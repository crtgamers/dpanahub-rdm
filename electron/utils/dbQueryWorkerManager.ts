/**
 * Manager para el worker thread de queries SQL pesadas (dbQueryWorker).
 *
 * Gestiona una única instancia del worker: init (queue/catalog), batchUpdateProgress, searchFTS,
 * getAllFilesInFolder, ping. Las peticiones se envían por postMessage y se resuelven por id.
 * Usado por database.ts para no bloquear el main thread en FTS y getAllFilesInFolder.
 *
 * @module dbQueryWorkerManager
 */

import { Worker } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const log = logger.child('DBQueryWorker');

interface PendingRequest {
  resolve: (_result: WorkerResponse) => void;
  reject: (_error: Error) => void;
}

interface WorkerResponse {
  id?: number;
  success: boolean;
  data?: unknown;
  error?: string;
  [key: string]: unknown;
}

type DbType = 'queue' | 'catalog';

/**
 * Gestiona el worker dbQueryWorker: inicialización por tipo (queue/catalog), envío de requests con timeout y resolución por id.
 */
export class DBQueryWorkerManager {
  private worker: Worker | null = null;
  /** Expuesto para que database.ts pueda comprobar si el worker está listo (p. ej. para FTS o getAllFilesInFolder). */
  isInitialized = false;
  private initializedTypes = new Set<string>();
  private lastCatalogInit: { dbPath: string; tableName: string } | null = null;
  private pendingRequests = new Map<number, PendingRequest>();
  private requestIdCounter = 0;
  private workerPath: string;
  private initTimeout = 5000;
  private requestTimeout = 30000;

  constructor() {
    this.workerPath = path.join(__dirname, 'workers', 'dbQueryWorker.js');
  }

  /**
   * Inicializa el worker con la base de datos indicada (queue o catalog). Para catalog puede re-inicializar si cambian dbPath o tableName.
   *
   * @param dbPath - Ruta al archivo .sqlite.
   * @param dbType - 'queue' o 'catalog'.
   * @param tableName - Nombre de tabla del catálogo (solo si dbType === 'catalog'); por defecto 'elements'.
   * @returns true si se inicializó correctamente; false en error.
   */
  async initialize(dbPath: string, dbType: DbType = 'queue', tableName?: string): Promise<boolean> {
    const tbl = tableName ?? 'elements';
    if (dbType === 'catalog' && this.lastCatalogInit) {
      if (this.lastCatalogInit.dbPath === dbPath && this.lastCatalogInit.tableName === tbl) {
        return true;
      }
    } else if (this.worker && this.initializedTypes.has(dbType)) {
      return true;
    }

    try {
      if (!this.worker) {
        log.info('Iniciando worker thread para queries SQL...');
        this.worker = new Worker(this.workerPath);

        this.worker.on('message', (message: WorkerResponse) => {
          this._handleWorkerMessage(message);
        });

        this.worker.on('error', (error: Error) => {
          log.error('Error en worker thread:', error);
          this._rejectAllPending('Worker error: ' + error.message);
        });

        this.worker.on('exit', (code: number) => {
          if (code !== 0) {
            log.error(`Worker thread terminó con código ${code}`);
          }
          this.isInitialized = false;
          this.initializedTypes.clear();
          this.worker = null;
          this._rejectAllPending('Worker thread terminado');
        });
      }

      if (log.debug) log.debug(`Enviando solicitud de inicialización para DB tipo: ${dbType}`);
      const initResult = (await this._sendRequest(
        'init',
        { dbPath, dbType, tableName: tableName ?? 'elements' },
        this.initTimeout
      )) as WorkerResponse;

      if (initResult.success) {
        this.isInitialized = true;
        this.initializedTypes.add(dbType);
        if (dbType === 'catalog') {
          this.lastCatalogInit = { dbPath, tableName: tbl };
        }
        log.info(`Worker thread inicializado correctamente para: ${dbType}`);
        return true;
      } else {
        log.error(`Error inicializando worker para ${dbType}:`, initResult.error);
        if (this.initializedTypes.size === 0) {
          this._cleanup();
        }
        return false;
      }
    } catch (error) {
      log.error(`Error creando/inicializando worker thread para ${dbType}:`, error);
      if (this.initializedTypes.size === 0) {
        this._cleanup();
      }
      return false;
    }
  }

  private _sendRequest(
    type: string,
    data: Record<string, unknown>,
    timeout: number = this.requestTimeout
  ): Promise<WorkerResponse> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error('Worker no está inicializado'));
        return;
      }

      if (type !== 'init' && !this.isInitialized) {
        reject(new Error('Worker no está inicializado'));
        return;
      }

      const requestId = ++this.requestIdCounter;
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Timeout esperando respuesta del worker (${timeout}ms)`));
      }, timeout);

      this.pendingRequests.set(requestId, {
        resolve: result => {
          clearTimeout(timeoutId);
          resolve(result);
        },
        reject: error => {
          clearTimeout(timeoutId);
          reject(error);
        },
      });

      try {
        this.worker.postMessage({
          id: requestId,
          type,
          ...data,
        });
      } catch (error) {
        this.pendingRequests.delete(requestId);
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  private _handleWorkerMessage(message: WorkerResponse): void {
    const id = message.id as number | undefined;
    if (id === undefined) return;

    const request = this.pendingRequests.get(id);
    if (!request) {
      log.warn(`Respuesta del worker sin request pendiente: ${id}`);
      return;
    }

    this.pendingRequests.delete(id);

    if (message.success) {
      request.resolve(message);
    } else {
      request.reject(new Error((message.error as string) || 'Error desconocido en worker'));
    }
  }

  private _rejectAllPending(reason: string): void {
    for (const [, req] of this.pendingRequests.entries()) {
      req.reject(new Error(reason));
    }
    this.pendingRequests.clear();
  }

  /**
   * Envía al worker una actualización en lote de progress y downloaded_bytes (tabla downloads).
   *
   * @param updates - Lista de { id, progress, downloadedBytes }.
   * @returns Respuesta del worker (success, updated?, error?).
   */
  async batchUpdateProgress(
    updates: Array<{ id: number; progress: number; downloadedBytes: number }>
  ): Promise<WorkerResponse> {
    if (!this.isInitialized) {
      throw new Error('Worker no está inicializado');
    }
    try {
      return (await this._sendRequest('batchUpdateProgress', { updates })) as WorkerResponse;
    } catch (error) {
      log.error('Error en batchUpdateProgress:', error);
      throw error;
    }
  }

  /**
   * Ejecuta búsqueda FTS en el worker (catálogo).
   *
   * @param searchTerm - Término de búsqueda.
   * @param options - limit y offset.
   * @param ftsTable - Nombre de la tabla FTS.
   * @param ftsType - 'fts5' o 'fts4'.
   * @returns Respuesta del worker (success, data?, total?, error?).
   */
  async searchFTS(
    searchTerm: string,
    options: { limit?: number; offset?: number },
    ftsTable: string,
    ftsType: 'fts5' | 'fts4'
  ): Promise<WorkerResponse> {
    if (!this.isInitialized) {
      throw new Error('Worker no está inicializado');
    }
    try {
      return (await this._sendRequest('searchFTS', {
        searchTerm,
        options,
        ftsTable,
        ftsType,
      })) as WorkerResponse;
    } catch (error) {
      log.error('Error en searchFTS:', error);
      throw error;
    }
  }

  /**
   * Obtiene todos los archivos (type='file') bajo una carpeta en el catálogo vía worker.
   *
   * @param folderId - ID del nodo carpeta.
   * @param maxFilesLimit - Límite máximo de archivos a devolver (por defecto 10000 en el worker).
   * @returns Respuesta del worker (success, data?, error?).
   */
  async getAllFilesInFolder(folderId: number, maxFilesLimit?: number): Promise<WorkerResponse> {
    if (!this.isInitialized) {
      throw new Error('Worker no está inicializado');
    }
    try {
      return (await this._sendRequest('getAllFilesInFolder', {
        folderId,
        maxFilesLimit,
      })) as WorkerResponse;
    } catch (error) {
      log.error('Error en getAllFilesInFolder:', error);
      throw error;
    }
  }

  /** Comprueba si el worker responde (envía ping con timeout 5s). @returns true si responde con success. */
  async ping(): Promise<boolean> {
    if (!this.isInitialized) {
      return false;
    }
    try {
      const result = (await this._sendRequest('ping', {}, 5000)) as WorkerResponse;
      return result.success === true;
    } catch (error) {
      log.warn('Worker no responde al ping:', (error as Error).message);
      return false;
    }
  }

  private _cleanup(): void {
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch (termErr) {
        log.debug?.('Error terminando worker DB (esperado):', (termErr as Error)?.message);
      }
      this.worker = null;
    }
    this.isInitialized = false;
    this._rejectAllPending('Worker cleanup');
  }

  /** Termina el worker y limpia el estado. Llamar al cerrar la aplicación. */
  destroy(): void {
    log.info('Destruyendo worker thread...');
    this._cleanup();
  }
}

let workerManagerInstance: DBQueryWorkerManager | null = null;

/** Devuelve la instancia singleton del manager del worker de queries SQL. */
export function getWorkerManager(): DBQueryWorkerManager {
  if (!workerManagerInstance) {
    workerManagerInstance = new DBQueryWorkerManager();
  }
  return workerManagerInstance;
}
