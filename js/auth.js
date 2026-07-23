// ============================================================================
//  auth.js — shared Supabase auth + profile helpers for the member system.
//
//  Same trust model as blog/discussion.js: a public page using the anon key.
//  Every privileged action is enforced server-side by RLS + SECURITY DEFINER
//  functions (see db/migrations/002_members.sql). Nothing here is a security
//  boundary — it only drives the UI.
//
//  Usage:
//      import { getClient, currentUser, signInWithGoogle, signOut,
//               fetchMyProfile } from "/js/auth.js";
// ============================================================================

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY, ADMIN_UID } from "/config.js";

export const POST_CATEGORIES = [
  "시장/매크로",
  "크립토/디지털자산",
  "정책/규제",
  "커리어",
  "자유",
];

export const IDENTITY_FIELDS = [
  "증권/브로커리지",
  "자산운용/펀드",
  "은행",
  "보험",
  "사모펀드/벤처캐피탈",
  "헤지펀드/트레이딩",
  "규제/감독기관",
  "핀테크/디지털자산",
  "리서치/이코노미스트",
  "법률/회계/컨설팅",
  "기업 재무/IR",
  "학계/연구",
  "기타",
];

let _client = null;

// Returns null (not a throwing state) when Supabase isn't configured yet, so
// pages can show a friendly "not configured" message instead of crashing.
export function isConfigured() {
  return Boolean(SUPABASE_URL) && !SUPABASE_URL.includes("YOUR-PROJECT-REF");
}

export function getClient() {
  if (!isConfigured()) return null;
  if (!_client) {
    _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return _client;
}

export async function currentUser() {
  const sb = getClient();
  if (!sb) return null;
  const { data: { session } } = await sb.auth.getSession();
  return session?.user ?? null;
}

export function onAuthChange(cb) {
  const sb = getClient();
  if (!sb) return () => {};
  const { data } = sb.auth.onAuthStateChange((_e, session) => cb(session?.user ?? null));
  return () => data.subscription.unsubscribe();
}

// redirectTo defaults to the current page so the user lands back where they
// started after the Google round-trip. The URL must be whitelisted in
// Supabase → Authentication → URL Configuration (see DISCUSSION_SETUP.md step 5).
export async function signInWithGoogle(redirectTo) {
  const sb = getClient();
  if (!sb) return;
  await sb.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: redirectTo || location.href.split("#")[0] },
  });
}

// Kakao is a native Supabase OAuth provider — enable it in
// Supabase → Authentication → Providers → Kakao (see MEMBERSHIP_SETUP.md).
//
// We request only `profile_nickname`. Kakao's email scope (account_email)
// requires a Business App conversion + review; on a personal app it is
// "권한 없음", and requesting it makes Kakao reject the whole login with
// KOE205. Nickname alone is enough to create the account (email stays null,
// which just means no weekly digest for Kakao-only members).
export async function signInWithKakao(redirectTo) {
  const sb = getClient();
  if (!sb) return;
  await sb.auth.signInWithOAuth({
    provider: "kakao",
    options: {
      redirectTo: redirectTo || location.href.split("#")[0],
      scopes: "profile_nickname",
    },
  });
}

const GOOGLE_SVG = `<svg class="google-icon" viewBox="0 0 48 48" aria-hidden="true" style="width:18px;height:18px;"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.2-7.9l-6.5 5C9.6 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C39.9 36.7 44 31 44 24c0-1.3-.1-2.3-.4-3.5z"/></svg>`;
const KAKAO_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true" style="width:18px;height:18px;"><path fill="#191600" d="M12 3C6.5 3 2 6.6 2 11c0 2.8 1.9 5.3 4.7 6.7-.2.7-.8 2.6-.9 3-.1.5.2.5.4.4.2-.1 2.6-1.8 3.7-2.5.7.1 1.4.2 2.1.2 5.5 0 10-3.6 10-8S17.5 3 12 3z"/></svg>`;

// Shared sign-in buttons (Google + Kakao). Use with wireSignIn().
export function signInButtonsHtml() {
  return `
    <button class="btn btn-full" data-auth="google">${GOOGLE_SVG} Google로 계속하기</button>
    <button class="btn btn-full" data-auth="kakao" style="background:#FEE500;color:#191600;border-color:#FEE500;">${KAKAO_SVG} 카카오로 계속하기</button>`;
}
export function wireSignIn(container, redirect) {
  const root = container || document;
  const g = root.querySelector('[data-auth="google"]');
  if (g) g.onclick = () => signInWithGoogle(redirect);
  const k = root.querySelector('[data-auth="kakao"]');
  if (k) k.onclick = () => signInWithKakao(redirect);
}

export async function signOut() {
  const sb = getClient();
  if (!sb) return;
  await sb.auth.signOut();
}

// The current user's profile row (created by the DB trigger on first sign-in).
// Returns null if signed out; may briefly be null right after signup until the
// trigger has run, so callers should tolerate a retry.
export async function fetchMyProfile() {
  const sb = getClient();
  if (!sb) return null;
  const user = await currentUser();
  if (!user) return null;
  const { data, error } = await sb.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (error) { console.warn("fetchMyProfile:", error.message); return null; }
  return data;
}

// Count of the current user's unread notifications (0 if signed out).
export async function unreadNotifications() {
  const sb = getClient();
  if (!sb) return 0;
  const user = await currentUser();
  if (!user) return 0;
  const { count, error } = await sb
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_read", false);
  if (error) return 0;
  return count || 0;
}

// Fetch safe public byline info for a set of user ids → { id: profile }.
export async function fetchPublicProfiles(ids) {
  const sb = getClient();
  const map = {};
  const uniq = [...new Set((ids || []).filter(Boolean))];
  if (!sb || !uniq.length) return map;
  const { data } = await sb.from("public_member_profiles").select("*").in("id", uniq);
  (data || []).forEach((p) => { map[p.id] = p; });
  return map;
}

export function isAdmin(user) {
  return Boolean(user) && Boolean(ADMIN_UID) && user.id === ADMIN_UID;
}

// Small HTML-escape helper shared by the member pages.
export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}
