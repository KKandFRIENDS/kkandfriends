import { createAuthClient } from 'https://esm.sh/better-auth@1.7.5/client';
import { API_URL, ADMIN_UID } from '/config.js';
import { communityApi } from '/js/vps-api.js';
import { setAdminHint } from '/js/admin-hint.js';

const client = createAuthClient({ baseURL: API_URL, fetchOptions: { credentials: 'include' } });

export const POST_CATEGORIES = ['시장/매크로','크립토/디지털자산','정책/규제','커리어','자유'];
export const IDENTITY_FIELDS = ['증권/브로커리지','자산운용/펀드','은행','보험','사모펀드/벤처캐피탈','헤지펀드/트레이딩','규제/감독기관','핀테크/디지털자산','리서치/이코노미스트','법률/회계/컨설팅','기업 재무/IR','학계/연구','기타'];

export const isConfigured = () => Boolean(API_URL);
// A busy or briefly unreachable API is not the same as being signed out:
// retry a couple of times before showing the sign-in screen.
export async function currentUser() {
  for (let attempt = 0; ; attempt += 1) {
    const result = await client.getSession().catch(error => ({ error }));
    if (!result.error) return result.data?.user || null;
    if (result.error.status === 401 || attempt >= 2) return null;
    await new Promise(resolve => setTimeout(resolve, 700 * (attempt + 1)));
  }
}
export function onAuthChange(callback) {
  const handler = () => currentUser().then(callback).catch(() => callback(null));
  addEventListener('pageshow', handler);
  return () => removeEventListener('pageshow', handler);
}
async function signInWithProvider(provider, redirectTo) {
  const callbackURL = new URL(redirectTo || location.href.split('#')[0], location.origin).href;
  const errorCallbackURL = new URL('/join', location.origin).href;
  const result = await client.signIn.social({ provider, callbackURL, errorCallbackURL, disableRedirect: true });
  if (result.error) throw new Error(result.error.message || '로그인을 시작하지 못했습니다.');
  if (!result.data?.url) throw new Error('로그인 이동 주소를 받지 못했습니다.');
  location.assign(result.data.url);
}

export const signInWithGoogle = (redirectTo) => signInWithProvider('google', redirectTo);
export const signInWithKakao = (redirectTo) => signInWithProvider('kakao', redirectTo);
export const signOut = () => { setAdminHint(false); return client.signOut(); };
export const isAdmin = (user) => {
  const owner = Boolean(user?.id && ADMIN_UID && user.id === ADMIN_UID);
  if (owner) setAdminHint(true);
  return owner;
};
export async function fetchMyProfile() {
  try { return (await communityApi.profile()).profile || null; } catch (error) { if (error.status === 401) return null; throw error; }
}
export async function unreadNotifications() {
  try { return (await communityApi.notifications()).notifications.filter(item => !item.is_read).length; }
  catch { return 0; }
}
export async function fetchPublicProfiles(ids) {
  if (!ids?.length) return {};
  const rows = (await communityApi.members([...new Set(ids.filter(Boolean))])).members;
  return Object.fromEntries(rows.map(profile => [profile.id, profile]));
}

const GOOGLE_SVG = `<svg class="google-icon" viewBox="0 0 48 48" aria-hidden="true" style="width:18px;height:18px"><path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/><path fill="#FF3D00" d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/><path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/><path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/></svg>`;
const KAKAO_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true" style="width:18px;height:18px"><path fill="#191600" d="M12 3C6.5 3 2 6.6 2 11c0 2.8 1.9 5.3 4.7 6.7-.2.7-.8 2.6-.9 3-.1.5.2.5.4.4.2-.1 2.6-1.8 3.7-2.5.7.1 1.4.2 2.1.2 5.5 0 10-3.6 10-8S17.5 3 12 3z"/></svg>`;
export function signInButtonsHtml() { return `<button class="btn btn-full" data-auth="google">${GOOGLE_SVG} Google로 계속하기</button><button class="btn btn-full" data-auth="kakao" style="background:#FEE500;color:#191600;border-color:#FEE500">${KAKAO_SVG} 카카오로 계속하기</button>`; }
export function wireSignIn(container, redirect) {
  const root = container || document;
  const start = async (button, action) => {
    button.disabled = true;
    try { await action(redirect); }
    catch (error) {
      button.disabled = false;
      console.error(error);
      alert(error.message || '로그인을 시작하지 못했습니다.');
    }
  };
  const google = root.querySelector('[data-auth="google"]');
  const kakao = root.querySelector('[data-auth="kakao"]');
  google?.addEventListener('click', () => start(google, signInWithGoogle));
  kakao?.addEventListener('click', () => start(kakao, signInWithKakao));
}
export function esc(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
