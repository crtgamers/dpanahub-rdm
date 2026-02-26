/**
 * Punto de entrada único del frontend hacia el proceso principal de Electron.
 *
 * Reexporta funciones que delegan en `window.api` (preload): catálogo (search, getChildren,
 * loadDatabase, …), descargas (addDownload, getDownloadState, onDownloadProgress, …), ventana
 * (minimize, close, selectFolder, openUserDataFolder), configuración (readConfigFile,
 * writeConfigFile, getAppVersion, checkForUpdates). Los tipos se reexportan desde ./types
 * para mantener imports existentes desde `../services/api` o `@/services/api`.
 *
 * @module api
 */

export type { SearchOptions } from './types';
export type {
  APIResponse,
  DownloadParams,
  FolderDownloadParams,
  ConnectionTestData,
  SuggestedTestFileResponse,
  CleanHistoryResponse,
  ApplyDownloadSettingsParams,
  PathResponse,
} from './types';

export {
  loadDatabase,
  closeDatabase,
  getCurrentSource,
  getDatabaseStatus,
  downloadCatalogDatabase,
  onCatalogDatabaseDownloadProgress,
  search,
  getChildren,
  getAncestors,
  getNodeInfo,
  clearNavCache,
  getDbUpdateDate,
  getRomsetSummary,
} from './catalog';
export type { CatalogSource, DatabaseStatus, CatalogDatabaseDownloadProgress } from './catalog';

export {
  downloadFolder,
  cleanHistory,
  clearHistory,
  clearCompletedFromList,
  applyDownloadSettings,
  getSuggestedTestFile,
  runConnectionTest,
  getDownloadState,
  addDownload,
  pauseDownloadState,
  pauseAllDownloads,
  cancelAllDownloads,
  resumeAllDownloads,
  resumeDownloadState,
  cancelDownloadState,
  deleteDownloadState,
  confirmOverwriteState,
  getDownloadDebug,
  getSessionMetrics,
  onDownloadStateChanged,
  onDownloadCompleted,
  onDownloadFailed,
  onChunkFailed,
  onNeedsConfirmation,
  onDownloadProgress,
  onHistoryCleaned,
  onDownloadsRestored,
  onErrorNotification,
  onFolderAddProgress,
  onFolderAddComplete,
} from './downloads';

export {
  minimizeWindow,
  maximizeWindow,
  getWindowIsMaximized,
  closeWindow,
  getDefaultDownloadDir,
  validateDownloadPath,
  selectFolder,
  getUserDataPath,
  openUserDataFolder,
  openExternalUrl,
} from './window';
export type { SelectFolderResult, ValidateDownloadPathResult } from './window';

export {
  getAppLocale,
  readConfigFile,
  writeConfigFile,
  getAppVersion,
  checkForUpdates,
  quitAndInstall,
  getPendingUpdateVersion,
  isUpdaterEnabled,
  getMemoryStats,
} from './config';
export type { MemoryStatsResponse } from './config';
export { formatMemoryStats } from './config';
