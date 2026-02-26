# Guía para contribuir

Gracias por tu interés en contribuir a **Dpana Hub – ROM Download Manager**. Este documento resume lo que necesitas saber para enviar cambios, con especial atención a la **internacionalización (i18n)**.

---

## Antes de abrir un PR

- **Rutas en código:** usa siempre **barras normales** (`/`) en imports y en rutas relativas (p. ej. `electron/utils/validation`), para consistencia multiplataforma y para evitar entradas duplicadas en el índice de Git en Windows.
- **Estilo de código:** el proyecto usa ESLint y Prettier. Ejecuta `npm run lint` y `npm run format:check`. Opcional: `npm run format` para formatear.
- **Tipos y tests:** `npm run typecheck:all` y `npm run test:unit` (y `npm run test:integration` si aplica).
- **Si tocas traducciones o textos de la UI:** ejecuta las validaciones i18n (ver más abajo). El CI también las ejecuta y el PR fallará si no pasan.
- **Exports no usados:** de forma opcional o en CI se puede ejecutar `npx ts-prune` o `npx knip` para detectar exports muertos; ver Fase 4.3 en la auditoría.

---

## Internacionalización (i18n)

La aplicación usa **vue-i18n** con mensajes en `src/locales/`. El idioma de referencia es **inglés** (`en/common.json`).

### Cómo añadir un nuevo idioma

1. **Copia el archivo de referencia**
   - Copia `src/locales/en/common.json` a `src/locales/<código>/common.json`.
   - Usa un código de idioma coherente (ej. `es`, `es-CL`, `fr`).

2. **Traduce los valores**
   - Sustituye solo los **valores** (strings a la derecha de los `:`). No cambies las **claves** (ej. `"app.name"`, `"nav.home"`).
   - Mantén las mismas claves que en `en/common.json`.

3. **Registra el idioma en el código**
   - En `src/locales/index.ts`:
     - Añade el código al array `SUPPORTED_LOCALES`.
     - Añade la etiqueta en `LOCALE_LABELS` (nombre del idioma en su propio idioma, ej. `'Español (Chile)'`).
   - Si aplica, actualiza la lógica de `resolveSupportedLocale()` para que tu código (ej. `fr-FR`) se resuelva al nuevo locale.

4. **Valida antes de abrir el PR**
   - `npm run validate-locales` — comprueba que todos los `common.json` (es, es-CL, y el tuyo) tengan **exactamente** las mismas claves que `en/common.json`. No elimines ni añadas claves.
   - `npm run validate-i18n-keys` — comprueba que las keys usadas en el código existan en `en/common.json`. Si añadiste keys nuevas en inglés, el resto de idiomas debe tenerlas también (y `validate-locales` ya lo exige).

### Reglas importantes

- **No elimines claves** de ningún `common.json`. Si una clave deja de usarse en el código, se puede dejar el valor en inglés o traducido; la estructura debe seguir igual que en `en`.
- **No añadas claves** que no existan en `en/common.json`. Primero añade la clave en `en`, luego en el resto de idiomas.
- **Claves semánticas:** usa nombres con sentido (ej. `errors.connectionError`), no la frase literal como clave.

Si algo no queda claro, puedes abrir un issue o preguntar en el PR.

---

## Resumen de comandos útiles

| Comando | Descripción |
|--------|-------------|
| `npm run validate-locales` | Comprueba que todos los idiomas tengan las mismas keys que `en`. |
| `npm run validate-i18n-keys` | Comprueba que las keys usadas en `t()` / `$t()` existan en `en`. |
| `npm run validate-i18n-keys:orphans` | Además lista keys definidas pero no usadas como literal. |
| `npm run lint` | ESLint. |
| `npm run format:check` | Prettier (solo comprobación). |
| `npm run typecheck:all` | TypeScript + Vue. |
| `npm run test:unit` | Tests unitarios. |
| `npm run test:integration` | Tests de integración. |
| `npm run test:coverage` | Tests con informe de cobertura (carpeta `coverage/`). |

---

## Tests

### Estructura

- **`__tests__/unit/`**: tests de módulos aislados (validation, Scheduler, StateStore, etc.). Se mockean dependencias (Electron, DB, config) con los archivos en `__tests__/__mocks__/`.
- **`__tests__/integration/`**: tests que ejercitan flujos completos (p. ej. handlers IPC, motor de descargas con mocks).
- **`__tests__/acceptance/`**: criterios de aceptación (existencia de APIs, cadenas en código).
- **`__tests__/__mocks__/`**: mocks compartidos (`electron.cjs`, `electronConfig.cjs`, `database.cjs`, `window.cjs`, `services.cjs`). Jest los aplica por nombre de módulo (ej. `electron`, `../config`).

### Convención de nombres

- Archivos de test: `*.test.ts` (o el nombre del módulo + `.test.ts`, ej. `validation.test.ts`).
- Para ejecutar solo un archivo: `npm run test -- __tests__/unit/validation.test.ts`.
- Para ejecutar por carpeta: `npm run test -- --testPathPattern=__tests__/unit`.

### Añadir tests (Electron/DB mockeados)

Al probar código que usa `require('electron')`, `config` o `database`, Jest resuelve automáticamente los mocks en `__mocks__/` si el path coincide. Para módulos bajo `electron/`, usa rutas relativas desde el test (ej. `import { validateNodeId } from '../../electron/utils/validation'`). Los mocks exportan objetos mínimos (ej. `app.getPath`, `ipcMain.handle`); extiéndelos en el test si necesitas un comportamiento concreto (ej. `jest.mock('../../electron/database', () => ({ ... }))`).

---

## Comentarios y JSDoc

En todo el proyecto se aplica un estándar de comentarios y documentación para mantener claridad y consistencia.

### Idioma

- **Idioma único:** español. Todos los comentarios inline, bloques de documentación y JSDoc (descripciones, `@param`, `@returns`, etc.) deben estar en español.
- **Excepciones:** nombres propios de código (StateStore, EventBus, Composition API), nombres de APIs y términos técnicos estándar se dejan en inglés cuando sea el uso habitual.

### Comentarios inline

- Evitar comentarios obvios que repiten exactamente lo que hace el código.
- Priorizar comentarios que expliquen el *por qué* (restricciones, edge cases, motivos de diseño).
- Eliminar referencias obsoletas: versiones antiguas del proyecto, funcionalidades eliminadas, nombres antiguos, anotaciones de migración ya completada, TODOs ya resueltos.

### JSDoc

- **Público:** Todas las funciones y métodos públicos deben tener JSDoc con al menos: descripción breve, `@param` por cada parámetro (con descripción; tipo solo si aporta), `@returns` cuando la función devuelve valor, `@throws` solo si se lanza una excepción documentada.
- **Privado:** No documentar con JSDoc completo a menos que la lógica sea no trivial y el comentario aporte valor.
- **Formato:** Descripción en una o dos frases; luego los tags en orden: `@param`, `@returns`, `@throws`. No usar tags innecesarios ni `@returns` que solo repita la firma TypeScript.
- **Ejemplos:** Usar `@example` solo en APIs complejas cuando ayude a entender el uso.

### Coherencia

- Tono técnico, claro y directo.
- No mezclar idiomas en un mismo archivo (salvo las excepciones indicadas).
- Mantener el mismo formato en todos los bloques JSDoc del proyecto.

---

## Licencia

Las contribuciones se incorporan al proyecto bajo la misma licencia **GPL-3.0-or-later**. Al contribuir, aceptas que tu código se distribuya bajo esa licencia.
