import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { ContractError } from './errors.js';

export const DRAFT_STATUSES = Object.freeze([
  'verified',
  'awaiting_approval',
  'approved',
  'rejected',
  'expired',
  'scheduled',
  'publishing',
  'published',
  'publish_failed',
]);

export function hashApprovalToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function issueApprovalToken({ randomBytesFn = randomBytes } = {}) {
  const token = randomBytesFn(16).toString('base64url');
  return { token, tokenHash: hashApprovalToken(token) };
}

export function verifyApprovalToken(token, expectedHash) {
  if (typeof token !== 'string' || typeof expectedHash !== 'string') return false;
  const actual = Buffer.from(hashApprovalToken(token), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function requireStatus(draft, expected, eventType) {
  if (draft.status !== expected) {
    throw new ContractError(`Cannot ${eventType} from ${draft.status}`, [
      `expected=${expected}`,
      `actual=${draft.status}`,
    ]);
  }
}

export function transitionDraft(draft, event, { now = new Date() } = {}) {
  if (!DRAFT_STATUSES.includes(draft.status)) {
    throw new ContractError('Unknown draft status', [String(draft.status)]);
  }
  const timestamp = now.toISOString();

  switch (event.type) {
    case 'request_approval': {
      requireStatus(draft, 'verified', event.type);
      if (!event.tokenHash || !event.expiresAt) {
        throw new ContractError('Approval request requires tokenHash and expiresAt');
      }
      return {
        ...draft,
        status: 'awaiting_approval',
        approvalTokenHash: event.tokenHash,
        approvalExpiresAt: new Date(event.expiresAt).toISOString(),
        approvalRequestedAt: timestamp,
      };
    }
    case 'approve': {
      requireStatus(draft, 'awaiting_approval', event.type);
      if (now.getTime() >= new Date(draft.approvalExpiresAt).getTime()) {
        throw new ContractError('Approval token has expired', ['expired']);
      }
      if (!verifyApprovalToken(event.token, draft.approvalTokenHash)) {
        throw new ContractError('Approval token is invalid', ['invalid_token']);
      }
      if (event.contentHash !== draft.contentHash) {
        throw new ContractError('Draft changed after approval request', ['content_hash_mismatch']);
      }
      return {
        ...draft,
        status: 'approved',
        approvedAt: timestamp,
        approvedContentHash: event.contentHash,
        approvalTokenHash: null,
      };
    }
    case 'reject': {
      requireStatus(draft, 'awaiting_approval', event.type);
      if (!verifyApprovalToken(event.token, draft.approvalTokenHash)) {
        throw new ContractError('Approval token is invalid', ['invalid_token']);
      }
      return {
        ...draft,
        status: 'rejected',
        rejectedAt: timestamp,
        rejectionReason: event.reason ?? null,
        approvalTokenHash: null,
      };
    }
    case 'expire': {
      requireStatus(draft, 'awaiting_approval', event.type);
      if (now.getTime() < new Date(draft.approvalExpiresAt).getTime()) {
        throw new ContractError('Approval is not expired yet', ['not_expired']);
      }
      return { ...draft, status: 'expired', expiredAt: timestamp, approvalTokenHash: null };
    }
    case 'schedule': {
      requireStatus(draft, 'approved', event.type);
      if (draft.approvedContentHash !== draft.contentHash) {
        throw new ContractError('Approved content changed before scheduling', ['content_hash_mismatch']);
      }
      const scheduledFor = new Date(event.scheduledFor);
      if (Number.isNaN(scheduledFor.getTime()) || scheduledFor.getTime() <= now.getTime()) {
        throw new ContractError('scheduledFor must be in the future', ['scheduledFor']);
      }
      return { ...draft, status: 'scheduled', scheduledFor: scheduledFor.toISOString() };
    }
    case 'begin_publish': {
      requireStatus(draft, 'scheduled', event.type);
      if (now.getTime() < new Date(draft.scheduledFor).getTime()) {
        throw new ContractError('Draft is not due yet', ['not_due']);
      }
      if (draft.publishedAt) throw new ContractError('Draft is already published', ['publishedAt']);
      return {
        ...draft,
        status: 'publishing',
        publishAttemptId: event.attemptId,
        publishStartedAt: timestamp,
      };
    }
    case 'publish_succeeded': {
      requireStatus(draft, 'publishing', event.type);
      if (event.attemptId !== draft.publishAttemptId) {
        throw new ContractError('Publish attempt does not own this draft', ['attempt_id_mismatch']);
      }
      return {
        ...draft,
        status: 'published',
        publishedAt: timestamp,
        gitSha: event.gitSha,
        publicUrl: event.publicUrl,
      };
    }
    case 'publish_failed': {
      requireStatus(draft, 'publishing', event.type);
      if (event.attemptId !== draft.publishAttemptId) {
        throw new ContractError('Publish attempt does not own this draft', ['attempt_id_mismatch']);
      }
      return { ...draft, status: 'publish_failed', publishFailedAt: timestamp, errorCode: event.errorCode };
    }
    case 'retry_publish': {
      requireStatus(draft, 'publish_failed', event.type);
      if (draft.publishedAt) throw new ContractError('Published draft cannot be retried', ['publishedAt']);
      return { ...draft, status: 'scheduled', scheduledFor: now.toISOString(), publishAttemptId: null };
    }
    default:
      throw new ContractError(`Unknown draft event: ${event.type}`, [event.type]);
  }
}
