// Heading fonts for server-rendered article pages (2026-11-06 KK: 사이트에
// 올라가는 글은 같은 규칙). THOUGHTS posts, the editors' previews and member
// pages already load Playfair Display + Noto Serif KR, so Korean headings there
// are Noto Serif KR. /original, /desk, /markets and /week did not, and their
// Korean headings fell back to Pretendard. Every published article now loads
// the same pair. The homepage stays without it (tests/performance.test.mjs).
export const ARTICLE_FONT_LINKS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800&family=Noto+Serif+KR:wght@400;500;700&display=swap">`;
