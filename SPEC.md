# SPEC — belentani-workspace (THE JUDAS EXPERIENCE // OMEGA)

Especificación del workspace restaurado, escrita con la notación EARS que el
propio protocolo exige (gate E1). Cada criterio tiene un identificador único
trazable a un test; el auditor integrado en la vista **SDD Maestro** valida
este documento: `npm run dev` → pestaña SDD Maestro → *Auditar Nueva Spec*.

- **Sistema:** `belentani-workspace` (React 19 + Vite 6 + Express 5 + Three.js r174)
- **Idiomas de interfaz:** PT > ES > EN > CA (orden canonical del protocolo)
- **Fuente canónica del protocolo:** `PROTOCOLO_COMPLETO_BELENTANI_VISUAL_ENGINE.md`
- **Matriz de calidad:** `PRODUCTION_CHECKLIST.md` (30 criterios, Niveles 0-2)

## Objective

El workspace reúne en una sola aplicación las seis superficies del ecosistema
Belentani (Judas OMEGA, Omega Prime, Visual Engine, SDD Maestro, Production
Checklist y Workspace Hub) sobre un kernel Express que sirve el build estático
y el oráculo de lore `/api/lore`. El objetivo de esta especificación es que el
repositorio compile, pase lint, tenga tests verdes, respete los presupuestos de
rendimiento y sea accesible WCAG 2.1 AA, sin placeholders ni código muerto.

## Commands

| Comando | Qué hace | Gate |
| --- | --- | --- |
| `npm run dev` | Kernel Express + middleware Vite en `0.0.0.0:3000` | E2 |
| `npm run build` | `tsc && vite build` → `dist/` | E5 |
| `npm run lint` / `npm run typecheck` | `tsc --noEmit` sobre src, server, api, e2e y configs | E5 |
| `npm test` | Vitest (unitario + componente + a11y) | E5 |
| `npm run test:coverage` | Lo anterior con cobertura v8 | E5 |
| `npm run test:e2e` | Playwright sobre el build de producción | E5 |
| `npm run perf` | Presupuestos de bundle (gzip/brotli, primer paint vs lazy) | E5 |
| `npm run check:i18n` | Paridad de claves en los 4 idiomas | E5 |
| `npm run audit` | Los 30 criterios de `PRODUCTION_CHECKLIST.md` | E7 |
| `npm start` | Kernel en modo producción sirviendo `dist/` | E7 |

Todas las herramientas de `scripts/` aceptan `--help` y `--json`.

## Project Structure

```
api/index.ts                 adaptador serverless (Vercel) → mismo Express app
server.ts                    kernel: /api/health, /api/lore, estáticos, seguridad
scripts/                     herramienta interna con --help (perf, i18n, audit)
e2e/workspace.spec.ts        happy path Playwright (chromium + móvil)
src/
  App.tsx                    shell: lazy + Suspense + ErrorBoundary por vista
  components/ErrorBoundary.tsx
  components/Navigation.tsx
  components/judas-omega/    experiencia 432 Hz + cosmos WebGL (44 nodos)
  components/omega-prime/    panel Omega Prime
  components/visual-engine/  generador procedural Three.js
  components/sdd-maestro/    protocolo SDD: datos, auditoría pura y vista
  components/production-checklist/
  components/workspace-hub/
  lib/webgl.ts               capacidades WebGL, DPR, reduced motion, visibility
  locales/i18n.ts            pt/es/en/ca con paridad estricta (84 claves)
  test/                      setup jsdom + suite axe-core WCAG 2.1 AA
  types/index.ts             contratos compartidos
```

## Code Style

TypeScript `strict` (sin `any` implícito), comentarios en español explicando el
*por qué*, Tailwind v4 para estilo, componentes funcionales con hooks,
lógica pura separada de la UI (patrón `sddAudit.ts` / `SddMaestroView.tsx`),
HTML semántico con nombres accesibles explícitos y cero placeholders, `TODO` o
pseudocódigo. Los commits siguen Conventional Commits.

## Testing Strategy

Cuatro técnicas ISTQB aplicadas de forma explícita (principio P1) y ninguna
ruta feliz aislada (principio P2):

1. **Partición de equivalencia** — clases válida / inválida / error de sistema
   para la auditoría de specs y para `/api/lore`.
2. **Análisis de valores límite** — 79/80/81 y 23999/24000/24001 caracteres,
   1/2/3 criterios EARS, `devicePixelRatio` 1/1.75/1.76/2/3, cuota 600/601.
3. **Tabla de decisión** — veredicto `approved` / `conditional` / `blocked`,
   `evaluateGate` (checklist × predecesores) y mapeo de errores upstream
   403/429/504/502.
4. **Máquina de estados** — `STATUS_CYCLE` (pending → in_progress → passed →
   blocked → pending), rate limiter con reloj inyectado y pausa por
   `visibilitychange`.

Cobertura de accesibilidad con axe-core sobre las seis vistas en los cuatro
idiomas. E2E de happy path con Playwright contra el build de producción.

## Boundaries

- **ALWAYS** (autónomo): ejecutar `typecheck`, `build`, `test`, `perf`,
  `check:i18n` y `audit` antes de dar trabajo por terminado; escribir tests de
  toda lógica crítica modificada; documentar en `CHANGELOG.md`.
- **ASK** (requiere confirmación): borrar ficheros con historia de git, cambiar
  dependencias mayores (Vite 8 / plugin-react 6), publicar en `main`, tocar
  secretos o configuración de la plataforma de deploy.
- **NEVER** (prohibido): commitear secretos, dejar `TODO`/placeholders,
  afirmar métricas no medidas, introducir regresiones, filtrar el detalle
  interno de un error al visitante, añadir tecnología no necesaria.

## Success Criteria

### Criterios EARS

- **REQ-001 (event-driven)** WHEN el visitante abre la aplicación THEN el
  sistema shall renderizar la vista Judas OMEGA como pestaña activa.
  → `e2e/workspace.spec.ts` «sirve la aplicación y expone las 6 pestañas».
- **REQ-002 (state-driven)** WHILE no exista un contexto WebGL utilizable, el
  sistema shall mostrar el panel de fallback en lugar de un lienzo en blanco.
  → `src/lib/webgl.test.ts`, `src/test/a11y.test.tsx`, E2E «sin WebGL».
- **REQ-003 (unwanted behaviour)** IF el build o el typecheck fallan, THEN el
  sistema shall terminar con código distinto de cero y volcar el error.
  → `npm run build`, `npm run lint` en CI.
- **REQ-004 (optional feature)** WHERE el visitante declare
  `prefers-reduced-motion: reduce`, el sistema shall congelar los bucles de
  animación y servir un fotograma estático.
  → `src/lib/webgl.ts` + `src/index.css` + E2E «reduced motion».
- **REQ-005 (ubiquitous)** El sistema shall responder `200` en `/api/health`
  con `status`, `service`, `model` y `aiConfigured`.
  → `server.test.ts` y E2E «contrato del servidor».
- **REQ-006 (unwanted behaviour)** IF la pestaña del navegador queda oculta,
  THEN el sistema shall detener el bucle `requestAnimationFrame` y reanudarlo
  sin saltos de reloj al volver.
  → `subscribeToVisibility` en `src/lib/webgl.test.ts`.
- **REQ-007 (event-driven)** WHEN el operador pega una spec y pulsa *Ejecutar
  Auditoría*, THEN el sistema shall publicar veredicto, puntuación y hallazgos
  en una región `aria-live="polite"`.
  → `SddMaestroView.test.tsx` y `src/test/a11y.test.tsx`.
- **REQ-008 (unwanted behaviour)** IF una vista lanza una excepción en render,
  THEN el sistema shall aislar el fallo en esa sección, mostrar un mensaje
  traducido y registrar el stack en JSON sin exponerlo al visitante.
  → `src/components/ErrorBoundary.test.tsx`.
- **REQ-009 (unwanted behaviour)** IF `/api/lore` recibe una consulta vacía,
  de más de 600 caracteres o un `mode`/`lang` fuera de la allowlist, THEN el
  sistema shall responder `400` o normalizar el valor sin reflejar la entrada.
  → `server.test.ts` «input validation» y «allowlists».
- **REQ-010 (unwanted behaviour)** IF se supera la cuota de `/api/lore`, THEN
  el sistema shall responder `429` con `Retry-After`.
  → `server.test.ts` «rate limiting».
- **REQ-011 (state-driven)** WHILE la aplicación se sirva en producción, el
  sistema shall cachear `/assets/*` un año como `immutable` y revalidar siempre
  el HTML.
  → `server.test.ts` «production static mode» y E2E «cache headers».
- **REQ-012 (ubiquitous)** El sistema shall mantener paridad exacta de claves
  de traducción entre pt, es, en y ca.
  → `scripts/check-i18n-parity.mjs` + `src/test/i18n.test.ts`.
- **REQ-013 (ubiquitous)** El sistema shall descargar menos de 120 kB de
  JavaScript comprimido (gzip) en el primer paint.
  → `scripts/perf-report.mjs` (presupuesto ejecutable en CI).

### Fuera de alcance

- Autenticación de visitantes, persistencia de estado del protocolo entre
  sesiones (el estado vive en memoria de la vista) y analítica de terceros.

## States

`pending → in_progress → passed → blocked → pending` (ciclo cerrado de gate,
`STATUS_CYCLE` en `src/components/sdd-maestro/sddAudit.ts`).

Transición automática derivada del checklist: al completar el último ítem de un
gate `pending` el estado pasa a `in_progress`; al desmarcar un ítem de un gate
`passed` vuelve a `in_progress`. Un gate declarado `passed` con checklist
incompleto o con un predecesor sin aprobar degrada a `blocked` (P5).

## Gate

E1 gate: esta spec debe superar la auditoría integrada antes de escribir código
(P5 GATEKEEPING). Errores: el visitante ve un mensaje genérico traducido y el
log interno conserva la traza completa (P4 ERROR LEAKAGE). Evidencia de P1: las
cuatro técnicas ISTQB están nombradas en *Testing Strategy* y aplicadas en los
ficheros de test citados. Evidencia de P2: cada requisito tiene su clase
inválida o de error de sistema. Evidencia de P3: HTML semántico y CSS moderno
verificados por axe-core en `src/test/a11y.test.tsx`.
