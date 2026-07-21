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

const routeValidationStages = Object.freeze([
  'Schema validation',
  'Route compatibility',
  'Policy validation',
]);

export function AssessmentResults({ requestText, result }: AssessmentResultsProps) {
  const reviewLabel = result.decision.requiresReview
    ? 'Manual review required'
    : 'Automatic route eligible';

  return (
    <div className="result-card" aria-label="Assessment result">
      <div className="result-header">
        <h2>Decision</h2>
        <span
          className={`review-badge ${result.decision.requiresReview ? 'review-required' : 'review-automatic'}`}
        >
          {reviewLabel}
        </span>
      </div>

      <div
        className="route-flow"
        aria-label="Model proposal through deterministic validation to controlled outcome"
      >
        <div
          className={`route-card proposed ${result.decision.modelRouteOverridden ? 'overridden' : ''}`}
        >
          <div className="route-card-label">Model proposal</div>
          <div className="route-card-value">{result.assessment.proposedRoute}</div>
          <div className="route-card-meta">Model-derived route</div>
        </div>

        <div className="route-validation-bridge">
          <span className="route-validation-label">Deterministic validation</span>
          <div className="route-validation-stages">
            {routeValidationStages.map((stage) => (
              <span className="route-validation-stage" key={stage}>
                <span aria-hidden="true">✓</span>
                {stage}
              </span>
            ))}
          </div>
        </div>

        <div className="route-card effective">
          <div className="route-card-label">Controlled outcome</div>
          <div className="route-card-value">{result.decision.effectiveRoute}</div>
          <div className="route-card-meta">
            {result.decision.requiresReview ? 'Manual review' : 'Automatic route'}
          </div>
        </div>
      </div>

      {result.decision.modelRouteOverridden ? (
        <div className="override-notice" role="status">
          <span className="override-notice-icon" aria-hidden="true">
            !
          </span>
          Deterministic policy overrode the model proposal.
        </div>
      ) : (
        <div className="policy-pass-notice">
          <span className="policy-pass-notice-icon" aria-hidden="true">
            {'\u2713'}
          </span>
          Model proposal passed deterministic routing policy.
        </div>
      )}

      <div className="decision-metrics">
        <div className="decision-metric">
          <span className="decision-metric-label">Intent</span>
          <span className="decision-metric-value">{formatLabel(result.assessment.intent)}</span>
        </div>
        <div className="decision-metric">
          <span className="decision-metric-label">Confidence</span>
          <span className="decision-metric-value">
            {Math.round(result.assessment.confidence * 100)}%
          </span>
        </div>
        <div className="decision-metric">
          <span className="decision-metric-label">Review</span>
          <span className="decision-metric-value">
            {result.decision.requiresReview ? 'Manual' : 'Automatic'}
          </span>
        </div>
        <div className="decision-metric highlight">
          <span className="decision-metric-label">Proposed route</span>
          <span className="decision-metric-value mono">{result.assessment.proposedRoute}</span>
        </div>
        <div className="decision-metric highlight">
          <span className="decision-metric-label">Effective route</span>
          <span className="decision-metric-value mono">{result.decision.effectiveRoute}</span>
        </div>
        <div className="decision-metric">
          <span className="decision-metric-label">Overridden</span>
          <span className="decision-metric-value">
            {result.decision.modelRouteOverridden ? 'Yes' : 'No'}
          </span>
        </div>
      </div>

      <div className="section-divider">Result details</div>

      <div className="result-panels">
        <div className="result-panel">
          <div className="result-panel-header">
            <h3>Extracted information</h3>
            <span className="result-panel-index">01</span>
          </div>
          <div className="result-panel-body">
            <div className="detail-row">
              <span className="detail-label">Name</span>
              <span
                className={`detail-value ${result.assessment.customer.name === null ? 'empty' : ''}`}
              >
                {displayValue(result.assessment.customer.name)}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Email</span>
              <span
                className={`detail-value ${result.assessment.customer.email === null ? 'empty' : ''}`}
              >
                {displayValue(result.assessment.customer.email)}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Phone</span>
              <span
                className={`detail-value ${result.assessment.customer.phone === null ? 'empty' : ''}`}
              >
                {displayValue(result.assessment.customer.phone)}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Account ref</span>
              <span
                className={`detail-value mono ${result.assessment.customer.accountReference === null ? 'empty' : ''}`}
              >
                {displayValue(result.assessment.customer.accountReference)}
              </span>
            </div>
          </div>
        </div>

        <div className="result-panel">
          <div className="result-panel-header">
            <h3>Service request</h3>
            <span className="result-panel-index">02</span>
          </div>
          <div className="result-panel-body">
            <div className="detail-row">
              <span className="detail-label">Service</span>
              <span
                className={`detail-value ${result.assessment.serviceRequest.requestedService === null ? 'empty' : ''}`}
              >
                {displayValue(result.assessment.serviceRequest.requestedService)}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Timing</span>
              <span
                className={`detail-value ${result.assessment.serviceRequest.requestedTiming === null ? 'empty' : ''}`}
              >
                {displayValue(result.assessment.serviceRequest.requestedTiming)}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Location</span>
              <span
                className={`detail-value ${result.assessment.serviceRequest.location === null ? 'empty' : ''}`}
              >
                {displayValue(result.assessment.serviceRequest.location)}
              </span>
            </div>
            <div className="summary-text">
              <span className="summary-text-label">Summary</span>
              <p className="summary-text-content">{result.assessment.serviceRequest.summary}</p>
            </div>
          </div>
        </div>

        <div className="result-panel">
          <div className="result-panel-header">
            <h3>Urgency and missing information</h3>
            <span className="result-panel-index">03</span>
          </div>
          <div className="result-panel-body">
            <div className="tag-columns">
              <div>
                <span className="tag-group-label">Urgency indicators</span>
                <div className="tag-list">
                  {result.assessment.urgencyIndicators.length > 0 ? (
                    result.assessment.urgencyIndicators.map((indicator) => (
                      <span className="tag tag-urgency" key={indicator}>
                        {formatLabel(indicator)}
                      </span>
                    ))
                  ) : (
                    <span className="empty-tag">None identified</span>
                  )}
                </div>
              </div>
              <div>
                <span className="tag-group-label">Missing information</span>
                <div className="tag-list">
                  {result.assessment.missingInformation.length > 0 ? (
                    result.assessment.missingInformation.map((item) => (
                      <span className="tag tag-missing" key={item}>
                        {formatLabel(item)}
                      </span>
                    ))
                  ) : (
                    <span className="empty-tag">No required gaps identified</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="result-panel">
          <div className="result-panel-header">
            <h3>Evidence</h3>
            <span className="result-panel-index">04</span>
          </div>
          <div className="result-panel-body">
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
                    <li
                      className="evidence-item"
                      key={`${reference.field}-${reference.start}-${reference.end}`}
                    >
                      <div className="evidence-item-header">
                        <span className="evidence-field">{formatLabel(reference.field)}</span>
                        <span className="evidence-range">
                          {reference.start}:{reference.end}
                        </span>
                      </div>
                      <div className="evidence-excerpt">
                        {validRange ? <mark>{excerpt}</mark> : excerpt}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="empty-tag">No validated evidence ranges were returned.</p>
            )}
          </div>
        </div>

        <div className="result-panel">
          <div className="result-panel-header">
            <h3>Provenance</h3>
            <span className="result-panel-index">05</span>
          </div>
          <div className="result-panel-body">
            <div className="detail-row">
              <span className="detail-label">Prompt</span>
              <span className="detail-value mono">
                {result.provenance.promptKey} / v{result.provenance.promptVersion}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Provider / model</span>
              <span className="detail-value mono">
                {result.provenance.provider} / {result.provenance.model}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Prompt SHA-256</span>
              <span className="detail-value mono">{result.provenance.promptSha256}</span>
            </div>
          </div>
        </div>

        <div className="result-panel">
          <div className="result-panel-header">
            <h3>Request identifiers</h3>
            <span className="result-panel-index">06</span>
          </div>
          <div className="result-panel-body">
            <div className="detail-row">
              <span className="detail-label">Request ID</span>
              <span className="detail-value mono">{result.requestId}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Correlation ID</span>
              <span className="detail-value mono">{result.correlationId}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Request state</span>
              <span className="detail-value">{formatLabel(result.status)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
