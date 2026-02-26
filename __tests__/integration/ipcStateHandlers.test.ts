/**
 * Tests de integración para handlers IPC del motor de descargas (ipcStateHandlers).
 * Comprueba forma de respuesta { success, data } o { success, error } sin inicializar el motor.
 */
jest.mock('../../electron/engines/DownloadEngine', () => ({
  __esModule: true,
  default: class MockDownloadEngine {
    isInitialized = false;
  },
}));

import { registerStateHandlers, removeStateHandlers } from '../../electron/ipcStateHandlers';

declare global {
  var __ipcHandlersMap: Record<string, (..._args: unknown[]) => unknown>;
}

const getHandler = (channel: string) => globalThis.__ipcHandlersMap?.[channel];

describe('IPC state handlers (integración)', () => {
  beforeAll(() => {
    globalThis.__ipcHandlersMap = {};
    registerStateHandlers({} as Electron.BrowserWindow);
  });

  afterAll(() => {
    removeStateHandlers();
  });

  describe('get-download-state', () => {
    it('devuelve { success: true, data } con stateVersion y downloads cuando el motor no está inicializado', async () => {
      const handler = getHandler('get-download-state');
      expect(handler).toBeDefined();
      const result = (await handler!(null, null)) as {
        success: boolean;
        data?: { stateVersion: number; downloads: unknown[] };
        error?: string;
      };
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(typeof result.data?.stateVersion).toBe('number');
      expect(Array.isArray(result.data?.downloads)).toBe(true);
    });
  });

  describe('add-download', () => {
    it('devuelve { success: false, error } con parámetros inválidos', async () => {
      const handler = getHandler('add-download');
      expect(handler).toBeDefined();
      const result = (await handler!(null, {})) as {
        success: boolean;
        data?: unknown;
        error?: string;
      };
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('rechaza params sin id', async () => {
      const handler = getHandler('add-download');
      const result = (await handler!(null, {
        title: 'x',
        downloadPath: 'C:\\Users\\Test\\Downloads',
      })) as {
        success: boolean;
        error?: string;
      };
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('pause-download-state', () => {
    it('devuelve forma { success, data } o { success, error } con downloadId inválido', async () => {
      const handler = getHandler('pause-download-state');
      expect(handler).toBeDefined();
      const result = (await handler!(null, -1)) as {
        success: boolean;
        data?: unknown;
        error?: string;
      };
      expect(result).toHaveProperty('success');
      expect(typeof result.success).toBe('boolean');
      if (!result.success) expect(result.error).toBeDefined();
    });
  });
});
