/**
 * Schema de mensajes i18n para tipado fuerte de keys (inferido del idioma base en).
 *
 * MessageSchema se usa como genérico en createI18n para que t() y $t() solo acepten keys válidas.
 *
 * @module locales/schema
 */

import en from './en/common.json';

/** Estructura de mensajes del idioma base (en). Usado como genérico en createI18n. */
export type MessageSchema = typeof en;
