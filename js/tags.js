// Tags for KK ORIGINAL posts (2026-10-26 KK): a few free words per post, shown under the title and
// used as hashtags when the post is shared to Instagram, LinkedIn and Facebook.
//
// Rules, kept identical on the editor, the API (server/src/routes/original.js has the same function)
// and the share feeds. tests/original-tags.test.mjs holds both copies to the same cases.
//   - leading "#" is dropped, spaces inside a tag are dropped ("AI 인프라" -> "AI인프라")
//   - letters (Hangul, Latin), digits and underscore only, 1 to 30 characters
//   - duplicates ignored (case-insensitive), at most 5 tags
export const MAX_TAGS = 5;
export const MAX_TAG_LENGTH = 30;
const TAG_PATTERN = /^[\p{L}\p{N}_]{1,30}$/u;

/** Turns "#AI, 데이터센터 ,ai" or ["#AI", "데이터센터"] into ["AI", "데이터센터"]. */
export function parseTags(input) {
  const parts = Array.isArray(input) ? input : String(input ?? '').split(/[,，、\n]/);
  const seen = new Set();
  const tags = [];
  for (const part of parts) {
    const tag = String(part ?? '').trim().replace(/^#+/, '').replace(/\s+/g, '');
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
}

/** The first problem with a parsed tag list, or '' when it is fine. */
export function tagProblem(tags) {
  if (tags.length > MAX_TAGS) return `태그는 최대 ${MAX_TAGS}개까지 쓸 수 있습니다.`;
  const bad = tags.find((tag) => !TAG_PATTERN.test(tag));
  if (bad) return `태그 "${bad}"를 쓸 수 없습니다. 글자·숫자·밑줄(_)만 쓰고 ${MAX_TAG_LENGTH}자 이하로 적어 주세요.`;
  return '';
}

export const hashtags = (tags) => parseTags(tags).filter((tag) => TAG_PATTERN.test(tag)).map((tag) => `#${tag}`);
