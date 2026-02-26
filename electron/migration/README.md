# Estado de la cola de descargas

La cola de descargas usa únicamente **StateStore** (`electron/engines/StateStore.ts`). No existe script de migración desde el sistema anterior (downloads.db / QueueDatabase).

Para contexto histórico cola vs sistema anterior, ver [docs/QUEUE-LEGACY.md](../../docs/QUEUE-LEGACY.md) si existe.
