// ============================================================================
//  discussion.js — reusable YouTube-style discussion + share module.
//
//  Embed on any post with ONE line (slug auto-derived from the URL):
//      <div id="kk-discussion"></div>
//      <script type="module" src="/blog/discussion.js"></script>
//  Override the slug if needed: <div id="kk-discussion" data-post-slug="my-slug"></div>
//
//  Loads the Supabase JS client + config.js from the repo. All privileged
//  actions are enforced server-side by RLS (see db/migrations/001_comments.sql);
//  nothing here is a security boundary.
// ============================================================================

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY, ADMIN_UID } from "/config.js";

const MAX = 2000;
const el = document.getElementById("kk-discussion");
if (el) boot(el);

async function boot(root) {
  // Inject the stylesheet once (keeps the embed to a single script tag).
  if (!document.querySelector('link[data-kkd]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/blog/discussion.css";
    link.dataset.kkd = "1";
    document.head.appendChild(link);
  }

  if (!SUPABASE_URL || SUPABASE_URL.includes("YOUR-PROJECT-REF")) {
    root.innerHTML =
      `<div class="kkd"><p class="kkd-error">Discussion is not configured yet. ` +
      `(config.js에 Supabase 정보를 입력하세요.)</p></div>`;
    return;
  }

  const slug = root.dataset.postSlug || deriveSlug();
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const state = {
    slug, sb,
    user: null,
    sort: "top",              // "top" | "newest"
    comments: [],             // flat list
    commentLikes: new Set(),  // comment ids the current user liked
    commentLikeCounts: {},    // id -> count
    postLiked: false,
    postLikeCount: 0,
    expanded: new Set(),      // parent ids whose replies are expanded
  };

  setupDelegation(root, state);
  render(root, state);

  const { data: { session } } = await sb.auth.getSession();
  state.user = session?.user ?? null;
  sb.auth.onAuthStateChange((_e, s) => { state.user = s?.user ?? null; refresh(root, state); });

  await loadAll(state);
  render(root, state);
}

// ── slug from /posts/20260706_ledger_eraser.html → "20260706_ledger_eraser" ──
function deriveSlug() {
  const file = location.pathname.split("/").pop() || "index";
  return decodeURIComponent(file.replace(/\.html?$/i, "")) || "index";
}

// ─────────────────────────────────────────────────────────────────────────────
//  Data loading
// ─────────────────────────────────────────────────────────────────────────────
async function loadAll(state) {
  const { sb, slug, user } = state;

  const [comments, postCount, commentLikeRows] = await Promise.all([
    sb.from("comments").select("*").eq("post_slug", slug).order("created_at", { ascending: true }),
    sb.from("post_likes").select("*", { count: "exact", head: true }).eq("post_slug", slug),
    sb.from("comment_likes").select("comment_id"),
  ]);

  state.comments = comments.data || [];
  state.postLikeCount = postCount.count || 0;

  const counts = {};
  (commentLikeRows.data || []).forEach((r) => { counts[r.comment_id] = (counts[r.comment_id] || 0) + 1; });
  state.commentLikeCounts = counts;

  if (user) {
    const [myPost, myComs] = await Promise.all([
      sb.from("post_likes").select("post_slug").eq("post_slug", slug).eq("user_id", user.id).maybeSingle(),
      sb.from("comment_likes").select("comment_id").eq("user_id", user.id),
    ]);
    state.postLiked = !!myPost.data;
    state.commentLikes = new Set((myComs.data || []).map((r) => r.comment_id));
  } else {
    state.postLiked = false;
    state.commentLikes = new Set();
  }
}

async function refresh(root, state) {
  await loadAll(state);
  render(root, state);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Rendering
// ─────────────────────────────────────────────────────────────────────────────
function render(root, state) {
  const { comments } = state;
  const tops = comments.filter((c) => !c.parent_id);
  const repliesOf = (id) => comments.filter((c) => c.parent_id === id);
  const total = comments.length;

  const sorted = [...tops].sort((a, b) => {
    if (state.sort === "top") return (cnt(state, b.id) - cnt(state, a.id)) || (ts(b) - ts(a));
    return ts(b) - ts(a);
  });

  root.innerHTML = `
  <section class="kkd" aria-label="Discussion / 토론">
    <hr class="kkd-hr" />

    <div class="kkd-actionbar">
      <button class="kkd-btn ${state.postLiked ? "is-on" : ""}" data-act="post-like" aria-pressed="${state.postLiked}">
        ${icon("like")}<span class="kkd-count">${state.postLikeCount}</span>
        <span class="kkd-sr"> Like / 좋아요</span>
      </button>

      <div class="kkd-sharewrap">
        <button class="kkd-btn" data-act="share">${icon("share")} Share / 공유</button>
        <div class="kkd-sharemenu" data-share-menu>
          <button class="kkd-share-item" data-share="x">${icon("x")} X (Twitter)</button>
          <button class="kkd-share-item" data-share="linkedin">${icon("in")} LinkedIn</button>
          <button class="kkd-share-item" data-share="kakao">${icon("kakao")} KakaoTalk</button>
          <button class="kkd-share-item" data-share="copy">${icon("link")} Copy link / 링크 복사</button>
        </div>
      </div>

      <span class="kkd-commentcount">${total} ${total === 1 ? "Comment" : "Comments"} / ${total}개 댓글</span>
    </div>

    <div class="kkd-sortrow" role="group" aria-label="Sort / 정렬">
      <span style="color:var(--kkd-muted);font-size:13px;">Sort by / 정렬:</span>
      <button class="kkd-sort ${state.sort === "top" ? "is-active" : ""}" data-sort="top">Top / 인기순</button>
      <button class="kkd-sort ${state.sort === "newest" ? "is-active" : ""}" data-sort="newest">Newest / 최신순</button>
    </div>

    ${composerHTML(state)}

    <div class="kkd-list">
      ${sorted.length ? sorted.map((c) => commentHTML(state, c, repliesOf(c.id))).join("") : emptyHTML()}
    </div>
  </section>`;

  wireInputs(root);
}

function composerHTML(state) {
  const signedIn = !!state.user;
  const av = avatarHTML(state.user);
  return `
    <div class="kkd-composer" data-composer>
      ${av}
      <div class="kkd-composer-main">
        <input type="text" class="kkd-hp" data-hp tabindex="-1" autocomplete="off" aria-hidden="true" placeholder="Leave this empty" />
        <textarea class="kkd-input" data-input rows="1"
          placeholder="Add a comment… / 댓글 추가…" ${signedIn ? "" : "disabled"} maxlength="${MAX + 50}"></textarea>
        <p class="kkd-policy">토론을 환영합니다. 단, 특정 종목 추천·투자 자문·비방은 금지됩니다. / Discussion welcome — no specific securities recommendations, investment advice, or personal attacks.</p>
        ${signedIn ? `
          <div class="kkd-composer-foot" data-foot hidden>
            <span class="kkd-charcount" data-charcount>0 / ${MAX}</span>
            <button class="kkd-btn kkd-btn-text kkd-btn-sm" data-act="cancel">Cancel / 취소</button>
            <button class="kkd-btn kkd-btn-primary kkd-btn-sm" data-act="submit">Comment / 등록</button>
          </div>` : `
          <p class="kkd-signin-note">
            <button data-act="signin">Sign in with Google / 로그인</button> to join the discussion / 후 참여하세요.
          </p>`}
      </div>
    </div>`;
}

function commentHTML(state, c, replies) {
  const canModerate = state.user && (state.user.id === c.author_id || isAdmin(state));
  const liked = state.commentLikes.has(c.id);
  const likes = cnt(state, c.id);
  const expanded = state.expanded.has(c.id);

  return `
  <div class="kkd-comment" data-id="${c.id}">
    ${avatarHTML({ user_metadata: { avatar_url: c.author_avatar_url, full_name: c.author_name } }, true)}
    <div class="kkd-c-main">
      <div class="kkd-c-head">
        <span class="kkd-c-name">${esc(c.author_name || "익명 / Anonymous")}</span>
        ${isAdminUid(c.author_id) ? `<span class="kkd-c-badge">KK</span>` : ""}
        <span class="kkd-c-time" title="${esc(absTime(c.created_at))}">${esc(relTime(c.created_at))}</span>
      </div>
      <div class="kkd-c-body ${c.is_hidden ? "kkd-c-hidden" : ""}">${c.is_hidden ? "가려진 댓글입니다 / Comment hidden by moderator" : esc(c.body)}</div>
      <div class="kkd-c-actions">
        <button class="kkd-icon-btn ${liked ? "is-on" : ""}" data-act="comment-like" data-id="${c.id}" aria-pressed="${liked}">
          ${icon("like")}<span>${likes || ""}</span>
        </button>
        <button class="kkd-icon-btn" data-act="reply" data-id="${c.id}">Reply / 답글</button>
        ${canModerate && !c.is_hidden && isAdmin(state) ? `<button class="kkd-icon-btn" data-act="hide" data-id="${c.id}">Hide / 가리기</button>` : ""}
        ${canModerate ? `<button class="kkd-icon-btn kkd-danger" data-act="delete" data-id="${c.id}">Delete / 삭제</button>` : ""}
      </div>
      <div class="kkd-reply-slot" data-reply-slot="${c.id}"></div>
    </div>
  </div>
  ${replies.length ? `
    <button class="kkd-replies-toggle" data-act="toggle-replies" data-id="${c.id}">
      ${expanded ? "▾" : "▸"} ${replies.length} ${replies.length === 1 ? "reply" : "replies"} / ${replies.length}개 답글
    </button>
    <div class="kkd-replies" ${expanded ? "" : "hidden"}>
      ${replies.sort((a, b) => ts(a) - ts(b)).map((r) => replyHTML(state, r)).join("")}
    </div>` : ""}`;
}

function replyHTML(state, c) {
  const canModerate = state.user && (state.user.id === c.author_id || isAdmin(state));
  const liked = state.commentLikes.has(c.id);
  const likes = cnt(state, c.id);
  return `
  <div class="kkd-comment" data-id="${c.id}">
    ${avatarHTML({ user_metadata: { avatar_url: c.author_avatar_url, full_name: c.author_name } }, true)}
    <div class="kkd-c-main">
      <div class="kkd-c-head">
        <span class="kkd-c-name">${esc(c.author_name || "익명 / Anonymous")}</span>
        ${isAdminUid(c.author_id) ? `<span class="kkd-c-badge">KK</span>` : ""}
        <span class="kkd-c-time" title="${esc(absTime(c.created_at))}">${esc(relTime(c.created_at))}</span>
      </div>
      <div class="kkd-c-body ${c.is_hidden ? "kkd-c-hidden" : ""}">${c.is_hidden ? "가려진 댓글입니다 / Comment hidden by moderator" : esc(c.body)}</div>
      <div class="kkd-c-actions">
        <button class="kkd-icon-btn ${liked ? "is-on" : ""}" data-act="comment-like" data-id="${c.id}" aria-pressed="${liked}">
          ${icon("like")}<span>${likes || ""}</span>
        </button>
        ${canModerate && !c.is_hidden && isAdmin(state) ? `<button class="kkd-icon-btn" data-act="hide" data-id="${c.id}">Hide / 가리기</button>` : ""}
        ${canModerate ? `<button class="kkd-icon-btn kkd-danger" data-act="delete" data-id="${c.id}">Delete / 삭제</button>` : ""}
      </div>
    </div>
  </div>`;
}

function emptyHTML() {
  return `<p class="kkd-empty">아직 댓글이 없습니다. 첫 번째 생각을 남겨주세요. / No comments yet — start the discussion.</p>`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Event wiring (delegation)
// ─────────────────────────────────────────────────────────────────────────────
// Per-render: wire the (freshly re-created) composer textarea.
function wireInputs(root) {
  const composer = root.querySelector("[data-composer]");
  const input = composer?.querySelector("[data-input]");
  const foot = composer?.querySelector("[data-foot]");
  const charcount = composer?.querySelector("[data-charcount]");
  if (!input) return;
  input.addEventListener("input", () => {
    autosize(input);
    if (foot) foot.hidden = false;
    if (charcount) {
      const n = input.value.length;
      charcount.textContent = `${n} / ${MAX}`;
      charcount.classList.toggle("is-over", n > MAX);
    }
  });
}

// Once per module: delegated click handling (survives re-renders because it
// lives on the persistent root element and reads fresh state/DOM each time).
function setupDelegation(root, state) {
  root.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-act], [data-sort], [data-share]");
    if (!t || !root.contains(t)) return;

    if (t.dataset.sort) { state.sort = t.dataset.sort; render(root, state); return; }
    if (t.dataset.share) { e.preventDefault(); doShare(t.dataset.share, state, root); closeShareMenu(root); return; }

    const act = t.dataset.act;
    const id = t.dataset.id;
    const input = root.querySelector("[data-composer] [data-input]");
    const composer = root.querySelector("[data-composer]");
    const foot = root.querySelector("[data-composer] [data-foot]");

    switch (act) {
      case "signin":   return signIn(state);
      case "share":    return toggleShareMenu(root);
      case "post-like":    if (requireAuth(state, root)) return togglePostLike(root, state); return;
      case "comment-like": if (requireAuth(state, root)) return toggleCommentLike(root, state, id); return;
      case "submit":   return submitComment(root, state, input, composer);
      case "cancel":   if (input) { input.value = ""; autosize(input); if (foot) foot.hidden = true; } return;
      case "reply":    if (requireAuth(state, root)) return openReply(root, state, id); return;
      case "toggle-replies":
        state.expanded.has(id) ? state.expanded.delete(id) : state.expanded.add(id);
        return render(root, state);
      case "hide":     return moderate(root, state, id, { is_hidden: true });
      case "delete":   return deleteComment(root, state, id);
    }
  });

  // close the share menu when clicking outside it
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".kkd-sharewrap")) closeShareMenu(root);
  });
}

function requireAuth(state, root) {
  if (state.user) return true;
  signIn(state);
  return false;
}

async function signIn(state) {
  await state.sb.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: location.href },
  });
}

async function togglePostLike(root, state) {
  const { sb, slug, user } = state;
  if (state.postLiked) {
    await sb.from("post_likes").delete().eq("post_slug", slug).eq("user_id", user.id);
  } else {
    await sb.from("post_likes").insert({ post_slug: slug, user_id: user.id });
  }
  await refresh(root, state);
}

async function toggleCommentLike(root, state, id) {
  const { sb, user } = state;
  if (state.commentLikes.has(id)) {
    await sb.from("comment_likes").delete().eq("comment_id", id).eq("user_id", user.id);
  } else {
    await sb.from("comment_likes").insert({ comment_id: id, user_id: user.id });
  }
  await refresh(root, state);
}

async function submitComment(root, state, input, composer, parentId = null) {
  const { sb, slug, user } = state;
  if (!user || !input) return;
  if (composer?.querySelector("[data-hp]")?.value) return; // honeypot tripped
  const body = input.value.trim();
  if (!body) return;
  if (body.length > MAX) { toast(root, `최대 ${MAX}자까지 / Max ${MAX} characters`); return; }

  const { error } = await sb.from("comments").insert({
    post_slug: slug,
    parent_id: parentId,
    author_id: user.id,
    author_name: displayName(user),
    author_avatar_url: user.user_metadata?.avatar_url || null,
    body,
  });
  if (error) { toast(root, "등록 실패 / Could not post"); return; }
  if (parentId) state.expanded.add(parentId);
  await refresh(root, state);
}

function openReply(root, state, parentId) {
  const slot = root.querySelector(`[data-reply-slot="${parentId}"]`);
  if (!slot || slot.dataset.open) return;
  slot.dataset.open = "1";
  slot.innerHTML = `
    <div class="kkd-composer kkd-reply-form">
      ${avatarHTML(state.user, true)}
      <div class="kkd-composer-main">
        <input type="text" class="kkd-hp" data-hp tabindex="-1" autocomplete="off" aria-hidden="true" />
        <textarea class="kkd-input" data-reply-input rows="1" placeholder="Reply… / 답글…" maxlength="${MAX + 50}"></textarea>
        <div class="kkd-composer-foot">
          <button class="kkd-btn kkd-btn-text kkd-btn-sm" data-act="reply-cancel">Cancel / 취소</button>
          <button class="kkd-btn kkd-btn-primary kkd-btn-sm" data-reply-submit>Reply / 답글</button>
        </div>
      </div>
    </div>`;
  const ta = slot.querySelector("[data-reply-input]");
  ta.focus();
  ta.addEventListener("input", () => autosize(ta));
  slot.querySelector("[data-reply-submit]").addEventListener("click", () => {
    submitComment(root, state, ta, slot.querySelector(".kkd-reply-form"), parentId);
  });
  slot.querySelector('[data-act="reply-cancel"]').addEventListener("click", () => {
    slot.innerHTML = ""; delete slot.dataset.open;
  });
}

async function moderate(root, state, id, patch) {
  const { error } = await state.sb.from("comments").update(patch).eq("id", id);
  if (error) { toast(root, "권한이 없습니다 / Not allowed"); return; }
  await refresh(root, state);
}

async function deleteComment(root, state, id) {
  if (!confirm("이 댓글을 삭제할까요? / Delete this comment?")) return;
  const { error } = await state.sb.from("comments").delete().eq("id", id);
  if (error) { toast(root, "삭제 실패 / Could not delete"); return; }
  await refresh(root, state);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Share
// ─────────────────────────────────────────────────────────────────────────────
function shareData() {
  const url = document.querySelector('link[rel="canonical"]')?.href || location.href;
  const title =
    document.querySelector('meta[property="og:title"]')?.content ||
    document.title ||
    "KK & Friends";
  return { url, title };
}

function toggleShareMenu(root) {
  const m = root.querySelector("[data-share-menu]");
  if (!m) return;
  const willOpen = !m.classList.contains("is-open");
  closeShareMenu(root);
  if (willOpen && navigator.share) {
    const { title, url } = shareData();
    navigator.share({ title, url }).catch(() => {});
    return;
  }
  m.classList.toggle("is-open", willOpen);
}
function closeShareMenu(root) { root.querySelector("[data-share-menu]")?.classList.remove("is-open"); }

async function doShare(kind, state, root) {
  const { title, url } = shareData();
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  if (kind === "x")        return void open(`https://twitter.com/intent/tweet?text=${t}&url=${u}`);
  if (kind === "linkedin") return void open(`https://www.linkedin.com/sharing/share-offsite/?url=${u}`);
  if (kind === "kakao")    return shareKakao(title, url);
  if (kind === "copy") {
    try { await navigator.clipboard.writeText(url); toast(root, "복사됨 ✓ / Copied ✓"); }
    catch { toast(root, url); }
  }
}
function open(href) { window.open(href, "_blank", "noopener,noreferrer,width=600,height=540"); }

async function shareKakao(title, url) {
  try {
    const { KAKAO_JS_KEY } = await import("/config.js");
    if (KAKAO_JS_KEY && window.Kakao) {
      if (!window.Kakao.isInitialized()) window.Kakao.init(KAKAO_JS_KEY);
      window.Kakao.Share.sendDefault({
        objectType: "feed",
        content: { title, description: "KK & Friends", link: { webUrl: url, mobileWebUrl: url } },
      });
      return;
    }
  } catch { /* fall through */ }
  open(`https://story.kakao.com/share?url=${encodeURIComponent(url)}`);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────────
function cnt(state, id) { return state.commentLikeCounts[id] || 0; }
function ts(c) { return new Date(c.created_at).getTime(); }
function isAdmin(state) { return !!state.user && state.user.id === ADMIN_UID; }
function isAdminUid(uid) { return uid === ADMIN_UID; }
function displayName(user) {
  const m = user.user_metadata || {};
  return m.full_name || m.name || (user.email ? user.email.split("@")[0] : "익명");
}
function avatarHTML(user, small) {
  const url = user?.user_metadata?.avatar_url;
  const name = user ? displayName(user) : "";
  const cls = `kkd-avatar ${small ? "kkd-avatar-sm" : ""}`;
  if (url) return `<img class="${cls}" src="${esc(url)}" alt="" referrerpolicy="no-referrer" />`;
  return `<div class="${cls}" aria-hidden="true">${esc((name || "?").trim().charAt(0).toUpperCase() || "?")}</div>`;
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function autosize(ta) { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 320) + "px"; }

function relTime(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "방금 전";
  const m = Math.floor(s / 60); if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}일 전`;
  const w = Math.floor(d / 7); if (w < 5) return `${w}주 전`;
  const mo = Math.floor(d / 30); if (mo < 12) return `${mo}개월 전`;
  return `${Math.floor(d / 365)}년 전`;
}
function absTime(iso) { try { return new Date(iso).toLocaleString("ko-KR"); } catch { return iso; } }

let toastTimer;
function toast(root, msg) {
  let t = document.querySelector(".kkd-toast");
  if (!t) { t = document.createElement("div"); t.className = "kkd-toast"; document.body.appendChild(t); }
  t.textContent = msg;
  requestAnimationFrame(() => t.classList.add("is-shown"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("is-shown"), 2200);
}

function icon(name) {
  const p = {
    like: '<path d="M2 20h2V9H2v11zm20-11a2 2 0 0 0-2-2h-6.3l1-4.6v-.3a1.5 1.5 0 0 0-.4-1L13 0 6.6 6.4A2 2 0 0 0 6 7.8V18a2 2 0 0 0 2 2h9a2 2 0 0 0 1.8-1.2l3-7a2 2 0 0 0 .2-.8V9z"/>',
    share: '<path d="M18 16a3 3 0 0 0-2.4 1.2l-7-4a3 3 0 0 0 0-2.4l7-4A3 3 0 1 0 15 5l-7 4a3 3 0 1 0 0 6l7 4a3 3 0 1 0 3-3z"/>',
    link: '<path d="M3.9 12a3.1 3.1 0 0 1 3.1-3.1h4V7h-4a5 5 0 0 0 0 10h4v-1.9h-4A3.1 3.1 0 0 1 3.9 12zM8 13h8v-2H8v2zm5-6h4a5 5 0 0 1 0 10h-4v-1.9h4a3.1 3.1 0 0 0 0-6.2h-4V7z"/>',
    x: '<path d="M18.9 2H22l-7.5 8.6L23 22h-6.8l-5.3-6.9L4.8 22H1.7l8-9.2L1 2h7l4.8 6.3L18.9 2zm-1.2 18h1.9L7.1 4H5.1l12.6 16z"/>',
    in: '<path d="M4.98 3.5A2.5 2.5 0 1 0 5 8.5a2.5 2.5 0 0 0 0-5zM3 9h4v12H3V9zm6 0h3.8v1.7h.05C13.4 9.3 15 8.7 17 8.7c4 0 4.7 2.6 4.7 6V21h-4v-5.4c0-1.3 0-3-1.8-3s-2.1 1.4-2.1 2.9V21H9V9z"/>',
    kakao: '<path d="M12 3C6.9 3 2.8 6.2 2.8 10.2c0 2.6 1.7 4.9 4.3 6.2-.2.7-.7 2.5-.8 2.9 0 .2.1.4.4.2.2-.1 2.6-1.8 3.6-2.5.5.1 1.1.1 1.7.1 5.1 0 9.2-3.2 9.2-7.2S17.1 3 12 3z"/>',
  }[name] || "";
  return `<svg class="kkd-ico" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${p}</svg>`;
}
