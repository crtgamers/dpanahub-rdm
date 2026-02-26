/**
 * @fileoverview Resolución de rutas a workers del proceso main (dev y empaquetado).
 * @module workerPaths
 */

import path from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { app } from 'electron';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const WORKER_FILE_DOWNLOAD = 'downloadWorker.js';

/**
 * Resuelve la ruta absoluta a downloadWorker.js para uso en WorkerPool o Worker directo.
 * Prueba en orden: ruta relativa al módulo (dist-electron/workers), app.getAppPath(),
 * y dentro de app.asar cuando está empaquetado.
 *
 * @returns Ruta absoluta al script del worker (puede no existir en tiempo de build).
 */
export function getDownloadWorkerPath(): string {
  const candidates = [
    path.join(__dirname, '..', 'workers', WORKER_FILE_DOWNLOAD),
    path.join(app.getAppPath(), 'dist-electron', 'workers', WORKER_FILE_DOWNLOAD),
    process.resourcesPath
      ? path.join(
          process.resourcesPath,
          'app.asar',
          'dist-electron',
          'workers',
          WORKER_FILE_DOWNLOAD
        )
      : '',
  ].filter(Boolean) as string[];
  for (const p of candidates) {
    if (p && existsSync(p)) return p;
  }
  return path.join(app.getAppPath(), 'dist-electron', 'workers', WORKER_FILE_DOWNLOAD);
}
