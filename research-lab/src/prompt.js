import { getApprovedExperiences, renderExperienceContext } from './experiences.js';

function requirePrompt(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value.trim();
}

export function composeWriterPrompt({
  masterPrompt,
  universalPrompt,
  writingOsPrompt,
  candidate,
  dossier,
  experienceRegistry,
  experienceIds = [],
}) {
  const approvedExperiences = getApprovedExperiences(experienceRegistry, experienceIds);
  const sourceList = candidate.sources
    .map((source) => `- [${source.id}] ${source.title ?? source.url} | ${source.url}`)
    .join('\n');
  const factList = dossier.facts
    .map((fact) => `- [${fact.sourceId}] ${fact.claim}`)
    .join('\n');
  const numberList = dossier.numbers
    .map((number) => `- [${number.id}] ${number.display}: ${number.context} (source: ${number.sourceId})`)
    .join('\n');

  return [
    '# PRIORITY 1 — VERIFIED WEEKLY BRIEF',
    `STREAM: ${candidate.stream}`,
    `TOPIC: ${candidate.title}`,
    `CENTRAL CLAIM: ${candidate.centralClaim}`,
    `WHY NOW: ${dossier.whyNow}`,
    `COUNTERARGUMENT: ${dossier.counterargument}`,
    `FALSIFIER: ${dossier.falsifier}`,
    '',
    '## VERIFIED FACTS',
    factList,
    '',
    '## VERIFIED NUMBERS — use 2 or 3 only',
    numberList,
    '',
    '## SOURCES',
    sourceList,
    '',
    '## ALLOWED PERSONAL EXPERIENCE — exact scope only',
    renderExperienceContext(approvedExperiences),
    '',
    '# PRIORITY 2 — KK BLOG MASTER PROMPT',
    requirePrompt(masterPrompt, 'masterPrompt'),
    '',
    '# PRIORITY 3 — UNIVERSAL FORMAT ROUTER',
    requirePrompt(universalPrompt, 'universalPrompt'),
    '',
    '# PRIORITY 4 — WRITING QA RULES',
    requirePrompt(writingOsPrompt, 'writingOsPrompt'),
    '',
    '# OUTPUT CONTRACT',
    '- Return JSON only.',
    '- Keys: title, markdown, metaphor, factInterpretationPhrase, experienceClaims, verifiedNumberIds, citedSourceIds, investmentRelated.',
    '- Do not publish, edit site files, or invent missing evidence.',
    '- If the dossier is insufficient, return {"blocked": true, "reason": "..."}.',
  ].join('\n');
}
