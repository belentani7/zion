# Changelog

Todos los cambios relevantes de `belentani-workspace`. El formato sigue
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el versionado
[SemVer](https://semver.org/lang/es/).

## [1.1.0] - 2026-11-25

Restauración total del workspace (Protocolo SDD Maestro, gates E0-E7).

### Añadido

- **Vista SDD Maestro** (`src/components/sdd-maestro/`): el módulo que
  `App.tsx` importaba y no existía. Incluye `sddData.ts` (gates E0-E7,
  constitución P1-P5 y quality gates del §9.4 del protocolo), `sddAudit.ts`
  (núcleo puro de auditoría de specs: 6 áreas Specify, criterios EARS en 5
  patrones, Capability Map, boundaries Always/Ask/Never, señales P1-P5,
  máquina de estados de gate y generador del informe Markdown) y
  `SddMaestroView.tsx` (scorecards, auditor en vivo con región `aria-live`,
  ciclo de vida plegable y tabla de quality gates).
- **ErrorBoundary** por vista (`src/components/ErrorBoundary.tsx`): un fallo en
  una sección ya no deja el workspace en blanco. Mensaje traducido para el
  visitante y log JSON con stack y componentStack para el operador (P4).
- **`src/lib/webgl.ts`**: sondeo de capacidades WebGL2/WebGL1, detección de
  rasterizadores por software, techo de `devicePixelRatio`,
  `prefers-reduced-motion` y pausa por `visibilitychange`, más la cámara
  orbital pura (`clampCameraDistance`, `zoomFromWheel`, `orbitFromKey`) en un
  único módulo compartido y testeable sin contexto GL.
- **`src/vite-env.d.ts`** con la referencia a `vite/client`.
- **Suite de tests**: Vitest 5.1.1 + Testing Library + jsdom + axe-core y
  Playwright. **251 tests** unitarios, de componente, de accesibilidad y del
  servidor (7 ficheros, 48 suites) más **28 casos E2E** (chromium y móvil)
  sobre el build de producción:
  `sddAudit` 76 · `webgl` 53 · `server` 38 · `a11y` 29 · `App` 18 ·
  `SddMaestroView` 17 · `ErrorBoundary` 8.
- **Herramientas internas** (`scripts/`): `perf-report.mjs` (presupuestos de
  bundle con gzip y brotli, primer paint vs lazy, assets duplicados),
  `check-i18n-parity.mjs` (paridad de claves en los 4 idiomas) y
  `audit-production-readiness.mjs` (los 30 criterios de
  `PRODUCTION_CHECKLIST.md`, automatizados). Las tres con `--help`, `--json` y
  códigos de salida significativos; documentadas en `scripts/README.md`.
- **Deploy**: `vercel.json` (build, SPA rewrite, cabeceras de cache) y
  `api/index.ts` (adaptador serverless que reutiliza el mismo Express app).
- **SEO/acceso**: `public/robots.txt` y `public/sitemap.xml`.
- **CI**: el workflow pasa de un único job advisory a build + typecheck + tests
  + cobertura + presupuestos de rendimiento + paridad i18n + auditoría de
  producción + E2E en Chromium, con artefactos y resumen.
- **Dependabot** (`.github/dependabot.yml`) con agrupación de Vitest, Testing
  Library, TypeScript y Three.js.
- `SPEC.md` con criterios de aceptación en notación EARS y `CHANGELOG.md`.

- **`PROTOCOLO-SDD-MAESTRO.md`**: documento canónico recuperado desde el paquete privado
  `BELENTANI — OMEGA RECOVERY HARNESS` de Google Drive (constitución P1-P5, 7 guardrails,
  ciclo E0-E7, matriz de deploy multistack, checklist Nivel 2 y automatización obligatoria).
  El `.gitignore` heredado lo excluía con el patrón `*MAESTRO*`, pensado para relatos de
  sesión; se añade la excepción explícita y justificada.
- **Guardrails y matriz de deploy en la vista SDD Maestro**: `GUARDRAILS` y `DEPLOY_MATRIX`
  en `sddData.ts`, renderizados como lista ordenada y tabla accesible (caption `sr-only`,
  `scope="col"`). Completan la constitución, que hasta ahora sólo mostraba P1-P5.

### Cambiado

- **Code splitting**: las 6 vistas se cargan con `React.lazy` + `Suspense` y
  `vite.config.ts` agrupa vendors (`vendor-react`, `vendor-three`,
  `vendor-icons`). El bundle inicial pasa de 1 039 kB (286 kB gzip) a 271 kB
  (81 kB gzip); Three.js (524 kB) solo se descarga al abrir una vista 3D.
- **TypeScript 5.9.3 → 7.0.2** (compilador nativo): el typecheck pasa de
  ≈4,1 s a ≈0,9 s. `@types/node` declarado explícitamente (era una dependencia
  fantasma vía `tsx`).
- **`tsconfig.json`** incluye `server.ts`, `api/`, `vite.config.ts`,
  `vitest.config.ts`, `playwright.config.ts` y `e2e/`: ya no hay código sin
  verificar por tipos.
- **`server.ts`**: logs estructurados JSON, cabeceras de seguridad (CSP,
  nosniff, frame options, permissions policy, COOP, HSTS), rate limiting de
  `/api/lore`, allowlists de `mode`/`lang`, límite de 64 kB, timeout y
  `maxOutputTokens` sobre Gemini, mapeo de errores upstream (403/429/504/502),
  cache `immutable` de `/assets` y `no-cache` del HTML, 404 JSON para rutas de
  API desconocidas y `createApp()` reutilizable desde serverless.
- **Accesibilidad**: un único `<h1>` por página (el de la vista activa; el del
  shell pasa a ser contexto `sr-only`), `document.documentElement.lang` y
  `document.title` siguen
  el estado real (WCAG 3.1.1 y 2.4.2), enlace de salto al contenido (2.4.1),
  `type="button"` en los 66 botones, `aria-pressed`/`aria-current` en tabs y
  toggles, nombre accesible en todos los `input[type=range]`, checkboxes reales
  con `role="checkbox"` en el checklist de producción, `scope="col"` y
  `caption` en las tablas, y `aria-hidden` en los iconos decorativos.
- **`src/index.css`**: bloque global `prefers-reduced-motion` que desactiva
  animaciones y transiciones (WCAG 2.3.3).
- **VisualEngineCanvas**: zoom por wheel con listener nativo no pasivo, pausa
  con la pestaña oculta, render estático con movimiento reducido, fallback sin
  WebGL, órbita por teclado y nombre accesible del canvas.
- **OmegaCosmosCanvas**: usa el sondeo compartido, se pausa al ocultar la
  pestaña y reanuda sin saltos de reloj.
- **i18n**: 27 claves nuevas con paridad estricta en pt/es/en/ca; las claves
  huérfanas (`trianglesLabel`, `pointsLabel`, `seed`, `filterCritical`,
  `filterHigh`, `filterMedium`, `viewScript`, `copyCommand`) ya se usan; el
  catálogo de idiomas y las etiquetas de pestaña se exportan desde `i18n.ts`
  para que `Navigation` y `App` no puedan divergir.
- **`vite.config.ts`**: `allowedHosts: true` (ver Arreglado), `target: es2022`
  alineado con `tsconfig`, `chunkSizeWarningLimit` y `manualChunks`.
- **Higiene del repositorio**: `dist/` deja de estar versionado (5,3 MB),
  `.gitignore` cubre build, cobertura, informes de Playwright y logs, y
  `bun.lock` se retira (no hay binario `bun` en el proyecto).

- **Chrome de la tabla de quality gates localizado**: el título, el caption y las cuatro
  cabeceras estaban hardcodeados (`Quality Gates`, `Herramienta`, `Umbral`, `Comando`) y se
  veían en español dentro de la interfaz inglesa, portuguesa y catalana. Ahora salen de
  `i18n.ts` (6 claves nuevas × 4 idiomas). El contenido de las filas sigue en español a
  propósito, según la convención documentada en `sddData.ts`.

### Arreglado

- **TS2307 `./components/sdd-maestro/SddMaestroView`**: el único error de
  compilación del repositorio. `npm run build` salía con código 2 y la
  aplicación no se podía desplegar.
- **`server.allowedHosts: 'all'` devolvía 403** a cualquier host que no fuera
  localhost. Vite 6 tipa la opción como `string[] | true`; con el string
  `'all'`, `isHostAllowed()` iteraba los caracteres `a`,`l`,`l` y nunca
  coincidía, así que proxies inversos, túneles, previews y acceso LAN quedaban
  bloqueados (`Blocked request. This host ... is not allowed.`).
- **`handleResetCamera` no hacía nada**: asignaba el objeto de ajustes a una
  copia de sí mismo. Ahora incrementa un token que la canvas consume para
  restaurar la órbita y la distancia.
- **`e.preventDefault()` dentro de `onWheel`** era ignorado por el navegador
  (React registra `wheel` como pasivo desde la versión 17) y la página se
  desplazaba mientras el usuario hacía zoom.
- **Fuga de contexto WebGL**: el sondeo de capacidades de `OmegaCosmosCanvas`
  no liberaba el contexto de prueba, acercándose al límite de contextos vivos
  por página.
- **Texto hardcodeado en inglés y español** dentro de vistas multilingües
  (`Scale / Geometry Size`, `WebGPU / TSL Ready`, `Copiar`/`Copiado`) y una
  afirmación falsa en el subtítulo del Visual Engine (`r185+` con Three.js
  0.174 / r174).
- **Assets duplicados**: dos pares de ficheros idénticos (1,9 MB) en
  `public/assets/aistudio/` con cero referencias en el código.
- **Dependencias muertas**: `clsx` y `tailwind-merge` declaradas y jamás
  importadas.
- **Imports sin usar** en `ProductionChecklistView` (`CheckCircle2`,
  `ShieldAlert`, `Filter`, `ExternalLink`, `Layers`).

- **Exportación de snapshot del Visual Engine**: el fallo de `toDataURL` se registraba con un
  `console.error('Snapshot failed', e)` y el visitante no recibía nada (P2: faltaba la categoría
  de error de sistema). Ahora el canvas eleva el resultado con `onSnapshotResult` (guardrail 2:
  el componente técnico no conoce idiomas), la vista lo anuncia en una región
  `role="status"` traducida en los 4 idiomas y el operador recibe un log JSON estructurado con
  generador, semilla y motivo, sin stack ni detalle interno (P4).
- **`snapshotFileName` y `describeSnapshot`** en `src/lib/webgl.ts`: la lógica del nombre de
  fichero y del anuncio pasa a funciones puras con 6 tests propios. El formato del nombre se
  conserva idéntico al histórico.
- **Identificadores estables en las regiones de estado** (`#engine-webgl-fallback` y
  `#engine-snapshot-status`): conviven dos regiones `role="status"` en el Visual Engine y cada
  test apunta ahora a la suya.

### Eliminado

- `dist/` y `bun.lock` del registro de git.
- `clsx`, `tailwind-merge` de `dependencies`.
- Copias duplicadas de assets en `public/assets/aistudio/`.

[1.1.0]: https://github.com/belentani7/zion/compare/9611e92...main
