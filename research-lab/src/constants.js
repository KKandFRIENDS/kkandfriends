export const STREAMS = Object.freeze([
  'Macro',
  'AI',
  'Equity',
  'Digital Assets',
  'Korea',
]);

export const SCORE_WEIGHTS = Object.freeze({
  publicRelevance: 25,
  significance: 20,
  evidenceQuality: 20,
  newInsight: 15,
  kkFit: 10,
  timeliness: 10,
});

export const DEFAULT_MIN_SCORE = 70;

export const INVESTMENT_DISCLAIMER =
  '본 자료는 정보 제공 목적이며 특정 자산의 매수·매도 권유가 아닙니다. 모든 투자 판단과 책임은 투자자 본인에게 있습니다.';

export const BANNED_LITERAL_PHRASES = Object.freeze([
  'Skin in the game',
  'Skin in the Game',
  '이건 내 해석이지, 공식 전망이 아니다',
]);
