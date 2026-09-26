// ============================================================================
//  subscribe.js — "다음 글을 메일로 받기" Stibee subscribe block for articles.
//
//  Embed on any article page with ONE line pair:
//      <div id="kk-subscribe"></div>
//      <script type="module" src="/blog/subscribe.js"></script>
//
//  Stibee's own script binds to fixed stb_* ids, so only one form can exist per
//  page. The homepage (index.html) carries its own inline copy; if a page
//  already has #stb_subscribe this module does nothing.
//
//  Stibee assets are fetched only when the block nears the viewport, and the
//  submit button stays disabled until they load — same contract as index.html
//  (see tests/performance.test.mjs).
// ============================================================================

const LIST_ACTION =
  "https://stibee.com/api/v1.0/lists/kB4v7ra3DH90CoZXkzqU6B3Wiz-uxQ==/public/subscribers";
const STIBEE_CSS = "https://resource.stibee.com/subscribe/stb_subscribe_form_style.css";
const STIBEE_JS = "https://resource.stibee.com/subscribe/stb_subscribe_form.js";

const LOADING_MSG = "구독 양식을 준비하고 있습니다. 잠시만 기다려 주세요.";
const ERROR_MSG = "구독 양식을 불러오지 못했습니다. 페이지를 새로고침해 다시 시도해 주세요.";

const mount = document.getElementById("kk-subscribe");
if (mount && !document.getElementById("stb_subscribe")) boot(mount);

function boot(root) {
  if (!document.querySelector("link[data-kks]")) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/blog/subscribe.css";
    link.dataset.kks = "1";
    document.head.appendChild(link);
  }

  root.className = "kks";
  root.setAttribute("aria-labelledby", "kks-title");
  root.innerHTML = `
    <p class="kks-eyebrow">Newsletter</p>
    <h2 class="kks-title" id="kks-title">다음 글을 메일로 받기</h2>
    <p class="kks-desc">새 글이 올라오면 이메일로 알려드립니다. 언제든 구독을 해지할 수 있습니다.</p>
    <div id="stb_subscribe">
      <form action="${LIST_ACTION}" method="POST" target="_blank" accept-charset="utf-8" class="stb_form" name="stb_subscribe_form" id="stb_subscribe_form" data-lang="" novalidate>
        <p class="stb_form_title">KK &amp; Friends 구독하기</p>
        <fieldset class="stb_form_set">
          <label for="stb_email" class="stb_form_set_label">Email / 이메일 주소<span class="stb_asterisk">*</span></label>
          <input type="text" class="stb_form_set_input" id="stb_email" name="email" placeholder="your@email.com" required="required" autocomplete="email" inputmode="email">
          <div class="stb_form_msg_error" id="stb_email_error"></div>
        </fieldset>
        <div class="stb_form_policy">
          <label>
            <input type="checkbox" id="stb_policy" value="stb_policy_true">
            <span>(필수)</span>
            <button id="stb_form_modal_open" data-modal="stb_form_policy_modal" class="stb_form_modal_open_btn" type="button">개인정보 수집 및 이용</button>에 동의합니다.
          </label>
          <div class="stb_form_msg_error" id="stb_policy_error"></div>
          <div class="stb_form_modal stb_form_policy_text blind" id="stb_form_policy_modal">
            <div class="stb_form_modal_body">
              <p class="stb_form_modal_title">개인정보 수집 및 이용</p>
              <div class="stb_form_modal_text">뉴스레터 발송을 위한 최소한의 개인정보를 수집하고 이용합니다.
수집된 정보는 발송 외 다른 목적으로 이용되지 않으며, 서비스가 종료되거나 구독을 해지할 경우 즉시 파기됩니다.</div>
              <div class="stb_form_modal_btn">
                <button id="stb_form_modal_close" class="stb_form_modal_close_btn" data-modal="stb_form_policy_modal" type="button">닫기</button>
              </div>
            </div>
            <div class="stb_form_modal_bg" id="stb_form_modal_bg"></div>
          </div>
        </div>
        <div class="stb_form_result" id="stb_form_result" role="status" aria-live="polite" aria-atomic="true" tabindex="-1"></div>
        <fieldset class="stb_form_set_submit">
          <button type="submit" class="stb_form_submit_button" id="stb_form_submit_button">구독하기 · Subscribe</button>
        </fieldset>
      </form>
    </div>`;

  const form = root.querySelector("#stb_subscribe_form");
  const button = root.querySelector("#stb_form_submit_button");
  const status = root.querySelector("#stb_form_result");

  let state = "loading";
  let loadStarted = false;

  function setState(next) {
    state = next;
    form.dataset.stibeeState = next;
    button.disabled = next !== "ready";
    button.setAttribute("aria-disabled", String(button.disabled));
    status.textContent = next === "loading" ? LOADING_MSG : next === "error" ? ERROR_MSG : "";
  }

  // Capture phase: block submits until Stibee's validator is attached, so the
  // form never falls through to a raw POST in a new tab.
  form.addEventListener("submit", (event) => {
    if (state === "ready") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    status.textContent = state === "error" ? ERROR_MSG : LOADING_MSG;
    status.focus();
  }, true);
  setState("loading");

  function loadStibeeAssets() {
    if (loadStarted) return;
    loadStarted = true;
    const style = document.createElement("link");
    style.id = "stibee-form-style";
    style.rel = "stylesheet";
    style.href = STIBEE_CSS;
    document.head.appendChild(style);
    const script = document.createElement("script");
    script.id = "stibee-form-script";
    script.src = STIBEE_JS;
    script.async = true;
    script.onload = () => setState("ready");
    script.onerror = () => setState("error");
    document.body.appendChild(script);
  }

  if ("IntersectionObserver" in window) {
    const loader = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        loader.disconnect();
        loadStibeeAssets();
      }
    }, { rootMargin: "800px 0px" });
    loader.observe(root);
  } else if (document.readyState === "complete") {
    loadStibeeAssets();
  } else {
    window.addEventListener("load", loadStibeeAssets, { once: true });
  }
}
