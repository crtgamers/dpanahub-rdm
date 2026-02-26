/**
 * Tipos compartidos para búsqueda (IPC y servicios).
 *
 * Fuente única de verdad para SearchOptions. Usado por SearchService (main), API del renderer (catalog.search)
 * e IPC. Exporta: SearchOptions.
 *
 * @module shared/types/search
 */

/**
 * Opciones de búsqueda en el catálogo local (base de datos extraída).
 * limit, offset, usePrefix, usePhrase, useOR aplican en ambos lados; folderLimit, includeTotalCount, scopeFolderId(s) solo en main.
 */
export interface SearchOptions {
  limit?: number;
  offset?: number;
  usePrefix?: boolean;
  usePhrase?: boolean;
  useOR?: boolean;
  /** Límite de carpetas en resultados (solo main) */
  folderLimit?: number;
  /** Incluir total de resultados (solo main) */
  includeTotalCount?: boolean;
  /** Si se define, limita los resultados a esta carpeta y todo su contenido (carpeta + hijos recursivos) */
  scopeFolderId?: number;
  /** Si se define, limita los resultados a las carpetas indicadas y todo su contenido (p. ej. solo favoritos) */
  scopeFolderIds?: number[];
}
