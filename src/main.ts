/**
 * Punto de entrada del frontend Vue (renderer de Electron).
 *
 * Orden de arranque: resolveAndSetInitialLocale(), applyInitialTheme(), createApp(App), app.use(i18n),
 * errorHandler/warnHandler globales, app.mount('#app'), logger.initBackendListener() (tras 100ms).
 * El idioma se resuelve desde guardado (ui-preferences) > sistema (getAppLocale/navigator) > es.
 *
 * @module src/main
 */

import { createApp } from 'vue';
import App from './App.vue';
import logger from './utils/logger';
import { showErrorToast } from './utils/errorHandler';
import { getAppLocale, readConfigFile } from './services/api';
import { DEFAULT_LOCALE } from './locales';
import { resolveInitialLocale, setAppLocale, i18n } from './plugins/i18n';
import { PRIMARY_COLORS } from './composables/useSettings';
import type { PrimaryColorKey } from './composables/useSettings';
import './style.css';

const vueLogger = logger.child('Vue');

/** Resuelve idioma (guardado > sistema > default), carga mensajes y establece locale en i18n. */
async function resolveAndSetInitialLocale(): Promise<void> {
  let systemLocale = DEFAULT_LOCALE;
  try {
    if (typeof window !== 'undefined' && window.api) {
      const res = await getAppLocale();
      if (res.success && typeof res.data === 'string') systemLocale = res.data;
    } else if (typeof navigator !== 'undefined') {
      systemLocale = navigator.language || DEFAULT_LOCALE;
    }
  } catch {
    systemLocale =
      typeof navigator !== 'undefined' ? navigator.language || DEFAULT_LOCALE : DEFAULT_LOCALE;
  }

  let savedLocale: string | null = null;
  try {
    const prefs = await readConfigFile('ui-preferences.json');
    if (prefs.success && prefs.data && typeof prefs.data === 'object') {
      const locale = (prefs.data as { locale?: string }).locale;
      if (typeof locale === 'string') savedLocale = locale;
    }
  } catch {
    // Sin preferencia guardada
  }

  const initialLocale = resolveInitialLocale(systemLocale, savedLocale);
  await setAppLocale(initialLocale);
  vueLogger.info('i18n: locale inicial', initialLocale);
}

function hexToRgbString(hex: string): string {
  const match = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!match) return '16, 185, 129';
  return [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)].join(', ');
}

/** Aplica color primario guardado a las variables CSS (para pantalla de carga y resto de la app). */
function applyInitialPrimaryColor(primaryColorKey: string): void {
  if (typeof document === 'undefined' || typeof document.documentElement === 'undefined') return;
  const key = primaryColorKey as PrimaryColorKey;
  const colorConfig = PRIMARY_COLORS[key] ?? PRIMARY_COLORS.green;
  const rgb = hexToRgbString(colorConfig.value);
  const root = document.documentElement;
  root.style.setProperty('--primary-color', colorConfig.value);
  root.style.setProperty('--primary-color-hover', colorConfig.hover);
  root.style.setProperty('--primary-color-rgb', rgb);
  root.style.setProperty('--primary-color-alpha', `rgba(${rgb}, 0.2)`);
  root.style.setProperty('--primary-color-alpha-08', `rgba(${rgb}, 0.08)`);
  root.style.setProperty('--primary-color-alpha-10', `rgba(${rgb}, 0.1)`);
  root.style.setProperty('--primary-color-alpha-12', `rgba(${rgb}, 0.12)`);
  root.style.setProperty('--primary-color-alpha-30', `rgba(${rgb}, 0.3)`);
  root.style.setProperty('--primary-glow', `0 0 1.25rem rgba(${rgb}, 0.3)`);
}

/** Aplica clases de tema visual, modo claro/oscuro y color primario antes del primer paint para evitar flash. */
async function applyInitialTheme(): Promise<void> {
  try {
    const prefs = await readConfigFile('ui-preferences.json');
    if (prefs.success && prefs.data && typeof prefs.data === 'object') {
      const data = prefs.data as {
        isDarkMode?: boolean;
        visualTheme?: string;
        primaryColor?: string;
      };
      if (typeof document !== 'undefined') {
        document.body.classList.toggle('light-mode', data.isDarkMode === false);
        if (data.visualTheme === 'aero') {
          document.body.classList.add('aero-theme');
        }
        if (typeof data.primaryColor === 'string' && data.primaryColor in PRIMARY_COLORS) {
          applyInitialPrimaryColor(data.primaryColor);
        }
      }
    }
  } catch {
    /* Sin preferencia guardada; se mantiene tema por defecto (dark glassmorphism). */
  }
}

/** Crea la app Vue, registra i18n, configura error/warn handlers y monta en #app. */
async function bootstrap(): Promise<void> {
  await resolveAndSetInitialLocale();
  await applyInitialTheme();

  const app = createApp(App);
  app.use(i18n);

  app.config.errorHandler = (err: unknown, instance: unknown, info: string): void => {
    vueLogger.error('Error en componente:', err);
    const comp = instance as { $?: { type?: { name?: string } } } | undefined;
    vueLogger.error('Componente:', comp?.$?.type?.name ?? 'Unknown');
    vueLogger.error('Info:', info);

    const t = i18n.global.t.bind(i18n.global);
    let errorTitle = t('errors.componentError');
    let errorMessage = t('errors.componentErrorHint');

    const message = err instanceof Error ? err.message : String(err ?? '');
    const msg = message.toLowerCase();

    if (msg.includes('network') || msg.includes('fetch') || msg.includes('http')) {
      errorTitle = t('errors.connectionError');
      errorMessage = t('errors.connectionErrorHint');
    } else if (msg.includes('timeout')) {
      errorTitle = t('errors.timeout');
      errorMessage = t('errors.timeoutHint');
    } else if (msg.includes('permission') || msg.includes('access')) {
      errorTitle = t('errors.permissionError');
      errorMessage = t('errors.permissionErrorHint');
    } else if (msg.includes('quota') || msg.includes('storage')) {
      errorTitle = t('errors.storageError');
      errorMessage = t('errors.storageErrorHint');
    } else if (msg.includes('cannot read') || msg.includes('undefined') || msg.includes('null')) {
      errorTitle = t('errors.dataError');
      errorMessage = t('errors.dataErrorHint');
    } else if (message) {
      errorMessage = `Error: ${message.substring(0, 150)}${message.length > 150 ? '...' : ''}`;
    }

    showErrorToast({
      title: errorTitle,
      message: errorMessage,
      type: 'error',
      duration: 8000,
    });
  };

  app.config.warnHandler = (msg: string, _instance: unknown, trace?: string): void => {
    vueLogger.warn('Advertencia:', msg);
    if (trace) vueLogger.warn('Trace:', trace);
  };

  app.mount('#app');
  vueLogger.info('Aplicación montada correctamente');

  setTimeout(() => {
    logger.initBackendListener();
  }, 100);
}

bootstrap().catch(err => {
  vueLogger.error('Error en arranque:', err);
});
