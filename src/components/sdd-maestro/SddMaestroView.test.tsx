import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Language } from '../../types';
import { SddMaestroView } from './SddMaestroView';
import { DEPLOY_MATRIX, GUARDRAILS, SDD_STAGES } from './sddData';
import { evaluateProtocol } from './sddAudit';

/**
 * Behaviour suite for the SDD Maestro view.
 *
 * Covers the three state transitions the view owns (checklist toggle, status
 * cycle, reset), the audit round trip and the Markdown export. Principle P2
 * forces the invalid and error classes in, not only the happy path.
 */

const TOTAL_ITEMS = SDD_STAGES.reduce((total, stage) => total + stage.checklist.length, 0);

function openGate(container: HTMLElement, stageId: string): void {
  const button = container.querySelector(
    `button[aria-controls="sdd-stage-${stageId}"]`,
  ) as HTMLButtonElement | null;
  if (button && button.getAttribute('aria-expanded') === 'false') {
    fireEvent.click(button);
  }
}

describe('SddMaestroView — scorecards reflect the canonical dataset', () => {
  it('renders the 8 gates, the 5 principles and the real progress', () => {
    const { container } = render(<SddMaestroView lang="es" />);
    const progress = evaluateProtocol(SDD_STAGES);

    expect(
      container.querySelectorAll('[aria-labelledby="sdd-gates-heading"] ol > li'),
    ).toHaveLength(8);
    expect(screen.getByText(/Protocolo SDD Maestro/)).toBeInTheDocument();
    expect(screen.getByText(/Principios de la Constitución/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Puertas de calidad/ })).toBeInTheDocument();
    // The scorecard and the donut centre both show the percentage.
    expect(screen.getAllByText(`${progress.percent}%`).length).toBeGreaterThanOrEqual(2);
    expect(container.textContent).toContain(
      `${progress.checklistDone} de ${progress.checklistTotal} items`,
    );
    expect(container.textContent).toContain(`/${progress.stagesTotal}`);
    // E5 appears in the scorecard and in the gate list.
    expect(screen.getAllByText(progress.firstOpenStage ?? '').length).toBeGreaterThanOrEqual(2);
  });

  it('renders every quality gate row with its verification command', () => {
    const { container } = render(<SddMaestroView lang="es" />);
    const section = container.querySelector('[aria-labelledby="sdd-quality-heading"]');
    const rows = section?.querySelectorAll('table tbody tr');
    expect(rows?.length).toBe(8);
    expect(section?.querySelector('table')?.textContent).toContain('npm run build');
    // Las cabeceras son chrome y van localizadas, nunca hardcodeadas.
    expect(section?.querySelector('thead')?.textContent).toContain('Herramienta');
  });

  it.each(['pt', 'es', 'en', 'ca'] as const)('renders without undefined text in %s', (lang) => {
    const { container } = render(<SddMaestroView lang={lang} />);
    expect(container.textContent).not.toContain('undefined');
  });
});

describe('SddMaestroView — checklist state machine (P3)', () => {
  it('marks an item as done and promotes the stage out of pending', async () => {
    const user = userEvent.setup();
    const { container } = render(<SddMaestroView lang="es" />);

    openGate(container, 'E6');
    const pendingBox = container.querySelector(
      '#sdd-stage-E6 input[type="checkbox"]:not(:checked)',
    ) as HTMLInputElement;
    expect(pendingBox).not.toBeNull();

    await user.click(pendingBox);
    expect(pendingBox.checked).toBe(true);
  });

  it('demotes a passed gate when an item is unchecked', async () => {
    const user = userEvent.setup();
    const { container } = render(<SddMaestroView lang="es" />);

    openGate(container, 'E0');
    const doneBox = container.querySelector(
      '#sdd-stage-E0 input[type="checkbox"]:checked',
    ) as HTMLInputElement;
    const statusChip = () =>
      container
        .querySelector('button[aria-controls="sdd-stage-E0"]')
        ?.closest('li')
        ?.textContent ?? '';

    expect(statusChip()).toContain('Aprobado');

    await user.click(doneBox);
    expect(doneBox.checked).toBe(false);
    expect(statusChip()).toContain('En Curso');
  });

  it('cycles the declared status pending → in_progress → passed → blocked', async () => {
    const user = userEvent.setup();
    const { container } = render(<SddMaestroView lang="es" />);

    openGate(container, 'E6');
    const cycleButton = screen
      .getAllByRole('button', { name: /Estado:/ })
      .find((button) => button.closest('#sdd-stage-E6')) as HTMLButtonElement;

    expect(cycleButton.textContent).toContain('Pendiente');
    await user.click(cycleButton);
    expect(cycleButton.textContent).toContain('En Curso');
    await user.click(cycleButton);
    expect(cycleButton.textContent).toContain('Aprobado');
    await user.click(cycleButton);
    expect(cycleButton.textContent).toContain('Bloqueado');
    await user.click(cycleButton);
    expect(cycleButton.textContent).toContain('Pendiente');
  });

  it('restores the canonical dataset on reset', async () => {
    const user = userEvent.setup();
    const { container } = render(<SddMaestroView lang="es" />);

    openGate(container, 'E0');
    const doneBox = container.querySelector(
      '#sdd-stage-E0 input[type="checkbox"]:checked',
    ) as HTMLInputElement;
    await user.click(doneBox);
    expect(doneBox.checked).toBe(false);

    await user.click(screen.getByRole('button', { name: /Restablecer|Reiniciar|Reset/i }));

    const resetBox = container.querySelector(
      '#sdd-stage-E0 input[type="checkbox"]',
    ) as HTMLInputElement;
    expect(resetBox.checked).toBe(true);
  });

  it('exposes every one of the 37 items once all gates are open', () => {
    const { container } = render(<SddMaestroView lang="es" />);
    for (const stage of SDD_STAGES) openGate(container, stage.id);
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(TOTAL_ITEMS);
  });
});

describe('SddMaestroView — spec auditor round trip', () => {
  const validSpec = `# SPEC — Zion

## Objective
Restaurar el workspace para que build, lint y tests pasen en verde.

## Commands
npm run build, npm run lint, npm test

## Project Structure
src/, server.ts, scripts/

## Code Style
TypeScript estricto, utilidades Tailwind, comentarios en español.

## Testing Strategy
Vitest con técnicas ISTQB: partición de equivalencia, análisis de valores
límite, tabla de decisión y máquina de estados. Cubre también las clases de
entrada inválida y error de sistema (ZERO HAPPY-PATH), con HTML semántico y
CSS moderno verificado por axe-core.

## Boundaries
ALWAYS: typecheck antes de commitear. ASK: antes de borrar ficheros. NEVER: secretos.

## Success Criteria
WHEN el usuario abre la app THEN el sistema debe renderizar la pestaña Judas OMEGA.
WHILE no hay contexto WebGL el sistema debe mostrar el panel de fallback.
IF el build falla, THEN el sistema debe salir con código distinto de cero.
WHERE el visitante prefiere movimiento reducido, el sistema debe congelar el cosmos.

## Gate
E1 gate: checklist constitution-grade aprobado antes de escribir código (P5
GATEKEEPING). Errores: el visitante ve un mensaje genérico; el log interno
conserva la traza (P4 ERROR LEAKAGE).
`;

  it('audits a complete spec and announces the verdict in the live region', async () => {
    const user = userEvent.setup();
    render(<SddMaestroView lang="es" />);

    await user.click(screen.getByRole('button', { name: /Auditar Nueva Spec/i }));
    // fireEvent for bulk text: userEvent types char by char and a 1.2 kB spec
    // would blow the per-test timeout without adding signal.
    fireEvent.change(screen.getByLabelText(/Spec a auditar/i), {
      target: { value: validSpec },
    });
    await user.click(screen.getByRole('button', { name: /Ejecutar Auditoría/i }));

    const live = document.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toContain('Veredicto: approved');
    expect(live?.textContent).toMatch(/Puntuación: \d+\/100/);
    expect(live?.textContent).toContain('WHEN');
  });

  it('blocks an empty spec and explains why', async () => {
    const user = userEvent.setup();
    render(<SddMaestroView lang="es" />);

    await user.click(screen.getByRole('button', { name: /Auditar Nueva Spec/i }));
    await user.click(screen.getByRole('button', { name: /Ejecutar Auditoría/i }));

    const live = document.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toContain('Veredicto: blocked');
    expect(live?.textContent).toMatch(/Puntuación: 0\/100/);
    expect(live?.textContent).toMatch(/por debajo del mínimo de 80/i);
  });

  it('clears the input and the result together', async () => {
    const user = userEvent.setup();
    render(<SddMaestroView lang="es" />);

    await user.click(screen.getByRole('button', { name: /Auditar Nueva Spec/i }));
    // fireEvent for bulk text: userEvent types char by char and a 1.2 kB spec
    // would blow the per-test timeout without adding signal.
    fireEvent.change(screen.getByLabelText(/Spec a auditar/i), {
      target: { value: validSpec },
    });
    await user.click(screen.getByRole('button', { name: /Ejecutar Auditoría/i }));
    expect(document.querySelector('[aria-live="polite"]')).not.toBeNull();

    await user.click(screen.getByRole('button', { name: /Limpiar/i }));

    expect((screen.getByLabelText(/Spec a auditar/i) as HTMLTextAreaElement).value).toBe('');
    expect(document.querySelector('[aria-live="polite"]')).toBeNull();
  });
});

describe('SddMaestroView — Markdown export', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('downloads a report with the protocol and creates then revokes the object URL', async () => {
    const user = userEvent.setup();
    const createSpy = vi.spyOn(URL, 'createObjectURL');
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    render(<SddMaestroView lang="es" />);
    await user.click(screen.getByRole('button', { name: /Exportar Protocolo/i }));

    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(anchorClick).toHaveBeenCalledTimes(1);
    expect(revokeSpy).toHaveBeenCalledTimes(1);

    const blob = createSpy.mock.calls[0][0] as Blob;
    const markdown = await blob.text();
    expect(markdown).toContain('# PROTOCOLO SDD MAESTRO');
    expect(markdown).toContain('E0');
    expect(markdown).toContain('E7');
    expect(markdown).toContain('| P1 |');
  });

  it('includes the audit result in the report when one has run', async () => {
    const user = userEvent.setup();
    const createSpy = vi.spyOn(URL, 'createObjectURL');
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    render(<SddMaestroView lang="es" />);
    await user.click(screen.getByRole('button', { name: /Auditar Nueva Spec/i }));
    fireEvent.change(screen.getByLabelText(/Spec a auditar/i), {
      target: { value: '## Objective\nSpec mínima de prueba para el export.' },
    });
    await user.click(screen.getByRole('button', { name: /Ejecutar Auditoría/i }));
    await user.click(screen.getByRole('button', { name: /Exportar Protocolo/i }));

    const blob = createSpy.mock.calls[0][0] as Blob;
    const markdown = await blob.text();
    expect(markdown).toContain('## Auditoría de Spec');
  });
});

describe('SddMaestroView — principles section', () => {
  it('renders the five immutable principles with their techniques', () => {
    const { container } = render(<SddMaestroView lang="es" />);

    expect(container.textContent).toContain('P1');
    expect(container.textContent).toContain('P5');
    expect(container.textContent).toMatch(/ISTQB/);
    expect(container.textContent).toMatch(/ZERO HAPPY-PATH/i);
  });
});

describe('SddMaestroView — guardrails y matriz de deploy del protocolo', () => {
  it('renderiza los 7 guardrails con su nombre canónico y su descripción', () => {
    const { container } = render(<SddMaestroView lang="es" />);
    const items = container.querySelectorAll(
      '[aria-labelledby="sdd-guardrails-heading"] ol > li',
    );

    expect(items).toHaveLength(7);
    expect(items).toHaveLength(GUARDRAILS.length);
    for (const guardrail of GUARDRAILS) {
      const item = container.querySelector(`#sdd-guardrail-${guardrail.id}`);
      expect(item?.textContent).toContain(guardrail.name);
      expect(item?.textContent).toContain(guardrail.description);
    }
    expect(container.textContent).toContain('Spec viva, actualizada en el mismo PR que el código.');
  });

  it('renderiza las 5 plataformas de la matriz de deploy con su comando literal', () => {
    const { container } = render(<SddMaestroView lang="es" />);
    const section = container.querySelector('[aria-labelledby="sdd-deploy-heading"]');
    const rows = section?.querySelectorAll('table tbody tr');

    expect(rows?.length).toBe(5);
    expect(rows?.length).toBe(DEPLOY_MATRIX.length);
    for (const target of DEPLOY_MATRIX) {
      expect(section?.textContent).toContain(target.platform);
      expect(section?.textContent).toContain(target.cli);
      expect(section?.textContent).toContain(target.signal);
    }
    expect(section?.querySelector('thead')?.textContent).toContain('Plataforma');
  });

  it('localiza el chrome de las dos secciones en los 4 idiomas', () => {
    const esperados: Record<Language, string[]> = {
      pt: ['Guardrails de Arquitetura', 'Matriz de Deploy', 'Portões de Qualidade'],
      es: ['Guardrails arquitectónicos', 'Matriz de despliegue', 'Puertas de calidad'],
      en: ['Architectural Guardrails', 'Deploy Matrix', 'Quality Gates'],
      ca: ['Guardrails arquitectònics', 'Matriu de desplegament', 'Portes de qualitat'],
    };

    for (const lang of Object.keys(esperados) as Language[]) {
      const { container, unmount } = render(<SddMaestroView lang={lang} />);
      for (const texto of esperados[lang]) expect(container.textContent).toContain(texto);
      unmount();
    }
  });

  it('mantiene el contenido técnico sin traducir en cualquier idioma', () => {
    // Convención documentada en sddData.ts: el contenido espeja el protocolo en español
    // y sólo el chrome de la vista se localiza.
    for (const lang of ['pt', 'es', 'en', 'ca'] as const) {
      const { container, unmount } = render(<SddMaestroView lang={lang} />);
      expect(container.textContent).toContain('Single Source of Truth');
      expect(container.textContent).toContain('AuthZ en cada endpoint');
      expect(container.textContent).toContain('docker compose up -d --build');
      unmount();
    }
  });
});
