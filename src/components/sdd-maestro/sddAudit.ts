import { SDDPrinciple, SDDStage, SDDStageId } from '../../types';

/**
 * SDD Maestro — pure logic core.
 *
 * Everything in this module is framework-free and side-effect free so it can be
 * unit tested with the four ISTQB techniques required by principle P1
 * (equivalence partitioning, boundary values, decision tables, state machine).
 *
 * Requirement syntax follows EARS (Easy Approach to Requirements Syntax,
 * Alistair Mavin): ubiquitous / event-driven (WHEN) / state-driven (WHILE) /
 * unwanted behaviour (IF…THEN) / optional feature (WHERE).
 */

/* -------------------------------------------------------------------------- */
/* Boundaries                                                                  */
/* -------------------------------------------------------------------------- */

/** Below this size a text cannot be a spec (boundary value, P2). */
export const MIN_SPEC_CHARS = 80;
/** Above this size the audit refuses to run to stay responsive in the browser. */
export const MAX_SPEC_CHARS = 24_000;
/** EARS criteria expected for a full score. */
export const EARS_TARGET_COUNT = 3;

/* -------------------------------------------------------------------------- */
/* Spec areas (Specify — 6 mandatory areas, protocol §3 E1)                    */
/* -------------------------------------------------------------------------- */

export type SpecAreaId =
  | 'objective'
  | 'commands'
  | 'project_structure'
  | 'code_style'
  | 'testing_strategy'
  | 'boundaries';

export interface SpecAreaDefinition {
  id: SpecAreaId;
  label: string;
  /** Any of these regular expressions marks the area as present. */
  patterns: RegExp[];
}

export const SPEC_AREAS: SpecAreaDefinition[] = [
  {
    id: 'objective',
    label: 'Objective',
    patterns: [/^#{1,6}\s*.*objective\b/im, /^#{1,6}\s*.*objetivo\b/im, /^#{1,6}\s*.*purpose\b/im],
  },
  {
    id: 'commands',
    label: 'Commands',
    patterns: [/^#{1,6}\s*.*commands?\b/im, /^#{1,6}\s*.*comandos\b/im, /^#{1,6}\s*.*scripts?\b/im],
  },
  {
    id: 'project_structure',
    label: 'Project Structure',
    patterns: [
      /^#{1,6}\s*.*project structure\b/im,
      /^#{1,6}\s*.*estructura\b/im,
      /^#{1,6}\s*.*file layout\b/im,
    ],
  },
  {
    id: 'code_style',
    label: 'Code Style',
    patterns: [/^#{1,6}\s*.*code style\b/im, /^#{1,6}\s*.*estilo\b/im, /^#{1,6}\s*.*conventions?\b/im],
  },
  {
    id: 'testing_strategy',
    label: 'Testing Strategy',
    patterns: [
      /^#{1,6}\s*.*testing\b/im,
      /^#{1,6}\s*.*tests?\b/im,
      /^#{1,6}\s*.*pruebas\b/im,
      /^#{1,6}\s*.*validation\b/im,
    ],
  },
  {
    id: 'boundaries',
    label: 'Boundaries (Always / Ask / Never)',
    patterns: [/^#{1,6}\s*.*boundaries\b/im, /^#{1,6}\s*.*límites\b/im, /^#{1,6}\s*.*limites\b/im],
  },
];

/** The three boundary buckets that principle P5 expects to see declared. */
export const BOUNDARY_BUCKETS = ['always', 'ask', 'never'] as const;
export type BoundaryBucket = (typeof BOUNDARY_BUCKETS)[number];

/* -------------------------------------------------------------------------- */
/* Findings                                                                    */
/* -------------------------------------------------------------------------- */

export type FindingSeverity = 'critical' | 'high' | 'medium';

export interface SpecFinding {
  id: string;
  severity: FindingSeverity;
  area: SpecAreaId | 'ears' | 'scope' | 'boundaries' | 'input' | 'constitution';
  message: string;
  fix: string;
}

export type SpecVerdict = 'approved' | 'conditional' | 'blocked';

/* -------------------------------------------------------------------------- */
/* EARS detection                                                              */
/* -------------------------------------------------------------------------- */

export type EarsPatternId =
  | 'ubiquitous'
  | 'event_driven'
  | 'state_driven'
  | 'unwanted_behaviour'
  | 'optional_feature';

export interface EarsCriterion {
  pattern: EarsPatternId;
  text: string;
  line: number;
}

const EARS_KEYWORDS: Record<Exclude<EarsPatternId, 'ubiquitous'>, RegExp> = {
  event_driven: /\bwhen\b/i,
  state_driven: /\bwhile\b/i,
  unwanted_behaviour: /\bif\b[\s\S]{0,220}?\bthen\b/i,
  optional_feature: /\bwhere\b/i,
};

/**
 * Extract EARS success criteria from a spec.
 *
 * A criterion is any line that states an obligation with "shall" (or the
 * Spanish/Portuguese equivalents "debe" / "deve"). The line is then classified
 * into one of the five EARS patterns; a line with "shall" but no keyword is
 * ubiquitous.
 */
export function extractEarsCriteria(spec: string): EarsCriterion[] {
  const lines = spec.split(/\r?\n/);
  const criteria: EarsCriterion[] = [];

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (line.length === 0) return;
    if (!/\b(?:shall|must|debe|deberá|devera|deve)\b/i.test(line)) return;
    // Headings are structure, not requirements.
    if (/^#{1,6}\s/.test(line)) return;

    let pattern: EarsPatternId = 'ubiquitous';
    if (EARS_KEYWORDS.unwanted_behaviour.test(line)) pattern = 'unwanted_behaviour';
    else if (EARS_KEYWORDS.state_driven.test(line)) pattern = 'state_driven';
    else if (EARS_KEYWORDS.event_driven.test(line)) pattern = 'event_driven';
    else if (EARS_KEYWORDS.optional_feature.test(line)) pattern = 'optional_feature';

    criteria.push({
      pattern,
      text: line.length > 220 ? `${line.slice(0, 217)}...` : line,
      line: index + 1,
    });
  });

  return criteria;
}

/* -------------------------------------------------------------------------- */
/* Capability / scope check                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Count the capabilities declared by a spec. Detected through explicit
 * `## Capability` headings, `C1/C2…` identifiers and `capability:` fields.
 * More than one triggers the Capability Map requirement of stage E1.
 */
export function detectCapabilities(spec: string): string[] {
  const found = new Set<string>();

  for (const match of spec.matchAll(/^#{1,6}\s*capability\s*[:\-]?\s*(.+)$/gim)) {
    found.add(match[1].trim().slice(0, 80));
  }
  for (const match of spec.matchAll(/^#{1,6}\s*(C\d+)\b[^\n]*$/gim)) {
    found.add(match[1].toUpperCase());
  }
  for (const match of spec.matchAll(/^\s*[-*]\s*capability\s*:\s*(.+)$/gim)) {
    found.add(match[1].trim().slice(0, 80));
  }

  return [...found];
}

/* -------------------------------------------------------------------------- */
/* Constitution (P1-P5) signal detection                                       */
/* -------------------------------------------------------------------------- */

export interface ConstitutionCheck {
  code: SDDPrinciple['code'];
  satisfied: boolean;
  signal: string;
}

const CONSTITUTION_SIGNALS: { code: SDDPrinciple['code']; patterns: RegExp[] }[] = [
  {
    code: 'P1',
    patterns: [
      /\bISTQB\b/i,
      /\bequivalence partition|\bpartición de (clases de )?equivalencia\b/i,
      /\bboundary value|\bvalores límite\b/i,
      /\bdecision table|\btabla de decisión\b/i,
      /\bstate machine|\bmáquina de estados\b/i,
    ],
  },
  {
    code: 'P2',
    patterns: [/\bhappy path\b/i, /\bcamino feliz\b/i, /\binvalid|\binválido\b/i, /\bedge case\b/i],
  },
  {
    code: 'P3',
    patterns: [/\bidle\b[\s\S]{0,80}?→/, /\bestados\b[^\n]{0,80}?→/, /\bstate transitions?\b/i, /\bcancelled\b|\bcancelado\b/i],
  },
  {
    code: 'P4',
    patterns: [/\berror\b[^\n]{0,120}\blog\b/i, /\bgeneric (error )?message\b/i, /\bmensaje genérico\b/i, /\bstack\b/i],
  },
  {
    code: 'P5',
    patterns: [/\bgates?\b/i, /\bchecklist\b/i, /\bE[0-7]\b/],
  },
];

export function checkConstitution(spec: string): ConstitutionCheck[] {
  return CONSTITUTION_SIGNALS.map(({ code, patterns }) => {
    for (const pattern of patterns) {
      const match = spec.match(pattern);
      if (match) {
        return { code, satisfied: true, signal: match[0].trim().slice(0, 60) };
      }
    }
    return { code, satisfied: false, signal: '—' };
  });
}

/* -------------------------------------------------------------------------- */
/* Spec audit                                                                  */
/* -------------------------------------------------------------------------- */

export interface SpecAreaResult extends SpecAreaDefinition {
  present: boolean;
}

export interface SpecAuditResult {
  input: { characters: number; lines: number; words: number };
  areas: SpecAreaResult[];
  ears: EarsCriterion[];
  earsByPattern: Record<EarsPatternId, number>;
  capabilities: string[];
  requiresCapabilityMap: boolean;
  boundaryBuckets: BoundaryBucket[];
  constitution: ConstitutionCheck[];
  findings: SpecFinding[];
  score: number;
  verdict: SpecVerdict;
  summary: string;
}

/** Weights of the score (decision table): 6 areas × 12 + EARS 16 + boundaries 12 = 100. */
const AREA_POINTS = 12;
const EARS_POINTS_FULL = 16;
const EARS_POINTS_PARTIAL = 8;
const BOUNDARY_POINTS = 12;

export function auditSpec(rawSpec: string): SpecAuditResult {
  const spec = typeof rawSpec === 'string' ? rawSpec : '';
  const characters = spec.length;
  const lines = spec === '' ? 0 : spec.split(/\r?\n/).length;
  const words = spec.trim() === '' ? 0 : spec.trim().split(/\s+/).length;

  const areas: SpecAreaResult[] = SPEC_AREAS.map((area) => ({
    ...area,
    present: area.patterns.some((pattern) => pattern.test(spec)),
  }));

  const ears = extractEarsCriteria(spec);
  const earsByPattern: Record<EarsPatternId, number> = {
    ubiquitous: 0,
    event_driven: 0,
    state_driven: 0,
    unwanted_behaviour: 0,
    optional_feature: 0,
  };
  for (const criterion of ears) earsByPattern[criterion.pattern] += 1;

  const capabilities = detectCapabilities(spec);
  const requiresCapabilityMap = capabilities.length > 1;

  const boundaryBuckets = BOUNDARY_BUCKETS.filter((bucket) =>
    new RegExp(`\\b${bucket}\\b`, 'i').test(spec),
  );

  const constitution = checkConstitution(spec);
  const findings: SpecFinding[] = [];

  /* --- Invalid input (equivalence class: empty / oversized) --- */
  if (characters < MIN_SPEC_CHARS) {
    findings.push({
      id: 'input-too-short',
      severity: 'critical',
      area: 'input',
      message: `La spec tiene ${characters} caracteres, por debajo del mínimo de ${MIN_SPEC_CHARS}.`,
      fix: 'Redacta la spec completa antes de auditar: una spec vacía nunca pasa el gate E1.',
    });
  } else if (characters > MAX_SPEC_CHARS) {
    findings.push({
      id: 'input-too-long',
      severity: 'critical',
      area: 'input',
      message: `La spec tiene ${characters.toLocaleString('es-ES')} caracteres, por encima del máximo de ${MAX_SPEC_CHARS.toLocaleString('es-ES')}.`,
      fix: 'Divide la spec en capabilities independientes (Capability Map) y audita cada una.',
    });
  }

  /* --- Missing areas --- */
  for (const area of areas) {
    if (area.present) continue;
    findings.push({
      id: `area-${area.id}`,
      severity: area.id === 'objective' ? 'critical' : 'high',
      area: area.id,
      message: `Área obligatoria ausente: ${area.label}.`,
      fix: `Añade una sección "## ${area.label}" con contenido verificable.`,
    });
  }

  /* --- EARS success criteria --- */
  if (ears.length === 0) {
    findings.push({
      id: 'ears-none',
      severity: 'critical',
      area: 'ears',
      message: 'Ningún criterio de éxito en formato EARS (frase con "shall" / "debe").',
      fix: 'Escribe al menos 3 criterios: "WHEN <evento> THEN el sistema shall <respuesta>".',
    });
  } else if (ears.length < EARS_TARGET_COUNT) {
    findings.push({
      id: 'ears-few',
      severity: 'medium',
      area: 'ears',
      message: `Solo ${ears.length} criterio(s) EARS; el objetivo son ${EARS_TARGET_COUNT}.`,
      fix: 'Cubre los 5 patrones EARS: ubiquitous, WHEN, WHILE, IF…THEN y WHERE.',
    });
  }

  if (ears.length > 0 && earsByPattern.unwanted_behaviour === 0) {
    findings.push({
      id: 'ears-no-unwanted',
      severity: 'high',
      area: 'ears',
      message: 'No hay criterios de comportamiento no deseado (IF…THEN), la omisión más cara según EARS.',
      fix: 'Añade "IF <condición de fallo> THEN el sistema shall <respuesta de recuperación>".',
    });
  }

  /* --- Boundaries triad --- */
  if (boundaryBuckets.length < BOUNDARY_BUCKETS.length) {
    const missing = BOUNDARY_BUCKETS.filter((bucket) => !boundaryBuckets.includes(bucket));
    findings.push({
      id: 'boundaries-incomplete',
      severity: 'high',
      area: 'boundaries',
      message: `Boundaries incompletos: falta ${missing.join(', ').toUpperCase()}.`,
      fix: 'Declara las tres listas: ALWAYS (autónomo), ASK (requiere confirmación), NEVER (prohibido).',
    });
  }

  /* --- Scope check --- */
  if (requiresCapabilityMap && !/\bcapability map\b|\bmapa de capabilities\b/i.test(spec)) {
    findings.push({
      id: 'scope-capability-map',
      severity: 'medium',
      area: 'scope',
      message: `${capabilities.length} capabilities detectadas sin Capability Map.`,
      fix: 'Añade un Capability Map que relacione las capabilities y su orden de entrega.',
    });
  }

  /* --- Constitution signals --- */
  for (const check of constitution) {
    if (check.satisfied) continue;
    findings.push({
      id: `constitution-${check.code}`,
      severity: check.code === 'P5' ? 'high' : 'medium',
      area: 'constitution',
      message: `Principio ${check.code} sin evidencia textual en la spec.`,
      fix: `Declara explícitamente cómo se cumple ${check.code} (ver tabla de la Constitución).`,
    });
  }

  /* --- Score --- */
  const areaScore = areas.filter((area) => area.present).length * AREA_POINTS;
  const earsScore =
    ears.length >= EARS_TARGET_COUNT
      ? EARS_POINTS_FULL
      : ears.length > 0
        ? EARS_POINTS_PARTIAL
        : 0;
  const boundaryScore =
    boundaryBuckets.length === BOUNDARY_BUCKETS.length ? BOUNDARY_POINTS : 0;
  const score = Math.max(0, Math.min(100, areaScore + earsScore + boundaryScore));

  /* --- Verdict (decision table) --- */
  const hasCritical = findings.some((finding) => finding.severity === 'critical');
  const hasHigh = findings.some((finding) => finding.severity === 'high');
  let verdict: SpecVerdict;
  if (hasCritical || score < 50) verdict = 'blocked';
  else if (!hasHigh && score >= 85) verdict = 'approved';
  else verdict = 'conditional';

  const areasPresent = areas.filter((area) => area.present).length;
  const summary =
    `${areasPresent}/${areas.length} áreas · ${ears.length} criterios EARS · ` +
    `${boundaryBuckets.length}/${BOUNDARY_BUCKETS.length} boundaries · ` +
    `${constitution.filter((check) => check.satisfied).length}/${constitution.length} principios · ` +
    `${findings.length} hallazgo(s)`;

  return {
    input: { characters, lines, words },
    areas,
    ears,
    earsByPattern,
    capabilities,
    requiresCapabilityMap,
    boundaryBuckets,
    constitution,
    findings,
    score,
    verdict,
    summary,
  };
}

/* -------------------------------------------------------------------------- */
/* Gate state machine (P3 / P5)                                                */
/* -------------------------------------------------------------------------- */

export type StageStatus = SDDStage['status'];

/** Closed status cycle used by the UI: pending → in_progress → passed → blocked. */
export const STATUS_CYCLE: StageStatus[] = ['pending', 'in_progress', 'passed', 'blocked'];

export function nextStatus(current: StageStatus): StageStatus {
  const index = STATUS_CYCLE.indexOf(current);
  if (index === -1) return 'pending';
  return STATUS_CYCLE[(index + 1) % STATUS_CYCLE.length];
}

export interface GateEvaluation {
  stageId: SDDStageId;
  checklistTotal: number;
  checklistDone: number;
  checklistComplete: boolean;
  blockingPredecessor: SDDStageId | null;
  canPass: boolean;
  /** Status after applying the gatekeeping rule: a `passed` gate that is not
   *  backed by a complete checklist and passed predecessors degrades to `blocked`. */
  effectiveStatus: StageStatus;
  reasons: string[];
}

/**
 * Evaluate one gate.
 *
 * Rule (P5 GATEKEEPING): a stage can only be `passed` when every item of its
 * checklist is completed AND every previous stage is `passed`. Otherwise a
 * declared pass is reported as blocked, with the concrete reason.
 */
export function evaluateGate(stages: SDDStage[], index: number): GateEvaluation {
  const stage = stages[index];
  const checklistTotal = stage.checklist.length;
  const checklistDone = stage.checklist.filter((item) => item.completed).length;
  const checklistComplete = checklistTotal > 0 && checklistDone === checklistTotal;

  const predecessors = stages.slice(0, index);
  const blocking = predecessors.find((previous) => previous.status !== 'passed');

  const reasons: string[] = [];
  if (!checklistComplete) {
    reasons.push(`Checklist incompleto (${checklistDone}/${checklistTotal}).`);
  }
  if (blocking) {
    reasons.push(`Gate anterior ${blocking.id} sin aprobar (estado: ${blocking.status}).`);
  }

  const canPass = checklistComplete && !blocking;
  const effectiveStatus: StageStatus =
    stage.status === 'passed' && !canPass ? 'blocked' : stage.status;

  return {
    stageId: stage.id,
    checklistTotal,
    checklistDone,
    checklistComplete,
    blockingPredecessor: blocking ? blocking.id : null,
    canPass,
    effectiveStatus,
    reasons,
  };
}

export interface ProtocolProgress {
  stagesTotal: number;
  checklistTotal: number;
  checklistDone: number;
  percent: number;
  gatesPassed: number;
  gatesBlocked: SDDStageId[];
  firstOpenStage: SDDStageId | null;
  evaluations: GateEvaluation[];
}

export function evaluateProtocol(stages: SDDStage[]): ProtocolProgress {
  const evaluations = stages.map((_stage, index) => evaluateGate(stages, index));
  const checklistTotal = evaluations.reduce((sum, evaluation) => sum + evaluation.checklistTotal, 0);
  const checklistDone = evaluations.reduce((sum, evaluation) => sum + evaluation.checklistDone, 0);

  const gatesBlocked = evaluations
    .filter((evaluation) => evaluation.effectiveStatus === 'blocked')
    .map((evaluation) => evaluation.stageId);

  const firstOpen = evaluations.find(
    (evaluation) => evaluation.effectiveStatus !== 'passed',
  );

  return {
    stagesTotal: stages.length,
    checklistTotal,
    checklistDone,
    percent: checklistTotal === 0 ? 0 : Math.round((checklistDone / checklistTotal) * 100),
    gatesPassed: evaluations.filter((evaluation) => evaluation.effectiveStatus === 'passed').length,
    gatesBlocked,
    firstOpenStage: firstOpen ? firstOpen.stageId : null,
    evaluations,
  };
}

/* -------------------------------------------------------------------------- */
/* Immutable state helpers (used by the view, tested in isolation)             */
/* -------------------------------------------------------------------------- */

export function toggleChecklistItem(
  stages: SDDStage[],
  stageId: SDDStageId,
  itemId: string,
): SDDStage[] {
  return stages.map((stage) => {
    if (stage.id !== stageId) return stage;
    const checklist = stage.checklist.map((item) =>
      item.id === itemId ? { ...item, completed: !item.completed } : item,
    );
    const complete = checklist.length > 0 && checklist.every((item) => item.completed);
    // Completing the checklist moves the stage forward; unchecking a box pulls it
    // back to in_progress so the UI never shows a lie.
    let status: StageStatus = stage.status;
    if (complete && stage.status === 'pending') status = 'in_progress';
    if (!complete && stage.status === 'passed') status = 'in_progress';
    return { ...stage, checklist, status };
  });
}

export function cycleStageStatus(stages: SDDStage[], stageId: SDDStageId): SDDStage[] {
  return stages.map((stage) =>
    stage.id === stageId ? { ...stage, status: nextStatus(stage.status) } : stage,
  );
}

/* -------------------------------------------------------------------------- */
/* Report rendering (export)                                                   */
/* -------------------------------------------------------------------------- */

export interface ProtocolReportInput {
  stages: SDDStage[];
  principles: SDDPrinciple[];
  audit?: SpecAuditResult | null;
  specTitle?: string;
}

const STATUS_ICON: Record<StageStatus, string> = {
  pending: '⬜',
  in_progress: '🔄',
  passed: '✅',
  blocked: '⛔',
};

const VERDICT_LABEL: Record<SpecVerdict, string> = {
  approved: 'APROBADA',
  conditional: 'APROBADA CON CONDICIONES',
  blocked: 'BLOQUEADA',
};

export function renderProtocolReport({
  stages,
  principles,
  audit = null,
  specTitle = 'Spec auditada',
}: ProtocolReportInput): string {
  const progress = evaluateProtocol(stages);

  const stageRows = stages
    .map((stage, index) => {
      const evaluation = progress.evaluations[index];
      return [
        `### ${stage.id} · ${stage.name} — ${stage.tagline}`,
        '',
        `- **Estado declarado:** ${STATUS_ICON[stage.status]} ${stage.status}`,
        `- **Estado efectivo (gate):** ${STATUS_ICON[evaluation.effectiveStatus]} ${evaluation.effectiveStatus}`,
        `- **Checklist:** ${evaluation.checklistDone}/${evaluation.checklistTotal}`,
        `- **Requisito de gate:** ${stage.gateRequirement}`,
        `- **Artefacto:** ${stage.artifact}`,
        `- **Descripción:** ${stage.description}`,
        ...(stage.notes ? [`- **Notas:** ${stage.notes}`] : []),
        ...(evaluation.reasons.length > 0
          ? [`- **Bloqueos:** ${evaluation.reasons.join(' ')}`]
          : []),
        '',
        ...stage.checklist.map(
          (item) => `- [${item.completed ? 'x' : ' '}] ${item.id} — ${item.text}`,
        ),
        '',
      ].join('\n');
    })
    .join('\n');

  const principleRows = principles
    .map(
      (principle) =>
        `| ${principle.code} | ${principle.name} | ${principle.desc} | ${principle.techniques.join('; ')} | ${principle.enforcement} |`,
    )
    .join('\n');

  const auditSection = audit
    ? [
        `## Auditoría de Spec — ${specTitle}`,
        '',
        `- **Veredicto:** ${VERDICT_LABEL[audit.verdict]}`,
        `- **Puntuación:** ${audit.score}/100`,
        `- **Resumen:** ${audit.summary}`,
        `- **Entrada:** ${audit.input.characters} caracteres · ${audit.input.lines} líneas · ${audit.input.words} palabras`,
        `- **Capabilities:** ${audit.capabilities.length > 0 ? audit.capabilities.join(', ') : 'ninguna declarada'}` +
          `${audit.requiresCapabilityMap ? ' → Capability Map obligatorio' : ''}`,
        '',
        '### Áreas obligatorias (Specify)',
        '',
        '| Área | Presente |',
        '|------|----------|',
        ...audit.areas.map((area) => `| ${area.label} | ${area.present ? '✅' : '❌'} |`),
        '',
        '### Criterios EARS detectados',
        '',
        '| Patrón | Cantidad |',
        '|--------|----------|',
        `| Ubiquitous (shall) | ${audit.earsByPattern.ubiquitous} |`,
        `| Event-driven (WHEN) | ${audit.earsByPattern.event_driven} |`,
        `| State-driven (WHILE) | ${audit.earsByPattern.state_driven} |`,
        `| Unwanted behaviour (IF…THEN) | ${audit.earsByPattern.unwanted_behaviour} |`,
        `| Optional feature (WHERE) | ${audit.earsByPattern.optional_feature} |`,
        '',
        ...(audit.ears.length > 0
          ? [
              '<details><summary>Criterios literales</summary>',
              '',
              ...audit.ears.map(
                (criterion) => `- **${criterion.pattern}** (línea ${criterion.line}): ${criterion.text}`,
              ),
              '',
              '</details>',
              '',
            ]
          : []),
        '### Constitución (P1-P5)',
        '',
        '| Principio | Evidencia | Señal |',
        '|-----------|-----------|-------|',
        ...audit.constitution.map(
          (check) => `| ${check.code} | ${check.satisfied ? '✅' : '❌'} | ${check.signal} |`,
        ),
        '',
        '### Hallazgos',
        '',
        ...(audit.findings.length === 0
          ? ['Sin hallazgos.']
          : audit.findings.map(
              (finding) =>
                `- **[${finding.severity.toUpperCase()}] ${finding.id}** — ${finding.message}\n  - Fix: ${finding.fix}`,
            )),
        '',
      ].join('\n')
    : '## Auditoría de Spec\n\n_No se ha ejecutado ninguna auditoría en esta sesión._\n';

  return [
    '# PROTOCOLO SDD MAESTRO — Informe de estado',
    '',
    `- **Generado:** ${new Date().toISOString()}`,
    `- **Ciclo:** E0 → E${stages.length - 1} (${stages.length} gates)`,
    `- **Progreso de checklist:** ${progress.percent}% (${progress.checklistDone}/${progress.checklistTotal})`,
    `- **Gates aprobados:** ${progress.gatesPassed}/${progress.stagesTotal}`,
    `- **Primer gate abierto:** ${progress.firstOpenStage ?? 'ninguno — protocolo completo'}`,
    `- **Gates bloqueados:** ${progress.gatesBlocked.length > 0 ? progress.gatesBlocked.join(', ') : 'ninguno'}`,
    '',
    '## Constitución (principios inmutables)',
    '',
    '| Código | Principio | Descripción | Técnicas | Enforcement |',
    '|--------|-----------|-------------|----------|-------------|',
    principleRows,
    '',
    '## Ciclo de vida (gates)',
    '',
    stageRows,
    auditSection,
    '---',
    '*Informe generado por el Protocolo SDD Maestro · belentani-workspace · gates E0-E7 y constitución P1-P5.*',
    '',
  ].join('\n');
}
