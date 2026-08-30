(function () {
  'use strict';

  var STORAGE_KEY = 'kk_analytics_consent';
  var MEASUREMENT_ID = 'G-2MEJPNMH4T';
  var BANNER_ID = 'analytics-consent';
  var SCRIPT_ID = 'kk-ga-script';

  function readChoice() {
    try {
      var value = window.localStorage.getItem(STORAGE_KEY);
      return value === 'granted' || value === 'denied' ? value : null;
    } catch (_) {
      return null;
    }
  }

  function saveChoice(value) {
    try { window.localStorage.setItem(STORAGE_KEY, value); } catch (_) {}
  }

  function removeBanner() {
    var banner = document.getElementById(BANNER_ID);
    if (banner) banner.remove();
  }

  function loadAnalytics() {
    if (document.getElementById(SCRIPT_ID)) return;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', MEASUREMENT_ID);

    var script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(MEASUREMENT_ID);
    document.head.appendChild(script);
  }

  function rejectAnalytics() {
    saveChoice('denied');
    if (window.gtag) window.gtag('consent', 'update', { analytics_storage: 'denied' });
    removeBanner();
  }

  function acceptAnalytics() {
    saveChoice('granted');
    removeBanner();
    if (document.getElementById(SCRIPT_ID)) {
      if (window.gtag) window.gtag('consent', 'update', { analytics_storage: 'granted' });
      return;
    }
    loadAnalytics();
  }

  function addStyles() {
    if (document.getElementById('analytics-consent-style')) return;
    var style = document.createElement('style');
    style.id = 'analytics-consent-style';
    style.textContent = [
      '#analytics-consent{position:fixed;z-index:10000;left:20px;right:20px;bottom:20px;max-width:760px;margin:0 auto;padding:20px 22px;background:#0E1422;color:#FFFFFF;border:1px solid rgba(122,184,245,.65);border-radius:8px;box-shadow:0 16px 48px rgba(0,0,0,.48);font-family:system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.55}',
      '#analytics-consent *{box-sizing:border-box}',
      '#analytics-consent-title{margin:0 0 6px;font-size:17px;font-weight:700;color:#FFFFFF}',
      '#analytics-consent p{margin:0;color:#D2DCEA;font-size:14px}',
      '#analytics-consent a{color:#7AB8F5}',
      '#analytics-consent .analytics-consent-actions{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:16px}',
      '#analytics-consent button{min-height:44px;padding:10px 16px;border-radius:4px;border:1px solid #7AB8F5;font:600 14px system-ui,-apple-system,"Segoe UI",sans-serif;cursor:pointer}',
      '#analytics-consent [data-analytics-choice="denied"]{background:transparent;color:#D2DCEA}',
      '#analytics-consent [data-analytics-choice="granted"]{background:#7AB8F5;color:#061018}',
      '#analytics-consent button:focus-visible,#analytics-consent a:focus-visible{outline:3px solid #FFFFFF;outline-offset:3px}',
      '@media(max-width:520px){#analytics-consent{left:12px;right:12px;bottom:12px;padding:18px}#analytics-consent .analytics-consent-actions{display:grid;grid-template-columns:1fr}#analytics-consent button{width:100%}}'
    ].join('');
    document.head.appendChild(style);
  }

  function createBanner() {
    removeBanner();
    addStyles();

    var banner = document.createElement('section');
    banner.id = BANNER_ID;
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-labelledby', 'analytics-consent-title');
    banner.setAttribute('aria-live', 'polite');

    var title = document.createElement('h2');
    title.id = 'analytics-consent-title';
    title.textContent = '선택적 분석 쿠키 · Optional analytics';

    var copy = document.createElement('p');
    copy.appendChild(document.createTextNode('사이트 개선을 위해 Google Analytics를 사용할 수 있습니다. 동의 전에는 분석 도구를 불러오지 않으며, 거부해도 로그인과 필수 기능은 그대로 작동합니다. '));
    var link = document.createElement('a');
    link.href = '/privacy';
    link.textContent = '자세히 보기 · Privacy';
    copy.appendChild(link);

    var actions = document.createElement('div');
    actions.className = 'analytics-consent-actions';
    var reject = document.createElement('button');
    reject.type = 'button';
    reject.dataset.analyticsChoice = 'denied';
    reject.textContent = '거부 · Reject';
    reject.addEventListener('click', rejectAnalytics);
    var accept = document.createElement('button');
    accept.type = 'button';
    accept.dataset.analyticsChoice = 'granted';
    accept.textContent = '분석 허용 · Allow analytics';
    accept.addEventListener('click', acceptAnalytics);
    actions.append(reject, accept);

    banner.append(title, copy, actions);
    document.body.appendChild(banner);
  }

  window.KKAnalyticsConsent = {
    accept: acceptAnalytics,
    reject: rejectAnalytics,
    open: createBanner,
    choice: readChoice
  };

  var choice = readChoice();
  if (choice === 'granted') loadAnalytics();
  else if (choice === null) createBanner();
})();
