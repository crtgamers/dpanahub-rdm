/**
 * Tests unitarios para electron/engines/EventBus.ts
 */
import { EventBus } from '../../electron/engines/EventBus';

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  afterEach(() => {
    bus.clear();
  });

  describe('emit/on/removeListener', () => {
    it('recibe eventos emitidos', () => {
      const fn = jest.fn();
      bus.on('downloadCompleted', fn);
      bus.emitDownloadCompleted(1, { title: 'test.zip' });
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn.mock.calls[0][0]).toMatchObject({
        downloadId: 1,
        title: 'test.zip',
      });
    });

    it('removeListener deja de recibir eventos', () => {
      const fn = jest.fn();
      bus.on('downloadCompleted', fn);
      bus.removeListener('downloadCompleted', fn);
      bus.emitDownloadCompleted(1);
      expect(fn).not.toHaveBeenCalled();
    });

    it('clear elimina todos los listeners', () => {
      const fn = jest.fn();
      bus.on('downloadCompleted', fn);
      bus.clear();
      bus.emitDownloadCompleted(1);
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe('emitDownloadCompleted', () => {
    it('incluye downloadId y metadata', () => {
      const payloads: unknown[] = [];
      bus.on('downloadCompleted', (p: unknown) => payloads.push(p));
      bus.emitDownloadCompleted(42, { title: 'rom.zip', savePath: '/path/to/file' });
      expect(payloads).toHaveLength(1);
      const p = payloads[0] as Record<string, unknown>;
      expect(p.downloadId).toBe(42);
      expect(p.title).toBe('rom.zip');
      expect(p.savePath).toBe('/path/to/file');
      expect(p.timestamp).toBeDefined();
    });
  });

  describe('emitDownloadFailed', () => {
    it('acepta Error y string como error', () => {
      const payloads: unknown[] = [];
      bus.on('downloadFailed', (p: unknown) => payloads.push(p));
      bus.emitDownloadFailed(1, new Error('Network error'));
      expect((payloads[0] as Record<string, unknown>).error).toBe('Network error');
      bus.emitDownloadFailed(2, 'Plain string');
      expect((payloads[1] as Record<string, unknown>).error).toBe('Plain string');
    });
  });

  describe('emitStateChanged (debounced)', () => {
    it('emite stateChanged una vez tras el debounce', () => {
      jest.useFakeTimers();
      const fn = jest.fn();
      bus.on('stateChanged', fn);
      bus.emitStateChanged(1);
      bus.emitStateChanged(2);
      bus.emitStateChanged(3);
      expect(fn).not.toHaveBeenCalled();
      jest.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
      expect((fn.mock.calls[0][0] as { stateVersion: number }).stateVersion).toBe(3);
      jest.useRealTimers();
    });
  });
});
