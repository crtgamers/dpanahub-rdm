/**
 * Módulo de actualizaciones automáticas (electron-updater).
 * Solo activo cuando la aplicación está empaquetada (producción).
 *
 * - Portable (un solo .exe): electron-updater descarga el .exe y lo ejecuta al reiniciar.
 * - Carpeta (dpanahub-rdm-win): se descarga el ZIP del release, se extrae y se reemplaza
 *   la carpeta in-place mediante un helper de PowerShell antes de reiniciar.
 *
 * @module updater
 */

import { app, BrowserWindow, ipcMain } from 'electron';
import { autoUpdater, type UpdateInfo, type ProgressInfo } from 'electron-updater';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import config from './config';
import { logger } from './utils';
import { createHandler } from './utils/ipcHelpers';

const log = logger.child('Updater');

const GITHUB_OWNER = 'crtgamers';
const GITHUB_REPO = 'dpanahub-rdm';

/** Ruta donde dejamos la actualización extraída (solo modo carpeta). */
let extractedUpdatePath: string | null = null;
/** Versión pendiente de instalar (solo modo carpeta). Reservado para uso futuro (ej. UI). */
let _pendingUpdateVersion: string | null = null;

/**
 * Devuelve la versión pendiente de instalar (solo modo carpeta), o null.
 * @returns Versión string (ej. "1.7.0") o null si no hay actualización descargada en modo carpeta.
 */
export function getPendingUpdateVersion(): string | null {
  return _pendingUpdateVersion;
}

/** Indica si el módulo de actualizaciones está activo (solo en builds empaquetados). */
export function isUpdaterEnabled(): boolean {
  return app.isPackaged;
}

/**
 * Indica si la app se ejecuta desde la carpeta descomprimida (dpanahub-rdm-win), no desde el .exe portable.
 * Se detecta si junto al ejecutable existe la carpeta "resources".
 * @returns true solo en Windows y cuando existe resources junto al .exe.
 */
export function isUnpackedDir(): boolean {
  if (process.platform !== 'win32') return false;
  const exeDir = path.dirname(process.execPath);
  const resourcesPath = path.join(exeDir, 'resources');
  return fs.existsSync(resourcesPath);
}

/**
 * Obtiene la URL del asset ZIP de Windows del release en GitHub.
 */
async function getWinZipAssetUrl(version: string): Promise<string> {
  const tag = `v${version}`;
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tags/${encodeURIComponent(tag)}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/vnd.github.v3+json' },
  });
  if (!res.ok) {
    throw new Error(`Release ${tag} no encontrada: ${res.status}`);
  }
  const data = (await res.json()) as {
    assets?: Array<{ name: string; browser_download_url: string }>;
  };
  const assets = data.assets ?? [];
  const zipAsset = assets.find(
    a => a.name.toLowerCase().endsWith('.zip') && a.name.toLowerCase().includes('win')
  );
  if (!zipAsset) {
    throw new Error(`No se encontró asset ZIP para Windows en ${tag}`);
  }
  return zipAsset.browser_download_url;
}

/**
 * Descarga el ZIP de la actualización y lo extrae en una carpeta temporal.
 * Solo para modo carpeta (unpacked). Devuelve la ruta de la carpeta extraída.
 */
async function downloadZipAndExtract(
  version: string,
  onProgress: (_percent: number) => void
): Promise<string> {
  const zipUrl = await getWinZipAssetUrl(version);
  const tempDir = app.getPath('temp');
  const zipPath = path.join(tempDir, `dpanahub-rdm-update-${version}.zip`);
  const extractDir = path.join(tempDir, `dpanahub-rdm-update-extract-${version}`);

  if (fs.existsSync(extractDir)) {
    fs.rmSync(extractDir, { recursive: true });
  }

  const response = await fetch(zipUrl);
  if (!response.ok) {
    throw new Error(`Error descargando: ${response.status}`);
  }
  const contentLength = response.headers.get('content-length');
  const total = contentLength ? parseInt(contentLength, 10) : 0;
  const body = response.body;
  if (!body) {
    throw new Error('Sin cuerpo en la respuesta');
  }

  const writer = fs.createWriteStream(zipPath);
  const reader = body.getReader();
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    writer.write(Buffer.from(value));
    received += value.length;
    if (total > 0) {
      onProgress(Math.min(100, Math.round((received / total) * 100)));
    }
  }
  writer.end();
  await new Promise<void>((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });

  if (!fs.existsSync(extractDir)) {
    fs.mkdirSync(extractDir, { recursive: true });
  }
  const { execSync } = await import('child_process');
  execSync(
    `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force"`,
    { stdio: 'inherit' }
  );
  try {
    fs.unlinkSync(zipPath);
  } catch (unlinkErr) {
    log.debug?.('No se pudo eliminar ZIP de actualización:', (unlinkErr as Error)?.message);
  }
  return extractDir;
}

/**
 * Ejecuta el helper de PowerShell que espera a que la app cierre, reemplaza los archivos
 * de la carpeta de la app con los de la actualización extraída y reinicia el ejecutable.
 */
function runUnpackedReplaceAndRestart(extractDir: string): void {
  const appDir = path.dirname(process.execPath);
  const exePath = path.join(appDir, 'dpanahub-rdm.exe');
  const psScript = `
$appDir = ${JSON.stringify(appDir)}
$extractDir = ${JSON.stringify(extractDir)}
$exePath = ${JSON.stringify(exePath)}
Start-Sleep -Seconds 3
$inner = Get-ChildItem -Path $extractDir -Directory | Select-Object -First 1
if ($inner) {
  Copy-Item -Path "$($inner.FullName)\\*" -Destination $appDir -Recurse -Force
}
Start-Process -FilePath $exePath
`;
  const scriptPath = path.join(app.getPath('temp'), 'dpanahub-rdm-update-apply.ps1');
  fs.writeFileSync(scriptPath, psScript, 'utf8');
  spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
    detached: true,
    stdio: 'ignore',
  }).unref();
}

/**
 * Inicializa el autoUpdater (electron-updater) y registra eventos para notificar al renderer.
 * En modo carpeta (unpacked) desactiva autoDownload y usa descarga/extracto ZIP manual.
 * Debe llamarse después de crear la ventana principal.
 * @param mainWindow - Ventana principal (para enviar update-checking, update-available, etc.); si null no hace nada.
 */
export function initAutoUpdater(mainWindow: BrowserWindow | null): void {
  if (!app.isPackaged) {
    log.debug('Actualizaciones desactivadas (modo desarrollo)');
    return;
  }
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const unpacked = isUnpackedDir();
  if (unpacked) {
    autoUpdater.autoDownload = false;
    log.info('Modo carpeta detectado: actualización in-place por ZIP');
  } else {
    autoUpdater.autoDownload = true;
  }
  autoUpdater.autoInstallOnAppQuit = true;

  const send = (channel: string, ...args: unknown[]) => {
    try {
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
        mainWindow.webContents.send(channel, ...args);
      }
    } catch (e) {
      log.warn('Error enviando evento de actualización al renderer:', e);
    }
  };

  autoUpdater.on('checking-for-update', () => {
    log.info('Comprobando actualizaciones...');
    send('update-checking');
  });

  autoUpdater.on('update-available', async (info: UpdateInfo) => {
    log.info('Actualización disponible:', info.version);
    send('update-available', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
    });

    if (unpacked) {
      try {
        send('update-download-progress', { percent: 0 });
        const extracted = await downloadZipAndExtract(info.version, percent => {
          send('update-download-progress', { percent });
        });
        extractedUpdatePath = extracted;
        _pendingUpdateVersion = info.version;
        send('update-download-progress', { percent: 100 });
        send('update-downloaded', { version: info.version });
      } catch (err) {
        log.error('Error descargando/extrayendo ZIP de actualización:', err);
        send('update-error', { message: (err as Error).message });
      }
    }
  });

  autoUpdater.on('update-not-available', () => {
    log.info('No hay actualizaciones disponibles');
    send('update-not-available');
  });

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    if (!unpacked) {
      send('update-download-progress', {
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total,
      });
    }
  });

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    if (!unpacked) {
      log.info('Actualización descargada:', info.version);
      send('update-downloaded', { version: info.version });
    }
  });

  autoUpdater.on('error', (err: Error) => {
    log.error('Error del actualizador:', err.message);
    send('update-error', { message: err.message });
  });

  setTimeout(async () => {
    try {
      const prefsPath = path.join(config.paths.configPath, 'ui-preferences.json');
      let autoCheck = true;
      if (fs.existsSync(prefsPath)) {
        const raw = fs.readFileSync(prefsPath, 'utf8');
        const prefs = JSON.parse(raw) as { autoCheckUpdates?: boolean };
        if (prefs.autoCheckUpdates === false) {
          autoCheck = false;
          log.info('Comprobación automática de actualizaciones desactivada por el usuario');
        }
      }
      if (autoCheck) {
        await autoUpdater.checkForUpdates();
      }
    } catch (e) {
      log.warn('Error en comprobación inicial de actualizaciones:', e);
    }
  }, 5000);
}

/**
 * Registra los handlers IPC: get-app-version, check-for-updates, quit-and-install.
 * El renderer puede invocarlos vía window.api.getAppVersion(), checkForUpdates(), quitAndInstall().
 */
export function registerUpdaterHandlers(): void {
  const register = (channel: string, handler: () => Promise<unknown> | unknown) => {
    ipcMain.handle(
      channel,
      createHandler(channel, (_event, ..._args) => handler(), {
        wrapSuccess: true,
        log,
        defaultErrorMessage: 'Error en actualizador',
      })
    );
  };

  register('get-app-version', () => app.getVersion());

  register('check-for-updates', async () => {
    if (!app.isPackaged) {
      return { skipped: true, reason: 'development' };
    }
    const result = await autoUpdater.checkForUpdates();
    return result?.updateInfo ? { version: result.updateInfo.version } : null;
  });

  register('quit-and-install', () => {
    if (!app.isPackaged) return;
    if (isUnpackedDir() && extractedUpdatePath) {
      runUnpackedReplaceAndRestart(extractedUpdatePath);
      extractedUpdatePath = null;
      _pendingUpdateVersion = null;
      setImmediate(() => app.quit());
    } else {
      autoUpdater.quitAndInstall(false, true);
    }
  });

  register('get-pending-update-version', () => getPendingUpdateVersion());
  register('is-updater-enabled', () => isUpdaterEnabled());
}

/** Quita los handlers IPC registrados por registerUpdaterHandlers (llamar en cleanup). */
export function removeUpdaterHandlers(): void {
  ipcMain.removeHandler('get-app-version');
  ipcMain.removeHandler('check-for-updates');
  ipcMain.removeHandler('quit-and-install');
  ipcMain.removeHandler('get-pending-update-version');
  ipcMain.removeHandler('is-updater-enabled');
}
