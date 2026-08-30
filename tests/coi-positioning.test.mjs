import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..');

async function source(file) {
  return readFile(path.join(ROOT, file), 'utf8');
}

function section(sourceText, pattern, name) {
  const match = sourceText.match(pattern);
  assert.ok(match, `${name} missing`);
  return match[1];
}

function founderSection(home) {
  return section(home, /<section class="founder" id="kk">([\s\S]*?)<\/section>/, 'founder section');
}

function homepageProminentAreas(home) {
  return {
    metadata: section(home, /<head>([\s\S]*?)<\/head>/, 'homepage metadata'),
    hero: section(home, /<section class="hero">([\s\S]*?)<\/section>/, 'homepage hero'),
    manifesto: section(home, /<section class="manifesto" id="about">([\s\S]*?)<\/section>/, 'homepage manifesto'),
    footer: section(home, /<footer>([\s\S]*?)<\/footer>/, 'homepage footer'),
  };
}

test('founder conversion section does not leverage current institutional roles', async () => {
  const founder = founderSection(await source('index.html'));
  assert.doesNotMatch(founder, /CROWDY|BitPlanet|JB Financial/i);
  assert.doesNotMatch(founder, /Current Roles/i);
});

test('homepage prominent areas avoid privileged-access and unpublished-insight claims', async () => {
  const areas = homepageProminentAreas(await source('index.html'));
  const contradictoryClaims = /(?:exclusive|private)[^.!?<>]{0,80}intelligence|share(?:s|d|ing)? intelligence|intelligence exchange|best insights?[^.!?<>]{0,40}(?:never|not) published|핵심 인사이트[^.!?<>]{0,40}(?:결코|공개되지)|quiet conversations|조용한 대화/i;

  for (const [name, content] of Object.entries(areas)) {
    assert.doesNotMatch(content, contradictoryClaims, `${name} contains a contradictory access claim`);
  }
});

test('homepage positioning centers experienced peers, public-information perspectives, and trusted relationships', async () => {
  const areas = homepageProminentAreas(await source('index.html'));
  const prominentCopy = Object.values(areas).join('\n');

  assert.match(prominentCopy, /experienced finance professionals/i);
  assert.match(prominentCopy, /peer discussion/i);
  assert.match(prominentCopy, /public-information market perspectives/i);
  assert.match(prominentCopy, /trusted professional relationships/i);
});

test('founder notice states personal capacity and restricted-information boundary bilingually', async () => {
  const founder = founderSection(await source('index.html'));
  assert.match(founder, /personal capacity/i);
  assert.match(founder, /does not represent any company, board, or institution/i);
  assert.match(founder, /material non-public information/i);
  assert.match(founder, /inside information/i);
  assert.match(founder, /confidential/i);
  assert.match(founder, /개인 자격/);
  assert.match(founder, /회사·이사회·기관을 대표하지 않습니다/);
  assert.match(founder, /미공개 중요정보\s*\(내부자 정보\)/);
  assert.match(founder, /비밀정보/);
});

test('community marketing avoids access claims and states the information boundary bilingually', async () => {
  const community = await source('community.html');
  assert.doesNotMatch(community, /deal flow|딜플로우|sourced from real relationships/i);
  assert.match(community, /Peer Perspectives &amp; Case Discussions/);
  assert.match(community, /public information/i);
  assert.match(community, /does not permit confidential information, inside information, employer-owned information, or otherwise restricted information/i);
  assert.match(community, /기밀정보, 미공개 중요정보\s*\(내부자 정보\), 소속 기관 소유 정보 또는 그 밖의 제한정보/);
  assert.match(community, /twitter:description" content="[^"]*experienced finance professionals/i);
  assert.doesNotMatch(community, /twitter:description" content="[^"]*elite finance professionals/i);
});

test('membership benefits describe peer exchange without intelligence-access language', async () => {
  const pages = await Promise.all(['index.html', 'membership.html'].map(source));
  for (const page of pages) {
    assert.doesNotMatch(page, /Peer nomination &amp; intelligence exchange|동료 추천 &amp; 인텔리전스 교류/i);
    assert.match(page, /Peer introductions &amp; perspective exchange/);
  }
});
