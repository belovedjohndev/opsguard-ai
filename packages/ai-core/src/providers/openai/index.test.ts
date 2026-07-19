import { describe, expect, it } from 'vitest';

import * as openAIAdapter from './index.js';

describe('@opsguard/ai-core/openai public contract', () => {
  it('exports only the intentional OpenAI adapter factory', () => {
    expect(Object.keys(openAIAdapter).sort()).toEqual(['createOpenAIModelGateway']);
  });
});
