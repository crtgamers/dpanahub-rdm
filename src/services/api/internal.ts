/**
 * Helpers internos del servicio API del frontend.
 *
 * getApi() devuelve window.api (PreloadApi) para invocar IPC al proceso main; en tests
 * o entornos sin Electron devuelve null. apiLogger es un logger con scope 'API'.
 * Reexporta API_ERRORS y GENERAL_ERRORS para uso en catalog, downloads, config, window.
 * No reexportar este módulo desde la API pública; usarlo solo dentro de src/services/api.
 *
 * @module api/internal
 */

import logger from '../../utils/logger';
import { API_ERRORS, GENERAL_ERRORS } from '../../constants/errors';
import type { PreloadApi } from '../../types/preload';

export const apiLogger = logger.child('API');

/**
 * Devuelve la API expuesta por el preload (window.api) para invocar IPC al proceso main.
 * En entorno sin Electron (p. ej. tests) devuelve null.
 *
 * @returns PreloadApi o null si no está disponible.
 */
export function getApi(): PreloadApi | null {
  if (typeof window === 'undefined' || !window.api) {
    apiLogger.warn('window.api no disponible');
    return null;
  }
  return window.api;
}

export { API_ERRORS, GENERAL_ERRORS };
