/**
 * Tests unitarios para electron/services/DownloadService.ts
 * Prueba validación de parámetros y respuestas tipadas.
 */
import DownloadService from '../../../electron/services/DownloadService';

describe('DownloadService', () => {
  let service: DownloadService;

  beforeEach(() => {
    service = new DownloadService();
  });

  describe('validateDownloadParams', () => {
    it('devuelve valid: false cuando faltan parámetros requeridos', () => {
      const result = service.validateDownloadParams({});
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('devuelve valid: false cuando id es inválido', () => {
      const result = service.validateDownloadParams({
        id: -1,
        title: 'test.zip',
        downloadPath:
          process.platform === 'win32' ? 'C:\\Users\\Test\\Downloads' : '/tmp/Downloads',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('devuelve valid: true y data con params válidos y ruta permitida', () => {
      const downloadPath =
        process.platform === 'win32' ? 'C:\\Users\\Test\\Downloads' : '/tmp/Downloads';
      const result = service.validateDownloadParams({
        id: 1,
        title: 'rom.zip',
        downloadPath,
        totalBytes: 1024,
      });
      expect(result.valid).toBe(true);
      expect((result as { data?: { id: number } }).data?.id).toBe(1);
    });
  });

  describe('validateDownloadFolderParams', () => {
    it('devuelve valid: true con folderId numérico', () => {
      const result = service.validateDownloadFolderParams({ folderId: 10 });
      expect(result.valid).toBe(true);
      expect((result as { data?: { folderId: number } }).data?.folderId).toBe(10);
    });

    it('devuelve valid: false cuando faltan params', () => {
      const result = service.validateDownloadFolderParams(
        null as unknown as Record<string, unknown>
      );
      expect(result.valid).toBe(false);
    });
  });
});
