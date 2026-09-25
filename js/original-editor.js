import {
  isConfigured, currentUser, signInButtonsHtml, wireSignIn, isAdmin, esc,
} from '/js/auth-vps.js';
import { communityApi } from '/js/vps-api.js';
import { renderMarkdown } from '/js/markdown.js';

const CATEGORIES = ['Macro', 'Korea', 'Equity', 'Digital Assets', 'Global', 'Manifesto'];
const root = document.getElementById('root');
const editId = new URLSearchParams(location.search).get('id');
let user = null;
let post = null;
let allPosts = [];
let slugTouched = false;

boot();

async function boot() {
  if (!isConfigured()) return showError('회원 시스템이 아직 연결되지 않았습니다.');
  user = await currentUser();
  if (!user) {
    root.innerHTML = `<div class="card center stack"><h2>Chief 로그인이 필요합니다</h2>${signInButtonsHtml()}</div>`;
    wireSignIn(root, location.href);
    return;
  }
  if (!isAdmin(user)) return showError('KK Original 편집실은 Chief 계정만 사용할 수 있습니다.');

  try { allPosts = (await communityApi.originalPosts()).posts || []; }
  catch (error) { return showError(`편집실을 열 수 없습니다. (${error.message})`); }
  if (editId) {
    post = allPosts.find(item => item.id === editId) || null;
    if (!post) return showError('글을 찾을 수 없거나 편집 권한이 없습니다.');
  }
  renderEditor();
}

function showError(message) {
  root.innerHTML = `<div class="banner error">${esc(message)}</div><div class="center"><a class="btn btn-ghost" href="/thoughts">THOUGHTS로</a></div>`;
}

function compactDate(date = new Date()) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10).replaceAll('-', '');
}

function slugify(title) {
  const words = String(title || '').toLowerCase().match(/[a-z0-9]+/g) || [];
  const suffix = words.join('-').slice(0, 55).replace(/-+$/g, '') || `kk-original-${String(Date.now()).slice(-6)}`;
  return `${compactDate()}-${suffix}`;
}

function renderEditor() {
  const published = post?.status === 'published';
  const categories = CATEGORIES.map(c => `<option value="${esc(c)}" ${post?.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('');
  root.innerHTML = `
    <div class="editor-head"><div><p class="eyebrow" style="text-align:left;margin:0">KK Original</p><h1 style="margin:6px 0">${post ? '글 수정' : '새 글'}</h1></div><div class="status">${published ? '발행됨' : post ? '임시 저장' : '작성 중'}</div></div>
    <input class="title-input" id="title" maxlength="200" placeholder="제목을 입력하세요" value="${esc(post?.title || '')}">
    <label class="field-label" for="summary">목록과 검색에 표시할 한 문단 요약</label>
    <textarea class="summary-input" id="summary" maxlength="500" placeholder="이 글의 핵심 결론을 1~2문장으로 적어 주세요.">${esc(post?.summary || '')}</textarea>
    <div class="meta-grid">
      <div><label class="field-label" for="category">분야</label><select id="category"><option value="">— 분야 선택 —</option>${categories}</select></div>
      <div><label class="field-label" for="slug">공개 주소</label><input class="slug-input" id="slug" maxlength="90" placeholder="20260924-example-title" value="${esc(post?.slug || '')}" ${published ? 'readonly' : ''}></div>
    </div>
    <p class="editor-note">주소는 영문 소문자·숫자·하이픈만 사용합니다. 발행 후에는 기존 링크 보호를 위해 바뀌지 않습니다.</p>
    <div class="toolbar" id="toolbar"><button data-md="h2">제목</button><button data-md="bold"><b>B</b></button><button data-md="italic"><i>I</i></button><button data-md="quote">❝ 인용</button><button data-md="ul">• 목록</button><button data-md="link">🔗 링크</button><button data-md="img">🖼 이미지</button><button data-md="code">&lt;/&gt; 코드</button><button data-md="preview" style="margin-left:auto">👁 미리보기</button></div>
    <div class="split"><textarea class="body" id="body" placeholder="본문을 적어 주세요. Markdown 서식을 사용할 수 있습니다.">${esc(post?.body || '')}</textarea><div class="preview-pane mobile-hide" id="preview-pane"><div class="preview-label">Preview</div><div class="rendered" id="preview"></div></div></div>
    <div class="actions"><button class="btn btn-ghost" id="save">임시 저장</button>${published ? '<button class="btn" id="update-pub">변경 사항 저장</button><button class="btn btn-outline" id="unpublish">발행 취소</button>' : '<button class="btn" id="publish">발행</button>'}<span class="spacer"></span><a class="btn btn-ghost" href="/thoughts?series=KK%20Original">취소</a></div>
    <div class="msg" id="msg" style="margin-top:12px"></div>
    ${renderPostManager()}`;

  wireEditor();
}

function renderPostManager() {
  if (!allPosts.length) return '<section class="post-manager"><h2>저장된 글</h2><p class="muted">아직 저장된 글이 없습니다.</p></section>';
  const rows = allPosts.map(item => `<a class="post-row" href="/write-original?id=${encodeURIComponent(item.id)}"><span><strong>${esc(item.title)}</strong><small>${esc(item.category)} · ${esc(item.slug)}</small></span><span class="${item.status === 'published' ? 'published-tag' : 'draft-tag'}">${item.status === 'published' ? '발행됨' : '임시 저장'}</span></a>`).join('');
  return `<section class="post-manager"><h2>저장된 글</h2><div class="post-list">${rows}</div></section>`;
}

function wireEditor() {
  const title = document.getElementById('title');
  const slug = document.getElementById('slug');
  const body = document.getElementById('body');
  const preview = document.getElementById('preview');
  const refresh = () => { preview.innerHTML = renderMarkdown(body.value); };
  body.addEventListener('input', refresh); refresh();
  if (!post) {
    title.addEventListener('input', () => { if (!slugTouched) slug.value = slugify(title.value); });
    slug.addEventListener('input', () => { slugTouched = true; });
  }

  const fileInput = document.createElement('input');
  fileInput.type = 'file'; fileInput.accept = 'image/png,image/jpeg,image/gif,image/webp'; fileInput.hidden = true;
  document.body.appendChild(fileInput);
  fileInput.onchange = () => { if (fileInput.files[0]) uploadImage(fileInput.files[0], body, refresh); };

  document.getElementById('toolbar').onclick = event => {
    const button = event.target.closest('button'); if (!button) return;
    const kind = button.dataset.md;
    if (kind === 'preview') return document.getElementById('preview-pane').classList.toggle('mobile-hide');
    if (kind === 'img') { fileInput.value = ''; fileInput.click(); return; }
    applyFormat(body, kind); refresh();
  };
  for (const eventName of ['dragover', 'drop']) body.addEventListener(eventName, event => {
    if (eventName === 'dragover') return event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file?.type.startsWith('image/')) { event.preventDefault(); uploadImage(file, body, refresh); }
  });
  body.addEventListener('paste', event => {
    const item = [...(event.clipboardData?.items || [])].find(i => i.type?.startsWith('image/'));
    const file = item?.getAsFile(); if (file) { event.preventDefault(); uploadImage(file, body, refresh); }
  });

  document.getElementById('save').onclick = () => save('draft');
  document.getElementById('publish')?.addEventListener('click', () => save('published'));
  document.getElementById('update-pub')?.addEventListener('click', () => save('published'));
  document.getElementById('unpublish')?.addEventListener('click', () => save('draft'));
}

function applyFormat(textarea, kind) {
  const start = textarea.selectionStart, end = textarea.selectionEnd, selected = textarea.value.slice(start, end);
  const wrap = (before, after = before) => textarea.setRangeText(before + selected + after, start, end, 'end');
  const prefix = value => textarea.setRangeText(value + selected, start, end, 'end');
  if (kind === 'bold') wrap('**');
  else if (kind === 'italic') wrap('*');
  else if (kind === 'code') selected.includes('\n') ? wrap('```\n', '\n```') : wrap('`');
  else if (kind === 'h2') prefix('\n## ');
  else if (kind === 'quote') prefix('\n> ');
  else if (kind === 'ul') prefix('\n- ');
  else if (kind === 'link') { const url = prompt('링크 주소 (https://…)'); if (url) textarea.setRangeText(`[${selected || '링크 텍스트'}](${url})`, start, end, 'end'); }
  textarea.focus();
}

async function uploadImage(file, textarea, refresh) {
  const msg = document.getElementById('msg');
  if (file.size > 5 * 1024 * 1024) return setMessage('error', '이미지는 5MB 이하만 업로드할 수 있습니다.');
  setMessage('', '이미지 업로드 중…');
  try {
    const data = await communityApi.upload(file);
    textarea.setRangeText(`\n![이미지](${data.url})\n`, textarea.selectionStart, textarea.selectionEnd, 'end');
    refresh(); setMessage('ok', '이미지가 삽입되었습니다.');
  } catch (error) { setMessage('error', `이미지 업로드 실패: ${error.message || error}`); }
}

function setMessage(type, message) {
  const node = document.getElementById('msg'); node.className = `msg ${type}`; node.textContent = message;
}

function collect() {
  return {
    title: document.getElementById('title').value.trim(),
    summary: document.getElementById('summary').value.trim(),
    category: document.getElementById('category').value,
    slug: document.getElementById('slug').value.trim().toLowerCase(),
    body: document.getElementById('body').value.trim(),
  };
}

async function save(status) {
  const value = collect();
  if (!value.title) return setMessage('error', '제목을 입력해 주세요.');
  if (!value.summary) return setMessage('error', '요약을 입력해 주세요.');
  if (!value.category) return setMessage('error', '분야를 선택해 주세요.');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.slug)) return setMessage('error', '공개 주소에는 영문 소문자·숫자·하이픈만 사용할 수 있습니다.');
  if (!value.body) return setMessage('error', '본문을 입력해 주세요.');
  const payload = { ...value, status };
  setMessage('', status === 'published' ? '발행 중…' : '저장 중…');
  try {
    if (post) {
      if (post.status === 'published') payload.slug = post.slug;
      post = (await communityApi.updateOriginal(post.id, payload)).post;
    } else {
      post = (await communityApi.createOriginal(payload)).post;
      history.replaceState(null, '', `/write-original?id=${post.id}`);
    }
    if (status === 'published') location.href = `/original/${encodeURIComponent(post.slug)}`;
    else location.href = `/write-original?id=${encodeURIComponent(post.id)}`;
  } catch (error) {
    const duplicate = String(error.message || '').includes('duplicate key');
    setMessage('error', duplicate ? '같은 공개 주소가 이미 있습니다. 주소를 조금 바꿔 주세요.' : `저장 실패: ${error.message || error}`);
  }
}

