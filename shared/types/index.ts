/**
 * Punto de entrada de tipos compartidos entre proceso principal (Electron) y renderer (Vue).
 *
 * Centraliza la reexportación de tipos usados en IPC, servicios y UI. Exporta: SearchOptions.
 *
 * @module shared/types
 */

export type { SearchOptions } from './search';
