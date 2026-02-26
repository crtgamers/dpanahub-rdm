/**
 * @fileoverview Módulo de gestión y validación del directorio de descargas.
 * @module downloadPath
 *
 * Proporciona:
 * - Carpeta predeterminada multiplataforma: <Carpeta Descargas del Usuario>/dpanahub-downloads
 * - Validación robusta de rutas (raíz, directorios críticos, sensibles, permisos)
 * - Creación segura de directorios
 * - Normalización y protección contra path traversal
 *
 * Decisiones de seguridad:
 * - Bloqueo total para raíz del sistema y directorios críticos del SO.
 * - Advertencia (no bloqueo) para directorios sensibles.
 * - Validación de permisos de escritura y detección de rutas de solo lectura.
 * - Rutas normalizadas con path.resolve para evitar traversal (..).
 */

import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { logger } from './logger';

const log = logger.child('DownloadPath');

/** Nombre de la subcarpeta de la app dentro de la carpeta de descargas del usuario. */
const DEFAULT_DOWNLOADS_SUBDIR = 'dpanahub-downloads';

/**
 * Resultado extendido de validación de ruta de descargas.
 * - valid: si la ruta es aceptable para usar.
 * - blockReason: si no se puede usar en absoluto (solo para directorios críticos).
 * - warningReason: si es usable pero con advertencia (sensible, readonly, admin).
 */
export interface DownloadPathValidationResult {
  valid: boolean;
  path?: string;
  error?: string;
  /** Presente cuando la ruta es un directorio crítico del sistema (bloqueo total). */
  blockReason?: 'critical';
  /** Presente cuando se debe mostrar advertencia pero el usuario puede continuar. */
  warningReason?: 'sensitive' | 'readonly' | 'admin';
}

/**
 * Obtiene la carpeta de descargas del usuario usando APIs nativas de Electron.
 * - Windows: FOLDERID_Downloads (Shell)
 * - Linux: XDG_DOWNLOAD_DIR si está definido, si no $HOME/Downloads
 * - macOS: NSDownloadsDirectory
 * No se hardcodea "Downloads" ni "Descargas"; Electron resuelve según el SO e idioma.
 *
 * @returns Ruta absoluta de la carpeta de descargas del usuario.
 */
export function getUserDownloadsDir(): string {
  return path.resolve(app.getPath('downloads'));
}

/**
 * Obtiene la carpeta predeterminada de descargas de la aplicación:
 * <Carpeta Descargas del Usuario>/dpanahub-downloads
 *
 * @returns Ruta absoluta de la carpeta predeterminada (puede no existir aún).
 */
export function getDefaultDownloadDir(): string {
  const userDownloads = getUserDownloadsDir();
  return path.join(userDownloads, DEFAULT_DOWNLOADS_SUBDIR);
}

/**
 * Crea el directorio (y padres) si no existe.
 * Maneja errores de permisos y EEXIST (idempotente).
 *
 * @param dirPath - Ruta absoluta del directorio.
 * @returns Promise<true> si existe o se creó; lanza o devuelve error en caso contrario.
 */
export async function ensureDirectoryExists(
  dirPath: string
): Promise<{ ok: boolean; error?: string }> {
  if (!dirPath || typeof dirPath !== 'string' || dirPath.trim().length === 0) {
    return { ok: false, error: 'Ruta no proporcionada' };
  }
  const resolved = path.resolve(dirPath.trim());
  try {
    await fs.promises.mkdir(resolved, { recursive: true });
    return { ok: true };
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    const message =
      e.code === 'EACCES'
        ? 'Sin permisos para crear la carpeta'
        : e.code === 'EROOT' || e.code === 'EPERM'
          ? 'No se puede crear la carpeta en esta ubicación'
          : e.message || 'Error creando la carpeta';
    log.warn('Error creando directorio:', resolved, e.code, e.message);
    return { ok: false, error: message };
  }
}

/**
 * Normaliza una ruta para validación: resolve, trim, sin path traversal en resultado.
 *
 * @param input - Ruta en bruto.
 * @returns Ruta absoluta normalizada o null si inválida.
 */
export function normalizePathForValidation(input: string): string | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  try {
    const resolved = path.resolve(trimmed);
    if (resolved.includes('..')) return null;
    return resolved;
  } catch {
    return null;
  }
}

/**
 * Comprueba si la ruta es la raíz del sistema según la plataforma.
 * - Windows: raíz del volumen del sistema (ej. C:\)
 * - Linux/macOS: /
 */
export function isSystemRoot(resolvedPath: string): boolean {
  const normalized = resolvedPath.replace(/[/\\]+$/, '');
  if (process.platform === 'win32') {
    return /^[A-Za-z]:$/.test(normalized) || normalized === '';
  }
  return normalized === '';
}

/**
 * Devuelve las rutas críticas del sistema que no deben usarse nunca para descargas.
 * Son directorios esenciales del SO; escribir aquí puede dañar el sistema.
 */
function getCriticalSystemPaths(): string[] {
  const critical: string[] = [];
  if (process.platform === 'win32') {
    const systemDrive = process.env.SYSTEMDRIVE || 'C:';
    const drive = systemDrive.replace(/:$/, '');
    critical.push(
      path.join(drive + ':', 'Windows'),
      path.join(drive + ':', 'Program Files'),
      path.join(drive + ':', 'Program Files (x86)'),
      path.join(drive + ':', 'ProgramData'),
      path.join(drive + ':', 'Recovery'),
      path.join(drive + ':', 'System Volume Information'),
      path.join(drive + ':', '$Recycle.Bin')
    );
  } else if (process.platform === 'linux') {
    critical.push(
      '/bin',
      '/sbin',
      '/boot',
      '/lib',
      '/lib64',
      '/usr/bin',
      '/usr/lib',
      '/usr/sbin',
      '/usr/share',
      '/etc',
      '/var',
      '/dev',
      '/proc',
      '/sys'
    );
  } else if (process.platform === 'darwin') {
    critical.push(
      '/System',
      '/bin',
      '/sbin',
      '/usr/bin',
      '/usr/lib',
      '/Library',
      '/private',
      '/private/var',
      '/private/etc'
    );
  }
  return critical.map(p => path.resolve(p).toLowerCase());
}

/**
 * Devuelve rutas sensibles (advertencia, no bloqueo): por ejemplo raíz de usuario en Linux
 * o carpetas del sistema que podrían requerir permisos especiales.
 */
function getSensitivePaths(): string[] {
  const sensitive: string[] = [];
  if (process.platform === 'linux') {
    sensitive.push('/root', '/tmp', '/run', '/sys');
  } else if (process.platform === 'darwin') {
    sensitive.push('/Applications', '/opt', '/tmp', '/var');
  }
  if (process.platform === 'win32') {
    const systemDrive = process.env.SYSTEMDRIVE || 'C:';
    const drive = systemDrive.replace(/:$/, '');
    sensitive.push(path.join(drive + ':', 'Users', 'Public'));
  }
  return sensitive.map(p => path.resolve(p).toLowerCase());
}

/**
 * Comprueba si resolvedPath es igual o está dentro de alguna de las rutas base.
 * Comparación case-insensitive en Windows.
 */
function isPathUnder(resolvedPath: string, basePaths: string[]): boolean {
  const pathLower = process.platform === 'win32' ? resolvedPath.toLowerCase() : resolvedPath;
  const pathNorm = pathLower.replace(/[/\\]+$/, '') + path.sep;
  for (const base of basePaths) {
    const baseNorm = base.replace(/[/\\]+$/, '') + path.sep;
    if (pathNorm === baseNorm || pathNorm.startsWith(baseNorm)) return true;
  }
  return false;
}

/**
 * Comprueba si el directorio existe y es escribible (acceso WRITE).
 * Si no existe, comprueba si el directorio padre es escribible para poder crearlo.
 */
async function checkWriteAccess(dirPath: string): Promise<{ writable: boolean; error?: string }> {
  try {
    await fs.promises.access(dirPath, fs.constants.W_OK);
    return { writable: true };
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') {
      const parent = path.dirname(dirPath);
      if (parent === dirPath) return { writable: false, error: 'Ruta no válida' };
      return checkWriteAccess(parent);
    }
    if (e.code === 'EACCES' || e.code === 'EPERM') {
      return { writable: false, error: 'El directorio es de solo lectura o no tienes permisos' };
    }
    return { writable: false, error: e.message || 'Error de acceso' };
  }
}

/**
 * Valida una ruta de descargas: raíz, directorios críticos, sensibles y permisos.
 * No usa solo lista negra: combina detección de raíz, rutas críticas y validación de permisos.
 *
 * @param downloadPath - Ruta elegida por el usuario (o predeterminada).
 * @returns Resultado con valid, path normalizado, error y opcionalmente blockReason/warningReason.
 */
export async function validateDownloadPath(
  downloadPath: string
): Promise<DownloadPathValidationResult> {
  const resolved = normalizePathForValidation(downloadPath);
  if (!resolved) {
    return {
      valid: false,
      error: 'Ruta no válida o contiene caracteres no permitidos',
    };
  }

  const resolvedNorm = process.platform === 'win32' ? resolved.toLowerCase() : resolved;

  if (isSystemRoot(resolved)) {
    log.warn('Bloqueo: ruta raíz del sistema', resolved);
    return {
      valid: false,
      path: resolved,
      error: 'No se puede usar la raíz del sistema como carpeta de descargas',
      blockReason: 'critical',
    };
  }

  const criticalPaths = getCriticalSystemPaths();
  if (isPathUnder(resolvedNorm, criticalPaths)) {
    log.warn('Bloqueo: directorio crítico del sistema', resolved);
    return {
      valid: false,
      path: resolved,
      error:
        'No se puede usar este directorio porque es crítico para el sistema operativo. Selecciona otra ubicación.',
      blockReason: 'critical',
    };
  }

  const sensitivePaths = getSensitivePaths();
  let warningReason: 'sensitive' | 'readonly' | 'admin' | undefined;
  if (isPathUnder(resolvedNorm, sensitivePaths)) {
    warningReason = 'sensitive';
  }

  const writeCheck = await checkWriteAccess(resolved);
  if (!writeCheck.writable) {
    return {
      valid: false,
      path: resolved,
      error: writeCheck.error || 'No se puede escribir en esta ubicación',
      warningReason: 'readonly',
    };
  }

  return {
    valid: true,
    path: resolved,
    ...(warningReason && { warningReason }),
  };
}

/**
 * Versión síncrona ligera para uso en validación previa (p. ej. en IPC antes de operaciones async).
 * Solo comprueba raíz y directorios críticos; no comprueba permisos de escritura.
 * Para validación completa usar validateDownloadPath().
 */
export function validateDownloadPathSync(downloadPath: string): DownloadPathValidationResult {
  const resolved = normalizePathForValidation(downloadPath);
  if (!resolved) {
    return { valid: false, error: 'Ruta no válida o contiene caracteres no permitidos' };
  }

  const resolvedNorm = process.platform === 'win32' ? resolved.toLowerCase() : resolved;

  if (isSystemRoot(resolved)) {
    return {
      valid: false,
      path: resolved,
      error: 'No se puede usar la raíz del sistema como carpeta de descargas',
      blockReason: 'critical',
    };
  }

  const criticalPaths = getCriticalSystemPaths();
  if (isPathUnder(resolvedNorm, criticalPaths)) {
    return {
      valid: false,
      path: resolved,
      error:
        'No se puede usar este directorio porque es crítico para el sistema operativo. Selecciona otra ubicación.',
      blockReason: 'critical',
    };
  }

  const sensitivePaths = getSensitivePaths();
  if (isPathUnder(resolvedNorm, sensitivePaths)) {
    return { valid: true, path: resolved, warningReason: 'sensitive' };
  }

  return { valid: true, path: resolved };
}
