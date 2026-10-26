// 2026 일정. 읽은 곳과 날: 2026-10-22에 아래 두 페이지의 본문에서 날짜를 직접 확인했다.
//   한국은행 통화정책방향 결정회의 일정 (2026년 회의일자 8건: 1/15 2/26 4/10 5/28 7/16 8/27 10/22 11/26)
//   Federal Reserve FOMC Calendars (2026: 10/27-28, 12/8-9*  *=경제전망 요약 발표 회의)
// 2026-10-27에 아래 회사 공식 페이지에서 실적 발표일을 직접 읽었다 (2026-10-27 KK 결정: 실적 발표일에 한해 기업 이름 허용).
//   SK하이닉스 뉴스룸 초대장 · 삼성전자 IR 페이지 · 현대차 IR 페이지 · Alphabet IR · Microsoft 뉴스 · Amazon 뉴스 · Apple IR 행사 페이지
// 읽었지만 이번 주가 아닌 곳: Meta(10/21에 이미 발표). 읽지 못한 곳: NVIDIA·Tesla·Broadcom IR(403), Apple 투자자 본페이지(날짜 없음, 행사 페이지에서 읽음).
// 접근하지 못해 넣지 않은 곳: 통계청(국가데이터처) 공표 일정(연결 끊김), BLS(403).
const BOK = {
  name: '한국은행 통화정책방향 결정회의 일정',
  url: 'https://www.bok.or.kr/portal/singl/crncyPolicyDrcMtg/listYear.do?mtgSe=A&menuNo=200755',
};
const FED = {
  name: 'Federal Reserve FOMC Calendars',
  url: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',
};

const SRC = {
  skhynix: { name: 'SK hynix Newsroom, Q3 2026 Earnings Conference Call Invitation', url: 'https://news.skhynix.com/en/q3-2026-earnings-conference-call-invitation/' },
  samsung: { name: '삼성전자 IR 페이지, IR 행사 예정 일정', url: 'https://www.samsung.com/sec/ir/' },
  hyundai: { name: 'Hyundai Motor Company IR, Upcoming', url: 'https://www.hyundai.com/worldwide/en/company/ir' },
  alphabet: { name: 'Alphabet Investor Relations, Date of Third Quarter 2026 Financial Results Conference Call', url: 'https://abc.xyz/investor/news/news-details/2026/Alphabet-Announces-Date-of-Third-Quarter-2026-Financial-Results-Conference-Call-2026-8tpGZsLS6v/default.aspx' },
  microsoft: { name: 'Microsoft Source, quarterly earnings release date', url: 'https://news.microsoft.com/source/2026/10/07/microsoft-announces-quarterly-earnings-release-date-69/' },
  amazon: { name: 'Amazon, Q3 2026 earnings', url: 'https://www.aboutamazon.com/md/news/company-news/amazon-earnings-q3-2026-report' },
  apple: { name: 'Apple Investor Relations, FY 26 Fourth Quarter Results', url: 'https://investor.apple.com/investor-relations/event-details/2026/FY-26-Fourth-Quarter-Results/default.aspx' },
};

export default {
  year: 2026,
  // 이 파일이 실제로 다루는 것과 아직 싣지 못한 것. 한가한 주를 "일정 없음"으로 단정하지 않으려고 화면에 그대로 쓴다.
  covers: ['한국은행 금통위', '미국 FOMC', '이름을 올린 기업의 실적 발표'],
  missing: ['통계청 주요 지표 발표', '미국 BLS 고용·물가 지표', '위에 없는 기업의 실적 발표'],
  items: [
    {
      id: '2026-10-22-bok-mpc',
      date: '2026-10-22',
      region: 'kr',
      title: '한국은행 금융통화위원회 통화정책방향 결정회의',
      note: '한국은행이 기준금리를 올리거나 내리거나 그대로 둘지 정하는 회의. 결과는 결정문으로 공개됩니다.',
      source: BOK,
      verifiedAt: '2026-10-22',
    },
    {
      id: '2026-10-28-fomc',
      date: '2026-10-28',
      region: 'us',
      title: '미국 FOMC 회의 (현지 10월 27~28일)',
      note: '미국 중앙은행(Fed)이 기준금리를 정하는 회의. 날짜는 미국 현지 기준이며, 한국에서는 결과가 보통 다음 날 새벽에 나옵니다.',
      source: FED,
      verifiedAt: '2026-10-22',
    },
    {
      id: '2026-10-28-skhynix-q3',
      date: '2026-10-28',
      region: 'kr',
      title: 'SK하이닉스 3분기 실적 발표',
      note: '7~9월 성적표. 오전 9시 전에 보도자료가 나오고 9시에 투자자 설명 전화회의(컨퍼런스콜)가 열립니다. 서울 시간.',
      source: SRC.skhynix,
      verifiedAt: '2026-10-27',
    },
    {
      id: '2026-10-28-alphabet-q3',
      date: '2026-10-28',
      region: 'us',
      title: 'Alphabet(구글 모회사) 3분기 실적 발표',
      note: '7~9월 성적표. 현지 오후 1시 30분(태평양시) 전화회의, 한국은 29일 새벽입니다.',
      source: SRC.alphabet,
      verifiedAt: '2026-10-27',
    },
    {
      id: '2026-10-28-microsoft-q1',
      date: '2026-10-28',
      region: 'us',
      title: 'Microsoft 회계 1분기 실적 발표',
      note: '이 회사의 회계연도는 7월에 시작해 7~9월이 1분기. 장 마감 후 발표, 현지 오후 2시 30분(태평양시) 전화회의, 한국은 29일 새벽입니다.',
      source: SRC.microsoft,
      verifiedAt: '2026-10-27',
    },
    {
      id: '2026-10-29-samsung-q3',
      date: '2026-10-29',
      region: 'kr',
      title: '삼성전자 3분기 실적 발표 전화회의',
      note: '7~9월 성적표를 투자자에게 설명하는 컨퍼런스콜. 삼성전자 IR 페이지에 오전 10시로 안내돼 있습니다.',
      source: SRC.samsung,
      verifiedAt: '2026-10-27',
    },
    {
      id: '2026-10-29-hyundai-q3',
      date: '2026-10-29',
      region: 'kr',
      title: '현대차 3분기 경영실적 발표',
      note: '7~9월 성적표. 현대차 IR 페이지의 예정 일정에 올라 있으며, 시각은 페이지에 적혀 있지 않습니다.',
      source: SRC.hyundai,
      verifiedAt: '2026-10-27',
    },
    {
      id: '2026-10-29-amazon-q3',
      date: '2026-10-29',
      region: 'us',
      title: 'Amazon 3분기 실적 발표',
      note: '7~9월 성적표. 현지 오후 2시(태평양시) 전화회의, 한국은 30일 새벽입니다.',
      source: SRC.amazon,
      verifiedAt: '2026-10-27',
    },
    {
      id: '2026-11-02-apple-q4',
      date: '2026-11-02',
      region: 'us',
      title: 'Apple 회계 4분기 실적 발표',
      note: '이 회사의 회계연도는 9월에 끝나 7~9월이 4분기. 현지 오후 2시(태평양시), 한국은 3일 아침입니다. 날짜는 미국 현지 기준.',
      source: SRC.apple,
      verifiedAt: '2026-10-27',
    },
    {
      id: '2026-11-26-bok-mpc',
      date: '2026-11-26',
      region: 'kr',
      title: '한국은행 금융통화위원회 통화정책방향 결정회의',
      note: '한국은행이 기준금리를 올리거나 내리거나 그대로 둘지 정하는 회의. 결과는 결정문으로 공개됩니다.',
      source: BOK,
      verifiedAt: '2026-10-22',
    },
    {
      id: '2026-12-09-fomc',
      date: '2026-12-09',
      region: 'us',
      title: '미국 FOMC 회의 (현지 12월 8~9일)',
      note: '날짜는 미국 현지 기준. 참가자들의 금리·성장률·물가 전망을 모은 경제전망 요약도 함께 나옵니다.',
      source: FED,
      verifiedAt: '2026-10-22',
    },
  ],
};
