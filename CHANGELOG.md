# Changelog

Todos los cambios notables del proyecto se documentan en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/), y el proyecto adhiere a [Versionado Semántico](https://semver.org/lang/es/).

---

## [1.9.0] - 24-02-2026

Versión que incorpora **dos nuevos catálogos** (PleasureDome y My Abandonware), el **modal de enlaces magnet** para copiar o abrir en cliente externo, y la extensión del flujo de bases de datos y del indicador de estado en el sidebar a las cuatro fuentes. La aplicación permite explorar y descargar desde **Myrient**, **LoLROMs**, **PleasureDome** y **My Abandonware** con la misma experiencia unificada.

### Agregado

- **Catálogos PleasureDome y My Abandonware:**
  - Pantalla de inicio (HomeScreen) con cuatro fuentes seleccionables; carga de base de datos y rutas desde `config` para cada una (`pleasuredomeDbPath`, `pleasuredomeCompressed7zPath`, `myabandonwareDbPath`, `myabandonwareCompressed7zPath`).
  - Hosts permitidos para descargas: dominios de PleasureDome y My Abandonware (incl. CDN) en `config.security.allowedHosts`.
  - Constantes por fuente en `shared/constants/catalogSources.ts`: URLs de descarga (.7z) y de página web para las cuatro fuentes; uso en DatabaseMissingModal y en descarga de catálogo.
  - Script `build-db-7z.ts` ampliado para comprimir también `pleasuredome_data.db` y `myabandonware_data.db` a `.7z` cuando existan en `resources/`.
  - Claves i18n: `home.pleasuredome`, `home.myabandonware`, `home.directoryPleasureDome`, `home.directoryMyAbandonware`; mensajes en `modals.databaseMissing` por fuente.
- **Modal de enlaces magnet (MagnetLinkModal):**
  - Modal accesible (ARIA) que muestra el enlace magnet asociado a una descarga (o recurso), con opción para **copiar al portapapeles** y **abrir con cliente externo** (protocolo `magnet:`). Integrado en la cola de descargas cuando el ítem ofrece magnet link.
  - Claves i18n: `modals.magnetLink.*` (título, etiquetas, botones).
- Paso `depcheck` en CI para detectar dependencias no usadas.
- `overrides` de `minimatch` (^10.2.1) en package.json.
- Inclusión de `better-sqlite3` en `asarUnpack` para el build empaquetado.

### Cambiado

- **Sidebar:** indicador de estado de base de datos consulta y muestra el estado (operacional / comprimida / no encontrada) para las cuatro fuentes (Myrient, LoLROMs, PleasureDome, My Abandonware); cuando no hay fuente activa, se combina el estado de todas para mostrar el mejor disponible.
- **DatabaseMissingModal y descarga de catálogo:** soporte para las cuatro fuentes; mensaje y URL de descarga según `catalogSources`; backend `catalogDatabaseDownload.ts` y rutas de config para PleasureDome y My Abandonware.
- **Tipos y API:** `CatalogSource` y handlers IPC aceptan `'pleasuredome'` y `'myabandonware'`; `getDatabaseStatus`, `load-database`, `get-current-source` y flujo de favoritos/Romset Builder actualizados para las cuatro fuentes.
- Node: 24.11.1 → 24.13.1 (`.nvmrc` y `engines.node`).
- Workflows de build (Windows, Linux, macOS): uso de `node-version-file: ".nvmrc"`; cache de Electron y electron-builder; nombres de artefactos actualizados a `dpanahub-rdm-*`.

### Mejorado

- **Experiencia multi-catálogo:** el usuario puede elegir entre cuatro fuentes desde la pantalla de inicio, descargar la base de datos faltante desde la aplicación para cualquiera de ellas y navegar/encolar con el mismo flujo unificado (Romset Builder, favoritos, indicador de estado).

---

## [1.8.0] - 21-02-2026

Versión que incorpora el **indicador de estado de la base de datos** en la interfaz y el flujo de **verificación y descarga** de las bases de datos de catálogo (Myrient, LoLROMs) cuando no están presentes, mejorando la experiencia en instalaciones nuevas o sin datos preinstalados y ademas antenimiento que corrige la visualización de la versión en la UI y bugs relacionados con rutas de la aplicación y la carpeta de destino.

### Agregado

- **Indicador de estado de la base de datos (sidebar):**
  - En el panel lateral (footer del sidebar) se muestra el estado del catálogo: **Operacional** (base lista), **Comprimida** (solo .7z, pendiente de extracción) o **No encontrada** (falta el archivo).
  - El indicador se actualiza al cambiar de fuente (Myrient/LoLROMs) y al cargar la aplicación; usa colores/estilos distintos para cada estado (online, warning, error).
  - Claves i18n: `nav.databaseOperational`, `nav.databaseCompressed`, `nav.databaseNotFound`.
- **Verificación y descarga de bases de datos cuando faltan:**
  - **DatabaseMissingModal:** modal que se muestra cuando la base de datos de la fuente seleccionada no está disponible. Ofrece **Descargar** (descarga el .7z desde GitHub y lo guarda en la ruta configurada) y **Ir al sitio web** para descarga manual; barra de progreso durante la descarga y mensajes de error en caso de fallo.
  - **Backend:** módulo `catalogDatabaseDownload.ts` para descargar el archivo .7z del catálogo desde la URL configurada (p. ej. GitHub); creación de directorio si no existe, escritura en temporal y renombrado al finalizar; soporte de progreso y cancelación (AbortSignal).
  - **IPC:** handler para iniciar la descarga de catálogo y notificar progreso al renderer; integración con las rutas de config (`compressed7zPath`, `lolromCompressed7zPath`) y con `catalogSources` (URLs de descarga por fuente).
- **Modales de rutas críticas:** avisos dedicados cuando falta la carpeta de descargas (**NoDownloadFolderModal**) o cuando la ruta es sensible o crítica (**SensitivePathModal**, **CriticalPathModal**), guiando al usuario a configurar la carpeta o a descargar la base de datos según el caso.
- **Claves i18n:** sección `modals.databaseMissing.*` (título, mensaje, descargar, abrir sitio web, progreso, errores) y soporte para los nuevos modales de rutas.

### Cambiado

- **Sidebar:** consulta `getDatabaseStatus(source)` para obtener el estado de la base de datos (none | compressed | operational) y mostrar el indicador en el footer; cuando no hay fuente activa, se combina el estado de ambas fuentes (Myrient y LoLROMs) para mostrar el mejor disponible.
- **Flujo de inicio y selección de fuente:** si al elegir una fuente no está la base de datos (ni .db ni .7z), se muestra el DatabaseMissingModal en lugar de fallar en silencio; tras descargar el .7z, el extractor existente puede descomprimir al siguiente arranque o al cambiar de fuente.
- **Configuración y fuentes de catálogo:** uso de `shared/constants/catalogSources.ts` para URLs de descarga y metadatos por fuente; rutas de destino desde `config.paths`.

### Mejorado

- **Experiencia en instalación nueva:** el usuario puede descargar la base de datos de catálogo desde la aplicación (Myrient o LoLROMs) sin tener que colocar manualmente archivos en `resources/`, reduciendo pasos de configuración y errores por rutas incorrectas.

### Arreglos

- **Carpeta del programa:** corregido el bug por el cual la sección «Carpeta del programa» (o equivalente) no mostraba ningún contenido; la ruta y el listado se muestran correctamente.
- **Carpeta de destino:** ajustes en la configuración y uso de la carpeta de destino de descargas para evitar rutas incorrectas o contenido no visible.
- **Versión mostrada en Configuración:** la versión que aparece en la parte inferior del modal de Configuración se obtiene ahora de la aplicación (Electron) en lugar de un valor fijo; muestra la versión actual (p. ej. 1.7.1).
- **Versión en el actualizador:** la sección de Actualizaciones en Configuración muestra correctamente la versión actual de la aplicación (antes se mostraba 1.3.0 de forma incorrecta).

---

## [1.7.0] - 20-02-2026

Versión que incorpora nueva *documentación interna**: JSDoc completado en todo el código para facilitar mantenimiento y contribuciones. ademas tiene um **nuevo modo visual**: tema **Frutiger Aero** (también conocido como **Web 2.0 Gloss**), inspirado en el estilo Windows Vista/7 (2004–2013): brillante, colorido, con superficies glossy, reflejos superiores, iluminación direccional y profundidad 3D suave.

### Agregado

- **Tema visual Frutiger Aero / Web 2.0 Gloss:**
  - Selector de tema visual en **Configuración → Personalización**: **Glassmorphism** (por defecto) o **Aero Frutiger**.
  - Estilo Aero con variantes **claro** y **oscuro**: vidrio translúcido azulado, blur real (blur 20px), gradientes celeste–verde menta, bordes más redondeados y sombras difusas con tinte azulado.
  - En modo oscuro: fondos semi-transparentes, texto blanco-celeste, overlays y superficies con saturación alta; soporte para imagen de fondo borrosa (fondos en `public/logos/`).
  - En modo claro: fondos claros con reflejos superiores, acentos celeste/verde menta y estética glossy auténtica.
  - Persistencia del tema elegido en `ui-preferences.json`; aplicación de la clase `aero-theme` en `body` al arranque (en `main.ts`) para evitar parpadeo.
- **Estilos:** nuevo archivo `src/styles/aero-theme.css` con variables CSS para Frutiger Aero (glass, fondos, texto, bordes, overlays, sombras, radios, logs, botones, formularios, modales, cola, toasts, etc.) en ambas variantes claro/oscuro.
- **Claves i18n:** `settings.themeAero` («Aero Frutiger») y soporte de `visualTheme` en la sección de tema; selector visual en Settings con previsualización para Glassmorphism y Aero.

### Cambiado

- **useSettings:** nuevo estado `visualTheme` (`glassmorphism` | `aero`); función `setVisualTheme(theme)` y mapa `VISUAL_THEMES` con clase `aero-theme` para el tema Aero; aplicación de la clase en `body` al cargar preferencias y al cambiar de tema (con clase temporal `theme-transitioning` para transición suave).
- **SettingsModal:** selector de tema visual (theme picker) con dos opciones: Glassmorphism y Aero Frutiger; emisión de `set-visual-theme` al elegir tema.
- **App.vue:** enlace de `visualTheme` y `setVisualTheme` con SettingsModal; paso de `visualTheme` al modal de configuración.
- **main.ts:** al aplicar preferencias iniciales (`applyInitialTheme`), se aplica también `aero-theme` en `body` cuando `visualTheme === 'aero'`.

### Documentación

- **JSDoc** añadido o completado en módulos principales:
  - **electron/workers**: dbQueryWorker, downloadWorker (protocolo, interfaces, funciones). chunkMerger fue eliminado por no estar en uso (el merge real usa downloadWorker ASSEMBLE).
  - **electron/utils**: fileHelpers, nodeNormalizer, partialIntegrity, dbQueryWorkerManager, circuitBreaker, schemas, connectionTest, rateLimiter (ya documentado), index.
  - **electron/services**: BaseService, DownloadService, FileService, QueueService, SearchService, index (interfaces y métodos públicos).
  - **electron/engines**: DownloadMetrics, ConcurrencyController, ChunkResponseHandler, ChunkProgressAggregator, ChunkHelpers, AdaptiveConcurrencyController, types, index; resto ya documentado.
  - **src/composables**: useRomsetBuilder, useToastHandlers, useQueueContent, useHistorySection, useFilterPanel, useFavorites, useErrorHandling, useModalFocusTrap, useVirtualScroll, index; los demás ya tenían JSDoc.
  - **Frontend**: main.ts, plugins/i18n, locales (index, schema), constants (errors, messages), services/api/types.
  - **shared**: types (search, index), constants (queue, queueStateOrder, messages, errors).
- Descripciones de módulo (`@module`), `@param` y `@returns` en funciones y métodos exportados donde aplica.
- README y CHANGELOG actualizados para reflejar la documentación del código.

---

## [1.6.0] - 19-02-2026

Versión que incorpora el **Romset Builder**: un asistente (wizard) paso a paso para elegir catálogo, navegar por proyectos o compañías y carpetas, ver un resumen de archivos y tamaño, y agregar toda la carpeta a la cola de descargas de una vez.

### Agregado

- **Romset Builder (modal y composable):**
  - Acceso desde el menú lateral («Romset Builder»). Abre un wizard con pasos: **Fuente** (Myrient o LoLROMs) → **Navegación** (proyecto/compañía y carpetas anidadas) → **Resumen** (cantidad de archivos y tamaño estimado) → **Agregar a la cola**.
  - En Myrient, el primer nivel muestra solo proyectos oficiales (No-Intro, Redump, TOSEC, MAME, etc.); en LoLROMs se muestran las compañías desde la raíz. La navegación se adapta a la profundidad real de cada ruta: cuando la carpeta seleccionada contiene archivos, se pasa automáticamente al resumen.
  - Resumen calculado vía backend: total de archivos y tamaño en bytes (sin transferir la lista completa). Filtro de búsqueda en listas con muchas opciones (> 8 ítems). Breadcrumb y stepper visual para indicar el paso actual.
- **Backend:** handler IPC `romset-builder-summary` y método `database.getFoldersSummary(folderIds)` que devuelve `fileCount` y `totalSizeBytes` de forma recursiva sobre la base de datos del catálogo activo.
- **API frontend:** `getRomsetSummary(folderIds)` en `src/services/api/catalog.ts`; integración en el composable `useRomsetBuilder` para cargar hijos, navegar y obtener el resumen antes de encolar.
- **Claves i18n:** sección completa `romsetBuilder.*` (título, pasos, fuentes, resumen, botones, mensajes de error y éxito) en `en`, `es` y `es-CL`. Entrada en menú lateral: `nav.romsetBuilder`.

### Cambiado

- **App.vue:** manejo del evento `add-to-queue` del Romset Builder; llamada a la API existente para agregar descarga por carpeta (por ID) con opción `deferStart` según umbral de confirmación en lotes; toasts de éxito o error al agregar el romset a la cola.
- **useAppLayout:** expone `showRomsetBuilder` y `openRomsetBuilder` para abrir el modal desde el Sidebar.

---

## [1.5.0] - 16-02-2026

Versión de **soporte multi-catálogo y bases de datos unificadas**. Incluye pantalla de inicio para elegir fuente (Myrient o LoLROMs), compresión y descompresión idénticas para ambas bases de datos, y consistencia estructural en índices y tablas auxiliares.

### Agregado

- **Pantalla de inicio (HomeScreen):** selector de fuente de catálogo al arrancar: **Myrient** o **LoLROMs**. El usuario elige qué catálogo cargar antes de explorar. Accesible desde la navegación lateral para cambiar de fuente.
- **Soporte LoLROMs:** segundo catálogo disponible junto a Myrient. Base de datos `lolrom_data.db` (o `lolrom_data.7z` comprimida), tabla `content` o `elements`, host permitido `lolroms.com` para descargas.
- **Favoritos por fuente:** `useFavorites` distingue favoritos por fuente (`myrient` / `lolroms`); favoritos antiguos sin `source` se asumen como myrient.
- **Claves i18n:** `home.selectSource`, `home.myrient`, `home.lolroms`, `home.loadingSource`, `home.directoryMyrient`, `home.directoryLolroms`.

### Cambiado

- **Bases de datos unificadas:** `myrient_data.db` y `lolrom_data.db` siguen exactamente el mismo flujo de procesamiento:
  - **Compresión:** el script `build-db-7z.ts` comprime ambas bases a `.7z` en el build (igual que antes para myrient; ahora también para lolrom).
  - **Descompresión:** `dbExtractor.ts` extrae la base desde el `.7z` al arranque cuando falta el `.db`, para ambas fuentes.
  - **Esquema:** creación de índices (`idx_parent_id`, `idx_parent_type_name`) y tabla auxiliar `element_paths` aplicada por igual a ambas bases, manteniendo consistencia estructural.
- **Script build-db-7z:** procesa `myrient_data.db` y `lolrom_data.db`; comprime cada una que exista; requiere al menos myrient (db o 7z) para el build; lolrom es opcional.
- **Mensajes de error dbExtractor:** generalizados para mencionar ambos archivos (myrient_data.db o lolrom_data.db) cuando falta 7-Zip.

### Mejorado

- **database.ts:** `loadDatabase(source)` carga myrient o lolrom según la fuente; rutas desde config (`lolromDbPath`, `lolromCompressed7zPath`); mismo pipeline de índices y element_paths para ambas.
- **config.ts:** rutas `lolromDbPath` y `lolromCompressed7zPath`; `allowedHosts` incluye `lolroms.com`.
- **IPC:** handler `load-database` acepta `myrient` o `lolroms`; `get-current-source` devuelve la fuente activa.

---

## [1.4.2] - 12-02-2026

Versión de **refactor de estilos, preferencias de accesibilidad/rendimiento y consistencia visual**. Incluye CSS modular, tema aplicado antes del primer paint, opciones de animación y modo rendimiento, y documentación de tamaños de iconos.

### Agregado

- **Preferencia de animaciones (Configuración):** opción para elegir «Seguir sistema», «Reducir animaciones» o «Animaciones completas»; respeta `prefers-reduced-motion` cuando está en «Seguir sistema». Persistida en `ui-preferences.json` y aplicada con clases `reduce-motion` / `force-full-motion` en `body`.
- **Modo rendimiento (Configuración):** opción para desactivar blur, transparencia y efectos glass (glassmorphism) y mejorar FPS en equipos limitados. Persistida en preferencias; aplica clase `performance-mode` y atributo `data-reduced-effects` en `body`.
- **Documentación de iconos:** `docs/ICON-SIZES.md` con convención de tamaños Lucide (12–64 px) y uso recomendado por contexto (inline, botones, modales, empty states).
- **Claves i18n:** `settings.motionPreference`, `motionPreferenceHint`, `motionAuto`, `motionReduce`, `motionFull`; `settings.performanceSection`, `performanceMode`, `performanceModeHint`; `common.decrease`, `common.increase`; `downloadFile`; `filters.clearAllAria`, `addIncludeAria`, `removeItemAria`, `addExcludeAria`; `folderDownload.downloadFilteredAria`, `downloadAllAria`.

### Cambiado

- **Estilos globales:** `style.css` refactorizado a **CSS modular** en `src/styles/`: `tokens.css`, `reset-base.css`, `layout.css`, `components/` (forms, buttons, table, panels, modals), `utilities.css`, `components.css`, `themes.css`. Orden de carga definido para tokens → reset → layout → componentes → utilidades → temas.
- **Tema al arranque:** aplicación de la clase de tema (light-mode) **antes del primer paint** en `main.ts` (`applyInitialTheme`) leyendo `ui-preferences.json`, para evitar parpadeo (flash) al cargar la aplicación.
- **ErrorBoundary:** estilos migrados a variables CSS (`--bg-main`, `--danger-color`, `--text-secondary`, `--overlay-bg-10`, etc.); eliminados bloques duplicados `.light-mode` (el tema se hereda del sistema de temas global).
- **Componentes (iconos y accesibilidad):** uso consistente de tamaños de iconos Lucide según la convención (12–24 px según contexto); botones stepper en Settings con `aria-label` para «Decrease value» / «Increase value»; `aria-hidden="true"` en iconos decorativos donde aplica; etiquetas ARIA en filtros (limpiar todo, añadir/quitar ítems) y en opciones de descarga de carpeta (solo visibles / carpeta completa).

### Mejorado

- **useSettings:** soporte para `motionPreference` y `performanceMode`; `updateMotionClass()` y `updatePerformanceModeClass()`; listener de `prefers-reduced-motion` cuando la preferencia es «auto»; limpieza en `onUnmounted`. Preferencias de tema y modo aplicadas al cargar UI (incl. `updateThemeClass()` tras cargar prefs).
- **SettingsModal:** nueva sección «Animaciones» con selector de preferencia de movimiento; nueva sección «Rendimiento» con toggle de modo rendimiento; steppers con `aria-label` traducido.

---

## [1.4.0] - 11-02-2026

Versión de **mejoras de rendimiento, fluidez y experiencia responsive** derivadas de reportes de performance y de interfaz. Reduce re-renders, trabajo en el hilo principal y mejora la estabilidad visual (LCP/CLS) y la adaptación a distintas resoluciones y proporciones.

### Mejorado (Rendimiento y fluidez)

- **Cola de descargas (`useDownloads`):** lista ordenada memoizada (`sortedAllDownloads`); el orden se recalcula solo cuando cambian `stateVersion` o los criterios de ordenación, reduciendo CPU en actualizaciones de progreso. Peticiones de estado unificadas en un único debounce (`scheduleStateFetch`, 80 ms) para los eventos state-changed, completed, failed, chunk-failed y folder-add-complete.
- **Búsqueda (`useSearch`):** resultados ordenados en ref memoizada (`sortedSearchFiles`); el orden se actualiza solo al cambiar resultados o criterios de ordenación (menos trabajo en el hilo principal).
- **Resultados de búsqueda filtrados (`App.vue`):** `filteredSearchFolders` y `filteredSearchFiles` pasan a refs memoizadas actualizadas por `watch` sobre carpetas, archivos y filtros avanzados; se evita recalcular `applyFilters` en cada evaluación del computed.
- **Tabla de archivos (`FileTable.vue`):** mapa precalculado `downloadButtonInfo` (computed) y `getButtonInfo(id)` para texto, icono y clase del botón de descarga por fila; se elimina trabajo repetido por re-render.
- **Filtro de cola (`useQueueFilter`):** término de búsqueda con debounce de 150 ms para no filtrar en cada pulsación.
- **Virtual scroll (`useVirtualScroll`):** menos ResizeObservers (máximo 12), conjunto `observedIndicesForIO` para no re-observar índices ya registrados, poda por rango visible y thresholds simplificados `[0, 0.5, 1]`; menos callbacks durante el scroll.
- **Escalado de ventana (`useWindowScale`):** throttle de 120 ms (leading + trailing) en el evento `resize` para reducir re-renders al redimensionar.
- **Navegación (`useNavigation`):** en carpetas no raíz, `getChildren` y `getNodeInfo` se ejecutan en paralelo con `Promise.all`, reduciendo el tiempo hasta el primer listado.
- **Backend – estado de cola:** rate limit dedicado para `get-download-state` (p. ej. 3 req/s) en `ipcStateHandlers` para evitar picos de CPU en el proceso main cuando el renderer pide estado con alta frecuencia.
- **Limpieza de memoria:** poda de `overwriteInfo` en `useDownloads` al aplicar cada snapshot de estado, eliminando entradas huérfanas cuando se limpia la cola o se eliminan ítems.

### Mejorado (Interfaz responsive y estabilidad visual – LCP/CLS)

- **Sidebar:** ancho del slot fijo (`min-width: var(--sidebar-collapsed-width)`); cuando está expandido usa overlay (`position: fixed`) en lugar de empujar el contenido, evitando saltos de layout (CLS). Transición del texto solo con `opacity`; elementos en leave con `position: absolute` para no provocar reflow. Nav items con `min-height` para que no colapse la fila.
- **Área de contenido y cuadrícula de carpetas:** `min-width: 0` y `contain: layout` en `.content-area`; alturas mínimas en `.folder-btn` y `.folders-grid` para reservar espacio y reducir CLS al pintar carpetas.
- **LCP:** preload del logo en `index.html` (`<link rel="preload" href="/logo.svg" as="image">`) y `fetchpriority="high"` en el loader inicial; navegación ya optimizada con `getChildren`/`getNodeInfo` en paralelo.
- **Panel de descargas flotante:** anchos y alturas fluidos (`width: min(380px, calc(100vw - 3rem))`, `max-height: min(500px, 60vh)`) para adaptarse al viewport y a pantallas grandes o DPI alto.
- **Panel de filtros:** reglas para proporciones extremas: `min-aspect-ratio: 21/9` (ultrawide) con límite de ancho; `max-aspect-ratio: 9/16` (vertical) con ancho y márgenes adaptados.
- **Settings, toasts y tablas:** `min-width`/`max-width` adaptativos en viewports pequeños (p. ej. `min-width: min(320px, 100vw)` en Settings y modales); columnas de tablas con `min-width` reducidos en breakpoints 640px, 480px y 360px para reducir scroll horizontal.
- **Breakpoint 360px:** variable `--bp-xxs: 360px` y ajustes en título, breadcrumb y controles para móvil vertical.
- **DPI y legibilidad:** sustitución de `px` por `rem` en márgenes, padding y tamaños clave (titlebar, formularios, modales, loader); uso de `clamp()` en fuentes y espaciado para escalado fluido.

### Mejorado (Tamaño del build)

- **Dependencias de producción:** Solo `7zip-bin` y `better-sqlite3` permanecen en `dependencies`; Vue, vue-i18n, lucide-vue-next, zod, electron-log y electron-updater pasan a `devDependencies` (ya están incluidos en los bundles de Vite). Reduce el tamaño de `app.asar` en ~35–40 MB.
- **Locales de Chromium:** Configuración `electronLanguages: ["en-US", "es", "es-419"]` en electron-builder para incluir solo los idiomas necesarios y reducir la carpeta `locales/` en ~30–40 MB.

### Arreglos

- Entradas huérfanas en `overwriteInfo` al limpiar la cola o recibir snapshots que eliminan ítems; se podan automáticamente en cada actualización de estado.

---

## [1.3.0] - 10-02-2026

### Agregado

- **Panel de estadísticas de sesión (`StatisticsPanel`):** modal accesible desde el menú lateral que muestra métricas en tiempo real: velocidad actual, resumen de sesión (iniciadas, completadas, fallidas, bytes descargados), profundidad de cola, percentiles de latencia (p50/p95/p99), métricas por host y estado del circuit breaker. Datos vía IPC `get-session-metrics` (backend: `DownloadMetrics`, `DownloadEngine.getSessionMetrics()`). Soporte i18n (`stats.*`).
- **Filtro de cola:** composable `useQueueFilter` para filtrar la cola de descargas por estado (descargando, en cola, pausadas, completadas, error, etc.) y por término de búsqueda en nombre/ruta/URL.
- **Composable `useFileSelection`:** gestión centralizada de la selección de archivos en la vista de exploración y en resultados de búsqueda; extraído de `App.vue` para mejorar mantenibilidad.

Versión centrada en **internacionalización (i18n)** completa, auditoría de cadenas, validaciones automáticas y español como idioma principal. Incluye mejoras opcionales de la auditoría i18n: fallback en cadena, tipado fuerte de keys, script de validación de keys usadas, CI para locales, CONTRIBUTING para contribuidores y español por defecto.

- **Internacionalización (i18n) completa:** todos los textos visibles de la UI usan `t()` / vue-i18n; claves en `src/locales/{en,es,es-CL}/common.json` (362 keys). Español como **idioma principal**: `DEFAULT_LOCALE = 'es'`, selector con Español primero (es, es-CL, en).
- **Fallback en cadena:** es-CL → es → en; es → en; en → en (`FALLBACK_LOCALE_MAP` en `locales/index.ts`).
- **Tipado fuerte de keys:** esquema `MessageSchema` desde `en/common.json` en `locales/schema.ts`; `createI18n<{ message: MessageSchema }, SupportedLocale>()` para que `t()` solo acepte keys válidas (autocompletado y comprobación en compilación).
- **Script `validate-i18n-keys`:** recorre `src/**/*.vue` y `*.ts`, extrae keys literales de `t()`/`$t()` y comprueba que existan en `en/common.json`. Opción `--orphans` para listar keys definidas pero no usadas como literal. Comandos: `npm run validate-i18n-keys`, `npm run validate-i18n-keys:orphans`.
- **CI:** pasos «Validate locales» y «Validate i18n keys» en `.github/workflows/ci.yml` para bloquear PRs con idiomas desalineados o keys inexistentes.
- **CONTRIBUTING.md:** guía para contribuir con sección i18n: cómo añadir un idioma, no eliminar keys, no añadir keys que no existan en `en`, ejecutar `validate-locales` y `validate-i18n-keys` antes del PR. Tabla de comandos útiles.
- **Placeholder de carga async:** componente `AsyncLoadPlaceholder.vue` con `t('common.loading')` en lugar de texto fijo «Loading…».
- **Claves i18n adicionales:** `filters.statusFlags`, `downloads.chunk*` (ChunkProgressIndicator), `logs.saveDialog*`, `exportSuccess`/`exportError`/`exportFailed`, `errors.loadContentDetail`, `settingsExtra.color*` (selector de color en configuración).

### Cambiado

- **Idioma por defecto:** de inglés a **español** (`DEFAULT_LOCALE = 'es'`). Cuando no hay preferencia guardada y el sistema no es en/es/es-CL, la app usa español. Orden del selector de idioma: Español, Español (Chile), English.
- **main.ts (frontend):** valor por defecto al obtener locale del sistema usa `DEFAULT_LOCALE` (español) en lugar de `'en'`.
- **Diálogo «Guardar logs» (Electron):** el renderer envía textos traducidos por IPC (`dialogOptions`); el handler en main los usa en `showSaveDialog`. LogsConsole usa `t()` para alertas de exportación.
- **useNavigation:** mensajes de carga/error vía `statusMessageKey` y `statusMessageParams` (keys `common.loading`, `errors.loadContentDetail`); App.vue muestra el mensaje en el estado vacío de la vista de exploración.
- **database.ts (Electron):** mensajes de `_showError` (diálogos de arranque) pasaron a inglés para consistencia en logs y soporte.
- **PRIMARY_COLORS (useSettings):** nombres en inglés; selector de color en SettingsModal usa `title` y `aria-label` traducidos (`settingsExtra.colorGreen`, etc.).
- **README:** enlace a CONTRIBUTING.md en Contribuciones; mención de `validate-locales` y `validate-i18n-keys` antes del PR. Roadmap: punto «Múltiples idiomas» marcado como implementado en 1.3.0.

### Arreglos

- Strings hardcodeados sustituidos por claves i18n: FiltersPanel («Estado / flags»), App (aria-label resultados búsqueda), SettingsModal (aria-label idioma), InitializationScreen (nombre, subtítulo, mensaje de carga), ChunkProgressIndicator (chunks, fusionando, tooltip).

---

## [1.2.0] - 08-02-2026

Versión centrada en documentación interna, mejora del manejo de errores en la UI y ajustes de CI/build. Incluye modal dedicado para errores de descarga, documento de arquitectura de estados y workflow de build Linux independiente.

### Agregado

- **Modal de error de descarga (`DownloadErrorModal`):** diálogo accesible (ARIA) que muestra el error de una descarga fallida, con opciones para cerrar o reiniciar la descarga; integrado en el panel de cola.
- **Documentación de arquitectura de descarga:** referencia de los 9 estados canónicos de descarga, máquina de estados, acciones permitidas (Iniciar, Reiniciar, Pausar, Detener, Eliminar, Sobrescribir, etc.) y reglas UX; incluye la variante de presentación “En espera de confirmación” (sobrescritura).
- **Workflow de build Linux:** workflow independiente `.github/workflows/build-linux.yml` para compilar AppImage y .deb en GitHub Actions (push/PR a main y `workflow_dispatch`).

### Cambiado

- **CI / Build:** workflows de build por plataforma (Windows, macOS, Linux) y CI actualizados en consonancia con la estructura actual del proyecto.
- **Normalización de estados:** uso consistente de los estados canónicos en motor y UI; la condición “En espera de confirmación” se trata como `paused` + `lastError === 'requires_overwrite_confirmation'` y queda documentada.

### Mejorado

- **Manejo de errores en cola:** errores de descarga mostrados en modal dedicado con acción de reinicio, además de toasts y estado en el ítem.
- **Tests y validación:** tests unitarios, de integración y de aceptación actualizados para reflejar cambios en mensajes, validaciones, estados y handlers IPC.

---

## [1.1.0] - 06-02-2026

Versión de mantenimiento y mejoras de estabilidad, rendimiento y accesibilidad. Incluye correcciones críticas derivadas de la auditoría de arquitectura y seguridad, migración definitiva de la cola a StateStore y mejoras de UI/UX y accesibilidad (WCAG).

### Arreglos (críticos)

- **Bloqueos del proceso principal (main):**
  - `readJSONFile` y `writeJSONFile` pasan a ser asíncronos (`fs.promises`); se elimina el uso de `readFileSync`/`writeFileSync` en configuración e IPC.
  - `getAvailableDiskSpace` es asíncrono (usa `spawn` en lugar de `execSync`) y dispone de caché por unidad/ruta con TTL de 15 s; `validateDiskSpace` se usa con `await` en DownloadEngine, SimpleDownloader y FileAssembler.
- **Fugas de memoria y recursos:** teardown centralizado en `ChunkDownloader`: en todos los caminos de salida de `handleChunkResponse` se limpia el interval de progreso, se marca el chunk y se quita la entrada del store de chunks activos (evita listeners e intervals huérfanos).
- **Seguridad y validación:** validación y sanitización de `savePath` desde IPC; cuando `savePath` llega del renderer se valida con `validateAndSanitizeDownloadPath` antes de usarlo para escritura (handlers `add-download`, etc.).

### Cambiado

- **Cola de descargas:** StateStore es la única fuente de verdad para la cola; el módulo legacy `queueDatabase` y el script de migración `queueToStateStore` fueron eliminados. La persistencia usa el archivo `downloads-state.db` (StateStore); ya no se ofrece migración automática desde instalaciones que solo tenían la base de datos antigua.

### Mejorado (accesibilidad y UI/UX)

- Skip link en `App.vue` para saltar al contenido principal.
- Trampa de foco en modales (Settings, Confirm, Overwrite, FolderChoice, BatchAdded, Logs, FiltersPanel) con `useFocusTrap`.
- Semántica y ARIA: `aria-labelledby`, `aria-describedby`, `aria-modal`, `aria-label` en botones (cerrar, favoritos, checkboxes de tabla y cola), `role="dialog"` en FiltersPanel; cierre con Escape en drawer y FiltersPanel.
- Toasts: errores con `role="alert"` y `aria-live="assertive"`; el resto con `role="status"` y `aria-live="polite"`.
- Contraste (WCAG 1.4.3): `--text-muted` ajustado en tema claro y oscuro para ≥ 4.5:1.
- Tamaño mínimo de objetivo táctil 44×44 px (WCAG 2.5.5) mediante variable `--min-touch-target`.
- Indicador de velocidad en barra de título con `role="status"` y `aria-live="polite"`; botones de LogsConsole con `aria-label`.

---

## [1.0.0] - 08-01-2026

Primera versión estable de **Dpana Hub – ROM Download Manager**. Aplicación de escritorio para explorar el catálogo de [Myrient](https://myrient.erista.me/) y descargar archivos con un motor robusto, cola persistente y soporte para descargas fragmentadas (chunks).

### Agregado

#### Motor de descargas

- **Descargas simples**: archivos por debajo de un umbral configurable (p. ej. 50 MB) se descargan en una sola conexión HTTP.
- **Descargas fragmentadas (chunked)**: archivos grandes se dividen en partes descargadas en paralelo (HTTP Range); bandas dinámicas (50–500 MB → 4–8 chunks; > 500 MB → 8–16 chunks).
- **Cola persistente**: estado de la cola guardado en SQLite; al reiniciar la aplicación las descargas pueden continuar donde quedaron.
- **Reintentos automáticos**: back-off exponencial ante errores de red.
- **Circuit breaker**: evita saturar hosts con fallos repetidos.
- **Verificación de integridad**: fusión atómica de chunks y comprobación por hash cuando está disponible.
- **Validación previa**: comprobación de espacio en disco y rutas antes de iniciar cada descarga.
- **Planificador (Scheduler)**: límites de descargas simultáneas y chunks por archivo; prioridad con aging para evitar inanición.
- **Test de calibración**: herramienta en Configuración para ajustar chunks y paralelismo según la conexión.
- **Estados de descarga**: `queued`, `starting`, `downloading`, `paused`, `merging`, `verifying`, `completed`, `failed`, `cancelled`; persistidos en SQLite.

#### Exploración y catálogo

- **Base de datos local SQLite**: más de 2,6 millones de entradas del catálogo Myrient para búsqueda y navegación sin depender de la web.
- **Navegación por carpetas**: explorador tipo gestor de archivos (tabla y cuadrícula).
- **Filtros**: por nombre, tamaño, fecha, extensión y otros criterios.
- **Favoritos**: sistemas o carpetas guardadas para acceso rápido.
- **Búsqueda**: integrada en la barra superior.

#### Interfaz y experiencia de usuario

- **Tema claro/oscuro**: con estilos glassmorphism y tipografía Inter.
- **Progreso detallado**: velocidad (EMA), ETA, porcentaje global y por archivo; indicador de progreso por chunks en descargas fragmentadas.
- **Acciones en cola**: pausar, reanudar, reiniciar o eliminar descargas desde el panel de cola.
- **Selección múltiple**: añadir muchos archivos a la cola de una vez (límite configurable, p. ej. 1000).
- **Modo preparación de cola**: al superar un umbral de archivos agregados, modal de confirmación para revisar el lote antes de iniciar.
- **Descarga de carpeta completa**: con confirmación y límite de archivos por carpeta (configurable).
- **Consola de logs**: accesible desde la interfaz para diagnóstico.
- **Apertura de carpeta de datos**: acceso rápido a config, logs y base de datos de la aplicación.
- **Toasts y notificaciones**: feedback visual opcional (activable en configuración).
- **ErrorBoundary**: manejo de errores en subárboles del frontend con recuperación automática cuando aplica.
- **Modales de confirmación**: sobrescritura de archivos, descarga de carpeta, lotes grandes.

#### Configuración

- **Carpeta de descargas**: ruta base configurable.
- **Descargas simultáneas**: 1–3 (por defecto 3).
- **Chunks simultáneos por archivo**: 1–5 (por defecto 3).
- **Umbral de confirmación en lotes**: cuántos archivos agregar antes de mostrar confirmación.
- **Notificaciones**: activar/desactivar toasts.
- **Reanudar al iniciar**: restaurar descargas pausadas al abrir la aplicación.
- **Persistencia de ventana**: posición y tamaño guardados entre sesiones.

#### Infraestructura y calidad

- **Electron 40** con proceso principal, preload y renderer (Vue 3 + Vite 7).
- **Workers**: `worker_threads` para descarga, fusión de chunks y consultas pesadas a la base de datos.
- **IPC**: handlers tipados con validación (Zod) y respuestas `{ success, data?, error }`.
- **Logging**: electron-log con niveles y archivo de log en directorio de datos.
- **Tests**: Jest con ES modules; tests unitarios, de integración y de aceptación.
- **Linting y formato**: ESLint 9 y Prettier; script `check-cjs` para uso de CommonJS.
- **CI**: GitHub Actions en push/PR: validate-locales, validate-i18n-keys, typecheck, lint, format check, tests unitarios e integración. Workflows separados para build Windows (portable x64), build Linux (AppImage + .deb) y build macOS (dmg, zip).
- **Build**: ejecutable portable Windows (x64); dmg y zip para macOS; AppImage y .deb para Linux. Base de datos empaquetable en `.7z` en `resources/`.

#### Documentación

- **README.md**: descripción del proyecto, características, instalación, uso, configuración, estructura, roadmap y limitaciones.
- **Licencia**: GPL-3.0-or-later (LICENSE incluido).
- **Créditos**: Myrient, Erista, comunidad de retrogaming, autor del logo.

### Requisitos para esta versión

- **Windows**: 10/11 (principal); ejecutable portable x64.
- **macOS**: builds dmg y zip (sin firma/notarización por defecto).
- **Linux**: builds AppImage y .deb (Utility).
- **Base de datos**: archivo de catálogo Myrient (p. ej. `myrient_data.db` o paquete en `resources/`) necesario para exploración y búsqueda.
- **Desarrollo**: Node.js 20.x+, npm 10.x+; 7-Zip para extracción de base de datos en `.7z`.

### Limitaciones conocidas

- La base de datos de catálogo debe estar en `resources/` (o configurada); es pesada y su actualización está prevista entre versiones.
- Máximo 1000 archivos por selección; para más, usar descarga de carpeta completa.
- Límite de 1000 archivos por carpeta en “Carpeta completa” (configurable en config).

### Notas de la release

- Directorio de datos: **Windows** `%APPDATA%\dpanahub-rdm\`, **macOS** `~/Library/Application Support/dpanahub-rdm/`, **Linux** `~/.config/dpanahub-rdm/`.
- En ese directorio: `config/*.json`, `downloads-state.db` (cola y estado de descargas), `window-state.json`, `logs/*.log`.
- Uso responsable: Myrient es un recurso de preservación; respetar condiciones de uso del servicio.

---

[1.9.0]: https://github.com/crtgamers/dpanahub-rdm/releases/tag/v1.9.0