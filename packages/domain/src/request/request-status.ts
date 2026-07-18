export const requestStatuses = [
  'received',
  'assessing',
  'needs_information',
  'pending_review',
  'rejected',
  'completed',
  'failed',
] as const;

export type RequestStatus = (typeof requestStatuses)[number];

export const terminalRequestStatuses = [
  'rejected',
  'completed',
  'failed',
] as const satisfies readonly RequestStatus[];

const allowedTransitions = {
  received: ['assessing', 'failed'],
  assessing: ['needs_information', 'pending_review', 'rejected', 'completed', 'failed'],
  needs_information: ['assessing', 'failed'],
  pending_review: ['assessing', 'needs_information', 'rejected', 'completed', 'failed'],
  rejected: [],
  completed: [],
  failed: [],
} as const satisfies Readonly<Record<RequestStatus, readonly RequestStatus[]>>;

const requestStatusSet: ReadonlySet<string> = new Set(requestStatuses);
const terminalRequestStatusSet: ReadonlySet<RequestStatus> = new Set(terminalRequestStatuses);

export const isRequestStatus = (value: string): value is RequestStatus =>
  requestStatusSet.has(value);

export const isTerminalRequestStatus = (status: RequestStatus): boolean =>
  terminalRequestStatusSet.has(status);

export const isAllowedRequestTransition = (
  currentStatus: RequestStatus,
  attemptedStatus: RequestStatus,
): boolean =>
  (allowedTransitions[currentStatus] as readonly RequestStatus[]).includes(attemptedStatus);
