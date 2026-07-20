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
    <section className="assessment-results" aria-label="Assessment result">
      <article className="decision-card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">Validated outcome</p>
            <h2>Decision</h2>
          </div>
          <span className={result.decision.requiresReview ? 'review-chip warning' : 'review-chip'}>
            {reviewLabel}
          </span>
        </div>

        <dl className="decision-metrics">
          <div>
            <dt>Intent</dt>
            <dd>{formatLabel(result.assessment.intent)}</dd>
          </div>
          <div>
            <dt>Confidence</dt>
            <dd>{Math.round(result.assessment.confidence * 100)}%</dd>
          </div>
          <div>
            <dt>Proposed route</dt>
            <dd>
              <code className="route-value">{result.assessment.proposedRoute}</code>
            </dd>
          </div>
          <div className="effective-route">
            <dt>Effective route</dt>
            <dd>
              <code className="route-value">{result.decision.effectiveRoute}</code>
            </dd>
          </div>
          <div>
            <dt>Review</dt>
            <dd>{result.decision.requiresReview ? 'Manual' : 'Automatic'}</dd>
          </div>
          <div>
            <dt>Model route overridden</dt>
            <dd>{result.decision.modelRouteOverridden ? 'Yes' : 'No'}</dd>
          </div>
        </dl>

        {result.decision.modelRouteOverridden ? (
          <p className="override-notice" role="status">
            <span aria-hidden="true">!</span>
            Deterministic policy overrode the model proposal.
          </p>
        ) : (
          <p className="policy-notice">
            <span aria-hidden="true">✓</span>
            Model proposal passed deterministic routing policy.
          </p>
        )}
      </article>

      <div className="result-section-grid">
        <article className="result-panel">
          <div className="panel-heading">
            <span className="panel-index">01</span>
            <h3>Extracted customer information</h3>
          </div>
          <dl className="detail-list">
            <div>
              <dt>Name</dt>
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
          </dl>
        </article>

        <article className="result-panel">
          <div className="panel-heading">
            <span className="panel-index">02</span>
            <h3>Service request details</h3>
          </div>
          <dl className="detail-list">
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

        <article className="result-panel result-panel-wide">
          <div className="panel-heading">
            <span className="panel-index">03</span>
            <h3>Urgency and missing information</h3>
          </div>
          <div className="signal-columns">
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
          </div>
        </article>

        <article className="result-panel result-panel-wide">
          <div className="panel-heading">
            <span className="panel-index">04</span>
            <h3>Evidence references</h3>
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
                      <span className="evidence-range">
                        {reference.start}:{reference.end}
                      </span>
                    </div>
                    {validRange ? <mark>{excerpt}</mark> : <span>{excerpt}</span>}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="empty-value">No validated evidence ranges were returned.</p>
          )}
        </article>

        <article className="result-panel">
          <div className="panel-heading">
            <span className="panel-index">05</span>
            <h3>Provenance</h3>
          </div>
          <dl className="metadata-list">
            <div>
              <dt>Prompt</dt>
              <dd>
                <code>
                  {result.provenance.promptKey} / v{result.provenance.promptVersion}
                </code>
              </dd>
            </div>
            <div>
              <dt>Provider / model</dt>
              <dd>
                <code>
                  {result.provenance.provider} / {result.provenance.model}
                </code>
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

        <article className="result-panel">
          <div className="panel-heading">
            <span className="panel-index">06</span>
            <h3>Request and correlation IDs</h3>
          </div>
          <dl className="metadata-list identifier-list">
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
              <dt>Request state</dt>
              <dd>{formatLabel(result.status)}</dd>
            </div>
          </dl>
        </article>
      </div>
    </section>
  );
}
