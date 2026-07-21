import { useEffect, useState } from 'react';

import { createAndAssessRequest, DemoApiError, readDemoConfiguration } from './api.js';
import type { AssessmentResponse, DemoConfiguration, DemoErrorKind } from './api.js';
import { AssessmentResults } from './components/AssessmentResults.js';
import { RequestComposer } from './components/RequestComposer.js';
import { presetScenarios } from './presets.js';

const maximumRequestTextLength = 20_000;

type ViewState =
  | Readonly<{ kind: 'idle' }>
  | Readonly<{ kind: 'submitting' }>
  | Readonly<{ kind: 'success'; result: AssessmentResponse; submittedText: string }>
  | Readonly<{ kind: 'error'; errorKind: DemoErrorKind; message: string }>;

type HealthStatus = 'checking' | 'healthy' | 'unavailable';
type ApiPresentationStatus = HealthStatus | 'pending';

const errorTitles: Readonly<Record<DemoErrorKind, string>> = Object.freeze({
  validation: 'Check the request or demo configuration',
  authorization: 'Demo tenant authorization failed',
  unavailable: 'OpsGuard API unavailable',
  model: 'Model assessment stopped safely',
  unexpected: 'Assessment could not be displayed',
});

const scenarioIcons: Record<string, string> = {
  'clear-service-request': '\u2713',
  'prompt-injection-support-request': '\u26A0',
  'conflicting-cancellation-request': '\u2716',
};

const scenarioCategories: Record<string, string> = {
  'clear-service-request': 'Sales',
  'prompt-injection-support-request': 'Adversarial',
  'conflicting-cancellation-request': 'Conflict',
};

const healthMessages: Record<ApiPresentationStatus, string> = {
  checking: 'Checking API',
  healthy: 'API healthy',
  unavailable: 'API unavailable',
  pending: 'API connecting',
};

const healthTones: Record<ApiPresentationStatus, 'neutral' | 'success' | 'pending' | 'error'> = {
  checking: 'neutral',
  healthy: 'success',
  unavailable: 'error',
  pending: 'pending',
};

const validationStages = Object.freeze([
  'Schema validation',
  'Route compatibility',
  'Policy validation',
]);

const decisionPlaceholderLabels = Object.freeze(['Intent', 'Confidence', 'Review requirement']);

export function App() {
  const [requestText, setRequestText] = useState('');
  const [viewState, setViewState] = useState<ViewState>({ kind: 'idle' });
  const [healthStatus, setHealthStatus] = useState<HealthStatus>('checking');

  useEffect(() => {
    let cancelled = false;
    const checkHealth = async () => {
      try {
        let configuration: DemoConfiguration;
        try {
          configuration = readDemoConfiguration();
        } catch {
          if (!cancelled) setHealthStatus('unavailable');
          return;
        }
        const response = await fetch(`${configuration.apiBaseUrl}/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        });
        if (!cancelled) {
          setHealthStatus(response.ok ? 'healthy' : 'unavailable');
        }
      } catch {
        if (!cancelled) setHealthStatus('unavailable');
      }
    };
    void checkHealth();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedPreset = presetScenarios.find((p) => requestText === p.requestText);

  const apiStatusFromSubmit: ApiPresentationStatus =
    viewState.kind === 'submitting'
      ? 'pending'
      : viewState.kind === 'success'
        ? 'healthy'
        : viewState.kind === 'error' && viewState.errorKind === 'unavailable'
          ? 'unavailable'
          : healthStatus;
  const apiStatusTone = healthTones[apiStatusFromSubmit];

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

  const getSafetyNotice = () => {
    switch (viewState.kind) {
      case 'submitting':
        return {
          primary: 'No external action is being executed.',
          secondary: 'The proposal is being validated against deterministic policy.',
        };
      case 'success':
        return {
          primary: 'No external action was executed.',
          secondary: 'The assessment remains pending review.',
        };
      case 'error':
        return {
          primary: 'No external action was executed.',
          secondary: 'The request failed before an operational decision could be made.',
        };
      default:
        return {
          primary: 'No external action will be executed.',
          secondary: 'OpsGuard validates every model proposal before an operational decision.',
        };
    }
  };

  const safetyNotice = getSafetyNotice();

  return (
    <div className="app-shell">
      <header className="header" aria-label="Operational context">
        <div className="header-statuses">
          <span className={`header-status status-${apiStatusTone}`} aria-label="API status">
            <span className="dot" aria-hidden="true" />
            <span className="header-status-label">{healthMessages[apiStatusFromSubmit]}</span>
          </span>
          <span className="header-tenant">
            Tenant <strong>synthetic demo</strong>
          </span>
          <span className="header-policy">
            <span className="dot" aria-hidden="true" />
            Policy controlled
          </span>
        </div>
      </header>

      <main className="main-layout">
        <aside className="scenario-rail" aria-label="Demo scenarios">
          <div className="rail-section">
            <div className="rail-product">
              <span className="rail-product-mark" aria-hidden="true">
                OG
              </span>
              <div className="rail-product-copy">
                <span className="rail-product-name">OpsGuard AI</span>
                <span className="rail-product-tagline">Controlled operations</span>
              </div>
            </div>
          </div>

          <div className="rail-section">
            <p className="rail-heading">Demo scenarios</p>
            <div className="rail-scenarios" role="group" aria-label="Preset scenarios">
              {presetScenarios.map((preset) => {
                const isSelected = requestText === preset.requestText;
                return (
                  <button
                    className="rail-scenario"
                    type="button"
                    key={preset.id}
                    aria-pressed={isSelected}
                    disabled={viewState.kind === 'submitting'}
                    onClick={() => handleRequestTextChange(preset.requestText)}
                  >
                    <span className="rail-scenario-icon" aria-hidden="true">
                      {scenarioIcons[preset.id] ?? '\u25CB'}
                    </span>
                    <span className="rail-scenario-info">
                      <span className="rail-scenario-name">{preset.label}</span>
                      <span className="rail-scenario-category">
                        {scenarioCategories[preset.id] ?? 'General'}
                      </span>
                    </span>
                    <span className="rail-selected-indicator" aria-hidden="true">
                      {isSelected ? '✓' : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rail-section rail-status">
            <div className="rail-status-item">
              <span className={`dot ${apiStatusTone}`} aria-hidden="true" />
              <span>
                API{' '}
                {apiStatusFromSubmit === 'healthy'
                  ? 'connected'
                  : apiStatusFromSubmit === 'pending'
                    ? 'connecting'
                    : apiStatusFromSubmit === 'unavailable'
                      ? 'unavailable'
                      : 'checked'}
              </span>
            </div>
            <div className="rail-status-item">
              <span className="dot success" aria-hidden="true" />
              <span>Safety controls active</span>
            </div>
            <div className="rail-status-item">
              <span className="dot success" aria-hidden="true" />
              <span>Policy controlled</span>
            </div>
          </div>
        </aside>

        <section className="request-workspace" aria-labelledby="request-heading">
          <div className="workspace-heading">
            <p className="eyebrow">Request workspace</p>
            <h1 id="request-heading">Operational request</h1>
            <p className="workspace-helper">
              Use a synthetic scenario or enter a request for controlled analysis.
            </p>
            {selectedPreset && (
              <div className="scenario-badge">
                <span aria-hidden="true">{scenarioIcons[selectedPreset.id] ?? '\u25CB'}</span>
                {selectedPreset.label}
              </div>
            )}
          </div>

          <RequestComposer
            requestText={requestText}
            isSubmitting={viewState.kind === 'submitting'}
            maximumLength={maximumRequestTextLength}
            onChange={handleRequestTextChange}
            onReset={handleReset}
            onSubmit={handleSubmit}
          />
        </section>

        <section className="decision-inspector" aria-labelledby="inspector-heading">
          <div className="inspector-heading">
            <div className="inspector-heading-row">
              <h1 id="inspector-heading">Decision inspector</h1>
              <span className="policy-badge">
                <span className="dot" aria-hidden="true" />
                Policy controlled
              </span>
            </div>
          </div>

          <div className="inspector-content" aria-live="polite">
            {viewState.kind === 'idle' && (
              <div className="decision-pipeline" aria-label="Assessment control flow">
                <div className="pipeline-endpoint pipeline-endpoint-proposal">
                  <span className="pipeline-endpoint-label">Model proposal</span>
                  <span className="pipeline-endpoint-route">Not assessed</span>
                  <span className="pipeline-endpoint-meta">Model-derived route</span>
                </div>

                <div className="pipeline-validation" aria-label="Deterministic validation">
                  <span className="pipeline-validation-label">Deterministic validation</span>
                  <div className="pipeline-validation-stages">
                    {validationStages.map((stage) => (
                      <span className="pipeline-validation-stage" key={stage}>
                        <span aria-hidden="true">✓</span>
                        {stage}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="pipeline-endpoint pipeline-endpoint-outcome">
                  <span className="pipeline-endpoint-label">Controlled outcome</span>
                  <span className="pipeline-endpoint-route">Not assessed</span>
                  <span className="pipeline-endpoint-meta">Effective route and review mode</span>
                </div>

                <div className="decision-placeholder-list">
                  {decisionPlaceholderLabels.map((label) => (
                    <div className="decision-placeholder" key={label}>
                      <span className="decision-placeholder-label">{label}</span>
                      <span className="decision-placeholder-value">Not assessed</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {viewState.kind === 'submitting' && (
              <div className="processing-state" role="status" aria-label="Assessment in progress">
                <span className="processing-orbit" aria-hidden="true" />
                <div>
                  <h2 className="processing-title">Validating the model proposal</h2>
                  <p className="processing-description">
                    Creating the tenant request, validating structure, and applying policy.
                  </p>
                </div>
                <div className="processing-steps" aria-label="Assessment progress">
                  <span className="processing-step">
                    <span className="processing-step-icon" aria-hidden="true" />
                    Request created
                  </span>
                  <span className="processing-step">
                    <span className="processing-step-icon" aria-hidden="true" />
                    Model assessment
                  </span>
                  <span className="processing-step">
                    <span className="processing-step-icon" aria-hidden="true" />
                    Policy decision
                  </span>
                </div>
              </div>
            )}

            {viewState.kind === 'error' && (
              <div className={`error-state error-${viewState.errorKind}`} role="alert">
                <span className="error-icon" aria-hidden="true">
                  !
                </span>
                <div className="error-content">
                  <h2>{errorTitles[viewState.errorKind]}</h2>
                  <p>{viewState.message}</p>
                </div>
              </div>
            )}

            {viewState.kind === 'success' && (
              <AssessmentResults requestText={viewState.submittedText} result={viewState.result} />
            )}
          </div>

          <aside className="safety-footer" aria-label="Execution safety notice">
            <span className="safety-footer-icon" aria-hidden="true">
              {'\u2713'}
            </span>
            <div className="safety-footer-text">
              <span className="safety-footer-primary">{safetyNotice.primary}</span>
              <span className="safety-footer-secondary">{safetyNotice.secondary}</span>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}
