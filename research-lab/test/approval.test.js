import test from 'node:test';
import assert from 'node:assert/strict';
import { ContractError } from '../src/errors.js';
import {
  hashApprovalToken,
  issueApprovalToken,
  transitionDraft,
  verifyApprovalToken,
} from '../src/approval.js';

const now = new Date('2099-01-02T06:00:00.000Z');

function deterministicBytes() {
  return Buffer.from('00112233445566778899aabbccddeeff', 'hex');
}

test('approval token is 128-bit, stored as a hash, and timing-safe verifiable', () => {
  const issued = issueApprovalToken({ randomBytesFn: deterministicBytes });
  assert.equal(Buffer.from(issued.token, 'base64url').length, 16);
  assert.equal(issued.tokenHash, hashApprovalToken(issued.token));
  assert.equal(verifyApprovalToken(issued.token, issued.tokenHash), true);
  assert.equal(verifyApprovalToken('wrong', issued.tokenHash), false);
});

test('approval requires the same content hash and consumes the token', () => {
  const issued = issueApprovalToken({ randomBytesFn: deterministicBytes });
  const requested = transitionDraft(
    { id: 'draft-1', status: 'verified', contentHash: 'content-a' },
    { type: 'request_approval', tokenHash: issued.tokenHash, expiresAt: '2099-01-02T12:00:00.000Z' },
    { now },
  );
  assert.throws(
    () => transitionDraft(requested, { type: 'approve', token: issued.token, contentHash: 'changed' }, { now }),
    ContractError,
  );
  const approved = transitionDraft(
    requested,
    { type: 'approve', token: issued.token, contentHash: 'content-a' },
    { now },
  );
  assert.equal(approved.status, 'approved');
  assert.equal(approved.approvalTokenHash, null);
  assert.throws(
    () => transitionDraft(approved, { type: 'approve', token: issued.token, contentHash: 'content-a' }, { now }),
    ContractError,
  );
});

test('silence expires and never becomes approval', () => {
  const issued = issueApprovalToken({ randomBytesFn: deterministicBytes });
  const requested = transitionDraft(
    { id: 'draft-1', status: 'verified', contentHash: 'content-a' },
    { type: 'request_approval', tokenHash: issued.tokenHash, expiresAt: '2099-01-02T07:00:00.000Z' },
    { now },
  );
  const expired = transitionDraft(requested, { type: 'expire' }, {
    now: new Date('2099-01-02T07:00:00.000Z'),
  });
  assert.equal(expired.status, 'expired');
});

test('scheduled draft cannot publish early and one attempt owns completion', () => {
  const approved = {
    id: 'draft-1',
    status: 'approved',
    contentHash: 'content-a',
    approvedContentHash: 'content-a',
  };
  const scheduled = transitionDraft(
    approved,
    { type: 'schedule', scheduledFor: '2099-01-03T00:00:00.000Z' },
    { now },
  );
  assert.throws(
    () => transitionDraft(scheduled, { type: 'begin_publish', attemptId: 'attempt-1' }, { now }),
    ContractError,
  );
  const publishing = transitionDraft(
    scheduled,
    { type: 'begin_publish', attemptId: 'attempt-1' },
    { now: new Date('2099-01-03T00:00:00.000Z') },
  );
  assert.throws(
    () => transitionDraft(publishing, { type: 'publish_succeeded', attemptId: 'attempt-2' }),
    ContractError,
  );
  const published = transitionDraft(
    publishing,
    {
      type: 'publish_succeeded',
      attemptId: 'attempt-1',
      gitSha: 'abc123',
      publicUrl: 'https://example.test/post',
    },
    { now: new Date('2099-01-03T00:01:00.000Z') },
  );
  assert.equal(published.status, 'published');
});
