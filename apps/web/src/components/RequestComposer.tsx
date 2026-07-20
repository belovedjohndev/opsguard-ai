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
    <div className="request-editor">
      <div className="editor-field">
        <div className="editor-field-header">
          <label className="editor-field-label" htmlFor="request-text">
            Request text
          </label>
          <span id="request-count" className="editor-char-count">
            {requestText.length.toLocaleString()} / {maximumLength.toLocaleString()}
          </span>
        </div>
        <textarea
          id="request-text"
          className="editor-textarea"
          value={requestText}
          maxLength={maximumLength}
          rows={9}
          disabled={isSubmitting}
          aria-describedby="request-count"
          placeholder="Enter a synthetic operational request..."
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      </div>

      <div className="editor-actions">
        <button
          className="btn-analyze"
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
          className="btn-reset"
          type="button"
          disabled={isSubmitting || requestText.length === 0}
          onClick={onReset}
        >
          Reset
        </button>
      </div>
    </div>
  );
}
