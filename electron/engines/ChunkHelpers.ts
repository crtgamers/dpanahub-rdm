/**
 * Utilidades compartidas para el sistema de descarga chunked.
 *
 * Extraído de ChunkDownloader.ts para evitar dependencias circulares
 * entre ChunkDownloader y ChunkResponseHandler.
 *
 * @module ChunkHelpers
 */

import config from '../config';
import { logger } from '../utils';
import type { ChunkEngineRef } from './types';

const log = logger.child('DownloadEngine');

/** Devuelve config.downloads.chunked (umbrales, chunkSize, etc.) o objeto vacío. */
export const chunkedConfig = (): Record<string, unknown> =>
  (config.downloads as { chunked?: Record<string, unknown> })?.chunked ?? {};

/** Devuelve config.network (timeouts, etc.) o undefined. */
export const networkConfig = (): Record<string, unknown> | undefined =>
  config.network as Record<string, unknown> | undefined;

/** Rango de bytes [start, end] de un chunk. */
export interface ChunkRange {
  start: number;
  end: number;
}

/** Formatea bytes a string legible (B, KB, MB, GB, TB). */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes === Infinity) return '∞';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/** Opciones al registrar un fallo de chunk (attemptNumber, bytesTransferred, errorCode). */
export interface RecordChunkFailureOptions {
  attemptNumber?: number;
  bytesTransferred?: number;
  errorCode?: string;
}

/**
 * Registra un fallo de chunk en la base de datos de intentos (stateStore.recordAttempt).
 * @param engine - ChunkEngineRef (stateStore).
 * @param downloadId - ID de la descarga.
 * @param chunkIndex - Índice del chunk.
 * @param errorMessage - Mensaje de error.
 * @param options - attemptNumber, bytesTransferred, errorCode opcionales.
 */
export function recordChunkFailure(
  engine: ChunkEngineRef,
  downloadId: number,
  chunkIndex: number,
  errorMessage: string,
  options: RecordChunkFailureOptions = {}
): void {
  try {
    const chunks = engine.stateStore.getChunks!(downloadId);
    const chunk = chunks.find((c: { chunkIndex: number }) => c.chunkIndex === chunkIndex);
    const chunkId = chunk?.id ?? null;
    engine.stateStore.recordAttempt!({
      downloadId,
      chunkId,
      attemptNumber: options.attemptNumber ?? 1,
      error: errorMessage,
      errorCode: options.errorCode ?? null,
      bytesTransferred: options.bytesTransferred ?? 0,
      timestamp: Date.now(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.warn(
      `[Chunk failure] descarga ${downloadId}, chunk ${chunkIndex}: no se pudo registrar fallo en BD - ${msg}`
    );
  }
}

/**
 * Limpia recursos activos de un chunk (chunkManager.cleanupChunk, activeChunks.delete).
 *
 * @param engine - ChunkEngineRef (chunkManager, activeChunks).
 * @param downloadId - ID de la descarga.
 * @param chunkIndex - Índice del chunk.
 */
export function cleanupActiveChunk(
  engine: ChunkEngineRef,
  downloadId: number,
  chunkIndex: number
): void {
  const key = `${downloadId}-${chunkIndex}`;
  engine.chunkManager.cleanupChunk(key);
  engine.activeChunks.delete(key);
}
