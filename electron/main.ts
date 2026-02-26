/**
 * Punto de entrada del proceso principal de Electron.
 *
 * Responsabilidades:
 * - Inicializar logger, directorio de config, base de datos de catálogo y servicios.
 * - Crear la ventana principal, registrar handlers IPC y arrancar el motor de descargas.
 * - Gestionar cierre ordenado: pausar motor, quitar handlers, cerrar DB.
 * - Capturar uncaughtException y unhandledRejection y notificar al renderer.
 *
 * Secuencia de arranque (tras app.whenReady()): ensureConfigDirectory → cleanOldLogs(5) →
 * createMainWindow({ loadContent: false }) → registerHandlers(mainWindow) →
 * registerStateHandlers(mainWindow) → registerUpdaterHandlers() → loadMainWindowContent(mainWindow) →
 * initAutoUpdater(mainWindow). Los servicios (ServiceManager) se inicializan bajo demanda al usar
 * búsqueda o descargas; el motor de descargas se inicializa al cargar el contenido (ensure-download-engine).
 *
 * Secuencia de cierre (before-quit): closeDownloadEngine() → removeStateHandlers() →
 * removeUpdaterHandlers() → removeHandlers() → database.close().
 *
 * Diagrama de flujo (Mermaid):
 *
 * flowchart TD
 *   subgraph Arranque["Arranque"]
 *     A[app.whenReady] --> B[ensureConfigDirectory]
 *     B --> C[cleanOldLogs]
 *     C --> D[createMainWindow]
 *     D --> E[registerHandlers]
 *     E --> F[registerStateHandlers]
 *     F --> G[registerUpdaterHandlers]
 *     G --> H[loadMainWindowContent]
 *     H --> I[initAutoUpdater]
 *   end
 *   subgraph Cierre["Cierre"]
 *     J[closeDownloadEngine] --> K[removeStateHandlers]
 *     K --> L[removeUpdaterHandlers]
 *     L --> M[removeHandlers]
 *     M --> N[database.close]
 *   end
 *
 * @module main
 */

import { app, BrowserWindow } from 'electron';
import { promises as fs } from 'fs';
import config from './config';
import { configureLogger, logger, cleanOldLogs, setMainWindowGetter } from './utils';
import database from './database';
import { createMainWindow, getMainWindow, loadMainWindowContent } from './window';
import { registerHandlers, removeHandlers } from './ipc';
import {
  registerStateHandlers,
  closeDownloadEngine,
  removeStateHandlers,
} from './ipcStateHandlers';
import { initAutoUpdater, registerUpdaterHandlers, removeUpdaterHandlers } from './updater';

configureLogger({
  fileLevel: 'info',
  consoleLevel: 'debug',
  maxSize: 10 * 1024 * 1024,
  isDev: !app.isPackaged,
});

setMainWindowGetter(getMainWindow);

const log = logger.child('Main');

// Suprimir deprecations de dependencias que no controlamos.
// - console-message: de Chromium/Electron.
// - url.parse(): proviene de electron-updater (HttpExecutor); nuestro código ya usa new URL().
process.on('warning', (warning: Error & { name: string; message: string; stack?: string }) => {
  if (warning.name === 'DeprecationWarning' && warning.message.includes('console-message')) {
    return;
  }
  if (warning.name === 'DeprecationWarning' && warning.message.includes('url.parse()')) {
    // Silenciar: viene de electron-updater, no de nuestro código. Solo registro en debug.
    log.debug?.('Deprecación url.parse() (dependencia electron-updater):', warning.message);
    return;
  }
});

/**
 * Envía un error al renderer para mostrarlo en la UI (toast/consola).
 * Solo se ejecuta si la ventana principal existe y no está destruida.
 *
 * @param error - Error o valor rechazado (se normaliza a Error).
 * @param type - Origen del error para etiquetado en el frontend.
 */
function sendErrorToRenderer(
  error: Error | unknown,
  type: 'uncaught' | 'uncaughtException' | 'unhandledRejection' = 'uncaught'
): void {
  try {
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
      const err = error instanceof Error ? error : new Error(String(error));
      const errorInfo = {
        type,
        message: err?.message ?? String(error ?? 'Error desconocido'),
        stack: err?.stack,
        timestamp: Date.now(),
        severity: 'error',
      };
      mainWindow.webContents.send('error-notification', errorInfo);
    }
  } catch (sendError) {
    log.error('Error enviando notificación al renderer:', sendError);
  }
}

/** Evita cerrar la app por errores tipo taskkill "proceso no encontrado" (p. ej. tras extracción 7z en Windows). */
function isProcessNotFoundError(err: Error): boolean {
  const msg = (err?.message ?? '').normalize('NFC');
  return (
    /no se encontr[oó] el proceso/i.test(msg) ||
    /process.*not found|not found.*process/i.test(msg) ||
    (/no se encontr/.test(msg) && /proceso|process/.test(msg))
  );
}

process.on('uncaughtException', (error: Error & { code?: string }) => {
  log.error('=== ERROR NO CAPTURADO ===');
  log.error('Error:', error.message);
  log.error('Stack:', error.stack);
  log.error('=========================');
  sendErrorToRenderer(error, 'uncaughtException');
  if (isProcessNotFoundError(error)) {
    log.warn('Error "proceso no encontrado" ignorado para evitar cierre de la aplicación.');
    return;
  }
  if (error.code === 'EADDRINUSE' || error.code === 'EACCES') {
    log.error('Error crítico del sistema, cerrando aplicación...');
    app.quit();
  }
});

process.on('unhandledRejection', (reason: unknown, _promise: Promise<unknown>) => {
  log.error('=== PROMESA RECHAZADA ===');
  log.error('Razón:', reason);
  if (reason instanceof Error) {
    log.error('Stack:', reason.stack);
  }
  log.error('=========================');
  const error = reason instanceof Error ? reason : new Error(String(reason));
  sendErrorToRenderer(error, 'unhandledRejection');
});

let isCleaningUp = false;
let appFullyInitialized = false;

/**
 * Crea el directorio de configuración del usuario si no existe.
 * Necesario para guardar config JSON, downloads.db y window-state antes de usarlos.
 */
async function ensureConfigDirectory(): Promise<void> {
  try {
    await fs.access(config.paths.configPath);
  } catch {
    await fs.mkdir(config.paths.configPath, { recursive: true });
    log.info('Directorio de configuración creado:', config.paths.configPath);
  }
}

/**
 * Inicialización completa de la aplicación tras app.whenReady().
 * Orden: directorio config → logs → DB catálogo → ventana → servicios → IPC → motor descargas.
 * Si la DB de catálogo falla, se hace quit(); el motor se inicia después de cargar el contenido.
 */
async function initialize(): Promise<void> {
  const endInit = logger.startOperation?.('Inicialización de aplicación') ?? (() => {});

  log.separator?.('INICIANDO DPANA HUB – ROM DOWNLOAD MANAGER');
  log.info('Versión de Electron:', process.versions.electron);
  log.info('Versión de Node:', process.versions.node);
  log.info('Plataforma:', process.platform);
  log.info('Modo:', app.isPackaged ? 'Producción' : 'Desarrollo');
  log.info('Archivo de log:', logger.getFilePath?.());

  await ensureConfigDirectory();
  await cleanOldLogs(5);

  // No cargar DB al inicio: el usuario elige Myrient o LoLROMs desde la pantalla de inicio
  log.info('Aplicación lista; base de datos se cargará al seleccionar fuente');

  const mainWindow = await createMainWindow({ loadContent: false });

  // Servicios (Search, Download, Queue, File) se inicializan bajo demanda al buscar o usar descargas
  log.info('Servicios de negocio se cargarán bajo demanda');

  registerHandlers(mainWindow);
  registerStateHandlers(mainWindow);
  registerUpdaterHandlers();
  await loadMainWindowContent(mainWindow);

  initAutoUpdater(mainWindow);

  endInit('exitosa');
  log.separator?.('APLICACIÓN LISTA');
  appFullyInitialized = true;
}

app.whenReady().then(initialize);

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    initialize();
  }
});

app.on('window-all-closed', () => {
  if (!appFullyInitialized) {
    return;
  }
  // Solo cerrar cuando no quede ninguna ventana (evita cierre al cerrar ventana de progreso de extracción).
  if (BrowserWindow.getAllWindows().length > 0) {
    return;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', (event: Electron.Event) => {
  if (isCleaningUp) {
    return;
  }
  event.preventDefault();
  isCleaningUp = true;

  cleanup()
    .then(() => {
      log.info('Limpieza completada, cerrando aplicación...');
      app.quit();
    })
    .catch(error => {
      log.error('Error en limpieza durante before-quit:', error);
      app.quit();
    });
});

/**
 * Cierre ordenado antes de salir: detiene el motor de descargas, quita handlers IPC
 * y cierra la base de datos de catálogo. El orden evita que el renderer siga
 * enviando peticiones mientras se cierran recursos.
 */
async function cleanup(): Promise<void> {
  log.separator?.('LIMPIANDO RECURSOS (SAFE SHUTDOWN)');

  try {
    await closeDownloadEngine();
    log.info('DownloadEngine cerrado');
  } catch (error) {
    log.warn('Error cerrando DownloadEngine:', error);
  }

  removeStateHandlers();
  removeUpdaterHandlers();
  removeHandlers();
  log.info('Handlers IPC removidos');

  database.close();
  log.info('Database de índice cerrada');

  log.separator?.('APLICACIÓN CERRADA');
}
