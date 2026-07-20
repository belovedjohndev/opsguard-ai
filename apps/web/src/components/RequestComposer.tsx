import { presetScenarios } from '../presets.js';

type RequestComposerProps = Readonly<{
  requestText: string;
  isSubmitting: boolean;
  maximumLength: number;
  onChange: (value: string) => void;
  onReset: () => void;
  onSubmit: () => void;
}>;

export function RequestComposer({
  requestText,
  isSubmitting,
  maximumLength,
  onChange,
  onReset,
  onSubmit,
}: RequestComposerProps) {
  return (
    <section className="composer-panel" aria-labelledby="request-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Request intake</p>
          <h2 id="request-heading">Operational request</h2>
          <p className="section-helper" id="request-helper">
            Use a synthetic scenario or enter a request for controlled analysis.
          </p>
        </div>
        <span className="section-step">01</span>
      </div>

      <div className="preset-list" aria-label="Preset scenarios">
        {presetScenarios.map((preset) => {
          const isSelected = requestText === preset.requestText;

          return (
            <button
              className="preset-option"
              type="button"
              key={preset.id}
              aria-pressed={isSelected}
              disabled={isSubmitting}
              onClick={() => onChange(preset.requestText)}
            >
              <span className="preset-selection" aria-hidden="true">
                <span />
              </span>
              <span className="preset-copy">
                <span className="preset-label">{preset.label}</span>
                <span className="preset-description">{preset.description}</span>
              </span>
              <span className="preset-state">{isSelected ? 'Selected' : 'Select'}</span>
            </button>
          );
        })}
      </div>

      <div className="textarea-shell">
        <div className="textarea-label-row">
          <label htmlFor="request-text">Request text</label>
          <span id="request-count" className="character-count">
            {requestText.length.toLocaleString()} / {maximumLength.toLocaleString()}
          </span>
        </div>
        <textarea
          id="request-text"
          value={requestText}
          maxLength={maximumLength}
          rows={9}
          disabled={isSubmitting}
          aria-describedby="request-helper request-count"
          placeholder="Enter a synthetic operational request..."
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      </div>

      <div className="composer-actions">
        <button
          className="primary-action"
          type="button"
          disabled={isSubmitting || requestText.trim().length === 0}
          onClick={onSubmit}
        >
          {isSubmitting ? (
            <>
              <span className="spinner" aria-hidden="true" />
              Analyzing request...
            </>
          ) : (
            'Analyze request'
          )}
        </button>
        <button
          className="secondary-action"
          type="button"
          disabled={isSubmitting || requestText.length === 0}
          onClick={onReset}
        >
          Reset
        </button>
      </div>
    </section>
  );
}
