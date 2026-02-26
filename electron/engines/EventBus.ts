/**
 * Bus de eventos entre el motor de descargas y el renderer (vía ipcStateHandlers).
 *
 * Emite: stateChanged, downloadProgress, downloadCompleted, downloadFailed,
 * chunkCompleted, chunkFailed, mergeStarted, verificationStarted, needsConfirmation.
 * emitStateChanged va debounced para coalescer cambios rápidos.
 *
 * @module EventBus
 */

import EventEmitter from 'events';
import config from '../config';

export interface DownloadCompletedMetadata {
  title?: string;
  savePath?: string;
}

export interface DownloadProgressPayload {
  [key: string]: unknown;
}

export interface FileInfoPayload {
  [key: string]: unknown;
}

const stateChangeDebounceMs =
  (config.ui as { stateChangeDebounceMs?: number })?.stateChangeDebounceMs ?? 50;

/**
 * Singleton de EventEmitter con setMaxListeners(100) para el motor de descargas.
 */
class EventBus extends EventEmitter {
  private _stateChangePending: number | null = null;
  private _stateChangeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super();
    this.setMaxListeners(100);
  }

  /**
   * Notifica que el estado de la cola cambió; el frontend puede pedir getSnapshot(minVersion). Va debounced.
   * @param stateVersion - Versión actual del estado (incrementada por trigger en StateStore).
   */
  emitStateChanged(stateVersion: number): void {
    this._stateChangePending = stateVersion;
    if (this._stateChangeTimer != null) return;
    this._stateChangeTimer = setTimeout(() => {
      this._stateChangeTimer = null;
      const v = this._stateChangePending;
      this._stateChangePending = null;
      if (v != null) {
        this.emit('stateChanged', { stateVersion: v, timestamp: Date.now() });
      }
    }, stateChangeDebounceMs);
  }

  /** Notifica que una descarga terminó correctamente. @param downloadId - ID. @param metadata - title, savePath opcionales. */
  emitDownloadCompleted(downloadId: number, metadata: DownloadCompletedMetadata = {}): void {
    this.emit('downloadCompleted', {
      downloadId,
      title: metadata.title,
      savePath: metadata.savePath,
      timestamp: Date.now(),
    });
  }

  /**
   * Notifica que una descarga falló.
   * @param downloadId - ID de la descarga. @param error - Mensaje o Error.
   * @param meta - failedDuringMerge si el fallo fue durante el merge de chunks.
   */
  emitDownloadFailed(
    downloadId: number,
    error: Error | string,
    meta?: { failedDuringMerge?: boolean }
  ): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    this.emit('downloadFailed', {
      downloadId,
      error: errorMessage,
      failedDuringMerge: meta?.failedDuringMerge ?? false,
      timestamp: Date.now(),
    });
  }

  /** Notifica progreso de una descarga (bytes, %, speed, ETA, chunkProgress, etc.). */
  emitDownloadProgress(downloadId: number, progress: DownloadProgressPayload): void {
    this.emit('downloadProgress', {
      downloadId,
      ...progress,
      timestamp: Date.now(),
    });
  }

  /** Notifica que un chunk de una descarga fragmentada se completó. */
  emitChunkCompleted(downloadId: number, chunkIndex: number): void {
    this.emit('chunkCompleted', {
      downloadId,
      chunkIndex,
      timestamp: Date.now(),
    });
  }

  /** Notifica que un chunk falló. @param willRetry - Si el motor va a reintentar el chunk. */
  emitChunkFailed(
    downloadId: number,
    chunkIndex: number,
    errorMessage: string,
    willRetry: boolean
  ): void {
    this.emit('chunkFailed', {
      downloadId,
      chunkIndex,
      error: errorMessage,
      willRetry: !!willRetry,
      timestamp: Date.now(),
    });
  }

  /** Notifica que comenzó la fusión de chunks para la descarga. */
  emitMergeStarted(downloadId: number): void {
    this.emit('mergeStarted', { downloadId, timestamp: Date.now() });
  }

  /** Notifica que comenzó la verificación (hash/tamaño) del archivo final. */
  emitVerificationStarted(downloadId: number): void {
    this.emit('verificationStarted', { downloadId, timestamp: Date.now() });
  }

  /** Notifica que la descarga requiere confirmación de sobrescritura (archivo existente). */
  emitNeedsConfirmation(downloadId: number, fileInfo: FileInfoPayload): void {
    this.emit('needsConfirmation', {
      downloadId,
      fileInfo,
      timestamp: Date.now(),
    });
  }

  /**
   * Limpia el bus: cancela el timer de debounce de stateChanged y quita todos los listeners.
   * Debe llamarse en el cleanup del motor para evitar fugas.
   */
  clear(): void {
    if (this._stateChangeTimer != null) {
      clearTimeout(this._stateChangeTimer);
      this._stateChangeTimer = null;
    }
    this._stateChangePending = null;
    this.removeAllListeners();
  }
}

const eventBus = new EventBus();
export default eventBus;
export { EventBus };
