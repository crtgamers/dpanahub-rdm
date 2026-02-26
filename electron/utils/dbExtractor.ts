/**
 * Extracción de la base de datos SQLite desde archivo .7z comprimido.
 *
 * Extraído de database.ts para reducir el "God Object" y separar la lógica de
 * extracción (I/O + proceso externo) de la lógica de consultas SQL.
 *
 * @module dbExtractor
 */

import { spawn } from 'child_process';
import { BrowserWindow, app } from 'electron';
import fs from 'fs';
import path from 'path';
import { getMainWindow } from '../window';
import { logger } from './logger';
import { readJSONFile } from './fileHelpers';

const log = logger.child('DbExtractor');

/** Claves de color primario; deben coincidir con src/composables/useSettings.ts */
type PrimaryColorKey = 'green' | 'blue' | 'red' | 'purple' | 'orange' | 'cyan';

/** Mapa de color primario (mismo valor que PRIMARY_COLORS en useSettings) para la ventana de progreso. */
const PRIMARY_COLORS: Record<PrimaryColorKey, { value: string; hover: string }> = {
  green: { value: '#4CAF50', hover: '#45a049' },
  blue: { value: '#2196F3', hover: '#1976D2' },
  red: { value: '#f44336', hover: '#d32f2f' },
  purple: { value: '#9c27b0', hover: '#7b1fa2' },
  orange: { value: '#ff9800', hover: '#f57c00' },
  cyan: { value: '#00bcd4', hover: '#0097a7' },
};

function hexToRgb(hex: string): string {
  const match = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!match) return '16, 185, 129';
  return [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)].join(', ');
}

/** Clave del tema visual; debe coincidir con useSettings (VisualThemeKey). */
type VisualThemeKey = 'glassmorphism' | 'aero';

interface ProgressThemeVars {
  '--bg-main': string;
  '--bg-secondary': string;
  '--border-color': string;
  '--text-primary': string;
  '--text-secondary': string;
  '--text-muted': string;
  '--primary-color': string;
  '--primary-alpha': string;
  '--shadow-glow': string;
  '--aero-inner-glow'?: string;
  '--aero-panel-shadow'?: string;
  '--aero-border-highlight'?: string;
  '--radius-lg'?: string;
}

const DARK_THEME: Omit<ProgressThemeVars, '--primary-color' | '--primary-alpha' | '--shadow-glow'> =
  {
    '--bg-main': '#0b0f1a',
    '--bg-secondary': 'rgba(31,41,55,0.5)',
    '--border-color': 'rgba(75,85,99,0.3)',
    '--text-primary': '#f9fafb',
    '--text-secondary': '#9ca3af',
    '--text-muted': '#8b92a0',
    '--radius-lg': '0.75rem',
  };

const LIGHT_THEME: Omit<
  ProgressThemeVars,
  '--primary-color' | '--primary-alpha' | '--shadow-glow'
> = {
  '--bg-main': '#f3f4f6',
  '--bg-secondary': 'rgba(255,255,255,0.6)',
  '--border-color': 'rgba(209,213,219,0.5)',
  '--text-primary': '#111827',
  '--text-secondary': '#4b5563',
  '--text-muted': '#4b5563',
  '--radius-lg': '0.75rem',
};

/** Paletas Frutiger Aero (oscuro y claro) para el modal de progreso. */
const AERO_DARK_THEME: Omit<
  ProgressThemeVars,
  '--primary-color' | '--primary-alpha' | '--shadow-glow'
> = {
  '--bg-main': 'rgba(11,30,61,0.72)',
  '--bg-secondary': 'rgba(20,70,140,0.5)',
  '--border-color': 'rgba(100,190,255,0.22)',
  '--text-primary': '#f0f8ff',
  '--text-secondary': '#a0d0f0',
  '--text-muted': '#78b8e0',
  '--aero-inner-glow': 'inset 0 1px 1px 0 rgba(255,255,255,0.15)',
  '--aero-panel-shadow': '0 8px 40px rgba(0,30,80,0.4)',
  '--aero-border-highlight': 'rgba(180,230,255,0.3)',
  '--radius-lg': '0.875rem',
};

const AERO_LIGHT_THEME: Omit<
  ProgressThemeVars,
  '--primary-color' | '--primary-alpha' | '--shadow-glow'
> = {
  '--bg-main': 'rgba(214,236,250,0.7)',
  '--bg-secondary': 'rgba(255,255,255,0.55)',
  '--border-color': 'rgba(100,180,240,0.4)',
  '--text-primary': '#0a1e38',
  '--text-secondary': '#2a5578',
  '--text-muted': '#3a6590',
  '--aero-inner-glow': 'inset 0 1px 2px 0 rgba(255,255,255,0.9)',
  '--aero-panel-shadow': '0 8px 36px rgba(0,50,120,0.15)',
  '--aero-border-highlight': 'rgba(255,255,255,0.8)',
  '--radius-lg': '0.875rem',
};

/**
 * Construye el HTML de la ventana de progreso aplicando tema (claro/oscuro), tema visual
 * (glassmorphism / aero) y color primario desde ui-preferences.json.
 */
async function buildProgressHtml(): Promise<string> {
  let isDarkMode = true;
  let primaryColorKey: PrimaryColorKey = 'green';
  let visualTheme: VisualThemeKey = 'glassmorphism';

  try {
    const prefs = await readJSONFile('ui-preferences.json');
    if (prefs && typeof prefs === 'object') {
      const p = prefs as {
        isDarkMode?: boolean;
        primaryColor?: string;
        visualTheme?: string;
      };
      if (typeof p.isDarkMode === 'boolean') isDarkMode = p.isDarkMode;
      if (typeof p.primaryColor === 'string' && p.primaryColor in PRIMARY_COLORS) {
        primaryColorKey = p.primaryColor as PrimaryColorKey;
      }
      if (p.visualTheme === 'aero' || p.visualTheme === 'glassmorphism') {
        visualTheme = p.visualTheme;
      }
    }
  } catch {
    // Sin preferencias guardadas: tema oscuro, verde, glassmorphism
  }

  const useAero = visualTheme === 'aero';
  const base = useAero
    ? isDarkMode
      ? AERO_DARK_THEME
      : AERO_LIGHT_THEME
    : isDarkMode
      ? DARK_THEME
      : LIGHT_THEME;

  const colorConfig = PRIMARY_COLORS[primaryColorKey] ?? PRIMARY_COLORS.green;
  const rgb = hexToRgb(colorConfig.value);
  const primaryAlpha = `rgba(${rgb}, 0.2)`;
  const shadowGlow = `0 0 15px rgba(${rgb}, 0.2)`;

  const vars: ProgressThemeVars = {
    ...base,
    '--primary-color': colorConfig.value,
    '--primary-alpha': primaryAlpha,
    '--shadow-glow': shadowGlow,
  };

  const rootCss = Object.entries(vars)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}:${v}`)
    .join(';');

  // Tarjeta: en Aero usa reflejo interior + sombra de panel + borde superior brillante; en Glass solo shadow-glow
  const cardShadow = useAero
    ? 'var(--aero-inner-glow), var(--aero-panel-shadow)'
    : 'var(--shadow-glow)';
  const cardBorderTop = useAero ? 'border-top:1px solid var(--aero-border-highlight);' : '';

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>:root{${rootCss};}*{box-sizing:border-box;}html,body{height:100%;margin:0;}body{font-family:'Inter',system-ui,sans-serif;background:var(--bg-main);color:var(--text-primary);display:flex;flex-direction:column;justify-content:center;align-items:center;padding:2rem;text-align:center;line-height:1.6;}.card{background:var(--bg-secondary);border:1px solid var(--border-color);${cardBorderTop}border-radius:var(--radius-lg,0.75rem);padding:2rem 2.5rem;max-width:420px;box-shadow:${cardShadow};}h2{margin:0 0 1rem 0;font-size:1.25rem;font-weight:600;color:var(--primary-color);}.message{margin:0.5rem 0;color:var(--text-secondary);font-size:0.875rem;}.hint{margin-top:1rem;font-size:0.75rem;color:var(--text-muted);}.spinner{width:44px;height:44px;margin:1.5rem auto 0;border:3px solid var(--primary-alpha);border-top-color:var(--primary-color);border-radius:50%;animation:spin 0.8s linear infinite;}@keyframes spin{to{transform:rotate(360deg);}}</style></head><body><div class="card"><h2>Dpana Hub – ROM Download Manager</h2><p class="message">Se está descomprimiendo la base de datos por primera vez.</p><p class="message">Esto puede tardar varios minutos. Por favor espere.</p><p class="hint">La aplicación se abrirá automáticamente al terminar.</p><div class="spinner"></div></div></body></html>`;
}

/** Verifica si un archivo existe de forma asíncrona (no bloquea el main thread). */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Devuelve la ruta a 7z/7za si existe en el sistema; null si no se encuentra.
 * Comprueba ubicaciones estándar según plataforma.
 */
export async function find7zPath(): Promise<string | null> {
  let possiblePaths: string[];
  if (process.platform === 'darwin') {
    possiblePaths = [
      '/usr/local/bin/7z',
      '/opt/homebrew/bin/7z',
      path.join(process.resourcesPath ?? '', '7z'),
    ];
  } else if (process.platform === 'win32') {
    possiblePaths = [
      'C:\\Program Files\\7-Zip\\7z.exe',
      'C:\\Program Files (x86)\\7-Zip\\7z.exe',
      path.join(process.resourcesPath ?? '', '7z.exe'),
    ];
  } else {
    // Linux y demás
    possiblePaths = [
      '/usr/bin/7z',
      '/usr/bin/7za',
      '/usr/local/bin/7z',
      '/usr/local/bin/7za',
      path.join(process.resourcesPath ?? '', '7z'),
      path.join(process.resourcesPath ?? '', '7za'),
    ];
  }

  for (const p of possiblePaths) {
    if (await fileExists(p)) return p;
  }
  return null;
}

/**
 * Resuelve la ruta al binario 7-Zip, priorizando 7zip-bin (bundled) y cayendo a sistema.
 */
async function resolve7zBinary(): Promise<string> {
  // 1. Intentar 7zip-bin (incluido en dependencias)
  let sevenZipPath: string | null = null;
  try {
    const mod = await import('7zip-bin');
    sevenZipPath =
      (mod as { path7za?: string; default?: { path7za?: string } }).path7za ??
      (mod as { default?: { path7za?: string } }).default?.path7za ??
      null;
    if (
      sevenZipPath &&
      app.isPackaged &&
      sevenZipPath.includes('app.asar') &&
      !sevenZipPath.includes('app.asar.unpacked')
    ) {
      sevenZipPath = sevenZipPath.replace('app.asar', 'app.asar.unpacked');
    }
    if (!sevenZipPath || !(await fileExists(sevenZipPath))) sevenZipPath = null;
  } catch {
    log.debug?.('7zip-bin no disponible, usando fallback');
  }

  // 2. Fallback a 7-Zip del sistema
  if (!sevenZipPath) {
    sevenZipPath = await find7zPath();
    if (sevenZipPath) log.info('Usando 7-Zip del sistema:', sevenZipPath);
  } else {
    log.info('Usando 7zip-bin (binario incluido):', sevenZipPath);
  }

  if (!sevenZipPath) {
    const hint =
      process.platform === 'win32'
        ? 'Instala 7-Zip desde https://www.7-zip.org/ o coloca el archivo .db (myrient_data.db o lolrom_data.db) en la carpeta resources de la aplicación.'
        : 'Instala 7-Zip (p. ej. pkg install 7z o apt install p7zip-full) o coloca el archivo .db correspondiente en la carpeta resources.';
    throw new Error(`No se encontró 7-Zip para extraer la base de datos.\n\n${hint}`);
  }

  return sevenZipPath;
}

/**
 * Extrae la base de datos desde el .7z usando 7-Zip (sistema o 7zip-bin);
 * muestra ventana de progreso durante la extracción.
 * Se usa tanto para myrient_data.db como para lolrom_data.db (mismo flujo).
 *
 * @param dbPath - Ruta destino del archivo .db.
 * @param compressed7zPath - Ruta del archivo .7z.
 */
export async function extractDatabase(dbPath: string, compressed7zPath: string): Promise<boolean> {
  const extractDir = path.dirname(dbPath);

  try {
    await fs.promises.mkdir(extractDir, { recursive: true });
  } catch (err) {
    log.warn('No se pudo crear directorio de extracción:', (err as Error).message);
  }

  const [sevenZipPath, progressHtml] = await Promise.all([resolve7zBinary(), buildProgressHtml()]);

  return new Promise((resolve, reject) => {
    const parent = getMainWindow() ?? undefined;
    const progressWindow = new BrowserWindow({
      width: 620,
      height: 480,
      minWidth: 320,
      minHeight: 240,
      maxWidth: 620,
      maxHeight: 480,
      show: false,
      frame: false,
      transparent: false,
      resizable: true,
      alwaysOnTop: true,
      parent: parent && !parent.isDestroyed() ? parent : undefined,
      modal: !!parent && !parent.isDestroyed(),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });

    progressWindow.once('ready-to-show', () => progressWindow.show());
    progressWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(progressHtml)}`);

    // No usar sevenZip.pid ni sevenZip.kill() después de 'close': en Windows, intentar matar
    // un proceso ya terminado puede provocar errores tipo "no se encontró el proceso" y cerrar la app.
    const sevenZip = spawn(sevenZipPath, ['x', compressed7zPath, `-o${extractDir}`, '-y'], {
      shell: false,
      windowsHide: true,
    });

    let errorOutput = '';

    sevenZip.stdout.on('data', (data: Buffer) => {
      const text = data.toString();
      const progressMatch = text.match(/(\d+)%/);
      if (progressMatch && log.debug) log.debug('7z progreso:', progressMatch[1] + '%');
    });

    sevenZip.stderr.on('data', (data: Buffer) => {
      errorOutput += data.toString();
    });

    const closeProgressWindow = () => {
      if (!progressWindow.isDestroyed()) {
        setImmediate(() => progressWindow.close());
      }
    };

    // En Windows, el cierre de la ventana puede provocar que Electron/Chromium intente terminar
    // un proceso por PID ya finalizado → "no se encontró el proceso" y cierre de la app.
    // Estrategia: ocultar la ventana de inmediato y retrasar el close() varios segundos.
    const isWin = process.platform === 'win32';
    const initialDelayMs = isWin ? 400 : 100;
    const closeDelayAfterHideMs = isWin ? 4000 : 0;

    const scheduleCloseProgressWindow = () => {
      setTimeout(() => {
        if (progressWindow.isDestroyed()) return;
        if (isWin) {
          progressWindow.hide();
          setTimeout(() => closeProgressWindow(), closeDelayAfterHideMs);
        } else {
          closeProgressWindow();
        }
      }, initialDelayMs);
    };

    sevenZip.on('close', (code: number) => {
      if (code === 0) {
        log.info('Extracción completada exitosamente');
        fs.promises
          .unlink(compressed7zPath)
          .then(() => log.info('Archivo .7z eliminado'))
          .catch((err: Error) => log.warn('No se pudo eliminar .7z:', err.message));
        resolve(true);
      } else {
        log.error('Error en extracción, código:', code);
        reject(new Error(`7-Zip falló con código ${code}: ${errorOutput}`));
      }
      scheduleCloseProgressWindow();
    });

    sevenZip.on('error', (err: NodeJS.ErrnoException) => {
      scheduleCloseProgressWindow();
      log.error('Error ejecutando 7-Zip:', err);
      if (err?.code === 'ENOENT') {
        const hint =
          process.platform === 'win32'
            ? 'Instala 7-Zip desde https://www.7-zip.org/ o coloca el archivo .db (myrient_data.db o lolrom_data.db) en la carpeta resources.'
            : 'Instala 7-Zip (p. ej. pkg install 7z o apt install p7zip-full) o coloca el archivo .db correspondiente en la carpeta resources.';
        reject(new Error(`No se encontró el ejecutable de 7-Zip (spawn ENOENT).\n\n${hint}`));
      } else {
        reject(err);
      }
    });
  });
}
