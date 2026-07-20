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

  const apiStatus =
    viewState.kind === 'submitting'
      ? { label: 'API connecting', tone: 'pending' }
      : viewState.kind === 'success'
        ? { label: 'API connected', tone: 'success' }
        : viewState.kind === 'error' && viewState.errorKind === 'unavailable'
          ? { label: 'API unavailable', tone: 'error' }
          : { label: 'API not checked', tone: 'neutral' };

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
        <a className="brand" href="#workspace" aria-label="OpsGuard AI workspace">
          <span className="brand-mark" aria-hidden="true">
            OG
          </span>
          <span className="brand-copy">
            <strong>OpsGuard AI</strong>
            <span>Controlled AI-Assisted Operations</span>
          </span>
        </a>

        <div className="header-statuses" aria-label="System status">
          <span className={`status-badge status-${apiStatus.tone}`}>
            <span className="status-indicator" aria-hidden="true" />
            {apiStatus.label}
          </span>
          <span className="status-badge status-success">
            <span className="status-indicator" aria-hidden="true" />
            Safety controls active
          </span>
          <span className="status-badge status-neutral">
            <span className="status-indicator" aria-hidden="true" />
            Tenant-scoped
          </span>
        </div>
      </header>

      <main id="workspace" className="console-main">
        <div className="workspace-grid">
          <RequestComposer
            requestText={requestText}
            isSubmitting={viewState.kind === 'submitting'}
            maximumLength={maximumRequestTextLength}
            onChange={handleRequestTextChange}
            onReset={handleReset}
            onSubmit={handleSubmit}
          />

          <section className="decision-workspace" aria-labelledby="decision-workspace-heading">
            <div className="workspace-heading">
              <div>
                <p className="eyebrow">Decision workspace</p>
                <h1 id="decision-workspace-heading">Assessment decision</h1>
              </div>
              <span className="control-badge">Policy controlled</span>
            </div>

            <div className="decision-state" aria-live="polite">
              {viewState.kind === 'idle' ? (
                <div className="empty-decision">
                  <div className="decision-flow" aria-label="Assessment control flow">
                    <span>Model proposal</span>
                    <span className="flow-arrow" aria-hidden="true">
                      →
                    </span>
                    <span>Policy validation</span>
                    <span className="flow-arrow" aria-hidden="true">
                      →
                    </span>
                    <span>Controlled outcome</span>
                  </div>
                  <p className="empty-decision-copy">
                    Select a scenario or enter a request to inspect the controlled assessment.
                  </p>
                  <dl className="decision-placeholders">
                    {[
                      'Intent',
                      'Confidence',
                      'Proposed route',
                      'Effective route',
                      'Review requirement',
                    ].map((label) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>Not assessed</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : null}

              {viewState.kind === 'submitting' ? (
                <div className="processing-state" role="status" aria-label="Assessment in progress">
                  <span className="processing-orbit" aria-hidden="true" />
                  <div>
                    <p className="eyebrow">Control pipeline active</p>
                    <h2>Validating the model proposal</h2>
                    <p>Creating the tenant request, validating structure, and applying policy.</p>
                  </div>
                  <ol className="processing-steps" aria-label="Assessment progress">
                    <li>Request created</li>
                    <li>Model assessment</li>
                    <li>Policy decision</li>
                  </ol>
                </div>
              ) : null}

              {viewState.kind === 'error' ? (
                <div className={`error-state error-${viewState.errorKind}`} role="alert">
                  <span className="error-symbol" aria-hidden="true">
                    !
                  </span>
                  <div>
                    <p className="eyebrow">Safe stop</p>
                    <h2>{errorTitles[viewState.errorKind]}</h2>
                    <p>{viewState.message}</p>
                  </div>
                </div>
              ) : null}

              {viewState.kind === 'success' ? (
                <AssessmentResults
                  requestText={viewState.submittedText}
                  result={viewState.result}
                />
              ) : null}
            </div>

            <aside className="execution-notice" aria-label="Execution safety notice">
              <span className="notice-icon" aria-hidden="true">
                ✓
              </span>
              <div>
                <strong>No external action was executed.</strong>
                <span>Assessment output remains pending review.</span>
              </div>
            </aside>
          </section>
        </div>
      </main>
    </div>
  );
}
