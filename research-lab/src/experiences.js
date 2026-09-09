import { ContractError } from './errors.js';

export function getApprovedExperiences(registry, requestedIds = []) {
  if (!registry || !Array.isArray(registry.experiences)) {
    throw new ContractError('Experience registry is invalid', ['experiences']);
  }

  const byId = new Map(registry.experiences.map((experience) => [experience.id, experience]));
  return requestedIds.map((id) => {
    const experience = byId.get(id);
    if (!experience) {
      throw new ContractError(`Unknown experience: ${id}`, [id]);
    }
    if (experience.status !== 'approved') {
      throw new ContractError(`Experience is not approved: ${id}`, [experience.status]);
    }
    if (!Array.isArray(experience.allowed_claims) || experience.allowed_claims.length === 0) {
      throw new ContractError(`Approved experience has no allowed claims: ${id}`, [id]);
    }
    return experience;
  });
}

export function flattenAllowedClaims(experiences) {
  return experiences.flatMap((experience) =>
    experience.allowed_claims.map((claim) => ({
      experienceId: experience.id,
      claim,
    })),
  );
}

export function renderExperienceContext(experiences) {
  if (experiences.length === 0) {
    return '사용 가능한 1인칭 경험 없음. 경험을 창작하지 말 것.';
  }

  return experiences
    .flatMap((experience) => [
      `[${experience.id}]`,
      ...experience.allowed_claims.map((claim) => `- ${claim}`),
      `- 금지 추론: ${(experience.do_not_infer ?? []).join(' / ') || '없음'}`,
    ])
    .join('\n');
}
