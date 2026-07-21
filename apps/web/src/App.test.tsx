import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './App.js';
import { presetScenarios } from './presets.js';

const requestId = '52c46b7f-ef13-4404-9cf5-c236ba1150a2';
const correlationId = '81881e5f-c076-4d2d-903d-1438947f196c';

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const assessmentResponse = Object.freeze({
  requestId,
  correlationId,
  status: 'pending_review',
  aiRunStatus: 'succeeded',
  assessment: {
    schemaVersion: 'request-assessment-v1',
    intent: 'support_request',
    confidence: 0.98,
    customer: {
      name: null,
      email: 'noc@example.test',
      phone: null,
      accountReference: 'ACCT-712',
    },
    serviceRequest: {
      summary: 'Account ACCT-712 is offline.',
      requestedService: null,
      requestedTiming: null,
      location: null,
    },
    urgencyIndicators: ['service_outage'],
    missingInformation: [],
    proposedRoute: 'sales',
    evidenceReferences: [{ field: 'customer.accountReference', start: 70, end: 78 }],
  },
  decision: {
    effectiveRoute: 'manual_review',
    requiresReview: true,
    modelRouteOverridden: true,
  },
  provenance: {
    promptKey: 'request.assessment',
    promptVersion: 2,
    promptSha256: '14aa90a99b1a6a17b4eb733ccb84f171499a91da49de5bc11703922ccf1779a5',
    provider: 'openai',
    model: 'synthetic-model',
  },
});

beforeEach(() => {
  vi.stubEnv('VITE_API_BASE_URL', 'http://127.0.0.1:3000');
  vi.stubEnv('VITE_DEMO_TENANT_ID', '8f7e6d5c-4b3a-4210-9fed-cba987654321');
  vi.stubEnv('VITE_DEMO_USER_ID', '719e2bb4-0a4e-4f04-9fd1-d7261ed71f11');
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('OpsGuard AI demo', () => {
  it('renders the intake before a stable assessment decision workspace', () => {
    render(<App />);

    const layout = document.querySelector('.main-layout');
    expect(layout).not.toBeNull();
    expect(layout?.children).toHaveLength(3);
    expect(screen.getByRole('heading', { name: 'Operational request' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Decision inspector' })).toBeTruthy();
    expect(screen.getByText('Model proposal')).toBeTruthy();
    expect(screen.getByText('Schema validation')).toBeTruthy();
    expect(screen.getByText('Route compatibility')).toBeTruthy();
    expect(screen.getByText('Policy validation')).toBeTruthy();
    expect(screen.getByText('Controlled outcome')).toBeTruthy();
    expect(screen.getAllByText('OpsGuard AI')).toHaveLength(1);
    expect(screen.getByText('Controlled operations')).toBeTruthy();
    expect(screen.getByLabelText('Operational context').textContent).not.toContain('OpsGuard AI');
    expect(screen.getByText('No external action will be executed.')).toBeTruthy();
    expect(
      screen.getByText('OpsGuard validates every model proposal before an operational decision.'),
    ).toBeTruthy();
  });

  it.each([
    [200, 'API healthy'],
    [503, 'API unavailable'],
  ])('renders the API health state for status %s', async (status, label) => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}, status)));
    render(<App />);

    expect((await screen.findAllByText(label)).length).toBeGreaterThan(0);
  });

  it('selects each preset with explicit styling and state text', () => {
    render(<App />);

    for (const preset of presetScenarios) {
      const presetButton = screen.getByRole('button', { name: new RegExp(preset.label, 'i') });
      fireEvent.click(presetButton);
      expect((screen.getByLabelText('Request text') as HTMLTextAreaElement).value).toBe(
        preset.requestText,
      );
      expect(presetButton.getAttribute('aria-pressed')).toBe('true');
    }
  });

  it('enables Analyze only when request text is present and resets the intake', () => {
    render(<App />);

    const textarea = screen.getByLabelText('Request text');
    const analyze = screen.getByRole('button', { name: 'Analyze request' }) as HTMLButtonElement;
    const reset = screen.getByRole('button', { name: 'Reset' }) as HTMLButtonElement;

    expect(analyze.disabled).toBe(true);
    expect(reset.disabled).toBe(true);

    fireEvent.change(textarea, { target: { value: 'Synthetic operational request' } });
    expect(analyze.disabled).toBe(false);
    expect(reset.disabled).toBe(false);

    fireEvent.click(reset);
    expect((textarea as HTMLTextAreaElement).value).toBe('');
    expect(analyze.disabled).toBe(true);
  });

  it('creates a request before assessing it and renders the validated result', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({}, 200))
      .mockResolvedValueOnce(jsonResponse({ requestId }, 201))
      .mockResolvedValueOnce(jsonResponse(assessmentResponse));
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);

    const preset = presetScenarios[1];
    fireEvent.click(screen.getByRole('button', { name: new RegExp(preset.label, 'i') }));
    fireEvent.click(screen.getByRole('button', { name: 'Analyze request' }));

    await screen.findByRole('heading', { name: 'Decision' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[0]).toBe('http://127.0.0.1:3000/v1/requests');
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      `http://127.0.0.1:3000/v1/requests/${requestId}/assessment`,
    );
    const createOptions = fetchMock.mock.calls[1]?.[1];
    const assessOptions = fetchMock.mock.calls[2]?.[1];
    expect(JSON.parse(String(createOptions?.body))).toMatchObject({ sourceType: 'form' });
    expect(JSON.parse(String(assessOptions?.body))).toEqual({ requestText: preset.requestText });
    expect(screen.getByText('Support Request')).toBeTruthy();
    expect(screen.getByText('noc@example.test')).toBeTruthy();
    expect(screen.getByText(requestId)).toBeTruthy();
    expect(screen.getAllByText('sales').length).toBeGreaterThan(0);
    expect(screen.getAllByText('manual_review').length).toBeGreaterThan(0);
    expect(screen.getByText('No external action was executed.')).toBeTruthy();
    expect(screen.getByText('The assessment remains pending review.')).toBeTruthy();
  });

  it('shows the deterministic route override message', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse({}, 200))
        .mockResolvedValueOnce(jsonResponse({ requestId }, 201))
        .mockResolvedValueOnce(jsonResponse(assessmentResponse)),
    );
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /Prompt-injection support request/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Analyze request' }));

    expect(
      await screen.findByText('Deterministic policy overrode the model proposal.'),
    ).toBeTruthy();
    expect(screen.getAllByText('manual_review').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Manual')).toBeTruthy();
  });

  it('disables duplicate submission while loading', async () => {
    const pending = new Promise<Response>(() => undefined);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({}, 200))
      .mockReturnValue(pending);
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /Clear service request/i }));
    const textarea = screen.getByLabelText('Request text') as HTMLTextAreaElement;
    const submittedText = textarea.value;
    const submit = screen.getByRole('button', { name: 'Analyze request' });
    fireEvent.click(submit);

    await waitFor(() => {
      expect(
        (screen.getByRole('button', { name: /Analyzing request/i }) as HTMLButtonElement).disabled,
      ).toBe(true);
    });
    expect(screen.getByRole('heading', { name: 'Validating the model proposal' })).toBeTruthy();
    expect(textarea.value).toBe(submittedText);
    expect(screen.getByText('No external action is being executed.')).toBeTruthy();
    expect(
      screen.getByText('The proposal is being validated against deterministic policy.'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Analyzing request/i }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('renders a sanitized model failure without provider content', async () => {
    const providerSecret = 'raw-provider-body-secret';
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse({}, 200))
        .mockResolvedValueOnce(jsonResponse({ requestId }, 201))
        .mockResolvedValueOnce(
          jsonResponse({
            requestId,
            correlationId,
            status: 'pending_review',
            aiRunStatus: 'failed',
            failure: { code: 'gateway_unavailable', message: providerSecret },
          }),
        ),
    );
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /Clear service request/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Analyze request' }));

    expect(
      await screen.findByRole('heading', { name: 'Model assessment stopped safely' }),
    ).toBeTruthy();
    expect(document.body.textContent).not.toContain(providerSecret);
    expect(document.body.textContent).toContain('No external action was executed.');
    expect(document.body.textContent).toContain(
      'The request failed before an operational decision could be made.',
    );
  });
});
