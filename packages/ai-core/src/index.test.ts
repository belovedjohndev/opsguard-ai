import { describe, expect, it } from 'vitest';

import * as workspace from './index.js';

describe('@opsguard/ai-core public contract', () => {
  it('exports only the intentional provider-neutral runtime API', () => {
    expect(Object.keys(workspace).sort()).toEqual([
      'FakeModelGateway',
      'FakeModelGatewayExhaustedError',
      'createModelGatewayError',
      'createModelGatewayFailure',
      'createModelPolicy',
      'createModelRefusal',
      'createModelRequestMetadata',
      'createModelSuccess',
      'createModelTask',
      'createModelUsage',
      'createOutputSchemaDescriptor',
      'createStructuredModelRequest',
      'fakeModelGatewayExhaustedCode',
      'modelCompletionStates',
      'modelGatewayErrorCodes',
      'modelGatewayErrorPhases',
      'modelGatewayErrorRetryability',
      'modelMessageRoles',
      'modelQualityTiers',
      'modelRefusalCategories',
      'parseModelId',
      'parseProviderId',
      'parseProviderRequestId',
    ]);

    expect(workspace).not.toHaveProperty('copyJsonValue');
    expect(workspace).not.toHaveProperty('modelContractFailure');
    expect(workspace).not.toHaveProperty('modelContractSuccess');
  });
});
