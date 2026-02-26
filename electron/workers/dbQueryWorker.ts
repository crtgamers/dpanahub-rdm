/**
 * Worker thread para ejecutar queries SQL pesadas fuera del main thread.
 *
 * Protocolo: el proceso main envía mensajes por parentPort con { id?, type, ... }.
 * Tipos: init (dbPath, dbType, tableName?), batchUpdateProgress (updates), searchFTS (searchTerm, options, ftsTable, ftsType),
 * getAllFilesInFolder (folderId), ping. Respuesta: postMessage({ id, success, data?, error?, ... }).
 *
 * @module workers/dbQueryWorker
 */

import { parentPort } from 'worker_threads';
import Database from 'better-sqlite3';
import fs from 'fs';

type DbType = 'queue' | 'catalog';

interface InitResult {
  success: boolean;
  error?: string;
}

interface BatchUpdateResult {
  success: boolean;
  updated?: number;
  error?: string;
}

interface SearchFTSResult {
  success: boolean;
  data?: unknown[];
  total?: number;
  limit?: number;
  offset?: number;
  error?: string;
}

interface FileRow {
  id: number;
  name: string;
  url: string | null;
  size_bytes: number | null;
  modified_date: number | null;
}

interface GetAllFilesResult {
  success: boolean;
  data?: Array<{
    id: number;
    title: string;
    name: string;
    url: string | null;
    size: string;
    size_bytes: number | null;
    modified_date: number | null;
  }>;
  error?: string;
}

interface CatalogStatements {
  searchFTS: ReturnType<Database.Database['prepare']> | null;
  currentFtsTable?: string;
  currentTableName?: string;
  getAllFilesRecursive: ReturnType<Database.Database['prepare']>;
}

const databases: {
  queue: Database.Database | null;
  catalog: Database.Database | null;
} = {
  queue: null,
  catalog: null,
};

const statements: {
  queue: { updateProgressBatch: ReturnType<Database.Database['prepare']> } | null;
  catalog: CatalogStatements | null;
} = {
  queue: null,
  catalog: null,
};

let lastCatalogInit: { dbPath: string; tableName: string } | null = null;

/**
 * Abre la base de datos en la ruta dada (cola o catálogo) y prepara statements.
 * Para catálogo puede reabrir si cambian dbPath o tableName.
 *
 * @param dbPath - Ruta absoluta al archivo .sqlite.
 * @param dbType - 'queue' (lectura/escritura, WAL) o 'catalog' (solo lectura).
 * @param tableName - Nombre de tabla del catálogo (solo si dbType === 'catalog'); por defecto 'elements'.
 * @returns InitResult con success y error opcional.
 */
function initializeDatabase(
  dbPath: string,
  dbType: DbType = 'queue',
  tableName = 'elements'
): InitResult {
  if (dbType !== 'queue' && dbType !== 'catalog') {
    return { success: false, error: `Tipo de base de datos inválido: ${dbType}` };
  }

  if (dbType === 'catalog') {
    const needsReinit =
      !databases.catalog ||
      lastCatalogInit?.dbPath !== dbPath ||
      lastCatalogInit?.tableName !== tableName;
    if (databases.catalog && needsReinit) {
      try {
        databases.catalog.close();
      } catch (_e) {
        /* ignore */
      }
      databases.catalog = null;
      statements.catalog = null;
    }
  } else if (databases[dbType]) {
    return { success: true };
  }

  try {
    if (!fs.existsSync(dbPath)) {
      return { success: false, error: `Base de datos no encontrada: ${dbPath}` };
    }

    const db = new Database(dbPath, dbType === 'catalog' ? { readonly: true } : {});

    if (dbType === 'queue') {
      db.pragma('journal_mode = WAL');
      db.pragma('synchronous = NORMAL');
      // cache_size negativo: -16384 ≈ 16MB de caché en memoria
      db.pragma('cache_size = -16384');
      db.pragma('temp_store = MEMORY');
      db.pragma('foreign_keys = ON');
    } else {
      // Conexión de catálogo en worker: caché moderada para limitar uso de RAM
      db.pragma('cache_size = -16384');
    }

    databases[dbType] = db;

    if (dbType === 'queue') {
      statements.queue = {
        updateProgressBatch: db.prepare(`
          UPDATE downloads SET
            progress = @progress,
            downloaded_bytes = @downloadedBytes,
            updated_at = @updatedAt
          WHERE id = @id
        `),
      };
    } else {
      lastCatalogInit = { dbPath, tableName };
      const validTable = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName) ? tableName : 'elements';
      statements.catalog = {
        searchFTS: null,
        currentFtsTable: undefined,
        getAllFilesRecursive: db.prepare(`
          WITH RECURSIVE folder_tree AS (
              SELECT id, parent_id, name, type, url, size_bytes, modified_date
              FROM ${validTable} 
              WHERE id = ?
              UNION ALL
              SELECT n.id, n.parent_id, n.name, n.type, n.url, n.size_bytes, n.modified_date
              FROM ${validTable} n
              INNER JOIN folder_tree ft ON n.parent_id = ft.id
          )
          SELECT id, name, url, size_bytes, modified_date
          FROM folder_tree
          WHERE type = 'file'
          ORDER BY name ASC
          LIMIT ?
        `),
      };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

interface ProgressUpdate {
  id: number;
  progress: number;
  downloadedBytes: number;
}

/**
 * Actualiza en lote progress y downloaded_bytes de la tabla downloads (cola).
 *
 * @param updates - Lista de { id, progress, downloadedBytes }.
 * @returns BatchUpdateResult con success, updated (cantidad) o error.
 */
function batchUpdateProgress(updates: ProgressUpdate[]): BatchUpdateResult {
  if (!databases.queue || !statements.queue) {
    return { success: false, error: 'Base de datos de cola no inicializada' };
  }

  try {
    const db = databases.queue;
    const transaction = db.transaction((updatesList: ProgressUpdate[]) => {
      const stmt = statements.queue!.updateProgressBatch;
      const now = Date.now();
      for (const update of updatesList) {
        stmt.run({
          id: update.id,
          progress: update.progress,
          downloadedBytes: update.downloadedBytes,
          updatedAt: now,
        });
      }
    });
    transaction(updates);
    return { success: true, updated: updates.length };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Ejecuta búsqueda FTS sobre la tabla FTS del catálogo (fts5 o fts4).
 *
 * @param searchTerm - Término de búsqueda (sintaxis según motor FTS).
 * @param options - limit y offset para paginación.
 * @param ftsTable - Nombre de la tabla FTS (validado contra inyección).
 * @param ftsType - 'fts5' (usa bm25) o 'fts4'.
 * @returns SearchFTSResult con success, data (filas), total, limit, offset o error.
 */
function executeSearchFTS(
  searchTerm: string,
  options: { limit?: number; offset?: number },
  ftsTable: string,
  ftsType: 'fts5' | 'fts4'
): SearchFTSResult {
  if (!databases.catalog || !statements.catalog) {
    return { success: false, error: 'Base de datos de catálogo no inicializada' };
  }

  try {
    const db = databases.catalog;
    const tableName = lastCatalogInit?.tableName ?? 'elements';
    const tbl = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName) ? tableName : 'elements';

    if (!/^[a-zA-Z0-9_]+$/.test(ftsTable)) {
      return { success: false, error: 'Nombre de tabla FTS inválido' };
    }

    const needsNewStmt =
      !statements.catalog.searchFTS ||
      statements.catalog.currentFtsTable !== ftsTable ||
      statements.catalog.currentTableName !== tbl;

    if (needsNewStmt) {
      if (ftsType === 'fts5') {
        statements.catalog.searchFTS = db.prepare(`
          SELECT n.id, n.name, n.modified_date, n.type, n.parent_id, n.size_bytes,
                 bm25(${ftsTable}) AS relevance
          FROM ${ftsTable} fts
          INNER JOIN ${tbl} n ON n.id = fts.rowid
          WHERE ${ftsTable} MATCH ?
          ORDER BY n.type DESC, relevance ASC, n.name ASC
          LIMIT ? OFFSET ?
        `);
      } else {
        statements.catalog.searchFTS = db.prepare(`
          SELECT n.id, n.name, n.modified_date, n.type, n.parent_id, n.size_bytes,
                 0 AS relevance
          FROM ${ftsTable} fts
          INNER JOIN ${tbl} n ON n.id = fts.rowid
          WHERE ${ftsTable} MATCH ?
          ORDER BY n.type DESC, n.name ASC
          LIMIT ? OFFSET ?
        `);
      }
      statements.catalog.currentFtsTable = ftsTable;
      statements.catalog.currentTableName = tbl;
    }

    const limit = options.limit ?? 500;
    const offset = options.offset ?? 0;
    const stmt = statements.catalog.searchFTS as { all: (..._params: unknown[]) => unknown[] };
    const results = stmt.all(searchTerm, limit, offset) as unknown[];

    return {
      success: true,
      data: results as unknown[],
      total: (results as unknown[]).length,
      limit,
      offset,
    };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/** Formatea bytes a string legible (B, KiB, MiB, GiB). Devuelve '-' si no es un número válido. */
function formatSize(sizeBytes: number | null | undefined): string {
  if (sizeBytes === null || sizeBytes === undefined) return '-';
  const bytes = Number(sizeBytes);
  if (isNaN(bytes) || bytes < 0) return '-';
  if (bytes === 0) return '0 B';
  const k = 1024;
  if (bytes < k) return `${bytes} B`;
  if (bytes < k * k) return `${(bytes / k).toFixed(1)} KiB`;
  if (bytes < k * k * k) return `${(bytes / (k * k)).toFixed(1)} MiB`;
  return `${(bytes / (k * k * k)).toFixed(1)} GiB`;
}

/** Límite por defecto de archivos por carpeta cuando no se indica (evita consultas desmesuradas). */
const DEFAULT_MAX_FILES_PER_FOLDER = 10000;

/**
 * Obtiene recursivamente todos los archivos (type='file') bajo una carpeta en el catálogo.
 *
 * @param folderId - ID del nodo carpeta en la tabla del catálogo.
 * @param maxFilesLimit - Límite máximo de filas a devolver (por defecto DEFAULT_MAX_FILES_PER_FOLDER).
 * @returns GetAllFilesResult con success, data (id, title, name, url, size, size_bytes, modified_date) o error.
 */
function getAllFilesInFolder(
  folderId: number,
  maxFilesLimit: number = DEFAULT_MAX_FILES_PER_FOLDER
): GetAllFilesResult {
  if (!databases.catalog || !statements.catalog || !statements.catalog.getAllFilesRecursive) {
    return { success: false, error: 'Base de datos de catálogo no inicializada' };
  }

  try {
    const limit = Math.max(1, Math.min(maxFilesLimit, 100000));
    const stmt = statements.catalog.getAllFilesRecursive as {
      all(_folderId: number, _limit: number): FileRow[];
    };
    const results = stmt.all(folderId, limit);
    return {
      success: true,
      data: results.map(file => ({
        id: file.id,
        title: file.name.replace(/\/$/, ''),
        name: file.name.replace(/\/$/, ''),
        url: file.url,
        size: formatSize(file.size_bytes),
        size_bytes: file.size_bytes,
        modified_date: file.modified_date,
      })),
    };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/** Mensaje entrante: type (init | batchUpdateProgress | searchFTS | getAllFilesInFolder | ping) más campos según tipo. */
interface WorkerMessage {
  id?: string | number;
  type: string;
  dbPath?: string;
  dbType?: DbType;
  updates?: ProgressUpdate[];
  searchTerm?: string;
  options?: { limit?: number; offset?: number };
  ftsTable?: string;
  ftsType?: 'fts5' | 'fts4';
  folderId?: number;
  maxFilesLimit?: number;
}

parentPort!.on('message', async (message: WorkerMessage) => {
  try {
    let result: Record<string, unknown>;

    switch (message.type) {
      case 'init':
        result = initializeDatabase(
          message.dbPath!,
          (message.dbType as DbType) || 'queue'
        ) as unknown as Record<string, unknown>;
        break;

      case 'batchUpdateProgress':
        result = batchUpdateProgress(message.updates ?? []) as unknown as Record<string, unknown>;
        break;

      case 'searchFTS':
        result = executeSearchFTS(
          message.searchTerm!,
          message.options ?? {},
          message.ftsTable!,
          message.ftsType!
        ) as unknown as Record<string, unknown>;
        break;

      case 'getAllFilesInFolder':
        result = getAllFilesInFolder(message.folderId!, message.maxFilesLimit) as unknown as Record<
          string,
          unknown
        >;
        break;

      case 'ping':
        result = { success: true, message: 'pong' };
        break;

      default:
        result = { success: false, error: `Tipo de query desconocido: ${message.type}` };
    }

    parentPort!.postMessage({
      id: message.id,
      success: (result as { success?: boolean }).success !== false,
      data: (result as { data?: unknown }).data,
      error: (result as { error?: string }).error,
      ...result,
    });
  } catch (error) {
    parentPort!.postMessage({
      id: message.id,
      success: false,
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
  }
});

process.on('uncaughtException', (error: Error) => {
  parentPort!.postMessage({
    type: 'error',
    error: error.message,
    stack: error.stack,
  });
});

process.on('unhandledRejection', (reason: unknown) => {
  parentPort!.postMessage({
    type: 'error',
    error: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});
