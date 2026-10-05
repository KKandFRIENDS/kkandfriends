// Reuse the fenced RPCs: never overwrite a ready run or another active worker.
export async function recordRunFailure(store, { date, attempt, claimed, stage, reason, error }) {
  if (!attempt) return false;
  if (!claimed && !await store.rpc('editorial_claim', { p_date: date, p_attempt: attempt })) return false;
  await store.rpc('editorial_finish', {
    p_date: date, p_attempt: attempt, p_payload: null, p_hash: null,
    p_detail: { stage, error, reason },
  });
  return true;
}
