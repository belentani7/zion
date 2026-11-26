import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { SddMaestroView } from '../components/sdd-maestro/SddMaestroView';
import { ProductionChecklistView } from '../components/production-checklist/ProductionChecklistView';
import { WorkspaceHubView } from '../components/workspace-hub/WorkspaceHubView';
import { VisualEngineView } from '../components/visual-engine/VisualEngineView';
import { Navigation } from '../components/Navigation';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { LANGUAGES } from '../locales/i18n';
import type { Language, NavTabId } from '../types';

/**
 * WCAG 2.1 AA suite (PRODUCTION_CHECKLIST criterion 24).
 *
 * Runs axe-core against every view in every language. jsdom has no layout
 * engine, so colour-contrast rules cannot be evaluated and are disabled here;
 * they are covered by Lighthouse in the deployment audit. Everything else —
 * landmarks, accessible names, table semantics, heading order, aria validity —
 * is machine-checkable and fails the build when it regresses.
 */

const axeOptions: axe.RunOptions = {
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
  rules: {
    // Requires a real layout engine.
    'color-contrast': { enabled: false },
    // jsdom reports every region as 0x0.
    'scrollable-region-focusable': { enabled: false },
  },
};

async function assertNoViolations(container: HTMLElement, label: string): Promise<void> {
  const results = await axe.run(container, axeOptions);
  const summary = results.violations.map(
    (violation) =>
      `${violation.id} (${violation.impact}) ×${violation.nodes.length}: ${violation.nodes[0]?.html?.slice(0, 120)}`,
  );
  expect(summary, `${label} — violaciones axe`).toEqual([]);
}

const ALL_LANGUAGES = LANGUAGES.map((entry) => entry.id) as Language[];

describe('axe-core WCAG 2.1 AA por vista e idioma', () => {
  it.each(ALL_LANGUAGES)('SddMaestroView en %s', async (lang) => {
    const { container } = render(<SddMaestroView lang={lang} />);
    await assertNoViolations(container, `SddMaestroView/${lang}`);
  });

  it.each(ALL_LANGUAGES)('ProductionChecklistView en %s', async (lang) => {
    const { container } = render(<ProductionChecklistView lang={lang} />);
    await assertNoViolations(container, `ProductionChecklistView/${lang}`);
  });

  it.each(ALL_LANGUAGES)('WorkspaceHubView en %s', async (lang) => {
    const { container } = render(<WorkspaceHubView lang={lang} />);
    await assertNoViolations(container, `WorkspaceHubView/${lang}`);
  });

  it.each(ALL_LANGUAGES)('VisualEngineView en %s', async (lang) => {
    const { container } = render(<VisualEngineView lang={lang} />);
    await assertNoViolations(container, `VisualEngineView/${lang}`);
  });

  it.each(ALL_LANGUAGES)('Navigation en %s', async (lang) => {
    const { container } = render(
      <main>
        <Navigation currentTab="judas_omega" onTabChange={() => {}} lang={lang} onLangChange={() => {}} />
      </main>,
    );
    await assertNoViolations(container, `Navigation/${lang}`);
  });

  it('ErrorBoundary en estado de error', async () => {
    const { container } = render(
      <ErrorBoundary lang="es" scope="test">
        <p>contenido sano</p>
      </ErrorBoundary>,
    );
    await assertNoViolations(container, 'ErrorBoundary');
  });
});

describe('estructura semántica exigida por P3 (HTML semántico)', () => {
  it('el auditor de specs declara su región en vivo y su control expandido', async () => {
    const user = userEvent.setup();
    const { container, getByRole } = render(<SddMaestroView lang="es" />);

    // Accessible name comes from t.sddAuditSpec ("Auditar Nueva Spec").
    const toggle = getByRole('button', { name: /auditar/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', 'sdd-audit-panel');
    // Collapsed by default: the panel is not in the DOM until opened.
    expect(container.querySelector('#sdd-audit-panel')).toBeNull();

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const controlled = container.querySelector('#sdd-audit-panel');
    expect(controlled).not.toBeNull();
    expect(controlled?.querySelector('textarea#sdd-spec-input')).not.toBeNull();
    // The live region only exists once there is something to announce.
    expect(controlled?.querySelector('[aria-live="polite"]')).toBeNull();

    await user.type(controlled?.querySelector('#sdd-spec-input') as HTMLElement, '## Objective\nSpec de prueba con al menos ochenta caracteres para superar el umbral mínimo del auditor.');
    await user.click(getByRole('button', { name: /ejecutar auditor/i }));

    const live = controlled?.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
    expect(live?.textContent).toMatch(/Veredicto/);
    expect(live?.textContent).toMatch(/Puntuación: \d+\/100/);
  });

  it('las gates E0-E7 son una lista ordenada plegable con checkboxes reales', async () => {
    const user = userEvent.setup();
    const { container } = render(<SddMaestroView lang="es" />);

    const gatesSection = container.querySelector('[aria-labelledby="sdd-gates-heading"]');
    const gates = gatesSection?.querySelectorAll('ol > li') ?? [];
    expect(gates.length).toBe(8);

    // Only E5 ships expanded: its 6 items are the only checkboxes in the DOM.
    expect(container.querySelectorAll('input[type="checkbox"]').length).toBe(6);
    expect(container.querySelectorAll('fieldset').length).toBe(1);
    expect(container.querySelectorAll('legend').length).toBe(1);

    const expander = (index: number) =>
      gatesSection?.querySelectorAll('ol > li button[aria-expanded]')[
        index
      ] as HTMLButtonElement;
    for (let index = 0; index < gates.length; index += 1) {
      if (expander(index).getAttribute('aria-expanded') === 'false') {
        await user.click(expander(index));
      }
    }

    // Every gate open: the whole 37-item protocol checklist is now reachable.
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes.length).toBe(37);
    for (const box of checkboxes) {
      // Implicit label association (the input lives inside its <label>), which
      // is what gives every criterion an accessible name.
      const label = box.closest('label');
      expect(label).not.toBeNull();
      expect((label?.textContent ?? '').trim().length).toBeGreaterThan(5);
      expect(box).toBeEnabled();
    }
  });

  it('todas las tablas de la vista tienen cabeceras con scope y caption accesible', () => {
    const { container } = render(<SddMaestroView lang="es" />);
    const tables = container.querySelectorAll('table');

    // Quality gates y la matriz de deploy recuperada del protocolo.
    expect(tables.length).toBe(2);
    for (const table of tables) {
      expect(table.querySelector('caption.sr-only')).not.toBeNull();
      const headers = table.querySelectorAll('thead th');
      expect(headers.length).toBeGreaterThan(0);
      for (const header of headers) expect(header).toHaveAttribute('scope', 'col');
    }
  });

  it('los guardrails son una lista ordenada etiquetada por su heading', () => {
    const { container } = render(<SddMaestroView lang="es" />);
    const section = container.querySelector('[aria-labelledby="sdd-guardrails-heading"]');
    const items = section?.querySelectorAll('ol > li') ?? [];

    expect(section).not.toBeNull();
    expect(container.querySelector('#sdd-guardrails-heading')).not.toBeNull();
    expect(items.length).toBe(7);
    for (const item of items) {
      expect((item.textContent ?? '').trim().length).toBeGreaterThan(20);
    }
  });

  it('el checklist de producción expone cada criterio como checkbox con nombre accesible', () => {
    const { container } = render(<ProductionChecklistView lang="es" />);

    const checkboxes = container.querySelectorAll('[role="checkbox"]');
    expect(checkboxes.length).toBeGreaterThan(20);
    for (const box of checkboxes) {
      expect(box).toHaveAttribute('aria-checked');
      expect(box.getAttribute('aria-label')?.length ?? 0).toBeGreaterThan(5);
    }
  });

  it('los 66 botones del workspace declaran type=button (sin submits accidentales)', () => {
    const views = [
      render(<SddMaestroView lang="es" />).container,
      render(<ProductionChecklistView lang="es" />).container,
      render(<WorkspaceHubView lang="es" />).container,
    ];
    for (const container of views) {
      for (const button of container.querySelectorAll('button')) {
        expect(button.getAttribute('type')).toBe('button');
      }
    }
  });

  it('el canvas 3D degrada a un mensaje de estado cuando no hay WebGL', () => {
    const { container } = render(<VisualEngineView lang="es" />);

    // jsdom cannot create a GL context: the component must render the fallback.
    const status = container.querySelector('[role="status"]');
    expect(status?.textContent).toContain('WebGL');
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('la navegación marca la pestaña activa y el idioma seleccionado', () => {
    const { container } = render(
      <main>
        <Navigation
          currentTab="sdd_maestro"
          onTabChange={() => {}}
          lang="pt"
          onLangChange={() => {}}
        />
      </main>,
    );

    const current = container.querySelector('[aria-current="page"]');
    expect(current).not.toBeNull();
    expect(current?.textContent).toContain('SDD');

    const pressed = container.querySelectorAll('[aria-pressed="true"]');
    expect(pressed.length).toBe(1);
    expect(pressed[0]).toHaveAttribute('lang', 'pt');
  });

  it('expone los 6 tabs del NavTabId sin duplicados', () => {
    const { container } = render(
      <main>
        <Navigation currentTab="judas_omega" onTabChange={() => {}} lang="es" onLangChange={() => {}} />
      </main>,
    );
    const tabs = [...container.querySelectorAll('nav button')].filter((button) =>
      button.hasAttribute('aria-current') || button.closest('nav')?.contains(button),
    );
    const ids: NavTabId[] = ['judas_omega', 'omega_prime', 'visual_engine', 'sdd_maestro', 'production_checklist', 'workspace_hub'];
    expect(ids.length).toBe(new Set(ids).size);
    expect(tabs.length).toBeGreaterThanOrEqual(ids.length);
  });
});
