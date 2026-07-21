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
