/**
 * API de catálogo: delegación al proceso main vía window.api.
 *
 * Expone: loadDatabase, closeDatabase, getCurrentSource, search, getChildren, getAncestors,
 * getNodeInfo, getDbUpdateDate, getRomsetSummary. Todas las funciones comprueban getApi()
 * y devuelven { success, data? } o { success: false, error }.
 *
 * @module api/catalog
 */

import { getApi, apiLogger, API_ERRORS, GENERAL_ERRORS } from './internal';
import type { APIResponse } from './types';
import type { SearchOptions } from '../../types/preload';

export type CatalogSource = 'myrient' | 'lolroms' | 'pleasuredome' | 'myabandonware';

/**
 * Carga la base de datos del catálogo indicado (Myrient, LoLROMs, PleasureDome o My Abandonware).
 * @param source - Fuente del catálogo: 'myrient' | 'lolroms' | 'pleasuredome' | 'myabandonware'.
 * @returns Respuesta con success; error si falla.
 */
export async function loadDatabase(source: CatalogSource): Promise<APIResponse<unknown>> {
  const api = getApi();
  if (!api) return { success: false, error: API_ERRORS.NOT_AVAILABLE };
  try {
    return (await api.loadDatabase(source)) as APIResponse<unknown>;
  } catch (error) {
    apiLogger.error('Error cargando base de datos:', error);
    return { success: false, error: (error as Error).message || GENERAL_ERRORS.UNKNOWN };
  }
}

/**
 * Cierra la base de datos del catálogo actual (vuelve a pantalla de inicio).
 * @returns success o error (API no disponible, etc.).
 */
export async function closeDatabase(): Promise<APIResponse<unknown>> {
  const api = getApi();
  if (!api) return { success: false, error: API_ERRORS.NOT_AVAILABLE };
  try {
    return (await api.closeDatabase()) as APIResponse<unknown>;
  } catch (error) {
    apiLogger.error('Error cerrando base de datos:', error);
    return { success: false, error: (error as Error).message || GENERAL_ERRORS.UNKNOWN };
  }
}

/**
 * Obtiene la fuente de catálogo actualmente cargada (null si ninguna).
 * @returns success y data (CatalogSource | null) o error.
 */
export async function getCurrentSource(): Promise<APIResponse<CatalogSource | null>> {
  const api = getApi();
  if (!api) return { success: false, error: API_ERRORS.NOT_AVAILABLE };
  try {
    const res = (await api.getCurrentSource()) as APIResponse<CatalogSource | null>;
    return res;
  } catch (error) {
    apiLogger.error('Error obteniendo fuente actual:', error);
    return { success: false, error: (error as Error).message || GENERAL_ERRORS.UNKNOWN };
  }
}

/**
 * Estado de la base de datos del catálogo para una fuente dada.
 * - `'none'`: no existe ni el .db ni el .7z en resources.
 * - `'compressed'`: solo existe el archivo .7z (hay que extraer para usar).
 * - `'operational'`: existe el .db listo para conexión read-only (búsqueda y navegación).
 */
export type DatabaseStatus = 'none' | 'compressed' | 'operational';

/**
 * Obtiene el estado de la base de datos para una fuente (sin cargarla).
 * @param source - 'myrient' | 'lolroms' | 'pleasuredome' | 'myabandonware'.
 * @returns success y data: 'operational' (.db existe), 'compressed' (solo .7z), 'none' (ni .db ni .7z).
 */
export async function getDatabaseStatus(
  source: CatalogSource
): Promise<APIResponse<DatabaseStatus>> {
  const api = getApi();
  if (!api) return { success: false, error: API_ERRORS.NOT_AVAILABLE };
  try {
    const res = (await api.getDatabaseStatus(source)) as APIResponse<DatabaseStatus>;
    return res;
  } catch (error) {
    apiLogger.error('Error obteniendo estado de base de datos:', error);
    return { success: false, error: (error as Error).message || GENERAL_ERRORS.UNKNOWN };
  }
}

export type CatalogDatabaseDownloadProgress = {
  source: string;
  percent: number;
  received: number;
  total: number;
};

/**
 * Descarga el archivo .7z de la fuente de catálogo desde GitHub a la carpeta resources.
 * @param source - 'myrient' | 'lolroms' | 'pleasuredome' | 'myabandonware'.
 * @returns success o error (red, permisos, cancelación, etc.).
 */
export async function downloadCatalogDatabase(
  source: CatalogSource
): Promise<APIResponse<unknown>> {
  const api = getApi();
  if (!api) return { success: false, error: API_ERRORS.NOT_AVAILABLE };
  try {
    return (await api.downloadCatalogDatabase(source)) as APIResponse<unknown>;
  } catch (error) {
    apiLogger.error('Error descargando base de datos de catálogo:', error);
    return { success: false, error: (error as Error).message || GENERAL_ERRORS.UNKNOWN };
  }
}

/**
 * Suscribe al progreso de la descarga de catálogo (downloadCatalogDatabase).
 * @param callback - Recibe { source, percent, received, total }.
 * @returns Función para cancelar la suscripción.
 */
export function onCatalogDatabaseDownloadProgress(
  callback: (_payload: CatalogDatabaseDownloadProgress) => void
): () => void {
  const api = getApi();
  if (!api?.onCatalogDatabaseDownloadProgress) return () => {};
  return api.onCatalogDatabaseDownloadProgress(callback);
}

/**
 * Busca en el catálogo por término (FTS o LIKE según backend).
 * @param term - Término de búsqueda.
 * @param options - Opciones: limit, offset, folderLimit, usePrefix, usePhrase, useOR, signal, etc.
 * @returns Respuesta con data (lista de nodos), total y hasMore; error si falla o la API no está disponible.
 */
export async function search(
  term: string,
  options: SearchOptions = {}
): Promise<APIResponse<unknown>> {
  const api = getApi();
  if (!api) return { success: false, error: API_ERRORS.NOT_AVAILABLE };
  try {
    return await api.search(term, options);
  } catch (error) {
    apiLogger.error('Error en búsqueda:', error);
    return { success: false, error: (error as Error).message || GENERAL_ERRORS.UNKNOWN };
  }
}

/**
 * Obtiene los hijos de un nodo del catálogo (paginado).
 * @param parentId - ID del nodo padre.
 * @param options - limit y offset para paginación.
 * @returns Respuesta con data (lista de nodos) y total; error si falla.
 */
export async function getChildren(
  parentId: number,
  options: { limit?: number; offset?: number } = {}
): Promise<APIResponse<unknown>> {
  const api = getApi();
  if (!api) return { success: false, error: API_ERRORS.NOT_AVAILABLE };
  try {
    return await api.getChildren(parentId, options);
  } catch (error) {
    apiLogger.error('Error obteniendo hijos:', error);
    return { success: false, error: (error as Error).message || GENERAL_ERRORS.UNKNOWN };
  }
}

/**
 * Obtiene la ruta de ancestros del nodo (para breadcrumb).
 * @param nodeId - ID del nodo.
 * @returns Respuesta con data (lista de { id, title, name }); error si falla.
 */
export async function getAncestors(nodeId: number): Promise<APIResponse<unknown>> {
  const api = getApi();
  if (!api) return { success: false, error: API_ERRORS.NOT_AVAILABLE };
  try {
    return await api.getAncestors(nodeId);
  } catch (error) {
    apiLogger.error('Error obteniendo ancestros:', error);
    return { success: false, error: (error as Error).message || GENERAL_ERRORS.UNKNOWN };
  }
}

/**
 * Obtiene información básica del nodo (id, parent_id, name, type).
 * @param nodeId - ID del nodo.
 * @returns Respuesta con data del nodo; error si no existe o falla.
 */
export async function getNodeInfo(nodeId: number): Promise<APIResponse<unknown>> {
  const api = getApi();
  if (!api) return { success: false, error: API_ERRORS.NOT_AVAILABLE };
  try {
    return await api.getNodeInfo(nodeId);
  } catch (error) {
    apiLogger.error('Error obteniendo info de nodo:', error);
    return { success: false, error: (error as Error).message || GENERAL_ERRORS.UNKNOWN };
  }
}

/**
 * Vacía el caché de navegación en el main (getChildren/getNodeInfo). Conviene llamarlo al volver
 * a la raíz para liberar RAM antes del TTL.
 */
export async function clearNavCache(): Promise<APIResponse<unknown>> {
  const api = getApi();
  if (!api) return { success: false, error: API_ERRORS.NOT_AVAILABLE };
  try {
    return (await api.clearNavCache()) as APIResponse<unknown>;
  } catch (error) {
    apiLogger.debug?.('Error limpiando caché de navegación:', error);
    return { success: false, error: (error as Error).message || GENERAL_ERRORS.UNKNOWN };
  }
}

/**
 * Obtiene resumen agregado de archivos bajo uno o más folders (recursivo).
 * @param folderIds - IDs de carpetas a resumir.
 * @returns Respuesta con { fileCount, totalSizeBytes } o error.
 */
export async function getRomsetSummary(
  folderIds: number[]
): Promise<APIResponse<{ fileCount: number; totalSizeBytes: number }>> {
  const api = getApi();
  if (!api) return { success: false, error: API_ERRORS.NOT_AVAILABLE };
  try {
    const res = (await api.romsetBuilderSummary({ folderIds })) as APIResponse<{
      fileCount: number;
      totalSizeBytes: number;
    }>;
    return res;
  } catch (error) {
    apiLogger.error('Error obteniendo resumen de romset:', error);
    return { success: false, error: (error as Error).message || GENERAL_ERRORS.UNKNOWN };
  }
}

/**
 * Obtiene la fecha de actualización del catálogo (modified_date de la raíz de carpetas).
 * @returns Respuesta con data (fecha en string) o error.
 */
export async function getDbUpdateDate(): Promise<APIResponse<unknown>> {
  const api = getApi();
  if (!api) return { success: false, error: API_ERRORS.NOT_AVAILABLE };
  try {
    return await api.getDbUpdateDate();
  } catch (error) {
    apiLogger.error('Error obteniendo fecha de actualización:', error);
    return { success: false, error: (error as Error).message || GENERAL_ERRORS.UNKNOWN };
  }
}
