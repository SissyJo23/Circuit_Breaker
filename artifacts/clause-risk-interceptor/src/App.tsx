import { useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent, ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  BookOpenCheck,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Clock3,
  FileText,
  FileUp,
  Fingerprint,
  Info,
  LockKeyhole,
  Scale,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import {
  getGetRiskEvaluationSummaryQueryKey,
  getListRiskEvaluationsQueryKey,
  useCreateRiskEvaluation,
  useGetRiskEvaluationSummary,
  useListRiskEvaluations,
} from '@workspace/api-client-react';
import type { ClauseEvaluation, RiskEvaluationSummary } from '@workspace/api-client-react';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();
const THRESHOLD = 80;

function formatDate(value?: string | null, includeTime = true) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date);
}

function shortId(value: string) {
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-banner" data-testid="status-error">
      <AlertTriangle size={16} />
      <span>{message} {onRetry ? <button className="retry-button" onClick={onRetry} data-testid="button-retry">Retry</button> : null}</span>
    </div>
  );
}

function SummaryStrip({ summary, isLoading, error, onRetry }: { summary?: RiskEvaluationSummary; isLoading: boolean; error?: unknown; onRetry: () => void }) {
  if (error) {
    return <ErrorState message={errorMessage(error, 'Summary data could not be loaded.')} onRetry={onRetry} />;
  }
  const cells = [
    { label: 'Clauses screened', value: summary?.total ?? 0, tone: '' },
    { label: 'Intercepted', value: summary?.intercepted ?? 0, tone: 'coral' },
    { label: 'Allowed', value: summary?.allowed ?? 0, tone: 'mint' },
    { label: 'Average risk score', value: summary ? summary.averageRiskScore.toFixed(1) : '—', tone: 'accent' },
  ];
  return (
    <section className="summary-strip" aria-label="Screening summary" data-testid="summary-strip">
      {cells.map((cell) => (
        <div className="summary-cell" key={cell.label}>
          <span className="summary-label">{cell.label}</span>
          {isLoading ? <div className="summary-loading" data-testid={`skeleton-summary-${cell.label}`} /> : <span className={`summary-value ${cell.tone}`} data-testid={`text-summary-${cell.label}`}>{cell.value}</span>}
        </div>
      ))}
    </section>
  );
}

function DecisionPill({ decision }: { decision: ClauseEvaluation['decision'] }) {
  const intercept = decision === 'INTERCEPT';
  return (
    <span className={`decision-pill ${intercept ? 'decision-intercept' : 'decision-allow'}`} data-testid={`status-decision-${decision.toLowerCase()}`}>
      {intercept ? <ShieldAlert size={13} /> : <ShieldCheck size={13} />}
      {decision}
    </span>
  );
}

function DecisionCard({ evaluation }: { evaluation?: ClauseEvaluation }) {
  if (!evaluation) {
    return (
      <section className="panel decision-panel" data-testid="card-current-decision">
        <div className="panel-header">
          <div className="panel-title"><ClipboardCheck size={17} /> Current decision</div>
          <span className="micro-copy">Awaiting input</span>
        </div>
        <div className="decision-empty">
          <div className="empty-mark"><ScanLine size={24} /></div>
          <div className="empty-title" data-testid="text-empty-decision">No clause screened yet</div>
          <div className="empty-copy">Paste a clause or upload a text file. The decision and its rationale will appear here.</div>
        </div>
      </section>
    );
  }
  const score = Math.max(0, Math.min(100, Number(evaluation.riskScore) || 0));
  const intercept = evaluation.decision === 'INTERCEPT';
  return (
    <section className="panel decision-panel" data-testid="card-current-decision">
      <div className="panel-header">
        <div className="panel-title"><ClipboardCheck size={17} /> Current decision</div>
        <span className="micro-copy" data-testid="text-result-timestamp">{formatDate(evaluation.createdAt)}</span>
      </div>
      <div className="decision-content">
        <div className="decision-topline">
          <div>
            <div className="decision-label">Screening record</div>
            <div className="decision-name" title={evaluation.sourceName ?? 'Pasted clause'} data-testid="text-result-source">{evaluation.sourceName || 'Pasted clause'}</div>
          </div>
          <DecisionPill decision={evaluation.decision} />
        </div>
        <div className="score-row">
          <div className="score-ring" style={{ ['--score' as string]: `${score}%` }} data-testid="visual-risk-score">
            <div className="score-ring-inner">
              <span className="score-number" data-testid="text-risk-score">{score}</span>
              <span className="score-denom">/ 100</span>
            </div>
          </div>
          <div className="score-context">
            <div className="risk-level" data-testid="text-risk-level">{evaluation.riskLevel} risk</div>
            <div className="threshold-copy">
              {intercept ? <>Score <strong>{score}</strong> meets the fixed threshold of <strong>{THRESHOLD}</strong>. Review is required.</> : <>Score <strong>{score}</strong> is below the fixed threshold of <strong>{THRESHOLD}</strong>. This is an AI screening result, not a legal-safety determination.</>}
            </div>
          </div>
        </div>
        <div className="decision-section">
          <div className="section-label">Rationale</div>
          <p className="rationale" data-testid="text-rationale">{evaluation.rationale}</p>
        </div>
        <div className="decision-section">
          <div className="section-label">Findings</div>
          {evaluation.findings.length ? (
            <div className="finding-list" data-testid="list-findings">
              {evaluation.findings.map((finding, index) => <div className="finding-item" key={`${finding}-${index}`} data-testid={`text-finding-${index}`}><CheckCircle2 size={14} /> <span>{finding}</span></div>)}
            </div>
          ) : <p className="micro-copy" data-testid="text-no-findings">No discrete findings were returned.</p>}
        </div>
        <div className="metadata-grid" data-testid="grid-analysis-metadata">
          <div className="metadata-item"><span className="metadata-key">Provider</span><span className="metadata-value" title={evaluation.provider}>{evaluation.provider}</span></div>
          <div className="metadata-item"><span className="metadata-key">Model</span><span className="metadata-value" title={evaluation.model}>{evaluation.model}</span></div>
          <div className="metadata-item"><span className="metadata-key">Analysis version</span><span className="metadata-value">{evaluation.analysisVersion}</span></div>
          <div className="metadata-item"><span className="metadata-key">Audit ID</span><span className="metadata-value">{shortId(evaluation.audit.auditId)}</span></div>
        </div>
        <div className="audit-preview" data-testid="card-result-audit">
          <div className="audit-preview-top"><span><Fingerprint size={12} style={{ verticalAlign: 'text-bottom' }} /> Audit event</span><span>{evaluation.audit.eventType}</span></div>
          <div className="audit-preview-id">{evaluation.audit.actor} · recorded {formatDate(evaluation.audit.recordedAt)}</div>
          <Link href="/audit" className="audit-preview-link" data-testid="link-open-audit">Open audit history <ArrowUpRight size={13} /></Link>
        </div>
      </div>
    </section>
  );
}

function Composer({ onCreated }: { onCreated: (evaluation: ClauseEvaluation) => void }) {
  const [clauseText, setClauseText] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [fileError, setFileError] = useState('');
  const createEvaluation = useCreateRiskEvaluation();
  const queryClientForComposer = useQueryClient();
  const characterCount = clauseText.length;

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileError('');
    setSourceName(file.name);
    const reader = new FileReader();
    reader.onload = () => setClauseText(String(reader.result ?? ''));
    reader.onerror = () => setFileError('The text file could not be read. Try another file.');
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (clauseText.trim().length < 10) {
      setFileError('Enter at least 10 characters before screening.');
      return;
    }
    setFileError('');
    createEvaluation.mutate(
      { data: { clauseText: clauseText.trim(), sourceName: sourceName.trim() || undefined } },
      {
        onSuccess: (evaluation) => {
          onCreated(evaluation);
          void queryClientForComposer.invalidateQueries({ queryKey: getListRiskEvaluationsQueryKey({ limit: 50 }) });
          void queryClientForComposer.invalidateQueries({ queryKey: getGetRiskEvaluationSummaryQueryKey() });
        },
      },
    );
  };

  return (
    <section className="panel" data-testid="card-clause-composer">
      <div className="panel-header">
        <div className="panel-title"><BookOpenCheck size={17} /> Submit a clause</div>
        <span className="micro-copy">Plain text only</span>
      </div>
      <form className="panel-body" onSubmit={handleSubmit}>
        <div className="field-group">
          <label className="field-label" htmlFor="source-name">Source <span>Optional context for the record</span></label>
          <input id="source-name" className="text-input" value={sourceName} onChange={(event) => setSourceName(event.target.value)} placeholder="e.g. Vendor MSA · Section 8.2" data-testid="input-source-name" />
        </div>
        <div className="field-group">
          <label className="field-label" htmlFor="clause-text">Clause text <span>{characterCount.toLocaleString()} / 50,000</span></label>
          <textarea id="clause-text" className="text-area" value={clauseText} onChange={(event) => setClauseText(event.target.value)} placeholder="Paste the clause exactly as it appears in the agreement…" maxLength={50000} data-testid="input-clause-text" />
        </div>
        <div className="composer-footer">
          <div className="button-row">
            <label className="button button-quiet upload-button" data-testid="button-upload-clause">
              <FileUp size={15} /> Upload .txt
              <input type="file" accept=".txt,text/plain" onChange={handleFile} data-testid="input-clause-file" />
            </label>
            <button type="button" className="button button-quiet" onClick={() => { setClauseText(''); setSourceName(''); setFileError(''); }} disabled={!clauseText && !sourceName} data-testid="button-clear-clause">Clear</button>
          </div>
          <button type="submit" className="button button-primary" disabled={createEvaluation.isPending || clauseText.trim().length < 10} data-testid="button-screen-clause">
            {createEvaluation.isPending ? <><span className="status-dot" /> Screening…</> : <><ScanLine size={15} /> Screen clause</>}
          </button>
        </div>
        {fileError ? <ErrorState message={fileError} /> : null}
        {createEvaluation.isError ? <ErrorState message={errorMessage(createEvaluation.error, 'The clause could not be screened.')} /> : null}
        {createEvaluation.isPending ? (
          <div className="disclaimer" data-testid="status-screening">
            <Clock3 size={15} /> <span>Analyzing language against the fixed review threshold. Keep this workspace open while the decision is recorded.</span>
          </div>
        ) : (
          <div className="disclaimer"><Info size={15} /> <span>Screening supports legal review triage. An <strong>ALLOW</strong> result does not mean the clause is legally safe or approved.</span></div>
        )}
      </form>
    </section>
  );
}

function AnalyzePage() {
  const [currentEvaluation, setCurrentEvaluation] = useState<ClauseEvaluation>();
  const summaryQuery = useGetRiskEvaluationSummary();
  const evaluationsQuery = useListRiskEvaluations({ limit: 50 });
  const latestEvaluation = currentEvaluation ?? evaluationsQuery.data?.[0];
  return (
    <main className="page-frame">
      <header className="page-intro">
        <div>
          <div className="eyebrow">Clause risk screening</div>
          <h1 className="page-title">A defensible answer,<br />before review begins.</h1>
          <p className="page-subtitle">Screen one clause at a time against a fixed decision rule. Every result is recorded with its rationale, model, and audit event.</p>
        </div>
        <div className="micro-copy" data-testid="text-threshold-summary"><LockKeyhole size={13} style={{ verticalAlign: 'text-bottom' }} /> Fixed control · score ≥ {THRESHOLD} = INTERCEPT</div>
      </header>
      <SummaryStrip summary={summaryQuery.data} isLoading={summaryQuery.isLoading} error={summaryQuery.error} onRetry={() => void summaryQuery.refetch()} />
      <div className="analysis-grid">
        <Composer onCreated={setCurrentEvaluation} />
        {evaluationsQuery.isLoading && !latestEvaluation ? (
          <section className="panel decision-panel" data-testid="skeleton-current-decision">
            <div className="panel-header"><div className="panel-title"><ClipboardCheck size={17} /> Current decision</div></div>
            <div className="decision-content"><div className="skeleton-block" style={{ width: '45%' }} /><div className="skeleton-block" style={{ height: 130, marginTop: 25 }} /><div className="skeleton-block" style={{ width: '88%', marginTop: 22 }} /><div className="skeleton-block" style={{ width: '72%', marginTop: 10 }} /></div>
          </section>
        ) : evaluationsQuery.error && !latestEvaluation ? (
          <section className="panel decision-panel" data-testid="card-current-error">
            <div className="panel-header"><div className="panel-title"><ClipboardCheck size={17} /> Current decision</div></div>
            <div className="decision-empty"><div className="empty-mark"><AlertTriangle size={23} /></div><div className="empty-title">Decision history unavailable</div><div className="empty-copy">{errorMessage(evaluationsQuery.error, 'The recent decision could not be loaded.')}</div><button className="retry-button" onClick={() => void evaluationsQuery.refetch()} data-testid="button-retry-decisions">Try again</button></div>
          </section>
        ) : <DecisionCard evaluation={latestEvaluation} />}
      </div>
    </main>
  );
}

function AuditDetail({ evaluation }: { evaluation?: ClauseEvaluation }) {
  if (!evaluation) {
    return <section className="panel detail-empty" data-testid="empty-audit-selection"><div><div className="empty-mark" style={{ margin: '0 auto 18px' }}><CircleHelp size={24} /></div><div className="empty-title">Select a screening record</div><div className="empty-copy">Choose a decision from the audit list to inspect the clause, rationale, and its recorded metadata.</div></div></section>;
  }
  return (
    <section className="panel audit-detail" data-testid="card-audit-detail">
      <div className="detail-header-block">
        <div className="decision-topline">
          <div><div className="eyebrow">Selected record</div><div className="detail-title" data-testid="text-audit-source">{evaluation.sourceName || 'Pasted clause'}</div></div>
          <DecisionPill decision={evaluation.decision} />
        </div>
      </div>
      <div className="detail-section">
        <div className="section-label">Clause text</div>
        <div className="detail-clause" data-testid="text-audit-clause">{evaluation.clauseText}</div>
      </div>
      <div className="detail-section">
        <div className="section-label">Decision rationale</div>
        <p className="rationale" data-testid="text-audit-rationale">{evaluation.rationale}</p>
        <div className="metadata-grid" style={{ marginTop: 20 }}>
          <div className="metadata-item"><span className="metadata-key">Risk score</span><span className="metadata-value" data-testid="text-audit-score">{evaluation.riskScore} / 100</span></div>
          <div className="metadata-item"><span className="metadata-key">Risk level</span><span className="metadata-value">{evaluation.riskLevel}</span></div>
          <div className="metadata-item"><span className="metadata-key">Decision rule</span><span className="metadata-value">≥ {evaluation.audit.threshold} = INTERCEPT</span></div>
          <div className="metadata-item"><span className="metadata-key">Evaluated</span><span className="metadata-value">{formatDate(evaluation.createdAt)}</span></div>
        </div>
      </div>
      <div className="detail-section">
        <div className="section-label">Audit metadata</div>
        <div className="detail-audit-table" data-testid="grid-audit-metadata">
          <div className="metadata-item"><span className="metadata-key">Audit ID</span><span className="metadata-value">{evaluation.audit.auditId}</span></div>
          <div className="metadata-item"><span className="metadata-key">Event type</span><span className="metadata-value">{evaluation.audit.eventType}</span></div>
          <div className="metadata-item"><span className="metadata-key">Actor</span><span className="metadata-value">{evaluation.audit.actor}</span></div>
          <div className="metadata-item"><span className="metadata-key">Recorded at</span><span className="metadata-value">{formatDate(evaluation.audit.recordedAt)}</span></div>
          <div className="metadata-item"><span className="metadata-key">Provider</span><span className="metadata-value">{evaluation.provider}</span></div>
          <div className="metadata-item"><span className="metadata-key">Model</span><span className="metadata-value">{evaluation.model}</span></div>
          <div className="metadata-item"><span className="metadata-key">Analysis version</span><span className="metadata-value">{evaluation.analysisVersion}</span></div>
        </div>
      </div>
    </section>
  );
}

function AuditPage() {
  const evaluationsQuery = useListRiskEvaluations({ limit: 50 });
  const [selectedId, setSelectedId] = useState<string>();
  const selected = useMemo(() => evaluationsQuery.data?.find((item) => item.id === selectedId) ?? evaluationsQuery.data?.[0], [evaluationsQuery.data, selectedId]);
  const records = evaluationsQuery.data ?? [];
  return (
    <main className="page-frame">
      <header className="page-intro">
        <div>
          <div className="eyebrow">Audit log</div>
          <h1 className="page-title">Every decision leaves a trail.</h1>
          <p className="page-subtitle">Review the latest screening events and the exact context behind each automated recommendation.</p>
        </div>
        <div className="micro-copy"><Fingerprint size={13} style={{ verticalAlign: 'text-bottom' }} /> Immutable screening record</div>
      </header>
      {evaluationsQuery.error ? <ErrorState message={errorMessage(evaluationsQuery.error, 'Audit history could not be loaded.')} onRetry={() => void evaluationsQuery.refetch()} /> : null}
      <div className="audit-layout">
        <section className="panel audit-list" data-testid="card-audit-list">
          <div className="audit-list-header"><div className="panel-title"><Clock3 size={17} /> Recent decisions</div><span className="audit-list-count" data-testid="text-audit-count">{records.length} records</span></div>
          {evaluationsQuery.isLoading ? <>{[1, 2, 3, 4, 5].map((item) => <div className="skeleton-row" key={item} data-testid={`skeleton-audit-${item}`} />)}</> : records.length === 0 ? (
            <div className="decision-empty" style={{ minHeight: 340 }} data-testid="empty-audit-list"><div className="empty-mark"><FileText size={23} /></div><div className="empty-title">No screening records yet</div><div className="empty-copy">Submit a clause from the screening workspace to create the first audit event.</div><Link href="/" className="audit-preview-link" style={{ marginTop: 17 }} data-testid="link-start-screening">Start screening <ChevronRight size={13} /></Link></div>
          ) : records.map((evaluation) => (
            <button className="audit-row" key={evaluation.id} onClick={() => setSelectedId(evaluation.id)} data-selected={selected?.id === evaluation.id} data-testid={`button-audit-record-${evaluation.id}`}>
              <div className="audit-row-top"><span className="audit-source">{evaluation.sourceName || 'Pasted clause'}</span><span className="audit-date">{formatDate(evaluation.createdAt, false)}</span></div>
              <div className="audit-row-bottom"><DecisionPill decision={evaluation.decision} /><span className="audit-score">Score {evaluation.riskScore}</span><span className="risk-tag">{evaluation.riskLevel}</span></div>
            </button>
          ))}
        </section>
        <AuditDetail evaluation={selected} />
      </div>
    </main>
  );
}

function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const isAudit = location === '/audit';
  return (
    <div className="workspace-shell">
      <aside className="side-rail" data-testid="navigation-sidebar">
        <div className="rail-kicker">Legal operations</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 13 }}>
          <Scale size={22} color="hsl(var(--sidebar-primary))" />
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-.02em' }}>Clause screening</div>
        </div>
        <div className="rail-rule" />
        <div className="rail-kicker" style={{ margin: '0 8px 10px' }}>Workspace</div>
        <nav className="rail-nav" aria-label="Primary navigation">
          <Link href="/" className="rail-link" data-active={String(!isAudit)} data-testid="link-analyze"><ScanLine size={17} /> Analyze clause</Link>
          <Link href="/audit" className="rail-link" data-active={String(isAudit)} data-testid="link-audit"><Fingerprint size={17} /> Audit history</Link>
        </nav>
        <div className="threshold-panel" data-testid="card-threshold">
          <div className="rail-kicker">Fixed decision threshold</div>
          <div className="threshold-number" style={{ marginTop: 10 }} data-testid="text-threshold">80</div>
          <div style={{ color: 'hsl(var(--sidebar-foreground) / .64)', fontSize: 11, lineHeight: 1.5, marginTop: 8 }}>Scores at or above 80 are intercepted for legal review.</div>
        </div>
        <div style={{ color: 'hsl(var(--sidebar-foreground) / .42)', font: '500 10px/1 var(--app-font-mono)', margin: '17px 8px 0' }}>CONTROLLED WORKSPACE</div>
      </aside>
      <div className="main-column">
        <div className="mobile-top">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Scale size={18} color="hsl(var(--sidebar-primary))" /><span style={{ fontSize: 12, fontWeight: 700 }}>Clause screening</span></div>
          <nav className="mobile-nav" aria-label="Mobile navigation">
            <Link href="/" data-active={String(!isAudit)} data-testid="link-mobile-analyze"><ScanLine size={16} /></Link>
            <Link href="/audit" data-active={String(isAudit)} data-testid="link-mobile-audit"><Fingerprint size={16} /></Link>
          </nav>
        </div>
        <header className="topbar">
          <span className="topbar-label">{isAudit ? 'Audit history' : 'Screening workspace'} / v1 control set</span>
          <div className="topbar-right"><span className="system-state" data-testid="status-system"><span className="status-dot" /> System ready</span><CircleHelp size={16} color="hsl(var(--muted-foreground))" /></div>
        </header>
        {children}
      </div>
    </div>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function Router() {
  return (
    <AppShell>
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/" component={AnalyzePage} />
          <Route path="/audit" component={AuditPage} />
          <Route component={NotFound} />
        </Switch>
      </RoutedErrorBoundary>
    </AppShell>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;