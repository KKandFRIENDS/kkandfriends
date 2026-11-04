// 2026 일정. 읽은 곳과 날: 2026-10-22에 아래 두 페이지의 본문에서 날짜를 직접 확인했다.
//   한국은행 통화정책방향 결정회의 일정 (2026년 회의일자 8건: 1/15 2/26 4/10 5/28 7/16 8/27 10/22 11/26)
//   Federal Reserve FOMC Calendars (2026: 10/27-28, 12/8-9*  *=경제전망 요약 발표 회의)
// 2026-10-27에 아래 회사 공식 페이지에서 실적 발표일을 직접 읽었다 (2026-10-27 KK 결정: 실적 발표일에 한해 기업 이름 허용).
//   SK하이닉스 뉴스룸 초대장 · 삼성전자 IR 페이지 · 현대차 IR 페이지 · Alphabet IR · Microsoft 뉴스 · Amazon 뉴스 · Apple IR 행사 페이지
// 읽었지만 이번 주가 아닌 곳: Meta(10/21에 이미 발표). 읽지 못한 곳: NVIDIA·Tesla·Broadcom IR(403), Apple 투자자 본페이지(날짜 없음, 행사 페이지에서 읽음).
// 2026-11-04에 아래 세 페이지의 본문에서 11~12월 날짜와 시각을 직접 읽었다 (KK 승인: 지표 일정 확대).
//   국가데이터처(옛 통계청) 월간 보도계획 11월·12월 (oa_mm=11, oa_mm=12)
//   한국은행 월간통계공표일정 목록 (시각은 매체 보도 가능 시각)
//   미국 BEA News Release Schedule (미국 동부시간, 11/1 서머타임 종료 뒤라 한국은 +14시간)
// 2026-11-04에 읽지 못해 넣지 않은 곳: BLS(403), 미국 인구조사국 달력(2027년 1월부터만 보임), 관세청·FRED(응답 없음),
//   거래소 휴장일(데이터를 못 받음), ISM(로그인), NVIDIA·Tesla·Meta·Broadcom IR(403 또는 빈 달력).
//   FOMC 의사록은 발표 뒤에야 날짜가 올라와 미리 넣을 수 없다(계산으로 채우지 않는다).
const KOSTAT = {
  name: '국가데이터처 월간 보도계획',
  url: 'https://mods.go.kr/newsPln.es?mid=a10305000000',
};
const BOK_STATS = {
  name: '한국은행 월간통계공표일정',
  url: 'https://www.bok.or.kr/portal/stats/statsPublictSchdul/listCldr.do?menuNo=200775',
};
const BEA = {
  name: 'U.S. Bureau of Economic Analysis, News Release Schedule',
  url: 'https://www.bea.gov/news/schedule',
};
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
  covers: ['한국은행 금통위', '미국 FOMC', '국가데이터처 주요 통계', '한국은행 주요 통계', '미국 BEA 지표', '이름을 올린 기업의 실적 발표'],
  missing: ['미국 BLS 고용·물가 지표', '미국 인구조사국 소매판매', '수출입 동향', '거래소 휴장·만기일', 'FOMC 의사록', '위에 없는 기업의 실적 발표'],
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
    // ── 지표 발표 일정 (2026-11-04 확대) ──
    ...[
      ['2026-11-03', '08:00', 'cpi', '10월 소비자물가동향', '생활에 쓰는 물건과 서비스 값이 1년 전보다 얼마나 올랐는지 보여주는 대표 물가 지표입니다.'],
      ['2026-11-11', '08:00', 'employment', '10월 고용동향', '취업자 수와 실업률로 일자리가 늘었는지 줄었는지 보여줍니다.'],
      ['2026-11-25', '12:00', 'population', '9월 인구동향', '한 달 동안의 출생아 수, 사망자 수, 혼인 건수를 집계합니다.'],
      ['2026-11-26', '12:00', 'household', '3분기 가계동향조사', '7~9월 가구의 소득과 지출이 얼마였는지 보여줍니다.'],
      ['2026-11-30', '08:00', 'industry', '10월 산업활동동향', '생산, 소비(소매판매), 투자가 한 달 전보다 늘었는지 한 번에 보여줍니다.'],
      ['2026-12-02', '08:00', 'cpi', '11월 소비자물가동향', '생활에 쓰는 물건과 서비스 값이 1년 전보다 얼마나 올랐는지 보여주는 대표 물가 지표입니다.'],
      ['2026-12-03', '12:00', 'household-finance', '2026년 가계금융복지조사', '가구의 자산, 부채, 소득을 1년에 한 번 조사한 결과입니다.'],
      ['2026-12-10', '12:00', 'population-projection', '장래인구추계 2025~2075년', '앞으로 50년 동안 인구가 어떻게 바뀔지 내다본 공식 추계입니다.'],
      ['2026-12-16', '08:00', 'employment', '11월 고용동향', '취업자 수와 실업률로 일자리가 늘었는지 줄었는지 보여줍니다.'],
      ['2026-12-23', '12:00', 'population', '10월 인구동향', '한 달 동안의 출생아 수, 사망자 수, 혼인 건수를 집계합니다.'],
      ['2026-12-30', '08:00', 'industry', '11월 산업활동동향', '생산, 소비(소매판매), 투자가 한 달 전보다 늘었는지 한 번에 보여줍니다.'],
      ['2026-12-31', '08:00', 'cpi', '12월 및 연간 소비자물가동향', '12월 물가와 함께 2026년 한 해 물가 상승률이 나옵니다.'],
    ].map(([date, time, key, title, note]) => ({
      id: `${date}-kostat-${key}`, date, time, region: 'kr', title,
      note: `국가데이터처(옛 통계청) 발표. ${note}`, source: KOSTAT, verifiedAt: '2026-11-04',
    })),
    ...[
      ['2026-11-05', '08:00', 'balance', '9월 국제수지(잠정)', '수출입과 해외 투자로 나라 전체에 달러가 얼마나 들어오고 나갔는지 보여줍니다.'],
      ['2026-11-13', '12:00', 'money', '9월 통화 및 유동성', '시중에 풀린 돈의 양이 얼마나 늘었는지 보여줍니다.'],
      ['2026-11-18', '12:00', 'household-credit', '3분기 가계신용(잠정)', '가계가 금융회사 대출과 카드 외상으로 진 빚이 9월 말 기준 얼마인지 보여줍니다.'],
      ['2026-11-20', '06:00', 'ppi', '10월 생산자물가지수(잠정)', '기업끼리 사고파는 물건과 서비스의 값이 얼마나 바뀌었는지 보여줍니다.'],
      ['2026-11-24', '06:00', 'consumer-survey', '11월 소비자동향조사', '가계가 경기와 살림살이를 얼마나 좋게 보는지(소비자심리지수) 보여줍니다.'],
      ['2026-11-25', '06:00', 'business-survey', '11월 기업경기조사·경제심리지수', '기업이 느끼는 경기와, 가계·기업을 합친 경제심리를 보여줍니다.'],
      ['2026-12-08', '08:00', 'balance', '10월 국제수지(잠정)', '수출입과 해외 투자로 나라 전체에 달러가 얼마나 들어오고 나갔는지 보여줍니다.'],
      ['2026-12-09', '08:00', 'gdp', '3분기 국민소득(잠정)', '7~9월 경제성장률(GDP)을 첫 발표(속보)보다 많은 자료로 다시 계산한 값입니다.'],
      ['2026-12-15', '12:00', 'money', '10월 통화 및 유동성', '시중에 풀린 돈의 양이 얼마나 늘었는지 보여줍니다.'],
      ['2026-12-22', '06:00', 'ppi', '11월 생산자물가지수(잠정)', '기업끼리 사고파는 물건과 서비스의 값이 얼마나 바뀌었는지 보여줍니다.'],
      ['2026-12-24', '06:00', 'consumer-survey', '12월 소비자동향조사', '가계가 경기와 살림살이를 얼마나 좋게 보는지(소비자심리지수) 보여줍니다.'],
      ['2026-12-29', '06:00', 'business-survey', '12월 기업경기조사·경제심리지수', '기업이 느끼는 경기와, 가계·기업을 합친 경제심리를 보여줍니다.'],
    ].map(([date, time, key, title, note]) => ({
      id: `${date}-bok-${key}`, date, time, region: 'kr', title,
      note: `한국은행 발표. ${note}`, source: BOK_STATS, verifiedAt: '2026-11-04',
    })),
    // 미국 항목: 날짜는 미국 현지 기준이라 time 칸(서울 시각으로 표시됨)을 쓰지 않고 시각은 메모에 적는다.
    ...[
      ['2026-11-04', 'trade', '미국 9월 무역수지', '수출과 수입의 차이.'],
      ['2026-11-25', 'gdp', '미국 3분기 GDP 2차 추정치', '7~9월 성장률을 다시 계산한 값과 기업이익.'],
      ['2026-11-25', 'pce', '미국 10월 개인소득·지출', 'Fed가 중시하는 PCE 물가가 함께 나옵니다.'],
      ['2026-12-08', 'trade', '미국 10월 무역수지', '수출과 수입의 차이.'],
      ['2026-12-23', 'gdp', '미국 3분기 GDP 3차 추정치', '7~9월 성장률의 세 번째 계산값.'],
      ['2026-12-23', 'pce', '미국 11월 개인소득·지출', 'Fed가 중시하는 PCE 물가가 함께 나옵니다.'],
    ].map(([date, key, title, note]) => ({
      id: `${date}-bea-${key}`, date, region: 'us',
      title: `${title} (현지 ${Number(date.slice(5, 7))}월 ${Number(date.slice(8))}일)`,
      note: `${note} 현지 오전 8시 30분(동부시간), 한국은 같은 날 밤 10시 30분입니다.`,
      source: BEA, verifiedAt: '2026-11-04',
    })),
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
