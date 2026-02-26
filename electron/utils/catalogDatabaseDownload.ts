/**
 * Descarga del archivo .7z de catálogo (Myrient, LoLROMs) desde GitHub.
 * Escribe en la ruta configurada en config.paths (compressed7zPath / lolromCompressed7zPath).
 * Crea el directorio padre si no existe; escribe en archivo temporal y renombra al finalizar.
 * Usa fetch (Node 18+) para seguir redirecciones de GitHub raw.
 *
 * @module utils/catalogDatabaseDownload
 */

import fs from 'fs';
import path from 'path';
import { getCatalogSourceInfo } from '../../shared/constants/catalogSources';
import type { CatalogSourceId } from '../../shared/constants/catalogSources';
import config from '../config';
import { ensureDirectoryExists } from './downloadPath';
import { logger } from './logger';

const log = logger.child('CatalogDbDownload');

const PERMISSION_ERROR_MESSAGE =
  "No se puede escribir en la carpeta de recursos. Usa 'Ir al sitio web' para descargar manualmente.";

/**
 * Obtiene la ruta destino del .7z para la fuente indicada (según config.paths).
 */
function getDestinationPath(source: CatalogSourceId): string {
  const paths = config.paths as {
    compressed7zPath: string;
    lolromCompressed7zPath: string;
    pleasuredomeCompressed7zPath: string;
    myabandonwareCompressed7zPath: string;
  };
  switch (source) {
    case 'lolroms':
      return paths.lolromCompressed7zPath;
    case 'pleasuredome':
      return paths.pleasuredomeCompressed7zPath;
    case 'myabandonware':
      return paths.myabandonwareCompressed7zPath;
    default:
      return paths.compressed7zPath;
  }
}

export interface DownloadCatalogDatabaseOptions {
  source: CatalogSourceId;
  onProgress?: (_percent: number, _received: number, _total: number) => void;
  signal?: AbortSignal;
}

export interface DownloadCatalogDatabaseResult {
  success: boolean;
  error?: string;
}

/**
 * Descarga el archivo .7z de la fuente de catálogo desde GitHub y lo guarda en la ruta configurada.
 * Crea el directorio padre si no existe; escribe en un archivo temporal y renombra al destino al finalizar.
 *
 * @param options - source, onProgress (percent, received, total), signal para cancelación.
 * @returns { success: true } o { success: false, error: string } (red, permisos, cancelación, disco lleno).
 */
export async function downloadCatalogDatabase(
  options: DownloadCatalogDatabaseOptions
): Promise<DownloadCatalogDatabaseResult> {
  const { source, onProgress, signal } = options;
  const info = getCatalogSourceInfo(source);
  const destinationPath = getDestinationPath(source);
  const dir = path.dirname(destinationPath);
  const tempPath = `${destinationPath}.download.${Date.now()}`;

  try {
    const dirResult = await ensureDirectoryExists(dir);
    if (!dirResult.ok) {
      return { success: false, error: dirResult.error ?? PERMISSION_ERROR_MESSAGE };
    }

    const response = await fetch(info.urlDownload, { signal });
    if (!response.ok) {
      return {
        success: false,
        error: `Error de red: el servidor respondió con ${response.status}. Prueba "Ir al sitio web" para descargar manualmente.`,
      };
    }

    const total = parseInt(response.headers.get('content-length') ?? '0', 10) || 0;
    let received = 0;
    const reader = response.body?.getReader();
    if (!reader) {
      return { success: false, error: 'No se pudo leer la respuesta del servidor.' };
    }

    const fileStream = fs.createWriteStream(tempPath);

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fileStream.write(Buffer.from(value));
        received += value.length;
        const percent = total > 0 ? Math.min(100, (received / total) * 100) : 0;
        onProgress?.(percent, received, total);
      }
    } finally {
      fileStream.end();
    }

    await new Promise<void>((resolve, reject) => {
      fileStream.on('finish', resolve);
      fileStream.on('error', reject);
    });

    const stat = fs.statSync(tempPath);
    if (stat.size === 0) {
      fs.unlinkSync(tempPath);
      return { success: false, error: 'El archivo descargado está vacío.' };
    }

    fs.renameSync(tempPath, destinationPath);
    log.info?.('Descarga de catálogo completada:', destinationPath);
    return { success: true };
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { name?: string };
    if (fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
      } catch {
        /* ignore */
      }
    }
    if (e?.name === 'AbortError') {
      return { success: false, error: 'Descarga cancelada.' };
    }
    const isPermission = e?.code === 'EACCES' || e?.code === 'EPERM';
    const isDisk = e?.code === 'ENOSPC';
    return {
      success: false,
      error: isPermission
        ? PERMISSION_ERROR_MESSAGE
        : isDisk
          ? 'No hay espacio suficiente en disco.'
          : e?.code === 'ECONNRESET' || e?.code === 'ETIMEDOUT' || e?.code === 'ENOTFOUND'
            ? `Error de red: ${e?.message ?? ''}. Prueba "Ir al sitio web" para descargar manualmente.`
            : (e?.message ?? String(e)),
    };
  }
}
