export const DESK_STAGES = ['scan', 'rank', 'research', 'write', 'edit'];

export function recoveryPlan(existing = []) {
  const present = new Set(existing);
  const firstMissing = DESK_STAGES.findIndex(stage => !present.has(stage));
  return firstMissing < 0 ? [] : DESK_STAGES.slice(firstMissing);
}

export function prepareRecoveryScan(scan, plan, attempt, recoveredAt = new Date().toISOString()) {
  if (!scan || !Array.isArray(plan) || !plan.includes('edit')) return scan;
  if (!/^[a-f0-9-]{36}$/.test(attempt || '')) throw new Error('Invalid recovery attempt');
  return { ...scan, recoveryOf: scan.attempt, attempt, recoveredAt };
}

export function completedEdit(edit) {
  return edit?.review?.passed === true && edit?.notified === true;
}
