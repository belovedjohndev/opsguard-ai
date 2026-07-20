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
          <p className="eyebrow">Operational intake</p>
          <h2 id="request-heading">Analyze a synthetic request</h2>
        </div>
        <span className="step-badge">01 / Input</span>
      </div>

      <div className="preset-grid" aria-label="Preset scenarios">
        {presetScenarios.map((preset) => (
          <button
            className="preset-card"
            type="button"
            key={preset.id}
            aria-pressed={requestText === preset.requestText}
            disabled={isSubmitting}
            onClick={() => onChange(preset.requestText)}
          >
            <span className="preset-label">{preset.label}</span>
            <span className="preset-description">{preset.description}</span>
          </button>
        ))}
      </div>

      <div className="textarea-shell">
        <label htmlFor="request-text">Request text</label>
        <textarea
          id="request-text"
          value={requestText}
          maxLength={maximumLength}
          rows={8}
          disabled={isSubmitting}
          aria-describedby="request-count"
          placeholder="Enter a synthetic operational request…"
          onChange={(event) => onChange(event.currentTarget.value)}
        />
        <span id="request-count" className="character-count">
          {requestText.length.toLocaleString()} / {maximumLength.toLocaleString()}
        </span>
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
              Validating proposal…
            </>
          ) : (
            'Analyze Request'
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
