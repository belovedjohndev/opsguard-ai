import { useState } from 'react';

import { createAndAssessRequest, DemoApiError, readDemoConfiguration } from './api.js';
import type { AssessmentResponse, DemoErrorKind } from './api.js';
import { AssessmentResults } from './components/AssessmentResults.js';
import { RequestComposer } from './components/RequestComposer.js';

const maximumRequestTextLength = 20_000;

type ViewState =
  | Readonly<{ kind: 'idle' }>
  | Readonly<{ kind: 'submitting' }>
  | Readonly<{ kind: 'success'; result: AssessmentResponse; submittedText: string }>
  | Readonly<{ kind: 'error'; errorKind: DemoErrorKind; message: string }>;

const errorTitles: Readonly<Record<DemoErrorKind, string>> = Object.freeze({
  validation: 'Check the request or demo configuration',
  authorization: 'Demo tenant authorization failed',
  unavailable: 'OpsGuard API unavailable',
  model: 'Model assessment stopped safely',
  unexpected: 'Assessment could not be displayed',
});

export function App() {
  const [requestText, setRequestText] = useState('');
  const [viewState, setViewState] = useState<ViewState>({ kind: 'idle' });

  const handleRequestTextChange = (value: string): void => {
    setRequestText(value);
    if (viewState.kind !== 'idle') setViewState({ kind: 'idle' });
  };

  const handleReset = (): void => {
    setRequestText('');
    setViewState({ kind: 'idle' });
  };

  const handleSubmit = (): void => {
    if (viewState.kind === 'submitting') return;

    const normalizedText = requestText.trim();
    if (normalizedText.length === 0 || requestText.length > maximumRequestTextLength) {
      setViewState({
        kind: 'error',
        errorKind: 'validation',
        message: 'Enter a synthetic request between 1 and 20,000 characters.',
      });
      return;
    }

    setViewState({ kind: 'submitting' });
    let configuration: ReturnType<typeof readDemoConfiguration>;
    try {
      configuration = readDemoConfiguration();
    } catch (error: unknown) {
      const apiError =
        error instanceof DemoApiError
          ? error
          : new DemoApiError('unexpected', 'The demo configuration could not be loaded.');
      setViewState({ kind: 'error', errorKind: apiError.kind, message: apiError.message });
      return;
    }

    void createAndAssessRequest(requestText, configuration)
      .then((result) => {
        setViewState({ kind: 'success', result, submittedText: requestText });
      })
      .catch((error: unknown) => {
        const apiError =
          error instanceof DemoApiError
            ? error
            : new DemoApiError('unexpected', 'The assessment could not be completed safely.');
        setViewState({ kind: 'error', errorKind: apiError.kind, message: apiError.message });
      });
  };

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="OpsGuard AI home">
          <span className="brand-mark" aria-hidden="true">
            OG
          </span>
          <span>OpsGuard AI</span>
        </a>
        <div className="header-principle">
          <span className="status-dot" aria-hidden="true" />
          <span>The model proposes. Deterministic policy controls the outcome.</span>
        </div>
        <div className="system-status" aria-label="System safety status">
          <span>Safety controls active</span>
          <strong>Controlled</strong>
        </div>
      </header>

      <main id="top">
        <section className="hero" aria-labelledby="page-title">
          <div className="hero-copy">
            <p className="hero-kicker">
              <span>AI-assisted intake</span>
              <span aria-hidden="true">/</span>
              <span>Deterministic control</span>
            </p>
            <h1 id="page-title">Controlled AI-Assisted Operations</h1>
            <p className="hero-summary">
              Turn messy operational requests into validated, tenant-scoped decisions—with every
              model proposal checked, controlled, and audit-ready.
            </p>
          </div>
          <div className="control-flow" aria-label="OpsGuard control flow">
            <span>01 · Intake</span>
            <i aria-hidden="true" />
            <span>02 · Model proposal</span>
            <i aria-hidden="true" />
            <span>03 · Policy decision</span>
          </div>
        </section>

        <RequestComposer
          requestText={requestText}
          isSubmitting={viewState.kind === 'submitting'}
          maximumLength={maximumRequestTextLength}
          onChange={handleRequestTextChange}
          onReset={handleReset}
          onSubmit={handleSubmit}
        />

        <div className="state-region" aria-live="polite">
          {viewState.kind === 'submitting' ? (
            <section className="processing-state" aria-label="Assessment in progress">
              <span className="processing-orbit" aria-hidden="true" />
              <div>
                <p className="eyebrow">Control pipeline active</p>
                <h2>Validating the model proposal</h2>
                <p>Creating the tenant request, checking structure, and calculating policy.</p>
              </div>
            </section>
          ) : null}

          {viewState.kind === 'error' ? (
            <section className={`error-state error-${viewState.errorKind}`} role="alert">
              <span className="error-symbol" aria-hidden="true">
                !
              </span>
              <div>
                <p className="eyebrow">Safe stop</p>
                <h2>{errorTitles[viewState.errorKind]}</h2>
                <p>{viewState.message}</p>
              </div>
            </section>
          ) : null}

          {viewState.kind === 'success' ? (
            <AssessmentResults requestText={viewState.submittedText} result={viewState.result} />
          ) : null}
        </div>

        <aside className="persistent-safety" aria-label="Execution safety notice">
          <span className="shield-icon" aria-hidden="true">
            ✓
          </span>
          <div>
            <strong>No external action was executed.</strong>
            <span>OpsGuard validates, controls, and audits the outcome.</span>
          </div>
        </aside>
      </main>

      <footer>
        <span>OpsGuard AI · Hackathon control demo</span>
        <span>Tenant-scoped · Structured · Auditable</span>
      </footer>
    </div>
  );
}
