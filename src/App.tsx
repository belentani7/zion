import React, { Suspense, lazy, useEffect, useState } from 'react';
import { Language, NavTabId } from './types';
import { NAV_TAB_LABELS, translations } from './locales/i18n';
import { Navigation } from './components/Navigation';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Loader2, ShieldCheck } from 'lucide-react';

/**
 * Every view is a lazy chunk.
 *
 * The six views used to be imported eagerly, so the entry bundle shipped the
 * whole workspace — including two Three.js scenes and the 44-node galaxy data —
 * in a single 1.04 MB file (286 kB gzip) before a single pixel was painted.
 * With `React.lazy` the entry only carries the shell and the active view, and
 * Three.js lands in its own cacheable vendor chunk (see vite.config.ts).
 */
const JudasExperienceView = lazy(() =>
  import('./components/judas-omega/JudasExperienceView').then((module) => ({
    default: module.JudasExperienceView,
  })),
);
const OmegaPrimeView = lazy(() =>
  import('./components/omega-prime/OmegaPrimeView').then((module) => ({
    default: module.OmegaPrimeView,
  })),
);
const VisualEngineView = lazy(() =>
  import('./components/visual-engine/VisualEngineView').then((module) => ({
    default: module.VisualEngineView,
  })),
);
const SddMaestroView = lazy(() =>
  import('./components/sdd-maestro/SddMaestroView').then((module) => ({
    default: module.SddMaestroView,
  })),
);
const ProductionChecklistView = lazy(() =>
  import('./components/production-checklist/ProductionChecklistView').then((module) => ({
    default: module.ProductionChecklistView,
  })),
);
const WorkspaceHubView = lazy(() =>
  import('./components/workspace-hub/WorkspaceHubView').then((module) => ({
    default: module.WorkspaceHubView,
  })),
);

const VIEWS: Record<
  NavTabId,
  { scope: string; Component: React.LazyExoticComponent<React.ComponentType<{ lang: Language }>> }
> = {
  judas_omega: { scope: 'judas-omega', Component: JudasExperienceView },
  omega_prime: { scope: 'omega-prime', Component: OmegaPrimeView },
  visual_engine: { scope: 'visual-engine', Component: VisualEngineView },
  sdd_maestro: { scope: 'sdd-maestro', Component: SddMaestroView },
  production_checklist: { scope: 'production-checklist', Component: ProductionChecklistView },
  workspace_hub: { scope: 'workspace-hub', Component: WorkspaceHubView },
};

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<NavTabId>('judas_omega');
  const [lang, setLang] = useState<Language>('es');

  const t = translations[lang];
  const tabLabel = NAV_TAB_LABELS[currentTab](t);
  const { scope, Component } = VIEWS[currentTab];

  /**
   * WCAG 2.1 AA 3.1.1 (Language of Page): the document language follows the
   * active bundle instead of staying frozen at the `lang="es"` of index.html,
   * which mispronounced the Portuguese, English and Catalan UIs in screen
   * readers and mistranslated the page for search engines.
   */
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  /** WCAG 2.1 AA 2.4.2 (Page Titled): the title names the active section. */
  useEffect(() => {
    document.title = `${tabLabel} · ${t.appTitle}`;
  }, [tabLabel, t.appTitle]);

  return (
    <div className="min-h-screen bg-black text-zinc-100 flex flex-col selection:bg-rose-500/30 selection:text-rose-100">
      {/* WCAG 2.4.1 Bypass Blocks: keyboard users skip the navigation bar. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-xl focus:bg-rose-600 focus:text-white focus:text-xs focus:font-semibold"
      >
        {t.skipToContent}
      </a>

      <Navigation
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        lang={lang}
        onLangChange={setLang}
      />

      <main id="main-content" className="flex-1 max-w-7xl w-full mx-auto p-4 lg:p-6">
        {/*
          Un único <h1> por página (WCAG 2.4.6 / outline): el titular visible de
          la vista activa. JudasExperienceView ya aporta su propio <h1>, así que
          el del shell se declara como párrafo de contexto accesible y no como
          segundo <h1> que rompería la jerarquía.
        */}
        <p className="sr-only">{t.appTitle}</p>

        {/* Each view is guarded: a failure in one section no longer blanks the
            whole workspace (P4 ERROR LEAKAGE). */}
        <ErrorBoundary lang={lang} scope={scope} key={scope}>
          <Suspense
            fallback={
              <div
                role="status"
                aria-live="polite"
                data-app-loading="true"
                className="min-h-[60vh] flex flex-col items-center justify-center gap-3"
              >
                <Loader2 className="w-6 h-6 animate-spin text-rose-500" aria-hidden="true" />
                <span className="text-[11px] font-mono uppercase tracking-[0.25em] text-zinc-500">
                  {tabLabel}
                </span>
              </div>
            }
          >
            <Component lang={lang} />
          </Suspense>
        </ErrorBoundary>
      </main>

      <footer className="border-t border-zinc-900 bg-black py-4 px-6 text-xs text-zinc-500">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="font-mono text-zinc-400">
            belentani-workspace · Ecosistema de Pedro Belentani (belentani7)
          </div>

          <div className="flex items-center gap-4 text-[11px] font-mono">
            <span className="flex items-center gap-1.5 text-amber-400/90">
              <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" /> THE JUDAS EXPERIENCE //
              OMEGA
            </span>
            <span>432 Hz · 76 BPM · Three.js</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
