import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type React from 'react';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';

/**
 * The shell: lazy views, per-section error isolation, document language and
 * document title. This file is what protects the three decisions that used to
 * be missing entirely (a single 1 MB eager bundle, no boundary, and a frozen
 * `lang="es"` on a four-language UI).
 */

async function mountApp() {
  const utils = render(<App />);
  // The default tab is a lazy chunk: wait for Suspense to resolve.
  // The Suspense fallback is tagged: `role="status"` is also used by the WebGL
  // degradation panel, which jsdom always renders.
  await waitFor(() => {
    expect(utils.container.querySelector('[data-app-loading]')).toBeNull();
  });
  return utils;
}

describe('App — arranque', () => {
  it('renders the shell with navigation, main and footer', async () => {
    const { container } = await mountApp();

    expect(container.querySelector('nav')).not.toBeNull();
    expect(container.querySelector('main#main-content')).not.toBeNull();
    expect(container.querySelector('footer')).not.toBeNull();
    // Un único <h1> por página: el que aporta la vista activa.
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('exposes a skip link pointing at the main content', async () => {
    await mountApp();
    const skip = screen.getByRole('link', { name: /contenido principal/i });
    expect(skip).toHaveAttribute('href', '#main-content');
  });

  it('mounts the default tab (Judas OMEGA) without a blank page', async () => {
    const { container } = await mountApp();

    expect(container.querySelector('main#main-content')?.textContent?.length ?? 0).toBeGreaterThan(
      50,
    );
  });

  it('does not report an error boundary on a clean boot', async () => {
    await mountApp();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('App — idioma y título del documento (WCAG 3.1.1 y 2.4.2)', () => {
  it.each([
    ['pt', 'pt'],
    ['es', 'es'],
    ['en', 'en'],
    ['ca', 'ca'],
  ])('switching to %s sets html lang="%s"', async (label, expected) => {
    await mountApp();

    await userEvent.click(screen.getByRole('button', { name: new RegExp(`^${label}$`) }));

    await waitFor(() => {
      expect(document.documentElement.lang).toBe(expected);
    });
  });

  it('starts in Spanish, matching the initial state', async () => {
    await mountApp();
    expect(document.documentElement.lang).toBe('es');
  });

  it('names the document after the active section', async () => {
    await mountApp();

    expect(document.title).toBe('Judas OMEGA · Belentani Workspace & Visual Engine');
    const titleBefore = document.title;

    await userEvent.click(screen.getByRole('button', { name: /Protocolo SDD Maestro/i }));

    await waitFor(() => {
      expect(document.title).not.toBe(titleBefore);
    });
    expect(document.title).toContain('Protocolo SDD Maestro');
  });
});

describe('App — navegación entre las 6 vistas', () => {
  const tabs = [
    { name: /OMEGA-PRIME/i },
    { name: /Visual Engine 3D/i },
    { name: /Protocolo SDD Maestro/i },
    { name: /Checklist Producción/i },
    { name: /Hub del Workspace/i },
    { name: /Judas OMEGA/i },
  ];

  it.each(tabs)('mounts $name without crashing', async ({ name }) => {
    const { container } = await mountApp();

    await userEvent.click(screen.getByRole('button', { name }));

    await waitFor(() => {
      expect(container.querySelector('[data-app-loading]')).toBeNull();
    });
    expect(container.querySelector('main#main-content')).not.toBeEmptyDOMElement();
    expect(screen.getByRole('button', { name })).toHaveAttribute('aria-current', 'page');
  });

  it('keeps the language across tab changes', async () => {
    await mountApp();

    await userEvent.click(screen.getByRole('button', { name: /^en$/ }));
    await waitFor(() => expect(document.documentElement.lang).toBe('en'));

    // Con el bundle EN activo la pestaña se llama "SDD Maestro Protocol".
    await userEvent.click(screen.getByRole('button', { name: /SDD Maestro Protocol/i }));
    await waitFor(() => expect(document.querySelector('[data-app-loading]')).toBeNull());

    expect(document.documentElement.lang).toBe('en');
    expect(document.title).toContain('SDD Maestro Protocol');
  });
});

describe('App — aislamiento de fallos (P4)', () => {
  it('a section that throws is confined by the boundary and the shell survives', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    function CrashingView(): React.JSX.Element {
      throw new Error('fallo interno de la vista');
    }

    const { container } = render(
      <div>
        <p id="shell">shell vivo</p>
        {/* Misma composición que App: boundary alrededor de una sola sección. */}
        <ErrorBoundary lang="es" scope="vista-que-falla">
          <CrashingView />
        </ErrorBoundary>
      </div>,
    );

    expect(container.querySelector('#shell')?.textContent).toBe('shell vivo');
    expect(screen.getByRole('alert')).toHaveTextContent(/Esta sección ha fallado/);
    // P4: el detalle interno no llega al visitante.
    expect(container.textContent).not.toContain('fallo interno de la vista');
    errorSpy.mockRestore();
  });
});
