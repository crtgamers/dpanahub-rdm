/**
 * Sesiones por descarga para invalidar operaciones al pausar o cancelar.
 *
 * createSession(downloadId) genera un sessionId único; isCurrent(downloadId, sessionId)
 * indica si la sesión sigue siendo la activa. Al pausar/cancelar se invalida la sesión
 * y los callbacks en curso pueden comprobar isCurrent antes de actualizar estado.
 *
 * @module engines/SessionManager
 */

/**
 * Gestiona sesiones por descarga para invalidar operaciones al pausar o cancelar.
 * Los callbacks en curso pueden comprobar isCurrent() antes de actualizar estado.
 */
export class SessionManager {
  private sessions = new Map<number, string>();

  /**
   * Crea una sesión nueva para la descarga y devuelve su ID único.
   * @param downloadId - ID de la descarga.
   * @returns sessionId único (timestamp + random).
   */
  createSession(downloadId: number): string {
    const sessionId = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    this.sessions.set(downloadId, sessionId);
    return sessionId;
  }

  /** Invalida la sesión de la descarga (p. ej. al pausar o cancelar). */
  invalidate(downloadId: number): void {
    this.sessions.delete(downloadId);
  }

  /**
   * Devuelve el sessionId actual de la descarga, o null si no hay sesión.
   * @param downloadId - ID de la descarga.
   * @returns sessionId o null.
   */
  getSessionId(downloadId: number): string | null {
    return this.sessions.get(downloadId) ?? null;
  }

  /**
   * Indica si el sessionId sigue siendo el activo para la descarga (no se pausó/canceló después).
   * @param downloadId - ID de la descarga.
   * @param sessionId - ID de sesión a comprobar; si null devuelve true.
   * @returns true si la sesión es la actual o sessionId es null.
   */
  isCurrent(downloadId: number, sessionId: string | null): boolean {
    if (!sessionId) return true;
    return this.getSessionId(downloadId) === sessionId;
  }
}

const sessionManager = new SessionManager();
export default sessionManager;
