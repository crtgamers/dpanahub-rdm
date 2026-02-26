/**
 * Punto de entrada de handlers IPC por dominio.
 * Registra y elimina todos los handlers de catálogo, config, ventana y logging.
 * @module ipc
 */

import type { BrowserWindow } from 'electron';
import { logger } from '../utils';
import { registerCatalogHandlers, removeCatalogHandlers } from './catalogHandlers';
import { registerConfigHandlers, removeConfigHandlers } from './configHandlers';
import { registerWindowHandlers, removeWindowHandlers } from './windowHandlers';
import { registerLoggingHandlers, removeLoggingHandlers } from './loggingHandlers';

const log = logger.child('IPC');

/**
 * Registra todos los handlers IPC (catálogo, config, ventana, logging).
 * Debe llamarse después de crear la ventana principal.
 * @param mainWindow - Ventana principal de Electron.
 */
export function registerHandlers(mainWindow: BrowserWindow | null): void {
  log.info('Registrando handlers IPC...');

  registerCatalogHandlers();
  registerConfigHandlers();
  registerWindowHandlers(mainWindow);
  registerLoggingHandlers(mainWindow);

  log.info('Handlers IPC registrados correctamente');
}

/**
 * Quita todos los handlers registrados por registerHandlers.
 */
export function removeHandlers(): void {
  removeCatalogHandlers();
  removeConfigHandlers();
  removeWindowHandlers();
  removeLoggingHandlers();

  log.info('Handlers IPC removidos');
}
