import { SDDPrinciple, SDDStage } from '../../types';

/**
 * Canonical data of the SDD Maestro Protocol (Spec-Driven Development).
 *
 * Source of truth: `PROTOCOLO_COMPLETO_BELENTANI_VISUAL_ENGINE.md`
 *   §1.3 Principios Inmutables (Constitution-Grade)  -> SDD_PRINCIPLES
 *   §3   Protocolo SDD — 7 Etapas + Gates (E0..E7)   -> SDD_STAGES
 *
 * Content stays in Spanish on purpose: it mirrors the protocol document and the
 * rest of the repo's data modules (`judasData.ts`, `CRITERIA_DATA`). Only the
 * chrome of the view is localised through `src/locales/i18n.ts`.
 */

export const SDD_STAGES: SDDStage[] = [
  {
    id: 'E0',
    name: 'INTAKE',
    tagline: 'Entender antes de tocar',
    description:
      'Reformular la petición en 1-3 frases, detectar proyecto y restricciones (PT>ES>EN>CA, tokens, disco) y buscar contexto existente en repos, skills y catálogo.',
    gateRequirement: 'Usuario confirma o la petición es inequívoca',
    artifact: 'Resumen + preguntas resueltas',
    status: 'passed',
    notes: 'Intake de la restauración total: diagnóstico forense del repo completado.',
    checklist: [
      { id: 'E0-1', text: 'Petición reformulada en 1-3 frases', completed: true },
      { id: 'E0-2', text: 'Proyecto y stack detectados desde el árbol de ficheros', completed: true },
      { id: 'E0-3', text: 'Restricciones registradas (idiomas PT>ES>EN>CA, disco, tokens)', completed: true },
      { id: 'E0-4', text: 'Contexto existente buscado (README, protocolo, checklist)', completed: true },
    ],
  },
  {
    id: 'E1',
    name: 'SPEC',
    tagline: 'Qué es "terminado" (Constitution wrap)',
    description:
      'Scope Check (si hay más de una capability, Capability Map), Specify en 6 áreas —Objective, Commands, Project Structure, Code Style, Testing Strategy, Boundaries— y Success Criteria testeables en formato EARS.',
    gateRequirement: 'Humano aprueba spec + checklist constitution-grade (P1-P5)',
    artifact: 'SPEC.md o specs/<id>/PRODUCT.md',
    status: 'passed',
    checklist: [
      { id: 'E1-1', text: 'Scope Check: capabilities identificadas', completed: true },
      { id: 'E1-2', text: '6 áreas Specify redactadas', completed: true },
      { id: 'E1-3', text: 'Success Criteria en formato EARS (WHEN…THEN…)', completed: true },
      { id: 'E1-4', text: 'Boundaries Always / Ask / Never definidos', completed: true },
      { id: 'E1-5', text: 'Checklist constitution-grade P1-P5 firmado', completed: true },
    ],
  },
  {
    id: 'E2',
    name: 'PLAN',
    tagline: 'Plan técnico (write-tech-spec)',
    description:
      'Contexto del codebase actual con referencias commit-pinned, cambios propuestos (módulos, APIs, data flow, tradeoffs), testing y validación mapeando invariantes de comportamiento a tests concretos, y paralelización.',
    gateRequirement: 'Humano aprueba el plan',
    artifact: 'tasks/plan.md o specs/<id>/TECH.md',
    status: 'passed',
    checklist: [
      { id: 'E2-1', text: 'Contexto con referencias commit-pinned', completed: true },
      { id: 'E2-2', text: 'Cambios propuestos con tradeoffs explícitos', completed: true },
      { id: 'E2-3', text: 'Invariantes de comportamiento mapeados a tests', completed: true },
      { id: 'E2-4', text: 'Riesgos y plan de reversión documentados', completed: true },
    ],
  },
  {
    id: 'E3',
    name: 'TASKS',
    tagline: 'Descomposición atómica',
    description:
      'Cada task debe ser completable en una sesión, con acceptance criteria, verify step y un máximo de 5 archivos. El orden se decide por dependencia, nunca por importancia.',
    gateRequirement: 'Humano aprueba la lista de tasks',
    artifact: 'tasks/todo.md o specs/<id>/TASKS.md',
    status: 'passed',
    checklist: [
      { id: 'E3-1', text: 'Tasks atómicas (≤5 archivos cada una)', completed: true },
      { id: 'E3-2', text: 'Acceptance criteria por task', completed: true },
      { id: 'E3-3', text: 'Verify step por task', completed: true },
      { id: 'E3-4', text: 'Orden por dependencia', completed: true },
    ],
  },
  {
    id: 'E4',
    name: 'IMPLEMENT',
    tagline: 'Ejecutar (implement-specs)',
    description:
      'Una task, un cambio, una verificación local (typecheck / lint / test). Reuse-before-generate, subagentes paralelos para trabajo independiente y actualización de specs en el mismo PR cuando cambian las decisiones.',
    gateRequirement: 'Checks locales pasan',
    artifact: 'Commits + evidencia de ejecución',
    status: 'passed',
    notes: 'Diffs atómicos verificados uno a uno con tsc y vite build.',
    checklist: [
      { id: 'E4-1', text: '1 task → 1 cambio → verificación local', completed: true },
      { id: 'E4-2', text: 'Reuse-before-generate aplicado', completed: true },
      { id: 'E4-3', text: 'typecheck (tsc --noEmit) en verde', completed: true },
      { id: 'E4-4', text: 'build (vite build) en verde', completed: true },
      { id: 'E4-5', text: 'Specs actualizadas en el mismo cambio', completed: true },
    ],
  },
  {
    id: 'E5',
    name: 'VERIFY',
    tagline: 'Evidencia, no promesas',
    description:
      'Probar contra los success criteria de E1 (tests, smoke, URL viva, captura real), verificación independiente y detección de regresiones y referencias rotas.',
    gateRequirement: '100% de criterios probados; lo no probado se declara explícitamente',
    artifact: 'Informe de verificación con evidencia',
    status: 'in_progress',
    notes:
      'Suite Vitest verde y métricas antes/después medidas. El render WebGL no es verificable en este entorno (sin binarios de navegador): declarado explícitamente.',
    checklist: [
      { id: 'E5-1', text: 'Tests unitarios de la lógica crítica', completed: true },
      { id: 'E5-2', text: 'Test de integración del camino feliz', completed: true },
      { id: 'E5-3', text: 'Auditoría de accesibilidad (axe-core, WCAG 2.1 AA)', completed: true },
      { id: 'E5-4', text: 'Métricas de rendimiento antes / después', completed: true },
      { id: 'E5-5', text: 'Verificación independiente (re-lectura adversarial)', completed: false },
      { id: 'E5-6', text: 'Regresión visual WebGL validada en navegador real', completed: false },
    ],
  },
  {
    id: 'E6',
    name: 'SHIP',
    tagline: 'Publicar',
    description:
      'Commit convencional (feat:, fix:, chore:, docs:), push a GitHub, deploy en la plataforma correcta, verificación de la URL viva (200 + health endpoint) y README actualizado con enlaces vivos.',
    gateRequirement: 'Usuario abre el resultado sin ayuda',
    artifact: 'Commit(s) + URL(s) verificada(s)',
    status: 'pending',
    checklist: [
      { id: 'E6-1', text: 'Commits convencionales', completed: true },
      { id: 'E6-2', text: 'Push a la rama de trabajo', completed: true },
      { id: 'E6-3', text: 'Deploy en la plataforma correcta', completed: false },
      { id: 'E6-4', text: 'URL viva responde 200 + /api/health', completed: false },
      { id: 'E6-5', text: 'README con enlaces vivos', completed: true },
    ],
  },
  {
    id: 'E7',
    name: 'LEARN',
    tagline: 'Cerrar y dejar memoria',
    description:
      'Actualizar ESTADO.md / README con lo hecho, lo que falta y las decisiones tomadas; registrar recursos en RECURSOS-500.md y cerrar la sesión (1 tarea = 1 sesión = compactar a ~25K).',
    gateRequirement: 'Memoria del ciclo escrita y sesión cerrada',
    artifact: 'ESTADO.md + RECURSOS-500.md actualizados',
    status: 'pending',
    checklist: [
      { id: 'E7-1', text: 'CHANGELOG.md actualizado', completed: true },
      { id: 'E7-2', text: 'Decisiones y riesgos pendientes documentados', completed: true },
      { id: 'E7-3', text: 'Recursos registrados (fuentes con versión)', completed: true },
      { id: 'E7-4', text: 'Sesión cerrada y compactada', completed: false },
    ],
  },
];

export const SDD_PRINCIPLES: SDDPrinciple[] = [
  {
    code: 'P1',
    name: 'ISTQB-FIRST',
    desc: 'Cuatro técnicas de diseño de tests aplicadas a toda lógica crítica.',
    techniques: [
      'Partición de clases de equivalencia',
      'Análisis de valores límite',
      'Tabla de decisión',
      'Máquina de estados',
    ],
    enforcement: 'Los tests cubren las 4 categorías',
  },
  {
    code: 'P2',
    name: 'ZERO HAPPY-PATH',
    desc: 'Ninguna spec se aprueba con solo el camino feliz.',
    techniques: ['Caso válido', 'Caso límite', 'Caso inválido', 'Error de sistema'],
    enforcement: 'La spec exige las 4 categorías mínimas',
  },
  {
    code: 'P3',
    name: 'STATES EXPLICIT',
    desc: 'Estados cerrados y transiciones documentadas, sin estados implícitos.',
    techniques: [
      'idle → parsing → generating → rendering → exporting',
      'error',
      'cancelled',
    ],
    enforcement: 'Transiciones documentadas en la spec',
  },
  {
    code: 'P4',
    name: 'ERROR LEAKAGE',
    desc: 'El usuario ve un mensaje genérico; el log interno conserva el detalle.',
    techniques: [
      'Mensaje público genérico',
      'Log interno con stack, params, seed y GPU memory',
    ],
    enforcement: 'Middleware de error implementado',
  },
  {
    code: 'P5',
    name: 'GATEKEEPING',
    desc: 'Spec aprobada antes de código; checklist completado antes de deploy.',
    techniques: ['Gates E0-E7', 'Checklist constitution-grade', 'Bloqueo de avance'],
    enforcement: 'Gates E0-E7 bloqueantes',
  },
];

/** Quality gates that the protocol declares mandatory (§9.4). */
export interface QualityGate {
  id: string;
  gate: string;
  tool: string;
  threshold: string;
  command: string;
}

export const QUALITY_GATES: QualityGate[] = [
  { id: 'qg-ts', gate: 'TypeScript', tool: 'tsc --noEmit', threshold: '0 errores', command: 'npm run typecheck' },
  { id: 'qg-build', gate: 'Build', tool: 'vite build', threshold: 'exit code 0', command: 'npm run build' },
  { id: 'qg-unit', gate: 'Unit Tests', tool: 'Vitest', threshold: 'verde + cobertura ≥ 80% en lógica crítica', command: 'npm run test' },
  { id: 'qg-a11y', gate: 'Accessibility', tool: 'axe-core', threshold: '0 violaciones WCAG 2.1 AA', command: 'npm run test' },
  { id: 'qg-perf', gate: 'Performance', tool: 'scripts/perf-report.mjs', threshold: 'JS inicial ≤ 250 kB brotli', command: 'npm run perf' },
  { id: 'qg-e2e', gate: 'E2E', tool: 'Playwright', threshold: 'flujos críticos en verde', command: 'npm run test:e2e' },
  { id: 'qg-i18n', gate: 'Paridad i18n', tool: 'scripts/check-i18n-parity.mjs', threshold: '0 claves huérfanas', command: 'npm run check:i18n' },
  { id: 'qg-audit', gate: 'Producción (30 criterios)', tool: 'scripts/audit-production-readiness.mjs', threshold: 'Nivel 2 sin fallos críticos', command: 'npm run audit' },
];

/** Claves i18n de los guardrails. Unión literal para que el typecheck las valide. */
export interface Guardrail {
  id: string;
  /** Nombre canónico del guardrail; es terminología fija y no se traduce. */
  name: string;
  /** Descripción en español, igual que el resto del contenido de este módulo. */
  description: string;
}

/**
 * Los 7 guardrails arquitectónicos de la constitución del proyecto, recuperados de
 * `PROTOCOLO-SDD-MAESTRO.md`. El documento canónico numera dos veces el 5 (Security by
 * Default y Rollback Defined); aquí se identifica cada guardrail por su `id` textual y la
 * vista los numera por posición, sin reescribir el original.
 */
export const GUARDRAILS: readonly Guardrail[] = [
  {
    id: 'single-source-of-truth',
    name: 'Single Source of Truth',
    description: 'Un patrón por concern: caché, serialización de errores y patrones de consulta.',
  },
  {
    id: 'boundary-contracts',
    name: 'Boundary Contracts',
    description: 'Interfaces en los límites de los módulos, no en su interior.',
  },
  {
    id: 'dependency-direction',
    name: 'Dependency Direction',
    description: 'Flechas en una sola vía, sin ciclos entre módulos.',
  },
  {
    id: 'observability-built-in',
    name: 'Observability Built-in',
    description: 'Logs estructurados, métricas y tracing desde el día 1.',
  },
  {
    id: 'security-by-default',
    name: 'Security by Default',
    description: 'AuthZ en cada endpoint, validación de entrada y rate limiting.',
  },
  {
    id: 'rollback-defined',
    name: 'Rollback Defined',
    description: 'Estrategia de rollback definida ANTES de desplegar.',
  },
  {
    id: 'spec-code-convergence',
    name: 'Spec-Code Convergence',
    description: 'Spec viva, actualizada en el mismo PR que el código.',
  },
] as const;

export interface DeployTarget {
  /** Fichero o manifiesto que delata la plataforma. Literal técnico, igual en todo idioma. */
  signal: string;
  platform: string;
  /** Comando de despliegue literal; nunca se traduce. */
  cli: string;
}

/** Matriz de deploy multistack del protocolo SDD Maestro. */
export const DEPLOY_MATRIX: readonly DeployTarget[] = [
  { signal: 'vercel.json + api/[...path].ts', platform: 'Vercel', cli: 'npx vercel --prod' },
  { signal: 'netlify.toml', platform: 'Netlify', cli: 'npx netlify deploy --prod --dir=dist' },
  { signal: 'wrangler.toml / wrangler.jsonc', platform: 'Cloudflare', cli: 'npx wrangler pages deploy' },
  { signal: 'railway.json', platform: 'Railway', cli: 'railway up' },
  {
    signal: 'Dockerfile + docker-compose.yml',
    platform: 'Docker / VPS',
    cli: 'docker compose up -d --build',
  },
] as const;
