/**
 * Handlers IPC de catálogo y búsqueda: search-db, get-children, get-ancestors, get-node-info,
 * clear-nav-cache, close-database, load-database, get-current-source, get-database-status,
 * download-catalog-database, get-db-update-date, get-search-metrics, romset-builder-summary.
 * @module ipc/catalogHandlers
 */

import { ipcMain } from 'electron';
import database, { type SearchOptions } from '../database';
import { serviceManager, ensureServicesInitialized } from '../services';
import { logger, validateSearchTerm, validateNodeId } from '../utils';
import { createHandler as createHandlerBase, guardValidation } from '../utils/ipcHelpers';
import { RateLimiter } from '../utils/rateLimiter';
import { ERRORS } from '../constants/errors';
import config from '../config';
import { downloadCatalogDatabase } from '../utils/catalogDatabaseDownload';
import { isValidCatalogSource } from '../../shared/constants/catalogSources';

const log = logger.child('IPC:Catalog');

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

function getServices(): {
  searchService: ReturnType<typeof serviceManager.getSearchService>;
} {
  const searchService = serviceManager.initialized ? serviceManager.getSearchService() : null;
  return { searchService: searchService ?? null };
}

const rateLimitingSearch = config.rateLimiting as
  | { search?: { maxRequests?: number; windowMs?: number; cleanupIntervalMs?: number } }
  | undefined;
const searchRateLimiter = new RateLimiter(
  rateLimitingSearch?.search?.maxRequests ?? 10,
  rateLimitingSearch?.search?.windowMs ?? 1000
);
let cleanupInterval: ReturnType<typeof setInterval> | null = null;
const searchAbortControllers = new Map<number, AbortController>();

export const CATALOG_CHANNELS = [
  'search-db',
  'get-search-metrics',
  'get-children',
  'get-ancestors',
  'get-node-info',
  'clear-nav-cache',
  'close-database',
  'load-database',
  'get-current-source',
  'get-database-status',
  'download-catalog-database',
  'get-db-update-date',
  'romset-builder-summary',
] as const;

export function registerCatalogHandlers(): void {
  if (!serviceManager.initialized) {
    log.warn('ServiceManager no está inicializado, usando validaciones básicas');
  }

  cleanupInterval = setInterval(() => {
    searchRateLimiter.cleanup();
  }, rateLimitingSearch?.search?.cleanupIntervalMs ?? 60000);
  if (typeof process !== 'undefined') {
    process.on('exit', () => {
      if (cleanupInterval) clearInterval(cleanupInterval);
    });
  }

  ipcMain.handle(
    'search-db',
    createHandler('search-db', async (event, ...args) => {
      await ensureServicesInitialized();
      const searchTerm = args[0];
      const options = (args[1] ?? {}) as Record<string, unknown>;
      const identifier = event.sender.id.toString();

      if (!searchRateLimiter.isAllowed(identifier)) {
        const status = searchRateLimiter.getStatus(identifier);
        log.warn(
          `Rate limit excedido para búsqueda (sender: ${identifier}): ${status?.count ?? 'N/A'} requests`
        );
        return {
          success: false,
          error: 'Demasiadas búsquedas. Por favor espera un momento antes de buscar nuevamente.',
          rateLimited: true,
          retryAfter: status?.resetInMs ?? rateLimitingSearch?.search?.windowMs ?? 1000,
        };
      }

      const { searchService } = getServices();

      const validation = validateSearchTerm(searchTerm as string);
      const err = guardValidation(validation);
      if (err) {
        if (typeof searchTerm === 'string' && searchTerm.trim().length < 2) {
          return { success: true, data: [], total: 0 };
        }
        return err;
      }

      let normalizedOptions: Record<string, unknown>;
      let searchTermToUse = validation.data as string;
      let searchCacheKey: string | null = null;

      if (searchService) {
        normalizedOptions = searchService.normalizeSearchOptions(
          options as {
            limit?: number;
            offset?: number;
            folderLimit?: number;
            usePrefix?: boolean;
            usePhrase?: boolean;
            useOR?: boolean;
          }
        ) as unknown as Record<string, unknown>;
        searchTermToUse = searchService.normalizeSearchTerm(searchTermToUse);
        searchCacheKey = searchService.getCacheKey(searchTermToUse, options);

        const cacheCheckStart = performance.now();
        const cachedResult = searchService.getFromCacheByKey(searchCacheKey) as {
          data?: unknown[];
          total?: number;
        } | null;
        if (cachedResult) {
          const cacheDurationMs = Math.round(performance.now() - cacheCheckStart);
          searchService.recordSearchMetrics({
            durationMs: cacheDurationMs,
            cacheHit: true,
            resultCount: cachedResult.data?.length ?? 0,
            total: cachedResult.total ?? 0,
          });
          const resultWithMetrics = { ...cachedResult, searchDurationMs: cacheDurationMs };
          if (cachedResult.total !== undefined) {
            const pagination = searchService.calculatePagination(
              cachedResult.total,
              (normalizedOptions as { limit: number }).limit,
              (normalizedOptions as { offset: number }).offset
            );
            return { ...resultWithMetrics, pagination };
          }
          return resultWithMetrics;
        }
      } else {
        const limitOpt = options.limit as number | string | undefined;
        const offsetOpt = options.offset as number | string | undefined;
        const folderLimitOpt = options.folderLimit as number | string | undefined;
        const scopeFolderIdOpt = options.scopeFolderId as number | undefined;
        const scopeFolderIdsOpt = options.scopeFolderIds as number[] | undefined;
        const scopeFolderIds =
          Array.isArray(scopeFolderIdsOpt) && scopeFolderIdsOpt.length > 0
            ? scopeFolderIdsOpt.filter((id): id is number => typeof id === 'number' && id > 0)
            : undefined;
        normalizedOptions = {
          limit: Math.min(Math.max(Number(limitOpt) || 500, 1), 1000),
          offset: Math.max(Number(offsetOpt) || 0, 0),
          folderLimit: Math.min(
            Math.max(Number(folderLimitOpt) || 0, 0),
            (Number(limitOpt) || 500) - 1
          ),
          usePrefix: options.usePrefix !== false,
          usePhrase: options.usePhrase === true,
          useOR: options.useOR === true,
          scopeFolderId:
            typeof scopeFolderIdOpt === 'number' && scopeFolderIdOpt > 0
              ? scopeFolderIdOpt
              : undefined,
          scopeFolderIds: scopeFolderIds?.length ? scopeFolderIds : undefined,
        };
      }

      const senderId = event.sender.id;
      const previousController = searchAbortControllers.get(senderId);
      if (previousController) {
        previousController.abort();
        searchAbortControllers.delete(senderId);
      }

      const controller = new AbortController();
      searchAbortControllers.set(senderId, controller);
      const optionsWithSignal = { ...normalizedOptions, signal: controller.signal };

      const searchStart = performance.now();
      let result: { success: boolean; data?: unknown[]; total?: number; cancelled?: boolean };
      try {
        result = await database.search(searchTermToUse, optionsWithSignal as SearchOptions);
      } finally {
        if (searchAbortControllers.get(senderId) === controller) {
          searchAbortControllers.delete(senderId);
        }
      }

      const searchDurationMs = Math.round(performance.now() - searchStart);

      if (result.cancelled) {
        return { ...result, searchDurationMs };
      }

      if (searchService && result.success && searchCacheKey) {
        searchService.setCacheByKey(searchCacheKey, result as Record<string, unknown>);
        searchService.recordSearchMetrics({
          durationMs: searchDurationMs,
          cacheHit: false,
          resultCount: result.data?.length ?? 0,
          total: result.total ?? 0,
        });
      }

      if (searchService && result.success && result.total !== undefined) {
        const pagination = searchService.calculatePagination(
          result.total,
          (normalizedOptions as { limit: number }).limit,
          (normalizedOptions as { offset: number }).offset
        );
        return { ...result, pagination, searchDurationMs };
      }

      return { ...result, searchDurationMs };
    })
  );

  ipcMain.handle(
    'get-search-metrics',
    createHandler('get-search-metrics', () => {
      const { searchService } = getServices();
      return searchService ? searchService.getSearchMetrics() : { recent: [], summary: {} };
    })
  );

  ipcMain.handle(
    'get-children',
    createHandler('get-children', (_event, ...args) => {
      const parentId = args[0];
      const options = (args[1] ?? {}) as Record<string, unknown>;
      const validation = validateNodeId(parentId);
      const err = guardValidation(validation);
      if (err) return err;
      const defaultLimit = 500;
      const limit =
        options.limit != null && Number(options.limit) > 0
          ? Math.min(Number(options.limit), 1000)
          : defaultLimit;
      const offset =
        options.offset != null && Number(options.offset) >= 0
          ? Math.max(0, Number(options.offset))
          : 0;
      return database.getChildren(validation.data!, { limit, offset });
    })
  );

  ipcMain.handle(
    'get-ancestors',
    createHandler('get-ancestors', (_event, nodeId) => {
      const validation = validateNodeId(nodeId);
      const err = guardValidation(validation);
      if (err) return err;
      return database.getAncestors(validation.data!);
    })
  );

  ipcMain.handle(
    'get-node-info',
    createHandler('get-node-info', (_event, nodeId) => {
      const validation = validateNodeId(nodeId);
      const err = guardValidation(validation);
      if (err) return err;
      return database.getNodeInfo(validation.data!);
    })
  );

  ipcMain.handle(
    'clear-nav-cache',
    createHandler('clear-nav-cache', () => {
      database.clearNavCache();
      return { success: true };
    })
  );

  ipcMain.handle(
    'close-database',
    createHandler('close-database', () => {
      database.close();
      const { searchService } = getServices();
      if (searchService) searchService.clearCache();
      return { success: true };
    })
  );

  ipcMain.handle(
    'load-database',
    createHandler('load-database', async (_event, ...args) => {
      const source = args[0];
      if (!isValidCatalogSource(source)) {
        return { success: false, error: 'Fuente de catálogo inválida' };
      }
      const success = await database.loadDatabase(source);
      return { success };
    })
  );

  ipcMain.handle(
    'get-current-source',
    createHandler('get-current-source', () => ({
      success: true,
      data: database.currentSource,
    }))
  );

  ipcMain.handle(
    'get-database-status',
    createHandler('get-database-status', async (_event, ...args) => {
      const source = args[0];
      if (!isValidCatalogSource(source)) {
        return { success: false, error: 'Fuente de catálogo inválida' };
      }
      const status = await database.getDatabaseStatus(source);
      return { success: true, data: status };
    })
  );

  ipcMain.handle(
    'download-catalog-database',
    createHandler('download-catalog-database', async (event, ...args) => {
      const source = args[0];
      if (!isValidCatalogSource(source)) {
        return { success: false, error: 'Fuente de catálogo inválida' };
      }
      const controller = new AbortController();
      const webContents = event.sender;
      const result = await downloadCatalogDatabase({
        source,
        signal: controller.signal,
        onProgress: (percent, received, total) => {
          webContents.send('catalog-database-download-progress', {
            source,
            percent,
            received,
            total,
          });
        },
      });
      return result.success ? { success: true } : { success: false, error: result.error };
    })
  );

  ipcMain.handle(
    'get-db-update-date',
    createHandler('get-db-update-date', () => {
      if (!database.currentSource) {
        return { success: true, data: null };
      }
      return database.getUpdateDate();
    })
  );

  ipcMain.handle(
    'romset-builder-summary',
    createHandler('romset-builder-summary', (_event, ...args) => {
      const params = args[0] as { folderIds?: number[] };
      if (!params?.folderIds || !Array.isArray(params.folderIds) || params.folderIds.length === 0) {
        return { success: false, error: 'folderIds requerido (array no vacío)' };
      }
      const folderIds = params.folderIds.filter(
        (id): id is number => typeof id === 'number' && Number.isFinite(id) && id > 0
      );
      if (folderIds.length === 0) {
        return { success: false, error: 'folderIds no contiene IDs válidos' };
      }
      return database.getFoldersSummary(folderIds);
    })
  );
}

export function removeCatalogHandlers(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
  searchAbortControllers.forEach(c => {
    try {
      c.abort();
    } catch (abortErr) {
      log.debug?.('Error abortando búsqueda en cleanup:', (abortErr as Error)?.message);
    }
  });
  searchAbortControllers.clear();

  for (const channel of CATALOG_CHANNELS) {
    ipcMain.removeHandler(channel);
  }
}
