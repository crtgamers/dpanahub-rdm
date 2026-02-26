/**
 * Handlers IPC de configuración: locale, lectura/escritura de archivos JSON de config.
 * @module ipc/configHandlers
 */

import { ipcMain, app } from 'electron';
import { createHandler as createHandlerBase, guardValidation } from '../utils/ipcHelpers';
import { readJSONFile, writeJSONFile, validateConfigFilename, logger } from '../utils';
import { ERRORS } from '../constants/errors';

const log = logger.child('IPC:Config');

type HandlerFn = (
  _event: Electron.IpcMainInvokeEvent,
  ..._args: unknown[]
) => Promise<unknown> | unknown;

const createHandler = (
  channel: string,
  handler: HandlerFn,
  _options: Record<string, unknown> = {}
) =>
  createHandlerBase(
    channel,
    handler as (_event: Electron.IpcMainInvokeEvent, ..._args: unknown[]) => Promise<unknown>,
    { log, defaultErrorMessage: ERRORS.GENERAL.INTERNAL_SERVER_ERROR }
  );

export const CONFIG_CHANNELS = ['get-app-locale', 'read-config-file', 'write-config-file'] as const;

export function registerConfigHandlers(): void {
  ipcMain.handle(
    'get-app-locale',
    createHandler('get-app-locale', () => {
      const locale = app.getLocale();
      return { success: true, data: locale };
    })
  );

  ipcMain.handle(
    'read-config-file',
    createHandler('read-config-file', async (_event, filename) => {
      const validation = validateConfigFilename(filename);
      const err = guardValidation(validation);
      if (err) return err;
      const data = await readJSONFile(validation.data!);
      return { success: true, data };
    })
  );

  ipcMain.handle(
    'write-config-file',
    createHandler('write-config-file', async (_event, filename, data) => {
      const filenameValidation = validateConfigFilename(filename);
      const err = guardValidation(filenameValidation);
      if (err) return err;
      if (data === undefined || data === null) {
        return { success: false, error: 'Datos no proporcionados' };
      }
      try {
        JSON.stringify(data);
      } catch (jsonErr) {
        log.debug?.('Datos no serializables a JSON:', (jsonErr as Error)?.message);
        return { success: false, error: 'Los datos no son serializables a JSON' };
      }
      const result = await writeJSONFile(filenameValidation.data!, data);
      return { success: result };
    })
  );
}

export function removeConfigHandlers(): void {
  for (const channel of CONFIG_CHANNELS) {
    ipcMain.removeHandler(channel);
  }
}
