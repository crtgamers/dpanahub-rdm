/**
 * Handlers IPC de logging: frontend-log y save-logs-to-file.
 * @module ipc/loggingHandlers
 */

import { ipcMain, dialog } from 'electron';
import fs from 'fs';
import { createHandler as createHandlerBase } from '../utils/ipcHelpers';
import { logger } from '../utils';
import { ERRORS } from '../constants/errors';
import type { BrowserWindow } from 'electron';

const log = logger.child('IPC:Logging');

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

export const LOGGING_CHANNELS = ['frontend-log', 'save-logs-to-file'] as const;

export function registerLoggingHandlers(mainWindow: BrowserWindow | null): void {
  ipcMain.handle(
    'frontend-log',
    createHandler('frontend-log', async (_event, ...args) => {
      const logEntry = (args[0] ?? {}) as {
        level?: string;
        scope?: string;
        message?: unknown[];
        timestamp?: unknown;
        mode?: string;
      };
      const { level, scope, message = [], mode } = logEntry;
      const frontendLogger = logger.child(`Frontend:${scope ?? 'App'}`);

      const formattedMessage = (Array.isArray(message) ? message : [message])
        .map((msg: unknown) => {
          if (
            typeof msg === 'object' &&
            msg !== null &&
            (msg as { type?: string }).type === 'error'
          ) {
            const m = msg as { message?: string; stack?: string };
            return `${m.message ?? ''}\n${m.stack ?? ''}`;
          }
          if (typeof msg === 'object') {
            return JSON.stringify(msg, null, 2);
          }
          return String(msg);
        })
        .join(' ');

      const levelMethod =
        (
          {
            DEBUG: frontendLogger.debug?.bind(frontendLogger),
            INFO: frontendLogger.info.bind(frontendLogger),
            WARN: frontendLogger.warn.bind(frontendLogger),
            ERROR: frontendLogger.error.bind(frontendLogger),
          } as Record<string, (_s: string) => void>
        )[level ?? 'INFO'] ?? frontendLogger.info.bind(frontendLogger);

      levelMethod(`[${mode ?? 'renderer'}] ${formattedMessage}`);

      return { success: true };
    })
  );

  ipcMain.handle(
    'save-logs-to-file',
    createHandler('save-logs-to-file', (async (
      _event,
      logText: string,
      dialogOptions?: {
        title: string;
        filterText: string;
        filterAll: string;
        canceledMessage: string;
      }
    ) => {
      const title = dialogOptions?.title ?? 'Save logs';
      const filterText = dialogOptions?.filterText ?? 'Text files';
      const filterAll = dialogOptions?.filterAll ?? 'All files';
      const canceledMessage = dialogOptions?.canceledMessage ?? 'User canceled';

      const result = await dialog.showSaveDialog(mainWindow!, {
        title,
        defaultPath: `dpanahub-rdm-logs-${new Date().toISOString().split('T')[0]}.txt`,
        filters: [
          { name: filterText, extensions: ['txt'] },
          { name: filterAll, extensions: ['*'] },
        ],
      });

      if (result.canceled || !result.filePath) {
        return { success: false, error: canceledMessage };
      }

      try {
        await fs.promises.writeFile(result.filePath, String(logText ?? ''), 'utf8');
        log.info(`Logs guardados en: ${result.filePath}`);
        return { success: true, path: result.filePath };
      } catch (error) {
        log.error('Error guardando logs:', error);
        return { success: false, error: (error as Error).message };
      }
    }) as HandlerFn)
  );
}

export function removeLoggingHandlers(): void {
  for (const channel of LOGGING_CHANNELS) {
    ipcMain.removeHandler(channel);
  }
}
