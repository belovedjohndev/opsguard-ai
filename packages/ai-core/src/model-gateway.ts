import type { ModelGatewayError } from './model-errors.js';
import type {
  JsonValue,
  ModelRefusal,
  ModelSuccess,
  StructuredModelRequest,
} from './model-types.js';

export type ModelGatewayFailure = Readonly<{
  status: 'error';
  error: ModelGatewayError;
}>;

export type ModelGatewayResult<TOutput extends JsonValue> =
  ModelGatewayFailure | ModelRefusal | ModelSuccess<TOutput>;

export interface ModelGateway {
  generateStructured<TOutput extends JsonValue>(
    request: StructuredModelRequest<TOutput>,
  ): Promise<ModelGatewayResult<TOutput>>;
}

export const createModelGatewayFailure = (error: ModelGatewayError): ModelGatewayFailure =>
  Object.freeze({ status: 'error', error });
