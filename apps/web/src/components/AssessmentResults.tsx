import type { AssessmentResponse } from '../api.js';

type AssessmentResultsProps = Readonly<{
  requestText: string;
  result: AssessmentResponse;
}>;

const displayValue = (value: string | null): string => value ?? 'Not identified';

const formatLabel = (value: string): string =>
  value
    .split(/[._]/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');

export function AssessmentResults({ requestText, result }: AssessmentResultsProps) {
  const reviewLabel = result.decision.requiresReview
    ? 'Manual review required'
    : 'Automatic route eligible';

  return (
    <section className="results-section" aria-labelledby="results-heading">
      <div className="section-heading results-title">
        <div>
          <p className="eyebrow">Validated outcome</p>
          <h2 id="results-heading">Controlled assessment</h2>
        </div>
        <span className="step-badge success-badge">02 / Complete</span>
      </div>

      <div className="results-grid">
        <article className="result-card decision-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Deterministic policy</p>
              <h3>Decision</h3>
            </div>
            <span
              className={result.decision.requiresReview ? 'review-chip warning' : 'review-chip'}
            >
              {reviewLabel}
            </span>
          </div>

          <div className="route-comparison">
            <div>
              <span>Model-proposed route</span>
              <strong>{formatLabel(result.assessment.proposedRoute)}</strong>
            </div>
            <span className="route-arrow" aria-hidden="true">
              →
            </span>
            <div className="effective-route">
              <span>Effective route</span>
              <strong>{formatLabel(result.decision.effectiveRoute)}</strong>
            </div>
          </div>

          {result.decision.modelRouteOverridden ? (
            <p className="override-notice" role="status">
              Deterministic policy overrode the model proposal.
            </p>
          ) : (
            <p className="policy-notice">Model proposal passed deterministic routing policy.</p>
          )}

          <div className="decision-metrics">
            <div>
              <span>Intent</span>
              <strong>{formatLabel(result.assessment.intent)}</strong>
            </div>
            <div>
              <span>Confidence</span>
              <strong>{Math.round(result.assessment.confidence * 100)}%</strong>
            </div>
            <div>
              <span>Request state</span>
              <strong>{formatLabel(result.status)}</strong>
            </div>
          </div>
        </article>

        <article className="result-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Validated fields</p>
              <h3>Extracted information</h3>
            </div>
          </div>
          <dl className="detail-list">
            <div>
              <dt>Customer name</dt>
              <dd>{displayValue(result.assessment.customer.name)}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{displayValue(result.assessment.customer.email)}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{displayValue(result.assessment.customer.phone)}</dd>
            </div>
            <div>
              <dt>Account reference</dt>
              <dd>{displayValue(result.assessment.customer.accountReference)}</dd>
            </div>
            <div>
              <dt>Service</dt>
              <dd>{displayValue(result.assessment.serviceRequest.requestedService)}</dd>
            </div>
            <div>
              <dt>Timing</dt>
              <dd>{displayValue(result.assessment.serviceRequest.requestedTiming)}</dd>
            </div>
            <div>
              <dt>Location</dt>
              <dd>{displayValue(result.assessment.serviceRequest.location)}</dd>
            </div>
          </dl>
          <div className="summary-block">
            <span>Summary</span>
            <p>{result.assessment.serviceRequest.summary}</p>
          </div>
        </article>

        <article className="result-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Risk and completeness</p>
              <h3>Operational signals</h3>
            </div>
          </div>
          <div className="signal-group">
            <span>Urgency indicators</span>
            <div className="tag-list">
              {result.assessment.urgencyIndicators.length > 0 ? (
                result.assessment.urgencyIndicators.map((indicator) => (
                  <span className="tag urgency-tag" key={indicator}>
                    {formatLabel(indicator)}
                  </span>
                ))
              ) : (
                <span className="empty-value">None identified</span>
              )}
            </div>
          </div>
          <div className="signal-group">
            <span>Missing information</span>
            <div className="tag-list">
              {result.assessment.missingInformation.length > 0 ? (
                result.assessment.missingInformation.map((item) => (
                  <span className="tag missing-tag" key={item}>
                    {formatLabel(item)}
                  </span>
                ))
              ) : (
                <span className="empty-value">No required gaps identified</span>
              )}
            </div>
          </div>
        </article>

        <article className="result-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Source-grounded</p>
              <h3>Evidence</h3>
            </div>
          </div>
          {result.assessment.evidenceReferences.length > 0 ? (
            <ul className="evidence-list">
              {result.assessment.evidenceReferences.map((reference) => {
                const validRange =
                  reference.start >= 0 &&
                  reference.end > reference.start &&
                  reference.end <= requestText.length;
                const excerpt = validRange
                  ? requestText.slice(reference.start, reference.end)
                  : 'Source range unavailable';
                return (
                  <li key={`${reference.field}-${reference.start}-${reference.end}`}>
                    <div>
                      <strong>{formatLabel(reference.field)}</strong>
                      <code>
                        {reference.start}:{reference.end}
                      </code>
                    </div>
                    {validRange ? <mark>{excerpt}</mark> : <span>{excerpt}</span>}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="empty-state">No validated evidence ranges were returned.</p>
          )}
        </article>

        <article className="result-card provenance-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Audit lineage</p>
              <h3>Provenance</h3>
            </div>
          </div>
          <dl className="provenance-list">
            <div>
              <dt>Prompt</dt>
              <dd>
                {result.provenance.promptKey} · v{result.provenance.promptVersion}
              </dd>
            </div>
            <div>
              <dt>Provider / model</dt>
              <dd>
                {result.provenance.provider} / {result.provenance.model}
              </dd>
            </div>
            <div>
              <dt>Request ID</dt>
              <dd>
                <code>{result.requestId}</code>
              </dd>
            </div>
            <div>
              <dt>Correlation ID</dt>
              <dd>
                <code>{result.correlationId}</code>
              </dd>
            </div>
            <div>
              <dt>Prompt SHA-256</dt>
              <dd>
                <code>{result.provenance.promptSha256}</code>
              </dd>
            </div>
          </dl>
        </article>

        <article className="result-card safety-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Guardrails applied</p>
              <h3>Safety controls</h3>
            </div>
            <span className="shield-icon" aria-hidden="true">
              ✓
            </span>
          </div>
          <ul className="control-list">
            <li>Tenant membership verified server-side</li>
            <li>Structured model output validated by domain code</li>
            <li>Effective route calculated by deterministic policy</li>
            <li>Prompt and model provenance retained for audit</li>
          </ul>
          <p className="no-action">No external action was executed.</p>
        </article>
      </div>
    </section>
  );
}
