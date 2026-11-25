import React from 'react';
import { AlertOctagon, RotateCcw } from 'lucide-react';
import { Language } from '../types';
import { translations } from '../locales/i18n';

interface Props {
  lang: Language;
  /** Identifies the guarded section in the logs (never shown to the visitor). */
  scope: string;
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Section-level error boundary.
 *
 * Before this component existed, any throw inside a view — a WebGL context
 * that could not be created, a null geometry, an aborted audio graph — took the
 * whole workspace down to a blank page, because React unmounts the entire tree
 * on an unhandled render error.
 *
 * It implements principle P4 (ERROR LEAKAGE): the visitor sees a generic,
 * translated message with a retry action, while the internal log keeps the
 * stack, the component stack and the scope.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Structured log (production checklist criterion 20).
    console.error(
      JSON.stringify({
        level: 'error',
        service: 'belentani-workspace',
        scope: this.props.scope,
        message: error.message,
        name: error.name,
        stack: error.stack,
        componentStack: info.componentStack ?? null,
        at: new Date().toISOString(),
      }),
    );
  }

  private handleRetry = (): void => {
    this.setState({ error: null });
  };

  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const t = translations[this.props.lang];

    return (
      <div
        role="alert"
        className="min-h-[320px] flex flex-col items-center justify-center gap-4 rounded-2xl border border-red-500/35 bg-red-950/15 p-8 text-center"
      >
        <AlertOctagon className="w-8 h-8 text-red-400" aria-hidden="true" />
        <div>
          <p className="text-sm font-bold text-white">{t.errorTitle}</p>
          <p className="text-xs text-zinc-400 mt-1 max-w-md">{t.errorDescription}</p>
        </div>
        <button
          type="button"
          onClick={this.handleRetry}
          className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-semibold transition-all"
        >
          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{t.errorRetry}</span>
        </button>
      </div>
    );
  }
}
