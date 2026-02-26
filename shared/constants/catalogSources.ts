/**
 * Constantes por fuente de catálogo (Myrient, LoLROMs, futuras).
 * URLs para descarga directa (raw) y para "Ir al sitio web" (página blob de GitHub).
 * Añadir una entrada nueva aquí al agregar más fuentes.
 *
 * @module shared/constants/catalogSources
 */

export type CatalogSourceId = 'myrient' | 'lolroms' | 'pleasuredome' | 'myabandonware';

/** Lista de fuentes de catálogo válidas. Usar para validación en handlers IPC y servicios. */
export const VALID_CATALOG_SOURCES: readonly CatalogSourceId[] = [
  'myrient',
  'lolroms',
  'pleasuredome',
  'myabandonware',
] as const;

/**
 * Comprueba si un valor es una fuente de catálogo válida.
 * @param source - Valor a comprobar (típicamente argumento de handler IPC).
 * @returns true si source es un CatalogSourceId válido.
 */
export function isValidCatalogSource(source: unknown): source is CatalogSourceId {
  return (
    typeof source === 'string' && (VALID_CATALOG_SOURCES as readonly string[]).includes(source)
  );
}

export interface CatalogSourceInfo {
  /** Identificador de la fuente (coincide con CatalogSource en api/catalog). */
  id: CatalogSourceId;
  /** URL para descargar el archivo .7z directamente (GitHub raw). */
  urlDownload: string;
  /** URL para abrir en el navegador (página del repositorio). */
  urlWebsite: string;
}

const GITHUB_BASE = 'https://github.com/crtgamers/dpanahub-rdm';
const RAW_BASE = `${GITHUB_BASE}/raw/main/resources`;
const BLOB_BASE = `${GITHUB_BASE}/blob/main/resources`;

/**
 * Información por fuente: URLs de descarga y de la página web.
 * Extensible: añadir nuevas fuentes aquí.
 */
export const CATALOG_SOURCE_INFO: Record<CatalogSourceId, CatalogSourceInfo> = {
  myrient: {
    id: 'myrient',
    urlDownload: `${RAW_BASE}/myrient_data.7z`,
    urlWebsite: `${BLOB_BASE}/myrient_data.7z`,
  },
  lolroms: {
    id: 'lolroms',
    urlDownload: `${RAW_BASE}/lolrom_data.7z`,
    urlWebsite: `${BLOB_BASE}/lolrom_data.7z`,
  },
  pleasuredome: {
    id: 'pleasuredome',
    urlDownload: `${RAW_BASE}/pleasuredome_data.7z`,
    urlWebsite: `${BLOB_BASE}/pleasuredome_data.7z`,
  },
  myabandonware: {
    id: 'myabandonware',
    urlDownload: `${RAW_BASE}/myabandonware_data.7z`,
    urlWebsite: `${BLOB_BASE}/myabandonware_data.7z`,
  },
};

/**
 * Obtiene la info de una fuente por su id.
 */
export function getCatalogSourceInfo(source: CatalogSourceId): CatalogSourceInfo {
  return CATALOG_SOURCE_INFO[source];
}
