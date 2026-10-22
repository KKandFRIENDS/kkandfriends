// 2026 일정. 읽은 곳과 날: 2026-10-22에 아래 세 곳에서 날짜를 직접 확인했다.
//   한국은행 통화정책방향 결정회의 일정 (2026년 회의일자 8건: 1/15 2/26 4/10 5/28 7/16 8/27 10/22 11/26)
//   Federal Reserve FOMC Calendars (2026: 10/27-28, 12/8-9*  *=경제전망 요약 발표 회의)
//   국가데이터처(옛 통계청) 「2026년 물가, 고용, 산업활동동향 보도계획」 PDF (mods.go.kr/ansk/file/schedule_2026.pdf).
//     같은 날 10월 월간 보도계획 페이지(mods.go.kr/newsPln.es)의 10/2 물가·10/16 고용·10/30 산업활동과 일치. 시각(08:00)은 그 월간 페이지에서만 읽었다.
//   한국은행 「통계 공표일정」 월간통계공표일정 목록 (bok.or.kr/portal/stats/statsPublictSchdul/listCldr.do). 날짜·시각은 목록에서, 10월 달력 칸(10/21, 10/27, 10/29 각 2건)과 대조.
//     시장·가계에 중요한 7종만 싣는다: 실질 GDP(속보)·국민소득(잠정)·국제수지·가계신용·소비자동향조사·기업경기조사(ESI)·생산자물가지수. 시각은 그 페이지 주석대로 "매체가 보도할 수 있는 시각"이다.
// 아직 읽지 못한 곳: BLS(403). 싣지 않은 것: 국가데이터처의 그 밖의 통계(인구동향 등), 한국은행의 그 밖의 통계(통화 및 유동성, 수출입물가, 가중평균금리, 국제투자대조표 등).
// 참고: kosis.kr 「국가통계 공표일정」은 통계별 "예정월"(매월, 2026-12)만 있어 주간 일정에 쓸 수 없고, 달력(statisPublicationCalendar)은 비어 있었다.
const BOK = {
  name: '한국은행 통화정책방향 결정회의 일정',
  url: 'https://www.bok.or.kr/portal/singl/crncyPolicyDrcMtg/listYear.do?mtgSe=A&menuNo=200755',
};
const FED = {
  name: 'Federal Reserve FOMC Calendars',
  url: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',
};
const NDS = {
  name: '국가데이터처 보도계획 (2026년 물가·고용·산업활동동향 보도계획)',
  url: 'https://mods.go.kr/newsPln.es?mid=a10305000000',
};

const BOKSTAT = {
  name: '한국은행 통계 공표일정',
  url: 'https://www.bok.or.kr/portal/stats/statsPublictSchdul/listCldr.do?menuNo=200775',
};

const CPI = '국가데이터처(옛 통계청)가 지난달 물가가 1년 전보다 얼마나 올랐는지 발표합니다.';
const JOBS = '지난달 취업자가 1년 전보다 몇 명 늘거나 줄었는지, 실업률이 얼마인지 알려주는 통계입니다.';
const OUTPUT = '공장 생산, 소매 판매, 설비투자가 지난달 어땠는지 보여주는 통계입니다.';

const GDP_FLASH = '한국은행이 분기 경제성장률을 처음 알려주는 발표(속보)입니다. 직전 분기보다 우리 경제가 얼마나 커졌는지 나옵니다.';
const GDP_PRELIM = '3분기 성장률의 잠정치입니다. 속보 때보다 소비·투자·수출 등 항목별 내용이 더 자세히 나옵니다.';
const BOP = '한 달 동안 상품·서비스·투자로 해외와 오간 돈의 흐름(경상수지 등)을 보여줍니다.';
const HH_CREDIT = '가계가 은행 대출과 카드 외상 등으로 진 빚이 분기 말에 얼마인지 보여주는 통계입니다.';
const CCSI = '가계가 경기와 생활형편을 어떻게 보는지 설문으로 묻는 조사입니다. 소비자심리지수가 여기서 나옵니다.';
const BSI = '기업이 체감하는 경기를 설문으로 묻는 조사입니다. 소비자심리와 합친 경제심리지수(ESI)도 함께 나옵니다.';
const PPI = '기업이 만들어 파는 물건과 서비스의 가격이 지난달 얼마나 변했는지 보여줍니다.';

export default {
  year: 2026,
  // 이 파일이 실제로 다루는 것과 아직 싣지 못한 것. 한가한 주를 "일정 없음"으로 단정하지 않으려고 화면에 그대로 쓴다.
  covers: ['한국은행 금통위', '한국은행 주요 통계', '미국 FOMC', '국가데이터처 물가·고용·산업활동 지표'],
  missing: ['미국 BLS 지표', '국가데이터처 그 밖의 통계', '한국은행 그 밖의 통계'],
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
      id: '2026-10-30-nds-output',
      date: '2026-10-30',
      time: '08:00',
      region: 'kr',
      title: '산업활동동향 (2026년 9월분)',
      note: `${OUTPUT} 9월분입니다.`,
      source: NDS,
      verifiedAt: '2026-10-22',
    },
    {
      id: '2026-11-03-nds-cpi',
      date: '2026-11-03',
      region: 'kr',
      title: '소비자물가동향 (2026년 10월분)',
      note: `${CPI} 10월분입니다.`,
      source: NDS,
      verifiedAt: '2026-10-22',
    },
    {
      id: '2026-11-11-nds-jobs',
      date: '2026-11-11',
      region: 'kr',
      title: '고용동향 (2026년 10월분)',
      note: `${JOBS} 10월분입니다.`,
      source: NDS,
      verifiedAt: '2026-10-22',
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
      id: '2026-11-30-nds-output',
      date: '2026-11-30',
      region: 'kr',
      title: '산업활동동향 (2026년 10월분)',
      note: `${OUTPUT} 10월분입니다.`,
      source: NDS,
      verifiedAt: '2026-10-22',
    },
    {
      id: '2026-12-02-nds-cpi',
      date: '2026-12-02',
      region: 'kr',
      title: '소비자물가동향 (2026년 11월분)',
      note: `${CPI} 11월분입니다.`,
      source: NDS,
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
    {
      id: '2026-12-16-nds-jobs',
      date: '2026-12-16',
      region: 'kr',
      title: '고용동향 (2026년 11월분)',
      note: `${JOBS} 11월분입니다.`,
      source: NDS,
      verifiedAt: '2026-10-22',
    },
    {
      id: '2026-12-30-nds-output',
      date: '2026-12-30',
      region: 'kr',
      title: '산업활동동향 (2026년 11월분)',
      note: `${OUTPUT} 11월분입니다.`,
      source: NDS,
      verifiedAt: '2026-10-22',
    },
    {
      id: '2026-12-31-nds-cpi',
      date: '2026-12-31',
      region: 'kr',
      title: '소비자물가동향 (2026년 12월 및 연간)',
      note: '국가데이터처(옛 통계청)가 지난달 물가 변화와 올해 연간 물가 상승률을 함께 발표합니다. 12월분입니다.',
      source: NDS,
      verifiedAt: '2026-10-22',
    },
    // 한국은행 통계 공표일정
    {
      id: '2026-10-27-bok-ccsi',
      date: '2026-10-27',
      time: '06:00',
      region: 'kr',
      title: '10월 소비자동향조사 (소비자심리지수)',
      note: CCSI,
      source: BOKSTAT,
      verifiedAt: '2026-10-22',
    },
    {
      id: '2026-10-27-bok-gdp-flash',
      date: '2026-10-27',
      time: '08:00',
      region: 'kr',
      title: '3분기 실질 국내총생산(GDP) 속보',
      note: GDP_FLASH,
      source: BOKSTAT,
      verifiedAt: '2026-10-22',
    },
    {
      id: '2026-10-29-bok-bsi',
      date: '2026-10-29',
      time: '06:00',
      region: 'kr',
      title: '10월 기업경기조사·경제심리지수(ESI)',
      note: BSI,
      source: BOKSTAT,
      verifiedAt: '2026-10-22',
    },
    {
      id: '2026-11-05-bok-bop',
      date: '2026-11-05',
      time: '08:00',
      region: 'kr',
      title: '9월 국제수지(잠정)',
      note: `${BOP} 9월분입니다.`,
      source: BOKSTAT,
      verifiedAt: '2026-10-22',
    },
    {
      id: '2026-11-18-bok-hh-credit',
      date: '2026-11-18',
      time: '12:00',
      region: 'kr',
      title: '3분기 가계신용(잠정)',
      note: HH_CREDIT,
      source: BOKSTAT,
      verifiedAt: '2026-10-22',
    },
    {
      id: '2026-11-20-bok-ppi',
      date: '2026-11-20',
      time: '06:00',
      region: 'kr',
      title: '10월 생산자물가지수(잠정)',
      note: `${PPI} 10월분입니다.`,
      source: BOKSTAT,
      verifiedAt: '2026-10-22',
    },
    {
      id: '2026-11-24-bok-ccsi',
      date: '2026-11-24',
      time: '06:00',
      region: 'kr',
      title: '11월 소비자동향조사 (소비자심리지수)',
      note: CCSI,
      source: BOKSTAT,
      verifiedAt: '2026-10-22',
    },
    {
      id: '2026-11-25-bok-bsi',
      date: '2026-11-25',
      time: '06:00',
      region: 'kr',
      title: '11월 기업경기조사·경제심리지수(ESI)',
      note: BSI,
      source: BOKSTAT,
      verifiedAt: '2026-10-22',
    },
    {
      id: '2026-12-08-bok-bop',
      date: '2026-12-08',
      time: '08:00',
      region: 'kr',
      title: '10월 국제수지(잠정)',
      note: `${BOP} 10월분입니다.`,
      source: BOKSTAT,
      verifiedAt: '2026-10-22',
    },
    {
      id: '2026-12-09-bok-gdp-prelim',
      date: '2026-12-09',
      time: '08:00',
      region: 'kr',
      title: '3분기 국민소득(잠정)',
      note: GDP_PRELIM,
      source: BOKSTAT,
      verifiedAt: '2026-10-22',
    },
    {
      id: '2026-12-22-bok-ppi',
      date: '2026-12-22',
      time: '06:00',
      region: 'kr',
      title: '11월 생산자물가지수(잠정)',
      note: `${PPI} 11월분입니다.`,
      source: BOKSTAT,
      verifiedAt: '2026-10-22',
    },
    {
      id: '2026-12-24-bok-ccsi',
      date: '2026-12-24',
      time: '06:00',
      region: 'kr',
      title: '12월 소비자동향조사 (소비자심리지수)',
      note: CCSI,
      source: BOKSTAT,
      verifiedAt: '2026-10-22',
    },
    {
      id: '2026-12-29-bok-bsi',
      date: '2026-12-29',
      time: '06:00',
      region: 'kr',
      title: '12월 기업경기조사·경제심리지수(ESI)',
      note: BSI,
      source: BOKSTAT,
      verifiedAt: '2026-10-22',
    },
  ],
};
