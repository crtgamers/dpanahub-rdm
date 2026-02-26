/**
 * @fileoverview Pool dinámico de Worker Threads reutilizables.
 *
 * Características:
 * - **Tamaño basado en CPU**: `maxWorkers` por defecto = `os.cpus().length - 1` (clamped 2..4).
 * - **Escalado bajo demanda**: arranca con `minWorkers`; crea workers adicionales cuando hay
 *   tareas encoladas y el pool no está al máximo.
 * - **Idle timeout**: workers que superan `idleTimeoutMs` sin actividad se destruyen,
 *   manteniendo al menos `minWorkers` vivos.
 * - **Comprobación de salud**: ping periódico a workers ociosos; los que no responden se reemplazan.
 * - **Diagnóstico**: `getStats()` expone métricas detalladas (tareas completadas, uptime,
 *   workers creados/destruidos).
 *
 * Interfaz pública: `execute`, `shutdown`, `getStats`.
 *
 * @module utils/workerPool
 */

import os from 'os';
import { Worker } from 'worker_threads';
import { logger } from './logger';

const log = logger.child('WorkerPool');

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface TaskWrapper {
  task: Record<string, unknown>;
  onProgress: ((_progress: number, _bytesProcessed: number) => void) | null;
  resolve: (_value: unknown) => void;
  reject: (_reason: Error) => void;
  timeoutId: ReturnType<typeof setTimeout> | null;
}

interface WorkerMessage {
  taskId?: string;
  type: string;
  progress?: number;
  bytesProcessed?: number;
  result?: unknown;
  error?: string;
}

/** Metadatos internos por worker. */
interface WorkerEntry {
  worker: Worker;
  index: number;
  busy: boolean;
  /** Timestamp de cuando el worker quedó idle. */
  idleSince: number;
  /** Timestamp de creación. */
  createdAt: number;
  /** Cantidad de tareas completadas por este worker. */
  tasksCompleted: number;
}

/** Configuración del pool dinámico. */
export interface WorkerPoolConfig {
  workerPath: string;
  /** Mínimo de workers siempre vivos (default: 1). */
  minWorkers?: number;
  /** Máximo de workers (default: auto basado en CPU). 0 = auto. */
  maxWorkers?: number;
  /** Timeout por tarea (ms). Default: 300_000 (5 min). */
  taskTimeoutMs?: number;
  /** Tiempo de inactividad antes de destruir un worker sobrante (ms). Default: 60_000. */
  idleTimeoutMs?: number;
  /** Intervalo de comprobación de salud (ms). Default: 30_000. 0 = deshabilitado. */
  healthCheckIntervalMs?: number;
  /** Timeout de respuesta a la comprobación de salud (ms). Default: 5_000. */
  healthCheckTimeoutMs?: number;
  /** Máximo de tareas en cola de espera. Al superarlo se rechaza con error. Default: 500. */
  maxWaitingTasks?: number;
}

export interface WorkerPoolStats {
  totalWorkers: number;
  availableWorkers: number;
  busyWorkers: number;
  waitingTasks: number;
  isShuttingDown: boolean;
  /** Máximo de workers permitidos. */
  maxWorkers: number;
  /** Mínimo de workers. */
  minWorkers: number;
  /** Total de tareas completadas en la vida del pool. */
  totalTasksCompleted: number;
  /** Total de workers creados (incluye reemplazos). */
  totalWorkersCreated: number;
  /** Total de workers destruidos por idle timeout. */
  totalIdleDestroys: number;
  /** Total de workers reemplazados por comprobación de salud fallida. */
  totalHealthReplacements: number;
  /** Límite de tareas en cola de espera (0 = sin límite). */
  maxWaitingTasks: number;
}

// ---------------------------------------------------------------------------
// Detección automática de CPU
// ---------------------------------------------------------------------------

/**
 * Calcula maxWorkers por defecto basado en CPU.
 * Reserva 1 core para el main thread de Electron; clampa entre 2 y 4.
 */
function autoMaxWorkers(): number {
  const cpus = os.cpus().length;
  return Math.max(2, Math.min(cpus - 1, 4));
}

// ---------------------------------------------------------------------------
// Clase principal
// ---------------------------------------------------------------------------

export default class WorkerPool {
  // Configuración
  private _workerPath: string;
  private _minWorkers: number;
  private _maxWorkers: number;
  private _taskTimeoutMs: number;
  private _idleTimeoutMs: number;
  private _healthCheckIntervalMs: number;
  private _healthCheckTimeoutMs: number;
  private _maxWaitingTasks: number;

  // Estado
  private _entries: Map<number, WorkerEntry> = new Map();
  private _nextIndex = 0;
  private _waitingTasks: TaskWrapper[] = [];
  private _isShuttingDown = false;

  // Temporizadores
  private _idleTimer: ReturnType<typeof setInterval> | null = null;
  private _healthTimer: ReturnType<typeof setInterval> | null = null;

  // Contadores (diagnóstico)
  private _totalTasksCompleted = 0;
  private _totalWorkersCreated = 0;
  private _totalIdleDestroys = 0;
  private _totalHealthReplacements = 0;
  /** Reemplazos consecutivos por fallo de carga del script; evita bucle infinito. */
  private _consecutiveLoadFailures = 0;
  private _hasLoggedDegraded = false;

  /**
   * Constructor con doble firma admitida.
   *
   * Acepta la firma posicional `(workerPath, poolSize, taskTimeout)` o un
   * objeto `WorkerPoolConfig`. Con la firma posicional, `poolSize` se usa como
   * `maxWorkers` y `minWorkers` se fija a `Math.min(1, poolSize)`.
   */
  constructor(
    workerPath: string,
    poolSizeOrConfig?: number | Partial<WorkerPoolConfig>,
    taskTimeout?: number
  ) {
    if (typeof poolSizeOrConfig === 'object' && poolSizeOrConfig !== null) {
      // Objeto de configuración
      const cfg = poolSizeOrConfig as Partial<WorkerPoolConfig>;
      this._workerPath = workerPath;
      this._minWorkers = Math.max(1, cfg.minWorkers ?? 1);
      this._maxWorkers = cfg.maxWorkers && cfg.maxWorkers > 0 ? cfg.maxWorkers : autoMaxWorkers();
      this._taskTimeoutMs = cfg.taskTimeoutMs ?? 300_000;
      this._idleTimeoutMs = cfg.idleTimeoutMs ?? 60_000;
      this._healthCheckIntervalMs = cfg.healthCheckIntervalMs ?? 30_000;
      this._healthCheckTimeoutMs = cfg.healthCheckTimeoutMs ?? 5_000;
      this._maxWaitingTasks = cfg.maxWaitingTasks ?? 500;
    } else {
      // Constructor con argumentos posicionales (path, poolSize, taskTimeout) para compatibilidad.
      // Con esta firma se mantiene al menos 1 worker activo cuando poolSize >= 1; maxWorkers = poolSize.
      const poolSize = typeof poolSizeOrConfig === 'number' ? poolSizeOrConfig : 2;
      this._workerPath = workerPath;
      this._minWorkers = Math.min(1, poolSize); // 1 si poolSize >= 1; 0 si poolSize === 0
      this._maxWorkers = poolSize;
      this._taskTimeoutMs = taskTimeout ?? 300_000;
      this._idleTimeoutMs = 60_000;
      this._healthCheckIntervalMs = 30_000;
      this._healthCheckTimeoutMs = 5_000;
      this._maxWaitingTasks = 500;
    }

    // Asegurar minWorkers <= maxWorkers
    this._minWorkers = Math.min(this._minWorkers, this._maxWorkers);

    this._initialize();
  }

  // -----------------------------------------------------------------------
  // Inicialización
  // -----------------------------------------------------------------------

  private _initialize(): void {
    // Crear los workers mínimos
    for (let i = 0; i < this._minWorkers; i++) {
      this._createWorker();
    }

    // Timer de idle cleanup
    if (this._idleTimeoutMs > 0) {
      this._idleTimer = setInterval(() => this._cleanupIdleWorkers(), this._idleTimeoutMs / 2);
    }

    // Timer de comprobación de salud
    if (this._healthCheckIntervalMs > 0) {
      this._healthTimer = setInterval(() => this._runHealthChecks(), this._healthCheckIntervalMs);
    }

    log.info(
      `WorkerPool inicializado: min=${this._minWorkers}, max=${this._maxWorkers}, ` +
        `idle=${this._idleTimeoutMs}ms, healthCheck=${this._healthCheckIntervalMs}ms ` +
        `(${os.cpus().length} CPUs detectados)`
    );
  }

  // -----------------------------------------------------------------------
  // Ciclo de vida de workers
  // -----------------------------------------------------------------------

  private _createWorker(): WorkerEntry {
    const index = this._nextIndex++;
    const worker = new Worker(this._workerPath);
    const entry: WorkerEntry = {
      worker,
      index,
      busy: false,
      idleSince: Date.now(),
      createdAt: Date.now(),
      tasksCompleted: 0,
    };

    worker.on('error', (error: Error) => {
      log.error(`Worker ${index} error:`, error);
      this._replaceWorker(index, 'error');
    });

    worker.on('exit', (code: number) => {
      if (code !== 0 && !this._isShuttingDown) {
        log.warn(`Worker ${index} salió con código ${code}, reemplazando...`);
        this._replaceWorker(index, 'crash');
      }
    });

    this._entries.set(index, entry);
    this._totalWorkersCreated++;

    return entry;
  }

  private static readonly MAX_CONSECUTIVE_LOAD_FAILURES = 3;

  private _replaceWorker(index: number, reason: 'error' | 'crash' | 'health'): void {
    if (this._isShuttingDown) return;

    const old = this._entries.get(index);
    if (old) {
      try {
        old.worker.terminate();
      } catch (err) {
        log.warn(`Error terminando worker ${index} (${reason}):`, (err as Error).message);
      }
      this._entries.delete(index);
    }

    if (reason === 'health') this._totalHealthReplacements++;
    if (reason === 'error' || reason === 'crash') this._consecutiveLoadFailures++;

    // Evitar bucle infinito cuando el script no carga o el worker sale con código 1 (mismo fallo)
    if (
      (reason === 'error' || reason === 'crash') &&
      this._consecutiveLoadFailures >= WorkerPool.MAX_CONSECUTIVE_LOAD_FAILURES
    ) {
      if (!this._hasLoggedDegraded) {
        this._hasLoggedDegraded = true;
        log.warn(
          `Worker pool en modo degradado: el script del worker no pudo cargar (ruta: ${this._workerPath}). ` +
            'No se crearán más reemplazos. Las tareas que usen el pool fallarán.'
        );
      }
      return;
    }

    // Solo reemplazar si estamos bajo el mínimo o si el worker estaba busy (tarea pendiente)
    if (this._entries.size < this._minWorkers || (old && old.busy)) {
      const entry = this._createWorker();
      log.info(`Worker ${entry.index} creado como reemplazo (razón: ${reason})`);
      // Si hay tareas esperando, asignar inmediatamente
      this._tryAssignWaiting();
    }
  }

  private _destroyWorker(index: number, reason: 'idle' | 'shutdown'): Promise<void> {
    const entry = this._entries.get(index);
    if (!entry) return Promise.resolve();

    this._entries.delete(index);

    if (reason === 'idle') this._totalIdleDestroys++;

    return new Promise<void>(resolve => {
      entry.worker.once('exit', () => resolve());
      entry.worker.terminate();
    });
  }

  // -----------------------------------------------------------------------
  // Escalado dinámico
  // -----------------------------------------------------------------------

  /**
   * Escala hacia arriba creando un worker si hay tareas encoladas y capacidad.
   * Retorna true si creó un nuevo worker.
   */
  private _tryScaleUp(): boolean {
    if (this._isShuttingDown) return false;
    if (this._waitingTasks.length === 0) return false;
    if (this._entries.size >= this._maxWorkers) return false;

    const entry = this._createWorker();
    log.debug(
      `Worker ${entry.index} creado bajo demanda (total: ${this._entries.size}/${this._maxWorkers}, ` +
        `waiting: ${this._waitingTasks.length})`
    );
    return true;
  }

  /**
   * Destruye workers ociosos que exceden `_idleTimeoutMs`,
   * siempre manteniendo al menos `_minWorkers` vivos.
   */
  private _cleanupIdleWorkers(): void {
    if (this._isShuttingDown) return;

    const now = Date.now();
    const idle: WorkerEntry[] = [];

    for (const entry of this._entries.values()) {
      if (!entry.busy && now - entry.idleSince > this._idleTimeoutMs) {
        idle.push(entry);
      }
    }

    // Ordenar por idleSince ASC (los más viejos primero)
    idle.sort((a, b) => a.idleSince - b.idleSince);

    // Destruir hasta llegar a minWorkers
    let destroyed = 0;
    for (const entry of idle) {
      if (this._entries.size <= this._minWorkers) break;
      log.debug(
        `Worker ${entry.index} destruido por inactividad ` +
          `(idle: ${Math.round((now - entry.idleSince) / 1000)}s, completadas: ${entry.tasksCompleted})`
      );
      this._destroyWorker(entry.index, 'idle');
      destroyed++;
    }

    if (destroyed > 0) {
      log.info(
        `${destroyed} worker(s) destruido(s) por inactividad (activos: ${this._entries.size})`
      );
    }
  }

  // -----------------------------------------------------------------------
  // Comprobaciones de salud
  // -----------------------------------------------------------------------

  /**
   * Envía PING a workers idle; si no responden dentro del timeout, reemplaza.
   * Solo verifica workers idle (los busy tienen su propio timeout de tarea).
   */
  private _runHealthChecks(): void {
    if (this._isShuttingDown) return;

    for (const entry of this._entries.values()) {
      if (entry.busy) continue;
      this._pingWorker(entry);
    }
  }

  private _pingWorker(entry: WorkerEntry): void {
    const pingId = `ping-${Date.now()}-${entry.index}`;
    let responded = false;

    const timeoutId = setTimeout(() => {
      if (!responded && !this._isShuttingDown) {
        log.warn(
          `Worker ${entry.index} no respondió a la comprobación de salud en ${this._healthCheckTimeoutMs}ms, reemplazando`
        );
        this._replaceWorker(entry.index, 'health');
      }
    }, this._healthCheckTimeoutMs);

    const handler = (msg: WorkerMessage) => {
      if (msg.type === 'PONG' && msg.taskId === pingId) {
        responded = true;
        clearTimeout(timeoutId);
        entry.worker.removeListener('message', handler);
      }
    };

    entry.worker.on('message', handler);
    try {
      entry.worker.postMessage({ type: 'PING', taskId: pingId });
    } catch (err) {
      responded = true;
      clearTimeout(timeoutId);
      entry.worker.removeListener('message', handler);
      log.warn(`Error enviando PING a worker ${entry.index}:`, (err as Error).message);
      this._replaceWorker(entry.index, 'health');
    }
  }

  // -----------------------------------------------------------------------
  // Ejecución de tareas
  // -----------------------------------------------------------------------

  async execute(
    task: Record<string, unknown>,
    onProgress: ((_progress: number, _bytesProcessed: number) => void) | null = null
  ): Promise<unknown> {
    if (this._isShuttingDown) {
      throw new Error('WorkerPool está cerrándose');
    }

    return new Promise((resolve, reject) => {
      const taskWrapper: TaskWrapper = {
        task,
        onProgress,
        resolve,
        reject,
        timeoutId: null,
      };

      // Buscar un worker disponible
      const entry = this._findAvailableWorker();

      if (entry) {
        this._executeOnWorker(entry, taskWrapper);
      } else {
        if (this._maxWaitingTasks > 0 && this._waitingTasks.length >= this._maxWaitingTasks) {
          reject(new Error('Cola de tareas llena. Intente más tarde.'));
          return;
        }
        this._waitingTasks.push(taskWrapper);
        // Intentar escalar si hay capacidad
        if (this._tryScaleUp()) {
          // El nuevo worker se asigna desde _tryAssignWaiting en el siguiente tick
          this._tryAssignWaiting();
        } else if (log.debug) {
          log.debug(
            `Tarea encolada, ${this._waitingTasks.length} en espera (pool al máximo: ${this._entries.size}/${this._maxWorkers})`
          );
        }
      }
    });
  }

  private _findAvailableWorker(): WorkerEntry | null {
    for (const entry of this._entries.values()) {
      if (!entry.busy) return entry;
    }
    return null;
  }

  private _tryAssignWaiting(): void {
    while (this._waitingTasks.length > 0) {
      const entry = this._findAvailableWorker();
      if (!entry) break;
      const task = this._waitingTasks.shift()!;
      this._executeOnWorker(entry, task);
    }
  }

  private _executeOnWorker(entry: WorkerEntry, taskWrapper: TaskWrapper): void {
    const { task, onProgress } = taskWrapper;
    const taskId = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

    entry.busy = true;

    taskWrapper.timeoutId = setTimeout(() => {
      entry.worker.removeAllListeners('message');
      taskWrapper.reject(
        new Error(`Tarea ${String(task.type)} excedió timeout de ${this._taskTimeoutMs}ms`)
      );
      entry.busy = false;
      entry.idleSince = Date.now();
      this._tryAssignWaiting();
    }, this._taskTimeoutMs);

    const messageHandler = (msg: WorkerMessage) => {
      // PROGRESS no incluye taskId en el worker; solo aplica a la tarea actual
      if (msg.type === 'PROGRESS') {
        if (onProgress) {
          onProgress(msg.progress ?? 0, msg.bytesProcessed ?? 0);
        }
        return;
      }
      if (msg.taskId !== taskId) return;

      if (msg.type === 'SUCCESS') {
        if (taskWrapper.timeoutId) clearTimeout(taskWrapper.timeoutId);
        entry.worker.removeListener('message', messageHandler);
        entry.busy = false;
        entry.idleSince = Date.now();
        entry.tasksCompleted++;
        this._totalTasksCompleted++;
        this._consecutiveLoadFailures = 0; // reset para permitir nuevos workers si antes fallaban
        taskWrapper.resolve(msg.result);
        this._tryAssignWaiting();
      } else if (msg.type === 'ERROR') {
        if (taskWrapper.timeoutId) clearTimeout(taskWrapper.timeoutId);
        entry.worker.removeListener('message', messageHandler);
        entry.busy = false;
        entry.idleSince = Date.now();
        entry.tasksCompleted++;
        this._totalTasksCompleted++;
        taskWrapper.reject(new Error(msg.error));
        this._tryAssignWaiting();
      }
    };

    entry.worker.on('message', messageHandler);

    entry.worker.postMessage({
      ...task,
      taskId,
    });
  }

  // -----------------------------------------------------------------------
  // Cierre
  // -----------------------------------------------------------------------

  async shutdown(): Promise<void> {
    this._isShuttingDown = true;

    // Limpiar timers
    if (this._idleTimer) {
      clearInterval(this._idleTimer);
      this._idleTimer = null;
    }
    if (this._healthTimer) {
      clearInterval(this._healthTimer);
      this._healthTimer = null;
    }

    // Rechazar tareas pendientes
    this._waitingTasks.forEach(t => {
      t.reject(new Error('WorkerPool cerrado'));
    });
    this._waitingTasks = [];

    // Terminar todos los workers
    const terminatePromises: Promise<void>[] = [];
    for (const entry of this._entries.values()) {
      terminatePromises.push(this._destroyWorker(entry.index, 'shutdown'));
    }
    await Promise.all(terminatePromises);
    this._entries.clear();

    log.info(
      `WorkerPool cerrado (tareas completadas: ${this._totalTasksCompleted}, ` +
        `workers creados: ${this._totalWorkersCreated}, ` +
        `idle destroys: ${this._totalIdleDestroys}, ` +
        `health replacements: ${this._totalHealthReplacements})`
    );
  }

  // -----------------------------------------------------------------------
  // Diagnóstico
  // -----------------------------------------------------------------------

  getStats(): WorkerPoolStats {
    let available = 0;
    let busy = 0;
    for (const entry of this._entries.values()) {
      if (entry.busy) busy++;
      else available++;
    }
    return {
      totalWorkers: this._entries.size,
      availableWorkers: available,
      busyWorkers: busy,
      waitingTasks: this._waitingTasks.length,
      isShuttingDown: this._isShuttingDown,
      maxWorkers: this._maxWorkers,
      minWorkers: this._minWorkers,
      totalTasksCompleted: this._totalTasksCompleted,
      totalWorkersCreated: this._totalWorkersCreated,
      totalIdleDestroys: this._totalIdleDestroys,
      totalHealthReplacements: this._totalHealthReplacements,
      maxWaitingTasks: this._maxWaitingTasks,
    };
  }
}
