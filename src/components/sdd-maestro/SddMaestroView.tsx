import React, { useMemo, useState } from 'react';
import { Language, SDDStage, SDDStageId } from '../../types';
import { translations } from '../../locales/i18n';
import {
  Activity,
  AlertTriangle,
  CheckCheck,
  ChevronRight,
  ClipboardList,
  Download,
  FileCheck,
  Gavel,
  ListChecks,
  Milestone,
  RotateCcw,
  ScrollText,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { SDD_PRINCIPLES, SDD_STAGES, QUALITY_GATES } from './sddData';
import {
  auditSpec,
  cycleStageStatus,
  evaluateProtocol,
  nextStatus,
  renderProtocolReport,
  toggleChecklistItem,
  type SpecAuditResult,
  type StageStatus,
} from './sddAudit';

interface Props {
  lang: Language;
}

const STATUS_STYLES: Record<StageStatus, { chip: string; card: string; dot: string }> = {
  pending: {
    chip: 'bg-zinc-800 text-zinc-400 border-zinc-700',
    card: 'border-zinc-800 bg-zinc-900/40',
    dot: 'bg-zinc-600',
  },
  in_progress: {
    chip: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
    card: 'border-amber-500/30 bg-amber-950/10',
    dot: 'bg-amber-400',
  },
  passed: {
    chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
    card: 'border-emerald-500/30 bg-emerald-950/10',
    dot: 'bg-emerald-400',
  },
  blocked: {
    chip: 'bg-red-500/15 text-red-300 border-red-500/40',
    card: 'border-red-500/35 bg-red-950/10',
    dot: 'bg-red-500',
  },
};

const VERDICT_STYLES: Record<SpecAuditResult['verdict'], string> = {
  approved: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  conditional: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  blocked: 'bg-red-500/15 text-red-300 border-red-500/40',
};

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-300 border-red-500/35',
  high: 'bg-amber-500/20 text-amber-300 border-amber-500/35',
  medium: 'bg-sky-500/20 text-sky-300 border-sky-500/35',
};

export const SddMaestroView: React.FC<Props> = ({ lang }) => {
  const t = translations[lang];

  const [stages, setStages] = useState<SDDStage[]>(SDD_STAGES);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ E5: true });
  const [auditOpen, setAuditOpen] = useState(false);
  const [specText, setSpecText] = useState('');
  const [audit, setAudit] = useState<SpecAuditResult | null>(null);

  const progress = useMemo(() => evaluateProtocol(stages), [stages]);

  const statusLabel = (status: StageStatus): string => {
    switch (status) {
      case 'pending':
        return t.sddStatusPending;
      case 'in_progress':
        return t.sddStatusInProgress;
      case 'passed':
        return t.sddStatusPassed;
      case 'blocked':
        return t.sddStatusBlocked;
      default:
        return status;
    }
  };

  const handleToggleItem = (stageId: SDDStageId, itemId: string) => {
    setStages((prev) => toggleChecklistItem(prev, stageId, itemId));
  };

  const handleCycleStatus = (stageId: SDDStageId) => {
    setStages((prev) => cycleStageStatus(prev, stageId));
  };

  const handleReset = () => {
    setStages(SDD_STAGES);
    setAudit(null);
    setSpecText('');
  };

  const handleRunAudit = () => {
    setAudit(auditSpec(specText));
  };

  const handleExport = () => {
    const report = renderProtocolReport({
      stages,
      principles: SDD_PRINCIPLES,
      audit,
      specTitle: specText.trim().split(/\r?\n/)[0]?.slice(0, 60) || 'Spec auditada',
    });
    const blob = new Blob([report], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `sdd-maestro-protocol-${Date.now()}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-zinc-900/60 border border-zinc-800/80 p-5 rounded-2xl">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1 rounded-lg bg-emerald-500/20 text-emerald-400">
              <Gavel className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-bold text-white">{t.sddTitle}</h2>
          </div>
          <p className="text-xs text-zinc-400 mt-1">{t.sddSubtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setAuditOpen((prev) => !prev)}
            aria-expanded={auditOpen}
            aria-controls="sdd-audit-panel"
            className="flex items-center gap-1.5 px-3 py-2 bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/30 rounded-xl text-xs font-semibold transition-all"
          >
            <FileCheck className="w-3.5 h-3.5" />
            <span>{t.sddAuditSpec}</span>
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-medium transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t.resetChecklist}</span>
          </button>
          <button
            type="button"
            onClick={handleExport}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition-all shadow-md shadow-emerald-600/30"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{t.sddExportReport}</span>
          </button>
        </div>
      </div>

      {/* Scorecards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              {t.sddProgress}
            </span>
            <div className="text-3xl font-extrabold text-white mt-1">{progress.percent}%</div>
            <span className="text-[11px] text-zinc-500 font-mono">
              {progress.checklistDone} de {progress.checklistTotal} items
            </span>
          </div>
          <div className="w-14 h-14 relative">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36" aria-hidden="true">
              <path
                className="text-zinc-800"
                strokeWidth="3.5"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className="text-emerald-500 transition-all duration-500"
                strokeDasharray={`${progress.percent}, 100`}
                strokeWidth="3.5"
                strokeLinecap="round"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-emerald-300">
              {progress.percent}%
            </span>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800">
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
            <Milestone className="w-3.5 h-3.5 text-emerald-400" />
            {t.sddGatesPassed}
          </span>
          <div className="text-3xl font-extrabold text-white mt-1">
            {progress.gatesPassed}
            <span className="text-base text-zinc-500 font-mono">/{progress.stagesTotal}</span>
          </div>
          <span className="text-[11px] text-zinc-500 font-mono">{t.sddGatesTitle}</span>
        </div>

        <div
          className={`p-5 rounded-2xl border ${
            progress.firstOpenStage
              ? 'bg-amber-950/15 border-amber-500/30'
              : 'bg-emerald-950/20 border-emerald-500/40'
          }`}
        >
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-amber-400" />
            {t.sddStageStatus}
          </span>
          <div className="text-2xl font-extrabold text-white mt-1 font-mono">
            {progress.firstOpenStage ?? 'E7 ✓'}
          </div>
          <span className="text-[11px] text-zinc-400">
            {progress.firstOpenStage
              ? `${statusLabel(stages.find((stage) => stage.id === progress.firstOpenStage)?.status ?? 'pending')}`
              : t.sddGatePassed}
          </span>
        </div>

        <div
          className={`p-5 rounded-2xl border ${
            progress.gatesBlocked.length > 0
              ? 'bg-red-950/20 border-red-500/40'
              : 'bg-zinc-900/60 border-zinc-800'
          }`}
        >
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
            {t.sddGateBlocked}
          </span>
          <div className="text-2xl font-extrabold text-white mt-1 font-mono">
            {progress.gatesBlocked.length > 0 ? progress.gatesBlocked.join(' · ') : '0'}
          </div>
          <span className="text-[11px] text-zinc-500">P5 GATEKEEPING</span>
        </div>
      </div>

      {/* Spec auditor */}
      {auditOpen && (
        <section
          id="sdd-audit-panel"
          aria-labelledby="sdd-audit-heading"
          className="bg-zinc-900/60 border border-sky-500/25 rounded-2xl p-5 flex flex-col gap-4"
        >
          <div className="flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-sky-400" />
            <h3 id="sdd-audit-heading" className="text-sm font-bold text-white">
              {t.sddAuditSpec}
            </h3>
          </div>

          <div>
            <label
              htmlFor="sdd-spec-input"
              className="block text-xs font-semibold text-zinc-300 mb-1.5"
            >
              {t.sddSpecInputLabel}
            </label>
            <p className="text-[11px] text-zinc-500 mb-2">{t.sddSpecInputHint}</p>
            <textarea
              id="sdd-spec-input"
              value={specText}
              onChange={(event) => setSpecText(event.target.value)}
              rows={10}
              spellCheck={false}
              placeholder={t.sddAuditPlaceholder}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-sky-500 resize-y"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleRunAudit}
              className="flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-semibold transition-all"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{t.sddRunAudit}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setSpecText('');
                setAudit(null);
              }}
              className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-medium transition-all"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>{t.sddClearSpec}</span>
            </button>
          </div>

          {audit && (
            <div aria-live="polite" className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`px-3 py-1.5 rounded-full border text-xs font-bold uppercase tracking-wider ${VERDICT_STYLES[audit.verdict]}`}
                >
                  {t.sddAuditVerdict}: {audit.verdict}
                </span>
                <span className="px-3 py-1.5 rounded-full border border-zinc-700 bg-zinc-950 text-xs font-mono text-zinc-200">
                  {t.sddAuditScore}: {audit.score}/100
                </span>
                <span className="text-[11px] font-mono text-zinc-400">{audit.summary}</span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-zinc-950/70 border border-zinc-800 rounded-xl p-4">
                  <h4 className="text-xs font-bold text-zinc-200 uppercase tracking-wider mb-3">
                    {t.sddAuditAreas}
                  </h4>
                  <ul className="flex flex-col gap-1.5">
                    {audit.areas.map((area) => (
                      <li key={area.id} className="flex items-center gap-2 text-xs">
                        {area.present ? (
                          <CheckCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                        )}
                        <span className={area.present ? 'text-zinc-200' : 'text-zinc-400'}>
                          {area.label}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <h4 className="text-xs font-bold text-zinc-200 uppercase tracking-wider mt-4 mb-2">
                    {t.sddAuditEars}
                  </h4>
                  <ul className="flex flex-col gap-1 text-[11px] font-mono text-zinc-400">
                    <li>ubiquitous (shall): {audit.earsByPattern.ubiquitous}</li>
                    <li>event-driven (WHEN): {audit.earsByPattern.event_driven}</li>
                    <li>state-driven (WHILE): {audit.earsByPattern.state_driven}</li>
                    <li>unwanted (IF…THEN): {audit.earsByPattern.unwanted_behaviour}</li>
                    <li>optional (WHERE): {audit.earsByPattern.optional_feature}</li>
                  </ul>
                </div>

                <div className="bg-zinc-950/70 border border-zinc-800 rounded-xl p-4">
                  <h4 className="text-xs font-bold text-zinc-200 uppercase tracking-wider mb-3">
                    {t.sddAuditFindings} ({audit.findings.length})
                  </h4>
                  {audit.findings.length === 0 ? (
                    <p className="text-xs text-emerald-300 flex items-center gap-2">
                      <CheckCheck className="w-4 h-4" /> {t.sddGatePassed}
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
                      {audit.findings.map((finding) => (
                        <li
                          key={finding.id}
                          className="border border-zinc-800 rounded-lg p-2.5 bg-zinc-900/50"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border ${
                                SEVERITY_STYLES[finding.severity] ?? SEVERITY_STYLES.medium
                              }`}
                            >
                              {finding.severity}
                            </span>
                            <span className="font-mono text-[10px] text-zinc-500">{finding.id}</span>
                          </div>
                          <p className="text-[11px] text-zinc-200 mt-1.5">{finding.message}</p>
                          <p className="text-[11px] text-zinc-400 mt-1">
                            <span className="font-semibold text-sky-400">Fix:</span> {finding.fix}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Constitution */}
      <section aria-labelledby="sdd-principles-heading" className="flex flex-col gap-3">
        <h3
          id="sdd-principles-heading"
          className="text-sm font-bold text-white flex items-center gap-2"
        >
          <ShieldCheck className="w-4 h-4 text-amber-400" />
          {t.sddPrinciples}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {SDD_PRINCIPLES.map((principle) => (
            <article
              key={principle.code}
              className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-2"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-amber-400">{principle.code}</span>
                <span className="text-xs font-bold text-white uppercase tracking-wide">
                  {principle.name}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">{principle.desc}</p>
              <ul className="flex flex-wrap gap-1">
                {principle.techniques.map((technique) => (
                  <li
                    key={technique}
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-300"
                  >
                    {technique}
                  </li>
                ))}
              </ul>
              <p className="text-[10px] text-emerald-400/90 font-mono mt-auto">
                enforcement: {principle.enforcement}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* Lifecycle E0-E7 */}
      <section aria-labelledby="sdd-gates-heading" className="flex flex-col gap-3">
        <h3 id="sdd-gates-heading" className="text-sm font-bold text-white flex items-center gap-2">
          <ScrollText className="w-4 h-4 text-indigo-400" />
          {t.sddGatesTitle}
        </h3>

        <ol className="flex flex-col gap-3">
          {stages.map((stage, index) => {
            const evaluation = progress.evaluations[index];
            const isOpen = Boolean(expanded[stage.id]);
            const styles = STATUS_STYLES[evaluation.effectiveStatus];
            const panelId = `sdd-stage-${stage.id}`;

            return (
              <li
                key={stage.id}
                className={`rounded-2xl border transition-colors ${styles.card}`}
              >
                <div className="flex items-center gap-3 p-3.5">
                  <button
                    type="button"
                    onClick={() => setExpanded((prev) => ({ ...prev, [stage.id]: !prev[stage.id] }))}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    className="flex items-center gap-3 flex-1 text-left min-w-0 cursor-pointer"
                  >
                    <ChevronRight
                      className={`w-4 h-4 text-zinc-500 shrink-0 transition-transform ${
                        isOpen ? 'rotate-90' : ''
                      }`}
                    />
                    <span
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${styles.dot}`}
                      aria-hidden="true"
                    />
                    <span className="font-mono text-xs font-bold text-amber-400 shrink-0">
                      {stage.id}
                    </span>
                    <span className="text-sm font-semibold text-white truncate">{stage.name}</span>
                    <span className="text-[11px] text-zinc-400 truncate hidden md:inline">
                      {stage.tagline}
                    </span>
                    <span className="ml-auto flex items-center gap-2 shrink-0">
                      <span className="text-[10px] font-mono text-zinc-500">
                        {evaluation.checklistDone}/{evaluation.checklistTotal}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase ${styles.chip}`}
                      >
                        {statusLabel(evaluation.effectiveStatus)}
                      </span>
                    </span>
                  </button>
                </div>

                {isOpen && (
                  <div id={panelId} className="px-4 pb-4 pt-1 border-t border-zinc-800/60">
                    <p className="text-xs text-zinc-300 mt-3">{stage.description}</p>

                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                      <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-3">
                        <dt className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
                          {t.sddGateRequirement}
                        </dt>
                        <dd className="text-[11px] text-zinc-200 mt-1">{stage.gateRequirement}</dd>
                      </div>
                      <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-3">
                        <dt className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
                          {t.sddArtifact}
                        </dt>
                        <dd className="text-[11px] font-mono text-zinc-200 mt-1">{stage.artifact}</dd>
                      </div>
                    </dl>

                    {stage.notes && (
                      <p className="text-[11px] text-zinc-400 mt-3 border-l-2 border-amber-500/40 pl-3">
                        {stage.notes}
                      </p>
                    )}

                    {evaluation.reasons.length > 0 && (
                      <p className="text-[11px] text-red-300 mt-3 flex items-start gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>{evaluation.reasons.join(' ')}</span>
                      </p>
                    )}

                    <fieldset className="mt-4">
                      <legend className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-2 flex items-center gap-1.5">
                        <ListChecks className="w-3.5 h-3.5" />
                        {t.sddChecklist}
                      </legend>
                      <ul className="flex flex-col gap-1.5">
                        {stage.checklist.map((item) => (
                          <li key={item.id}>
                            <label className="flex items-start gap-2.5 cursor-pointer group">
                              <input
                                type="checkbox"
                                checked={item.completed}
                                onChange={() => handleToggleItem(stage.id, item.id)}
                                className="mt-0.5 w-3.5 h-3.5 accent-emerald-500 cursor-pointer"
                              />
                              <span className="font-mono text-[10px] text-zinc-600 shrink-0">
                                {item.id}
                              </span>
                              <span
                                className={`text-[11px] transition-colors ${
                                  item.completed
                                    ? 'text-zinc-500 line-through'
                                    : 'text-zinc-200 group-hover:text-white'
                                }`}
                              >
                                {item.text}
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </fieldset>

                    <button
                      type="button"
                      onClick={() => handleCycleStatus(stage.id)}
                      className={`mt-4 px-3 py-1.5 rounded-xl border text-[11px] font-semibold transition-all cursor-pointer ${styles.chip}`}
                    >
                      {t.sddStageStatus}: {statusLabel(stage.status)} →{' '}
                      {statusLabel(nextStatus(stage.status))}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      {/* Quality gates */}
      <section aria-labelledby="sdd-quality-heading" className="flex flex-col gap-3">
        <h3 id="sdd-quality-heading" className="text-sm font-bold text-white flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-sky-400" />
          Quality Gates
        </h3>
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <caption className="sr-only">
                Quality gates obligatorios del protocolo con su herramienta, umbral y comando
              </caption>
              <thead>
                <tr className="bg-zinc-950/80 border-b border-zinc-800 text-zinc-400 font-semibold uppercase tracking-wider">
                  <th scope="col" className="py-3 px-4">Gate</th>
                  <th scope="col" className="py-3 px-4">Herramienta</th>
                  <th scope="col" className="py-3 px-4">Umbral</th>
                  <th scope="col" className="py-3 px-4">Comando</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {QUALITY_GATES.map((gate) => (
                  <tr key={gate.id} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="py-2.5 px-4 font-semibold text-white">{gate.gate}</td>
                    <td className="py-2.5 px-4 font-mono text-[11px] text-zinc-300">{gate.tool}</td>
                    <td className="py-2.5 px-4 text-zinc-400">{gate.threshold}</td>
                    <td className="py-2.5 px-4">
                      <code className="px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 font-mono text-[11px] text-emerald-300">
                        {gate.command}
                      </code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
};
