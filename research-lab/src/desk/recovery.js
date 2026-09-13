export const DESK_STAGES = ['scan', 'rank', 'research', 'write', 'edit'];

export function recoveryPlan(existing = []) {
  const present = new Set(existing);
  const firstMissing = DESK_STAGES.findIndex(stage => !present.has(stage));
  return firstMissing < 0 ? [] : DESK_STAGES.slice(firstMissing);
}

export function completedEdit(edit) {
  return edit?.review?.passed === true && edit?.notified === true;
}
