import { describe, expect, it } from 'vitest';
import {
  BOUNDARY_BUCKETS,
  EARS_TARGET_COUNT,
  MAX_SPEC_CHARS,
  MIN_SPEC_CHARS,
  SPEC_AREAS,
  STATUS_CYCLE,
  auditSpec,
  checkConstitution,
  cycleStageStatus,
  detectCapabilities,
  evaluateGate,
  evaluateProtocol,
  extractEarsCriteria,
  nextStatus,
  renderProtocolReport,
  toggleChecklistItem,
  type SpecVerdict,
} from './sddAudit';
import { SDD_PRINCIPLES, SDD_STAGES } from './sddData';
import type { SDDStage } from '../../types';

/**
 * Test design follows the four ISTQB techniques required by principle P1:
 * equivalence partitioning, boundary value analysis, decision tables and
 * state machine testing. Principle P2 (ZERO HAPPY-PATH) forces the invalid
 * and system-error classes to be present in every group.
 */

const VALID_SPEC = `# SPEC — Zion restoration

## Objective
Restore the workspace so build, lint and tests pass.

## Commands
npm run build, npm run lint, npm test

## Project Structure
src/, server.ts, scripts/

## Code Style
TypeScript strict, Tailwind utilities, Spanish comments.

## Testing Strategy
Vitest unit tests using ISTQB techniques: equivalence partitioning, boundary
value analysis, decision table and state machine. No happy path only: invalid
input and system error classes are covered too.

## Boundaries
ALWAYS: run typecheck. ASK: before deleting files. NEVER: commit secrets.

## Success Criteria
WHEN the user opens the app THEN the system shall render the Judas OMEGA tab.
WHILE a WebGL context is unavailable the system shall render the fallback panel.
IF the build fails THEN the system shall exit with a non-zero code and log the stack.
WHERE the visitor prefers reduced motion, the system shall not animate the cosmos.
The system shall expose /api/health returning 200.

## States
idle → parsing → generating → rendering → exporting | error | cancelled

## Gate
E1 gate: checklist constitution-grade approved before code (P5 GATEKEEPING).
Errors: the user sees a generic message; the internal log keeps the stack.
`;

/** Build a spec with one area removed, to test each equivalence class. */
function withoutArea(spec: string, heading: string): string {
  const lines = spec.split('\n');
  const start = lines.findIndex((line) => line.trim().toLowerCase() === heading.toLowerCase());
  if (start === -1) throw new Error(`heading not found: ${heading}`);
  const end = lines.findIndex((line, index) => index > start && line.startsWith('## '));
  return [...lines.slice(0, start), ...lines.slice(end === -1 ? lines.length : end)].join('\n');
}

describe('auditSpec — equivalence partitioning (valid / invalid / error)', () => {
  it('approves a complete constitution-grade spec', () => {
    const result = auditSpec(VALID_SPEC);

    expect(result.verdict).toBe('approved');
    expect(result.findings).toEqual([]);
    expect(result.score).toBe(100);
    expect(result.areas.every((area) => area.present)).toBe(true);
    expect(result.ears.length).toBeGreaterThanOrEqual(EARS_TARGET_COUNT);
    expect(result.boundaryBuckets).toEqual([...BOUNDARY_BUCKETS]);
    expect(result.constitution.every((check) => check.satisfied)).toBe(true);
  });

  it('measures the input footprint', () => {
    const result = auditSpec(VALID_SPEC);
    const lines = VALID_SPEC.split(/\r?\n/).length;
    const words = VALID_SPEC.trim().split(/\s+/).length;

    expect(result.input.characters).toBe(VALID_SPEC.length);
    expect(result.input.lines).toBe(lines);
    expect(result.input.words).toBe(words);
  });

  it('blocks an empty spec with a critical finding', () => {
    const result = auditSpec('');

    expect(result.verdict).toBe('blocked');
    expect(result.score).toBe(0);
    expect(result.input.characters).toBe(0);
    expect(result.input.lines).toBe(0);
    expect(result.input.words).toBe(0);
    expect(result.findings.map((finding) => finding.id)).toContain('input-too-short');
  });

  it('blocks whitespace-only input instead of scoring it as a spec', () => {
    const result = auditSpec('   \n\t\n  ');

    expect(result.input.words).toBe(0);
    expect(result.verdict).toBe('blocked');
  });

  it.each(SPEC_AREAS.map((area) => [area.id, area.label] as const))(
    'reports the missing area %s (%s)',
    (areaId) => {
      const heading = `## ${SPEC_AREAS.find((area) => area.id === areaId)?.label.split(' (')[0]}`;
      const result = auditSpec(withoutArea(VALID_SPEC, heading));

      expect(result.areas.find((area) => area.id === areaId)?.present).toBe(false);
      expect(result.findings.map((finding) => finding.id)).toContain(`area-${areaId}`);
      expect(result.verdict).not.toBe('approved');
    },
  );

  it('treats a missing Objective as critical and any other area as high', () => {
    const critical = auditSpec(withoutArea(VALID_SPEC, '## Objective'));
    const high = auditSpec(withoutArea(VALID_SPEC, '## Commands'));

    expect(critical.findings.find((f) => f.id === 'area-objective')?.severity).toBe('critical');
    expect(critical.verdict).toBe('blocked');
    expect(high.findings.find((f) => f.id === 'area-commands')?.severity).toBe('high');
  });

  it('does not throw on non-string input (system error class)', () => {
    const result = auditSpec(undefined as unknown as string);

    expect(result.verdict).toBe('blocked');
    expect(result.input.characters).toBe(0);
    expect(result.findings.map((finding) => finding.id)).toContain('input-too-short');
  });

  it('flags a spec with no EARS criteria as critical', () => {
    const spec = withoutArea(VALID_SPEC, '## Success Criteria');
    const result = auditSpec(spec);

    expect(result.ears).toEqual([]);
    expect(result.findings.map((finding) => finding.id)).toContain('ears-none');
    expect(result.findings.find((finding) => finding.id === 'ears-none')?.severity).toBe('critical');
  });

  it('flags the absence of unwanted-behaviour criteria as high', () => {
    const spec = VALID_SPEC.replace(
      'IF the build fails THEN the system shall exit with a non-zero code and log the stack.\n',
      '',
    );
    const result = auditSpec(spec);

    expect(result.earsByPattern.unwanted_behaviour).toBe(0);
    expect(result.findings.find((finding) => finding.id === 'ears-no-unwanted')?.severity).toBe(
      'high',
    );
  });
});

describe('auditSpec — boundary value analysis', () => {
  const filler = (length: number) => `## Objective\n${'x'.repeat(Math.max(0, length - 13))}`;

  it.each([
    [MIN_SPEC_CHARS - 1, true],
    [MIN_SPEC_CHARS, false],
    [MIN_SPEC_CHARS + 1, false],
  ])('length %i → too-short finding: %s', (length, expected) => {
    const result = auditSpec(filler(length));
    expect(result.input.characters).toBe(length);
    expect(result.findings.some((finding) => finding.id === 'input-too-short')).toBe(expected);
  });

  it.each([
    [MAX_SPEC_CHARS - 1, false],
    [MAX_SPEC_CHARS, false],
    [MAX_SPEC_CHARS + 1, true],
  ])('length %i → too-long finding: %s', (length, expected) => {
    const result = auditSpec('y'.repeat(length));
    expect(result.input.characters).toBe(length);
    expect(result.findings.some((finding) => finding.id === 'input-too-long')).toBe(expected);
  });

  it('caps the score at 100 and never returns a negative score', () => {
    const repeated = `${VALID_SPEC}\n`.repeat(4);
    expect(auditSpec(repeated).score).toBeLessThanOrEqual(100);
    expect(auditSpec('').score).toBeGreaterThanOrEqual(0);
  });

  it.each([
    [1, 8],
    [EARS_TARGET_COUNT - 1, 8],
    [EARS_TARGET_COUNT, 16],
    [EARS_TARGET_COUNT + 5, 16],
  ])('EARS criteria count %i awards %i points of the 16 available', (count, expectedPoints) => {
    const base = withoutArea(VALID_SPEC, '## Success Criteria');
    const criteria = Array.from({ length: count }, (_, index) => {
      const kind = index % 3;
      if (kind === 0) return `WHEN event ${index} happens THEN the system shall respond ${index}.`;
      if (kind === 1) return `IF fault ${index} occurs, THEN the system shall recover ${index}.`;
      return `WHILE state ${index} holds the system shall hold ${index}.`;
    }).join('\n');

    const withFew = auditSpec(`${base}\n## Success Criteria\n${criteria}\n`);
    const withNone = auditSpec(base);

    expect(withFew.ears.length).toBe(count);
    expect(withFew.score - withNone.score).toBe(expectedPoints);
  });

  it('scores the boundary triad only when all three buckets are declared', () => {
    const partial = auditSpec(VALID_SPEC.replace('ASK: before deleting files. ', ''));
    const full = auditSpec(VALID_SPEC);

    expect(partial.boundaryBuckets).toEqual(['always', 'never']);
    expect(full.boundaryBuckets.length).toBe(3);
    expect(full.score - partial.score).toBe(12);
    expect(partial.findings.map((finding) => finding.id)).toContain('boundaries-incomplete');
  });
});

describe('auditSpec — verdict decision table', () => {
  const cases: {
    name: string;
    spec: string;
    expected: SpecVerdict;
  }[] = [
    { name: 'complete spec', spec: VALID_SPEC, expected: 'approved' },
    {
      name: 'complete but missing one non-objective area (high finding)',
      spec: withoutArea(VALID_SPEC, '## Code Style'),
      expected: 'conditional',
    },
    { name: 'empty input (critical finding)', spec: '', expected: 'blocked' },
    {
      name: 'no objective (critical finding)',
      spec: withoutArea(VALID_SPEC, '## Objective'),
      expected: 'blocked',
    },
    {
      name: 'oversized input (critical finding)',
      spec: 'z'.repeat(MAX_SPEC_CHARS + 10),
      expected: 'blocked',
    },
  ];

  it.each(cases)('$name → $expected', ({ spec, expected }) => {
    expect(auditSpec(spec).verdict).toBe(expected);
  });

  it('keeps score and verdict consistent: blocked implies critical or score < 50', () => {
    for (const spec of [VALID_SPEC, '', withoutArea(VALID_SPEC, '## Commands'), 'x'.repeat(200)]) {
      const result = auditSpec(spec);
      if (result.verdict === 'blocked') {
        const hasCritical = result.findings.some((finding) => finding.severity === 'critical');
        expect(hasCritical || result.score < 50).toBe(true);
      }
      if (result.verdict === 'approved') {
        expect(result.findings.some((finding) => finding.severity !== 'medium')).toBe(false);
        expect(result.score).toBeGreaterThanOrEqual(85);
      }
    }
  });

  it('every finding carries an actionable fix', () => {
    const result = auditSpec('## Objective\nshort');
    expect(result.findings.length).toBeGreaterThan(0);
    for (const finding of result.findings) {
      expect(finding.fix.length).toBeGreaterThan(10);
      expect(finding.message.length).toBeGreaterThan(10);
      expect(['critical', 'high', 'medium']).toContain(finding.severity);
    }
  });
});

describe('extractEarsCriteria — the five EARS patterns', () => {
  it.each([
    ['The system shall log every command.', 'ubiquitous'],
    ['WHEN the user clicks export THEN the system shall download the report.', 'event_driven'],
    ['WHILE the canvas is rendering the system shall show the FPS counter.', 'state_driven'],
    ['IF the API returns 500, THEN the system shall retry once.', 'unwanted_behaviour'],
    ['WHERE dark mode is enabled, the system shall use the obsidian palette.', 'optional_feature'],
  ])('classifies "%s" as %s', (line, pattern) => {
    const criteria = extractEarsCriteria(line);
    expect(criteria).toHaveLength(1);
    expect(criteria[0].pattern).toBe(pattern);
    expect(criteria[0].line).toBe(1);
  });

  it('ignores lines without an obligation keyword and headings', () => {
    const spec = [
      '## The system shall be a heading, not a requirement',
      'A prose line without obligations.',
      '- WHEN the build passes THEN the pipeline shall publish the artifact.',
    ].join('\n');

    const criteria = extractEarsCriteria(spec);
    expect(criteria).toHaveLength(1);
    expect(criteria[0].pattern).toBe('event_driven');
    expect(criteria[0].line).toBe(3);
  });

  it('accepts Spanish and Portuguese obligation verbs', () => {
    expect(extractEarsCriteria('WHEN el usuario abre la app THEN el sistema debe renderizar.')).toHaveLength(1);
    expect(extractEarsCriteria('O sistema deve registar cada comando.')).toHaveLength(1);
  });

  it('truncates criteria longer than 220 characters', () => {
    const long = `WHEN ${'a'.repeat(300)} THEN the system shall respond.`;
    const [criterion] = extractEarsCriteria(long);
    expect(criterion.text.length).toBe(220);
    expect(criterion.text.endsWith('...')).toBe(true);
  });

  it('returns an empty list for an empty spec', () => {
    expect(extractEarsCriteria('')).toEqual([]);
  });
});

describe('detectCapabilities — E1 scope check', () => {
  it('detects "## Capability:" headings', () => {
    expect(detectCapabilities('## Capability: Visual Engine\n## Capability: SDD Gatekeeper')).toEqual([
      'Visual Engine',
      'SDD Gatekeeper',
    ]);
  });

  it('detects C1/C2 identifiers and bullet declarations', () => {
    expect(detectCapabilities('## C1 Cosmos\n## C2 Terminal\n- capability: Audio 432')).toEqual([
      'C1',
      'C2',
      'Audio 432',
    ]);
  });

  it('returns no capabilities for a spec that declares none', () => {
    expect(detectCapabilities(VALID_SPEC)).toEqual([]);
  });

  it('requires a Capability Map when more than one capability is declared', () => {
    const spec = '## Objective\nx\n## Capability: A\n## Capability: B\n';
    const result = auditSpec(spec);

    expect(result.capabilities.length).toBe(2);
    expect(result.requiresCapabilityMap).toBe(true);
    expect(result.findings.map((finding) => finding.id)).toContain('scope-capability-map');
  });

  it('does not require a Capability Map when it is already present', () => {
    const spec = `${VALID_SPEC}\n## Capability: A\n## Capability: B\n## Capability Map\nA → B\n`;
    const result = auditSpec(spec);

    expect(result.requiresCapabilityMap).toBe(true);
    expect(result.findings.map((finding) => finding.id)).not.toContain('scope-capability-map');
  });
});

describe('checkConstitution — P1..P5 signals', () => {
  it('finds every principle in the canonical spec', () => {
    const checks = checkConstitution(VALID_SPEC);
    expect(checks.map((check) => check.code)).toEqual(['P1', 'P2', 'P3', 'P4', 'P5']);
    expect(checks.every((check) => check.satisfied)).toBe(true);
    expect(checks.every((check) => check.signal !== '—')).toBe(true);
  });

  it('reports unsatisfied principles with a neutral signal', () => {
    const checks = checkConstitution('## Objective\nNothing about quality here.');
    expect(checks.every((check) => !check.satisfied)).toBe(true);
    expect(checks.every((check) => check.signal === '—')).toBe(true);
  });

  it('covers the five principle codes declared in sddData', () => {
    const codes = checkConstitution('').map((check) => check.code);
    expect(codes).toEqual(SDD_PRINCIPLES.map((principle) => principle.code));
  });
});

describe('nextStatus / STATUS_CYCLE — state machine (P3)', () => {
  it('walks the closed cycle pending → in_progress → passed → blocked → pending', () => {
    let status = STATUS_CYCLE[0];
    const walked: typeof status[] = [status];
    for (let step = 0; step < STATUS_CYCLE.length; step += 1) {
      status = nextStatus(status);
      walked.push(status);
    }
    expect(walked).toEqual([...STATUS_CYCLE, STATUS_CYCLE[0]]);
  });

  it('returns pending for an unknown status (defensive transition)', () => {
    expect(nextStatus('nonsense' as never)).toBe('pending');
  });

  it('exposes exactly the four statuses of the SDDStage type', () => {
    expect(STATUS_CYCLE).toEqual(['pending', 'in_progress', 'passed', 'blocked']);
  });
});

describe('evaluateGate — gatekeeping decision table (P5)', () => {
  const stage = (overrides: Partial<SDDStage> & { id: SDDStage['id'] }): SDDStage => ({
    name: overrides.id,
    tagline: '',
    description: '',
    gateRequirement: '',
    artifact: '',
    status: 'pending',
    checklist: [
      { id: `${overrides.id}-1`, text: 'uno', completed: false },
      { id: `${overrides.id}-2`, text: 'dos', completed: false },
    ],
    ...overrides,
  });

  const complete = (id: SDDStage['id'], status: SDDStage['status']): SDDStage =>
    stage({
      id,
      status,
      checklist: [
        { id: `${id}-1`, text: 'uno', completed: true },
        { id: `${id}-2`, text: 'dos', completed: true },
      ],
    });

  it('passes a gate with a complete checklist and passed predecessors', () => {
    const stages = [complete('E0', 'passed'), complete('E1', 'passed')];
    const evaluation = evaluateGate(stages, 1);

    expect(evaluation.canPass).toBe(true);
    expect(evaluation.effectiveStatus).toBe('passed');
    expect(evaluation.checklistDone).toBe(2);
    expect(evaluation.reasons).toEqual([]);
    expect(evaluation.blockingPredecessor).toBeNull();
  });

  it('degrades a declared pass with an incomplete checklist to blocked', () => {
    const stages = [complete('E0', 'passed'), stage({ id: 'E1', status: 'passed' })];
    const evaluation = evaluateGate(stages, 1);

    expect(evaluation.canPass).toBe(false);
    expect(evaluation.effectiveStatus).toBe('blocked');
    expect(evaluation.checklistDone).toBe(0);
    expect(evaluation.reasons.join(' ')).toContain('Checklist incompleto (0/2)');
  });

  it('degrades a declared pass when a predecessor is not passed', () => {
    const stages = [complete('E0', 'in_progress'), complete('E1', 'passed')];
    const evaluation = evaluateGate(stages, 1);

    expect(evaluation.canPass).toBe(false);
    expect(evaluation.effectiveStatus).toBe('blocked');
    expect(evaluation.blockingPredecessor).toBe('E0');
    expect(evaluation.reasons.join(' ')).toContain('Gate anterior E0');
  });

  it('reports the first blocking predecessor only', () => {
    const stages = [
      stage({ id: 'E0', status: 'blocked' }),
      stage({ id: 'E1', status: 'pending' }),
      complete('E2', 'passed'),
    ];
    expect(evaluateGate(stages, 2).blockingPredecessor).toBe('E0');
  });

  it('leaves non-passed statuses untouched even when the gate cannot pass', () => {
    const stages = [stage({ id: 'E0', status: 'pending' }), stage({ id: 'E1', status: 'pending' })];
    expect(evaluateGate(stages, 1).effectiveStatus).toBe('pending');
  });

  it('never treats an empty checklist as complete', () => {
    const stages = [stage({ id: 'E0', status: 'passed', checklist: [] })];
    const evaluation = evaluateGate(stages, 0);

    expect(evaluation.checklistComplete).toBe(false);
    expect(evaluation.effectiveStatus).toBe('blocked');
  });
});

describe('toggleChecklistItem / cycleStageStatus — immutable transitions', () => {
  it('toggles a single item without mutating the input', () => {
    const before = SDD_STAGES;
    const after = toggleChecklistItem(before, 'E5', 'E5-5');

    expect(after).not.toBe(before);
    expect(after.find((s) => s.id === 'E5')?.checklist.find((i) => i.id === 'E5-5')?.completed).toBe(
      true,
    );
    expect(before.find((s) => s.id === 'E5')?.checklist.find((i) => i.id === 'E5-5')?.completed).toBe(
      false,
    );
    expect(after.filter((s) => s.id !== 'E5')).toEqual(before.filter((s) => s.id !== 'E5'));
  });

  it('leaves every other stage untouched', () => {
    const after = toggleChecklistItem(SDD_STAGES, 'E0', 'E0-1');
    expect(after.find((s) => s.id === 'E1')).toEqual(SDD_STAGES.find((s) => s.id === 'E1'));
  });

  it('promotes a pending stage to in_progress when its checklist is completed', () => {
    const pending: SDDStage[] = [
      {
        ...SDD_STAGES[0],
        id: 'E0',
        status: 'pending',
        checklist: [
          { id: 'E0-1', text: 'uno', completed: false },
          { id: 'E0-2', text: 'dos', completed: true },
        ],
      },
    ];
    const after = toggleChecklistItem(pending, 'E0', 'E0-1');
    expect(after[0].status).toBe('in_progress');
  });

  it('demotes a passed stage to in_progress when an item is unchecked', () => {
    const after = toggleChecklistItem(SDD_STAGES, 'E0', 'E0-1');
    expect(after[0].status).toBe('in_progress');
  });

  it('keeps a blocked stage blocked when items change', () => {
    const blocked: SDDStage[] = [{ ...SDD_STAGES[0], status: 'blocked' }];
    expect(toggleChecklistItem(blocked, 'E0', 'E0-1')[0].status).toBe('blocked');
  });

  it('ignores unknown stage and item ids', () => {
    expect(toggleChecklistItem(SDD_STAGES, 'E9' as never, 'E0-1')).toEqual(SDD_STAGES);
    expect(toggleChecklistItem(SDD_STAGES, 'E0', 'nope')).toEqual(SDD_STAGES);
    expect(cycleStageStatus(SDD_STAGES, 'E9' as never)).toEqual(SDD_STAGES);
  });

  it('cycles the declared status of one stage along STATUS_CYCLE', () => {
    // E5 ships as in_progress: in_progress → passed → blocked → pending.
    const first = cycleStageStatus(SDD_STAGES, 'E5');
    expect(first.find((s) => s.id === 'E5')?.status).toBe('passed');

    const second = cycleStageStatus(first, 'E5');
    expect(second.find((s) => s.id === 'E5')?.status).toBe('blocked');

    const third = cycleStageStatus(second, 'E5');
    expect(third.find((s) => s.id === 'E5')?.status).toBe('pending');

    expect(cycleStageStatus(third, 'E5').find((s) => s.id === 'E5')?.status).toBe('in_progress');
  });
});

describe('evaluateProtocol — the canonical E0..E7 dataset', () => {
  it('counts 8 gates and 37 checklist items', () => {
    const progress = evaluateProtocol(SDD_STAGES);
    expect(progress.stagesTotal).toBe(8);
    expect(progress.checklistTotal).toBe(37);
  });

  it('reports the real completion state of the restoration', () => {
    const progress = evaluateProtocol(SDD_STAGES);
    expect(progress.checklistDone).toBe(32);
    expect(progress.percent).toBe(86);
    expect(progress.gatesPassed).toBe(5);
    expect(progress.firstOpenStage).toBe('E5');
    expect(progress.gatesBlocked).toEqual([]);
  });

  it('flags a lied-about gate as blocked at protocol level', () => {
    const lying = SDD_STAGES.map((s) => (s.id === 'E5' ? { ...s, status: 'passed' as const } : s));
    const progress = evaluateProtocol(lying);

    expect(progress.gatesBlocked).toEqual(['E5']);
    expect(progress.gatesPassed).toBe(5);
  });

  it('reports a fully closed protocol', () => {
    const closed = SDD_STAGES.map((s) => ({
      ...s,
      status: 'passed' as const,
      checklist: s.checklist.map((item) => ({ ...item, completed: true })),
    }));
    const progress = evaluateProtocol(closed);

    expect(progress.percent).toBe(100);
    expect(progress.gatesPassed).toBe(8);
    expect(progress.firstOpenStage).toBeNull();
  });

  it('returns 0% for an empty protocol instead of NaN', () => {
    const progress = evaluateProtocol([]);
    expect(progress.percent).toBe(0);
    expect(progress.firstOpenStage).toBeNull();
  });
});

describe('renderProtocolReport — exportable evidence', () => {
  it('renders every gate, principle and the progress header', () => {
    const report = renderProtocolReport({ stages: SDD_STAGES, principles: SDD_PRINCIPLES });

    expect(report).toContain('# PROTOCOLO SDD MAESTRO');
    for (const stage of SDD_STAGES) {
      expect(report).toContain(`### ${stage.id} · ${stage.name}`);
      expect(report).toContain(stage.gateRequirement);
      expect(report).toContain(stage.artifact);
    }
    for (const principle of SDD_PRINCIPLES) {
      expect(report).toContain(`| ${principle.code} | ${principle.name} |`);
    }
    const progress = evaluateProtocol(SDD_STAGES);
    expect(report).toContain(`**Progreso de checklist:** ${progress.percent}%`);
    expect(report).toContain(`**Gates aprobados:** ${progress.gatesPassed}/${progress.stagesTotal}`);
    expect(report).toContain(`**Primer gate abierto:** ${progress.firstOpenStage}`);
    expect(report).toContain('- **Generado:**');
  });

  it('declares that no audit ran when none is supplied', () => {
    const report = renderProtocolReport({ stages: SDD_STAGES, principles: SDD_PRINCIPLES });
    expect(report).toContain('No se ha ejecutado ninguna auditoría en esta sesión.');
  });

  it('embeds the audit verdict, score, areas, EARS table and findings', () => {
    const audit = auditSpec(withoutArea(VALID_SPEC, '## Commands'));
    const report = renderProtocolReport({
      stages: SDD_STAGES,
      principles: SDD_PRINCIPLES,
      audit,
      specTitle: 'SPEC Zion',
    });

    expect(report).toContain('## Auditoría de Spec — SPEC Zion');
    expect(report).toContain(`Puntuación:** ${audit.score}/100`);
    expect(report).toContain('| Commands | ❌ |');
    expect(report).toContain('| Ubiquitous (shall) |');
    expect(report).toContain('area-commands');
    expect(report).toContain('Fix:');
  });

  it('lists literal EARS criteria when they exist', () => {
    const report = renderProtocolReport({
      stages: SDD_STAGES,
      principles: SDD_PRINCIPLES,
      audit: auditSpec(VALID_SPEC),
    });
    expect(report).toContain('Criterios literales');
    expect(report).toContain('event_driven');
  });

  it('falls back to a default title when the spec is empty', () => {
    const report = renderProtocolReport({
      stages: SDD_STAGES,
      principles: SDD_PRINCIPLES,
      audit: auditSpec(''),
    });
    expect(report).toContain('## Auditoría de Spec — Spec auditada');
    expect(report).toContain('BLOQUEADA');
  });
});
