/**
 * Limitador de frecuencia de requests por identificador (ventana deslizante).
 *
 * Cada identificador (p. ej. hostname o senderId) tiene una lista de timestamps;
 * isAllowed(identifier) comprueba si hay menos de maxRequests en los últimos windowMs
 * y, si sí, registra la request y devuelve true. record() registra sin comprobar (para
 * descargas ya autorizadas). cleanup() elimina entradas sin requests recientes.
 *
 * @module rateLimiter
 */

import { logger } from './logger';

const log = logger.child('RateLimiter');

export interface RateLimiterStatus {
  count: number;
  remaining: number;
  resetTime: number;
  resetInMs: number;
}

export interface RateLimiterStats {
  totalIdentifiers: number;
  maxRequests: number;
  windowMs: number;
}

export class RateLimiter {
  private maxRequests: number;
  private windowMs: number;
  private requests = new Map<string, number[]>();

  /**
   * @param maxRequests - Máximo de requests permitidas por ventana.
   * @param windowMs - Duración de la ventana en milisegundos.
   * @throws Error si maxRequests o windowMs <= 0.
   */
  constructor(maxRequests: number, windowMs: number) {
    if (maxRequests <= 0 || windowMs <= 0) {
      throw new Error('maxRequests y windowMs deben ser mayores a 0');
    }

    this.maxRequests = maxRequests;
    this.windowMs = windowMs;

    log.info(`RateLimiter inicializado: ${maxRequests} requests por ${windowMs}ms`);
  }

  /**
   * Registra una request para el identificador (sin comprobar límite).
   * Usado al registrar una descarga ya autorizada para que el conteo sea correcto.
   * @param identifier - Identificador (p. ej. hostname).
   */
  record(identifier: string): void {
    const now = Date.now();
    const userRequests = this.requests.get(identifier) ?? [];
    const recentRequests = userRequests.filter(ts => now - ts < this.windowMs);
    recentRequests.push(now);
    this.requests.set(identifier, recentRequests);
  }

  /**
   * Comprueba si el identificador puede hacer una request más (dentro del límite) y, si sí, la registra.
   * @param identifier - Identificador (hostname, senderId, etc.).
   * @returns true si se permite y se registra la request; false si se excedió el límite.
   */
  isAllowed(identifier: string): boolean {
    if (!identifier || typeof identifier !== 'string') {
      log.warn('RateLimiter: identifier inválido, rechazando request');
      return false;
    }

    const now = Date.now();
    const userRequests = this.requests.get(identifier) ?? [];
    const recentRequests = userRequests.filter(ts => now - ts < this.windowMs);

    if (recentRequests.length >= this.maxRequests) {
      log.debug(
        `Rate limit excedido para ${identifier}: ${recentRequests.length}/${this.maxRequests} requests en ${this.windowMs}ms`
      );
      return false;
    }

    recentRequests.push(now);
    this.requests.set(identifier, recentRequests);

    return true;
  }

  /**
   * Estado actual del identificador (cuántas requests en ventana, cuándo se resetea).
   * @param identifier - Identificador.
   * @returns RateLimiterStatus o null si no hay requests recientes.
   */
  getStatus(identifier: string): RateLimiterStatus | null {
    if (!identifier) return null;

    const now = Date.now();
    const userRequests = this.requests.get(identifier) ?? [];
    const recentRequests = userRequests.filter(ts => now - ts < this.windowMs);

    if (recentRequests.length === 0) return null;

    const oldestRequest = Math.min(...recentRequests);
    const resetTime = oldestRequest + this.windowMs;

    return {
      count: recentRequests.length,
      remaining: Math.max(0, this.maxRequests - recentRequests.length),
      resetTime,
      resetInMs: Math.max(0, resetTime - now),
    };
  }

  /**
   * Elimina entradas sin requests en la ventana actual (reducir memoria).
   * @returns Número de identificadores eliminados.
   */
  cleanup(): number {
    const now = Date.now();
    let removedCount = 0;

    for (const [identifier, requests] of this.requests.entries()) {
      const recentRequests = requests.filter(ts => now - ts < this.windowMs);

      if (recentRequests.length === 0) {
        this.requests.delete(identifier);
        removedCount++;
      } else {
        this.requests.set(identifier, recentRequests);
      }
    }

    return removedCount;
  }

  /** Elimina todo el historial de requests del identificador. @returns true si existía. */
  reset(identifier: string): boolean {
    if (this.requests.has(identifier)) {
      this.requests.delete(identifier);
      return true;
    }
    return false;
  }

  /** Elimina todos los identificadores. @returns Número de identificadores que había. */
  resetAll(): number {
    const count = this.requests.size;
    this.requests.clear();
    log.info(`RateLimiter: todos los identificadores reseteados (${count})`);
    return count;
  }

  /** Estadísticas globales del limitador (totalIdentifiers, maxRequests, windowMs). */
  getStats(): RateLimiterStats {
    return {
      totalIdentifiers: this.requests.size,
      maxRequests: this.maxRequests,
      windowMs: this.windowMs,
    };
  }
}
