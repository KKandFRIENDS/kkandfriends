// 2026 일정. 읽은 곳과 날: 2026-10-22에 아래 두 페이지의 본문에서 날짜를 직접 확인했다.
//   한국은행 통화정책방향 결정회의 일정 (2026년 회의일자 8건: 1/15 2/26 4/10 5/28 7/16 8/27 10/22 11/26)
//   Federal Reserve FOMC Calendars (2026: 10/27-28, 12/8-9*  *=경제전망 요약 발표 회의)
// 접근하지 못해 넣지 않은 곳: 통계청(국가데이터처) 공표 일정(연결 끊김), BLS(403).
const BOK = {
  name: '한국은행 통화정책방향 결정회의 일정',
  url: 'https://www.bok.or.kr/portal/singl/crncyPolicyDrcMtg/listYear.do?mtgSe=A&menuNo=200755',
};
const FED = {
  name: 'Federal Reserve FOMC Calendars',
  url: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',
};

export default {
  year: 2026,
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
      title: '미국 FOMC 회의 (10월 27~28일)',
      note: '미국 중앙은행(Fed)이 기준금리를 정하는 회의. 이틀간 열리며 결과는 보통 둘째 날 나옵니다.',
      source: FED,
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
      id: '2026-12-09-fomc',
      date: '2026-12-09',
      region: 'us',
      title: '미국 FOMC 회의 (12월 8~9일)',
      note: '이틀간 열리는 미국 기준금리 회의. 참가자들의 금리·성장률·물가 전망을 모은 경제전망 요약도 함께 나옵니다.',
      source: FED,
      verifiedAt: '2026-10-22',
    },
  ],
};
