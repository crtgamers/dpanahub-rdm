/**
 * API de ventana y sistema: delegación al proceso main vía window.api.
 *
 * Expone: minimizeWindow, maximizeWindow, getWindowIsMaximized, closeWindow, selectFolder,
 * getUserDataPath, openUserDataFolder, openExternalUrl. Para ventana solo si getApi() está disponible.
 *
 * @module api/window
 */

import { getApi, apiLogger, API_ERRORS, GENERAL_ERRORS } from './internal';
import type { APIResponse, PathResponse } from './types';

export type { PathResponse };

/** Minimiza la ventana principal. No hace nada si window.api no está disponible. */
export function minimizeWindow(): void {
  const api = getApi();
  if (api) void api.minimizeWindow();
}

/** Maximiza o restaura la ventana principal. */
export function maximizeWindow(): void {
  const api = getApi();
  if (api) void api.maximizeWindow();
}

/**
 * Indica si la ventana principal está maximizada (para sincronizar el icono de la barra de título).
 * @returns true si está maximizada; false si no o si la API no está disponible.
 */
export async function getWindowIsMaximized(): Promise<boolean> {
  const api = getApi();
  if (!api) return false;
  const res = await api.getWindowIsMaximized();
  return res?.data === true;
}

/** Cierra la ventana principal (puede terminar la aplicación si es la única). No hace nada si getApi() es null. */
export function closeWindow(): void {
  const api = getApi();
  if (api) void api.closeWindow();
}

/**
 * Obtiene la carpeta predeterminada de descargas: &lt;Carpeta Descargas del usuario&gt;/dpanahub-downloads.
 * @param createIfMissing - Si true, crea la carpeta si no existe.
 * @returns success, path y error opcional.
 */
export async function getDefaultDownloadDir(
  createIfMissing = false
): Promise<APIResponse<{ path: string }>> {
  const api = getApi();
  if (!api) return { success: false, error: API_ERRORS.NOT_AVAILABLE };
  try {
    const res = await api.getDefaultDownloadDir(createIfMissing);
    const path =
      (res as { path?: string }).path ?? (res as { data?: { path?: string } }).data?.path;
    if (res.success && path) return { success: true, data: { path } };
    return {
      success: false,
      error: (res as { error?: string }).error || GENERAL_ERRORS.UNKNOWN,
    };
  } catch (error) {
    apiLogger.error('Error obteniendo carpeta predeterminada:', error);
    return { success: false, error: (error as Error).message || GENERAL_ERRORS.UNKNOWN };
  }
}

export interface ValidateDownloadPathResult extends APIResponse<unknown> {
  path?: string;
  blockReason?: 'critical';
  warningReason?: 'sensitive' | 'readonly' | 'admin';
}

/**
 * Valida una ruta de descargas (críticos del SO, sensibles, permisos).
 * @param filePath - Ruta a validar.
 * @returns success, path, error, blockReason y/o warningReason.
 */
export async function validateDownloadPath(filePath: string): Promise<ValidateDownloadPathResult> {
  const api = getApi();
  if (!api) return { success: false, error: API_ERRORS.NOT_AVAILABLE };
  try {
    return (await api.validateDownloadPath(filePath)) as ValidateDownloadPathResult;
  } catch (error) {
    apiLogger.error('Error validando ruta:', error);
    return { success: false, error: (error as Error).message || GENERAL_ERRORS.UNKNOWN };
  }
}

export interface SelectFolderResult extends APIResponse<string | null> {
  path?: string;
  blockReason?: 'critical';
  warningReason?: 'sensitive' | 'readonly' | 'admin';
}

/**
 * Abre el diálogo nativo para seleccionar una carpeta.
 * La ruta se valida en el main; puede devolver blockReason o warningReason.
 * @returns success, path (ruta seleccionada), error, blockReason y/o warningReason.
 */
export async function selectFolder(): Promise<SelectFolderResult> {
  const api = getApi();
  if (!api) return { success: false, error: API_ERRORS.NOT_AVAILABLE };
  try {
    return (await api.selectFolder()) as SelectFolderResult;
  } catch (error) {
    apiLogger.error('Error seleccionando carpeta:', error);
    return { success: false, error: (error as Error).message || GENERAL_ERRORS.UNKNOWN };
  }
}

/**
 * Obtiene la ruta del directorio de datos de usuario de la aplicación.
 * @returns success, path y error opcional.
 */
export async function getUserDataPath(): Promise<PathResponse> {
  const api = getApi();
  if (!api) return { success: false, error: API_ERRORS.NOT_AVAILABLE };
  try {
    return (await api.getUserDataPath()) as PathResponse;
  } catch (error) {
    apiLogger.error('Error obteniendo ruta de datos:', error);
    return { success: false, error: (error as Error).message || GENERAL_ERRORS.UNKNOWN };
  }
}

/**
 * Abre el directorio de datos de usuario en el explorador del sistema.
 * @returns success, path y error opcional.
 */
export async function openUserDataFolder(): Promise<PathResponse> {
  const api = getApi();
  if (!api) return { success: false, error: API_ERRORS.NOT_AVAILABLE };
  try {
    return (await api.openUserDataFolder()) as PathResponse;
  } catch (error) {
    apiLogger.error('Error abriendo carpeta del programa:', error);
    return { success: false, error: (error as Error).message || GENERAL_ERRORS.UNKNOWN };
  }
}

/**
 * Abre una URL en el navegador por defecto del sistema.
 * @param url - URL a abrir (debe ser http(s) o permitida por la app).
 * @returns success o error.
 */
export async function openExternalUrl(url: string): Promise<APIResponse<unknown>> {
  const api = getApi();
  if (!api) return { success: false, error: API_ERRORS.NOT_AVAILABLE };
  try {
    return await api.openExternalUrl(url);
  } catch (error) {
    apiLogger.error('Error abriendo URL externa:', error);
    return { success: false, error: (error as Error).message || GENERAL_ERRORS.UNKNOWN };
  }
}
