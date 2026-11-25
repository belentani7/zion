import { describe, expect, it, vi } from 'vitest';
import type React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

/**
 * P4 (ERROR LEAKAGE) + the crash isolation that used to be missing entirely:
 * without a boundary, one throw inside a view blanked the whole workspace.
 */

function Boom({ message }: { message: string }): React.JSX.Element {
  throw new Error(message);
}

function Ok() {
  return <p>contenido sano</p>;
}

describe('ErrorBoundary', () => {
  it('renders its children while nothing throws', () => {
    render(
      <ErrorBoundary lang="es" scope="test">
        <Ok />
      </ErrorBoundary>,
    );
    expect(screen.getByText('contenido sano')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each([
    ['es', 'Esta sección ha fallado', 'Reintentar'],
    ['pt', 'Esta secção falhou', 'Tentar novamente'],
    ['en', 'This section failed', 'Try again'],
    ['ca', 'Aquesta secció ha fallat', 'Tornar-ho a provar'],
  ])('renders the translated fallback in %s', (lang, title, retry) => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary lang={lang as 'es'} scope="vista">
        <Boom message="boom" />
      </ErrorBoundary>,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(title);
    expect(alert).toHaveTextContent(retry);
    errorSpy.mockRestore();
  });

  it('never shows the internal detail to the visitor', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary lang="es" scope="vista">
        <Boom message="AIzaSySECRETVALUE1234567890 leaked" />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert').textContent).not.toContain('AIzaSySECRETVALUE1234567890');
    expect(screen.getByRole('alert').textContent).not.toContain('boom');
    errorSpy.mockRestore();
  });

  it('logs one structured JSON line with scope, stack and component stack', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary lang="es" scope="sdd-maestro">
        <Boom message="fallo interno" />
      </ErrorBoundary>,
    );

    const lines = errorSpy.mock.calls
      .map((call) => String(call[0]))
      .filter((line) => line.startsWith('{'));
    expect(lines.length).toBe(1);

    const parsed = JSON.parse(lines[0]);
    expect(parsed).toMatchObject({
      level: 'error',
      service: 'belentani-workspace',
      scope: 'sdd-maestro',
      message: 'fallo interno',
    });
    expect(typeof parsed.stack).toBe('string');
    expect(typeof parsed.componentStack).toBe('string');
    expect(typeof parsed.at).toBe('string');
    errorSpy.mockRestore();
  });

  it('remounts the children when the visitor retries', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let shouldThrow = true;

    function Flaky(): React.JSX.Element {
      if (shouldThrow) throw new Error('transient');
      return <p>recuperado</p>;
    }

    const { getByRole } = render(
      <ErrorBoundary lang="es" scope="flaky">
        <Flaky />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();

    shouldThrow = false;
    fireEvent.click(getByRole('button', { name: /reintentar/i }));

    expect(screen.getByText('recuperado')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    errorSpy.mockRestore();
  });
});
