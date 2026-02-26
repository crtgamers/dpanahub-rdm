/**
 * Re-exporta constantes de mensajes desde shared para uso en el frontend.
 *
 * Expone: SUCCESS_MESSAGES, formatHistoryCleaned, formatHistoryCleanedOld, formatMemoryOptimized.
 * La fuente de verdad es shared/constants/messages.ts.
 *
 * @module constants/messages
 */

export {
  SUCCESS_MESSAGES,
  formatHistoryCleaned,
  formatHistoryCleanedOld,
  formatMemoryOptimized,
} from '../../shared/constants/messages';
