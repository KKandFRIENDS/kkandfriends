import { INVESTMENT_DISCLAIMER } from '../src/constants.js';

const approvedInternshipClaim =
  '1996년 JP Morgan Summer Associate Internship Program에 참석해 인턴으로 JP Morgan 경력을 시작했다.';

export const sampleExperienceRegistry = {
  schema_version: 1,
  policy: { default: 'deny' },
  experiences: [
    {
      id: 'career-jpm-hong-kong-start',
      status: 'approved',
      allowed_claims: [approvedInternshipClaim],
      do_not_infer: ['담당 상품', '고객', '손익'],
    },
    {
      id: 'unapproved-example',
      status: 'published_candidate',
      allowed_claims: [],
      do_not_infer: [],
    },
  ],
};

function source(id, suffix) {
  return {
    id,
    type: 'primary',
    title: `Synthetic primary fixture ${suffix}`,
    url: `https://example.test/${suffix}`,
  };
}

function dossier(sourceId, experienceIds = []) {
  return {
    whyNow: '제도와 자본 배분의 변화가 일반 독자의 비용과 선택에 직접 영향을 주기 때문이다.',
    counterargument: '현재 변화는 일시적 투자 사이클이며 장기 구조 변화로 보기 이르다는 반론이 있다.',
    falsifier: '향후 네 분기 동안 실제 이용량과 현금흐름이 함께 감소하면 중심 주장은 틀린다.',
    facts: [
      { claim: 'Fixture에서 검증된 첫 번째 사실', sourceId, status: 'verified' },
      { claim: 'Fixture에서 검증된 두 번째 사실', sourceId, status: 'verified' },
    ],
    numbers: [
      { id: `${sourceId}-n1`, display: '42%', context: '합성 fixture의 첫 번째 수치', sourceId },
      { id: `${sourceId}-n2`, display: '18개월', context: '합성 fixture의 두 번째 수치', sourceId },
    ],
    experienceIds,
  };
}

function candidate(id, stream, score, experienceIds = []) {
  const sourceId = `${id}-source`;
  return {
    id,
    stream,
    title: `${stream} 분야 합성 테스트 주제`,
    centralClaim: `${stream}의 변화는 기술 뉴스가 아니라 자본 배분 구조의 변화다.`,
    scores: {
      publicRelevance: score,
      significance: score,
      evidenceQuality: score,
      newInsight: score,
      kkFit: score,
      timeliness: score,
    },
    sources: [source(sourceId, id)],
    duplicateOf: null,
    conflictStatus: 'clear',
    dossier: dossier(sourceId, experienceIds),
  };
}

export const sampleCandidates = [
  candidate('ai-1', 'AI', 9.4, ['career-jpm-hong-kong-start']),
  candidate('macro-1', 'Macro', 9.1),
  candidate('equity-1', 'Equity', 8.6),
  candidate('digital-1', 'Digital Assets', 8.3),
  candidate('korea-1', 'Korea', 8.0),
];

function expandedBody(start, count) {
  return Array.from({ length: count }, (_, offset) => {
    const index = start + offset;
    return `검증 구간 ${index}의 자료는 이야기와 현금흐름이 갈라지는 지점을 보여준다. 관찰 ${index}에서 중요한 것은 발표문의 크기가 아니라 비용을 누가 부담하고 이익을 누가 가져가는지다. 시장 참여자는 사례 ${index}의 숫자를 독립적으로 읽어야 기대가 가격을 앞질렀는지 판단할 수 있다.`;
  }).join('\n\n');
}

function validDraft(candidate, experienceClaims = []) {
  const sourceId = `${candidate.id}-source`;
  return {
    title: candidate.title,
    metaphor: candidate.id === 'ai-1' ? '교차로의 신호등' : '수위가 바뀌는 갑문',
    factInterpretationPhrase: '여기까지는 확인된 자료이고, 다음 문단은 그 구조를 읽은 판단이다.',
    experienceClaims,
    verifiedNumberIds: [`${sourceId}-n1`, `${sourceId}-n2`],
    citedSourceIds: [sourceId],
    investmentRelated: true,
    markdown: [
      `# ${candidate.title}`,
      '',
      '결론부터 말하면, 이번 변화는 제품 경쟁이 아니라 자본 배분의 경로가 바뀌는 사건이다.',
      '',
      '## 숫자가 먼저 가리키는 곳',
      '',
      '합성 fixture의 검증 수치는 42%와 18개월이다. 실제 운영에서는 dossier의 primary source가 이 자리를 채운다.',
      '',
      expandedBody(1, 14),
      '',
      '여기까지는 확인된 자료이고, 다음 문단은 그 구조를 읽은 판단이다.',
      '',
      '**Bottom line:** Follow the cash flow, not the headline.',
      '',
      '## 시장의 언어가 짧은 이유',
      '',
      ...experienceClaims,
      expandedBody(15, 4),
      '',
      '💡 **수치가 움직일 때 이야기보다 현금흐름을 먼저 확인한다.**',
      '',
      '가격은 기대를 먼저 사고, 장부는 결과를 나중에 적는다.',
      '',
      'By KK · Chief of KKandFriends',
      '',
      INVESTMENT_DISCLAIMER,
    ].join('\n'),
  };
}

export const sampleDrafts = {
  'ai-1': validDraft(sampleCandidates[0], [approvedInternshipClaim]),
  'macro-1': validDraft(sampleCandidates[1]),
};

export const sampleWeekInput = {
  weekKey: '2099-W01-SYNTHETIC',
  candidates: sampleCandidates,
  draftsByCandidateId: sampleDrafts,
  experienceRegistry: sampleExperienceRegistry,
  usedMetaphors: ['장부와 지우개'],
};
