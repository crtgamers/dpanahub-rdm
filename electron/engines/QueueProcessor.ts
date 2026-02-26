/**
 * Lógica de selección de descargas a arrancar desde la cola.
 * Separa la responsabilidad de "qué iniciar" del orquestador (DownloadEngine),
 * permitiendo tests unitarios del selector sin ejecutar descargas reales.
 *
 * @module QueueProcessor
 */

import type { StateStore } from './StateStore';
import type Scheduler from './Scheduler';
import type { ConcurrencyController } from './ConcurrencyController';
import { DownloadState } from './types';

export interface SelectDownloadsToStartOptions {
  /** Máximo de ítems de la cola a considerar en una pasada (p. ej. 100). */
  maxQueueBatchSize: number;
  /** IDs ya dispuestos para startDownload (evita doble arranque mientras no han pasado a STARTING). */
  excludeIds?: Set<number>;
}

export interface SelectDownloadsToStartResult {
  /** Lista de descargas (en estado queued) elegidas para arrancar; el caller debe llamar startDownload por cada una. */
  toStart: Array<{ id: number }>;
  /** Cantidad de descargas en cola consideradas. */
  queuedCount: number;
  /** Slots globales disponibles en el momento de la selección. */
  slotsAvailable: number;
}

/**
 * Determina qué descargas en cola deben arrancar según slots disponibles y planificador.
 *
 * @param stateStore - Almacén de estado de descargas.
 * @param scheduler - Planificador (prioridad, límites por host, rate limit).
 * @param concurrencyController - Semáforos de slots globales.
 * @param options - maxQueueBatchSize.
 * @returns toStart (ids listos para startDownload), queuedCount y slotsAvailable (informativos).
 */
export function selectDownloadsToStart(
  stateStore: StateStore,
  scheduler: Scheduler,
  concurrencyController: ConcurrencyController,
  options: SelectDownloadsToStartOptions
): SelectDownloadsToStartResult {
  const queued = stateStore.getDownloadsByStateLimited(
    DownloadState.QUEUED,
    options.maxQueueBatchSize
  );
  const queuedCount = stateStore.getSummary().queued;
  if (queued.length === 0) {
    return {
      toStart: [],
      queuedCount: 0,
      slotsAvailable: concurrencyController.getAvailableGlobalSlots(),
    };
  }

  const queuedToProcess = queued;
  const slotsAvailable = concurrencyController.getAvailableGlobalSlots();
  const globalActiveCount = concurrencyController.getGlobalActiveCount();

  if (slotsAvailable <= 0) {
    return {
      toStart: [],
      queuedCount,
      slotsAvailable: 0,
    };
  }

  const toStart = scheduler.selectDownloadsToStart(
    queuedToProcess,
    slotsAvailable,
    globalActiveCount
  );

  const toStartMapped = toStart
    .map(d => ({ id: (d as { id: number }).id }))
    .filter(d => d.id != null && !options.excludeIds?.has(d.id));

  return {
    toStart: toStartMapped,
    queuedCount,
    slotsAvailable,
  };
}
