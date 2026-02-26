/**
 * Handlers IPC de ventana, diálogos, rutas y memoria: minimize/maximize/close,
 * get-default-download-dir, validate-download-path, select-folder, open-folder,
 * get-user-data-path, open-user-data-folder, open-external-url, get-memory-stats.
 * @module ipc/windowHandlers
 */

import { ipcMain, dialog, shell } from 'electron';
import fs from 'fs';
import type { BrowserWindow } from 'electron';
import { setLastNormalBounds, restoreWindowToDefault } from '../window';
import { createHandler as createHandlerBase } from '../utils/ipcHelpers';
import {
  logger,
  getDefaultDownloadDir,
  ensureDirectoryExists,
  validateDownloadPath,
  validateAndSanitizeDownloadPath,
} from '../utils';
import { ERRORS } from '../constants/errors';
import config from '../config';

const log = logger.child('IPC:Window');

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

export const WINDOW_CHANNELS = [
  'window-minimize',
  'window-maximize',
  'window-is-maximized',
  'window-close',
  'get-default-download-dir',
  'validate-download-path',
  'select-folder',
  'open-folder',
  'get-user-data-path',
  'open-user-data-folder',
  'open-external-url',
  'get-memory-stats',
] as const;

export function registerWindowHandlers(mainWindow: BrowserWindow | null): void {
  ipcMain.handle(
    'window-minimize',
    createHandler('window-minimize', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.minimize();
      }
    })
  );

  ipcMain.handle(
    'window-maximize',
    createHandler('window-maximize', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMaximized()) {
          restoreWindowToDefault(mainWindow);
        } else {
          setLastNormalBounds(mainWindow.getBounds());
          mainWindow.maximize();
        }
      }
    })
  );

  ipcMain.handle(
    'window-is-maximized',
    createHandler('window-is-maximized', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        return { success: true, data: mainWindow.isMaximized() };
      }
      return { success: true, data: false };
    })
  );

  ipcMain.handle(
    'window-close',
    createHandler('window-close', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.close();
      }
    })
  );

  ipcMain.handle(
    'get-default-download-dir',
    createHandler('get-default-download-dir', async (_event, ...args) => {
      const createIfMissing = args[0] as boolean | undefined;
      const defaultDir = getDefaultDownloadDir();
      if (createIfMissing === true) {
        const created = await ensureDirectoryExists(defaultDir);
        if (!created.ok) {
          return { success: false, error: created.error, path: defaultDir };
        }
      }
      return { success: true, path: defaultDir };
    })
  );

  ipcMain.handle(
    'validate-download-path',
    createHandler('validate-download-path', async (_event, ...args) => {
      const filePath = args[0] as string | undefined;
      if (!filePath || typeof filePath !== 'string') {
        return { success: false, error: 'Ruta no proporcionada' };
      }
      const validation = await validateDownloadPath(filePath);
      return {
        success: validation.valid,
        path: validation.path,
        error: validation.error,
        blockReason: validation.blockReason,
        warningReason: validation.warningReason,
      };
    })
  );

  ipcMain.handle(
    'select-folder',
    createHandler('select-folder', async () => {
      const result = await dialog.showOpenDialog(mainWindow!, {
        properties: ['openDirectory', 'createDirectory'],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false };
      }

      const selectedPath = result.filePaths[0];
      const pathValidation = await validateDownloadPath(selectedPath);
      if (!pathValidation.valid || pathValidation.blockReason === 'critical') {
        log.warn(`Selección de carpeta rechazada: ${selectedPath}`, pathValidation.error);
        return {
          success: false,
          error: pathValidation.error,
          blockReason: pathValidation.blockReason,
        };
      }

      return {
        success: true,
        path: pathValidation.path,
        warningReason: pathValidation.warningReason,
      };
    })
  );

  ipcMain.handle(
    'open-folder',
    createHandler('open-folder', async (_event, filePath) => {
      if (!filePath || typeof filePath !== 'string') {
        return { success: false, error: 'Ruta no proporcionada o inválida' };
      }

      try {
        const pathValidation = validateAndSanitizeDownloadPath(filePath);
        if (!pathValidation.valid) {
          log.warn(`Bloqueado intento de abrir ruta no segura: ${filePath}`);
          return { success: false, error: pathValidation.error };
        }

        const resolvedPath = pathValidation.path!;

        let stats: fs.Stats;
        try {
          stats = await fs.promises.stat(resolvedPath);
        } catch (e) {
          const err = e as NodeJS.ErrnoException;
          if (err.code === 'ENOENT') {
            return { success: false, error: 'La ruta no existe' };
          }
          throw e;
        }

        if (stats.isDirectory()) {
          await shell.openPath(resolvedPath);
        } else if (stats.isFile()) {
          shell.showItemInFolder(resolvedPath);
        } else {
          return { success: false, error: 'La ruta no es un archivo ni un directorio válido' };
        }

        return { success: true };
      } catch (error) {
        log.error('Error abriendo carpeta:', error);
        return { success: false, error: (error as Error).message };
      }
    })
  );

  ipcMain.handle(
    'get-user-data-path',
    createHandler('get-user-data-path', async () => ({
      success: true,
      path: config.paths.userDataPath,
    }))
  );

  ipcMain.handle(
    'open-user-data-folder',
    createHandler('open-user-data-folder', async () => {
      const userDataPath = config.paths.userDataPath;
      try {
        await fs.promises.mkdir(userDataPath, { recursive: true });
        await shell.openPath(userDataPath);
        return { success: true, path: userDataPath };
      } catch (error) {
        log.error('Error abriendo carpeta del programa:', error);
        return { success: false, error: (error as Error).message, path: userDataPath };
      }
    })
  );

  ipcMain.handle(
    'open-external-url',
    createHandler('open-external-url', async (_event, url) => {
      if (!url || typeof url !== 'string') {
        return { success: false, error: 'URL no proporcionada' };
      }
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
          return { success: false, error: 'Solo se permiten enlaces https o http' };
        }
        await shell.openExternal(url);
        return { success: true };
      } catch (urlErr) {
        log.debug?.('URL inválida para abrir externamente:', (urlErr as Error)?.message);
        return { success: false, error: 'URL inválida' };
      }
    })
  );

  ipcMain.handle('get-memory-stats', async () => {
    try {
      const usage = process.memoryUsage();
      const memInfo =
        typeof (
          process as NodeJS.Process & {
            getProcessMemoryInfo?: () => Promise<Record<string, number>>;
          }
        ).getProcessMemoryInfo === 'function'
          ? await (
              process as NodeJS.Process & {
                getProcessMemoryInfo: () => Promise<Record<string, number>>;
              }
            ).getProcessMemoryInfo()
          : null;

      const toMB = (bytes: number | undefined): number | undefined =>
        typeof bytes === 'number' ? Math.round((bytes / 1024 / 1024) * 100) / 100 : undefined;

      return {
        success: true,
        data: {
          pid: process.pid,
          rssMB: toMB(usage.rss),
          heapTotalMB: toMB(usage.heapTotal),
          heapUsedMB: toMB(usage.heapUsed),
          externalMB: toMB(usage.external as number),
          arrayBuffersMB: toMB((usage as unknown as { arrayBuffers?: number }).arrayBuffers),
          rawMemoryUsage: usage,
          processMemoryInfo: memInfo,
        },
      };
    } catch (error) {
      log.error('Error obteniendo estadísticas de memoria:', error);
      return { success: false, error: (error as Error).message || 'Error obteniendo memoria' };
    }
  });
}

export function removeWindowHandlers(): void {
  for (const channel of WINDOW_CHANNELS) {
    ipcMain.removeHandler(channel);
  }
}
