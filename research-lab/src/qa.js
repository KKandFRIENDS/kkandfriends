import {
  BANNED_LITERAL_PHRASES,
  INVESTMENT_DISCLAIMER,
} from './constants.js';
import { flattenAllowedClaims, getApprovedExperiences } from './experiences.js';

function countOccurrences(text, needle) {
  if (!needle) return 0;
  return text.split(needle).length - 1;
}

export function countContentCharacters(markdown) {
  return [...markdown].filter((character) => /[\p{L}\p{N}]/u.test(character)).length;
}

function normalizeMetaphor(value) {
  return value.trim().toLocaleLowerCase('ko-KR').replace(/\s+/g, ' ');
}

function findRepeatedLongSentences(markdown) {
  const counts = new Map();
  const sentences = markdown
    .replace(/^#+\s+/gm, '')
    .split(/[.!?。]\s*/)
    .map((sentence) => sentence.replace(/\s+/g, ' ').trim())
    .filter((sentence) => sentence.length >= 30);
  for (const sentence of sentences) counts.set(sentence, (counts.get(sentence) ?? 0) + 1);
  return [...counts.entries()].filter(([, count]) => count > 2);
}

function findDuplicateParagraphs(markdown) {
  const counts = new Map();
  const paragraphs = markdown
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter((paragraph) => paragraph.length >= 80);
  for (const paragraph of paragraphs) counts.set(paragraph, (counts.get(paragraph) ?? 0) + 1);
  return [...counts.entries()].filter(([, count]) => count > 1);
}

export function verifyDraft({
  draft,
  dossier,
  experienceRegistry,
  requestedExperienceIds = [],
  usedMetaphors = [],
  lengthRange = { min: 2000, max: 3000 },
}) {
  const errors = [];
  const warnings = [];
  const markdown = typeof draft?.markdown === 'string' ? draft.markdown : '';

  if (!draft || typeof draft !== 'object') errors.push('draft_missing');
  if (!markdown.trim()) errors.push('markdown_missing');
  if (typeof draft?.title !== 'string' || !draft.title.trim()) errors.push('title_missing');
  if (typeof draft?.metaphor !== 'string' || !draft.metaphor.trim()) errors.push('metaphor_missing');
  if (typeof draft?.factInterpretationPhrase !== 'string' || !draft.factInterpretationPhrase.trim()) {
    errors.push('fact_interpretation_phrase_missing');
  }

  const contentCharacters = countContentCharacters(markdown);
  if (contentCharacters < lengthRange.min) errors.push('draft_too_short');
  if (contentCharacters > lengthRange.max) errors.push('draft_too_long');

  if (countOccurrences(markdown, 'Bottom line:') !== 1) errors.push('bottom_line_count');
  if (countOccurrences(markdown, '💡') !== 1) errors.push('insight_icon_count');
  if (!markdown.includes('By KK · Chief of KKandFriends')) errors.push('byline_missing');
  if (markdown.includes('[확인 필요]')) errors.push('unresolved_verification_marker');
  if (
    draft?.factInterpretationPhrase &&
    countOccurrences(markdown, draft.factInterpretationPhrase) !== 1
  ) {
    errors.push('fact_interpretation_phrase_not_used_once');
  }

  if (findRepeatedLongSentences(markdown).length > 0) errors.push('repeated_sentence');
  if (findDuplicateParagraphs(markdown).length > 0) errors.push('duplicate_paragraph');

  for (const phrase of BANNED_LITERAL_PHRASES) {
    if (markdown.toLocaleLowerCase('en-US').includes(phrase.toLocaleLowerCase('en-US'))) {
      errors.push(`banned_phrase:${phrase}`);
    }
  }

  const firstContentLine = markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('#'));
  if (/^(최근|요즘|오늘날|안녕하세요|이번 글에서는)/.test(firstContentLine ?? '')) {
    errors.push('generic_opener');
  }

  if (draft.investmentRelated && !markdown.includes(INVESTMENT_DISCLAIMER)) {
    errors.push('investment_disclaimer_missing');
  }

  const normalizedUsedMetaphors = new Set(usedMetaphors.map(normalizeMetaphor));
  if (draft.metaphor && normalizedUsedMetaphors.has(normalizeMetaphor(draft.metaphor))) {
    errors.push('metaphor_reused');
  }

  const approvedExperiences = getApprovedExperiences(experienceRegistry, requestedExperienceIds);
  const allowedClaims = new Set(flattenAllowedClaims(approvedExperiences).map(({ claim }) => claim));
  for (const claim of draft.experienceClaims ?? []) {
    if (!allowedClaims.has(claim)) errors.push(`unapproved_experience_claim:${claim}`);
    if (countOccurrences(markdown, claim) !== 1) {
      errors.push(`experience_claim_not_used_once:${claim}`);
    }
  }
  if ((draft.experienceClaims ?? []).length === 0) {
    warnings.push('no_personal_experience_used');
  }

  const validNumberIds = new Set(dossier.numbers.map((number) => number.id));
  const usedNumberIds = draft.verifiedNumberIds ?? [];
  if (usedNumberIds.length < 2 || usedNumberIds.length > 3) errors.push('verified_number_count');
  for (const id of usedNumberIds) {
    if (!validNumberIds.has(id)) errors.push(`unknown_verified_number:${id}`);
    const number = dossier.numbers.find((item) => item.id === id);
    if (number && !markdown.includes(number.display)) {
      errors.push(`verified_number_not_in_draft:${id}`);
    }
  }

  const validSourceIds = new Set(dossier.facts.map((fact) => fact.sourceId));
  for (const number of dossier.numbers) validSourceIds.add(number.sourceId);
  for (const id of draft.citedSourceIds ?? []) {
    if (!validSourceIds.has(id)) errors.push(`unknown_cited_source:${id}`);
  }
  if (!Array.isArray(draft.citedSourceIds) || draft.citedSourceIds.length === 0) {
    errors.push('citations_missing');
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
    metrics: {
      contentCharacters,
      verifiedNumberCount: usedNumberIds.length,
      citationCount: draft.citedSourceIds?.length ?? 0,
      experienceClaimCount: draft.experienceClaims?.length ?? 0,
    },
  };
}
