// ============================================================================
//  config.js — public, non-secret configuration for the static site.
//
//  Every read and write goes through the VPS API (API_URL), which enforces
//  sessions, membership and admin rights on the server. Supabase was retired
//  on 2026-09-28; nothing here may point at it again.
//
//  NEVER put a secret (API key, token, service key) in this file or anywhere
//  else in the repo.
// ============================================================================

// The owner's user id. Used CLIENT-SIDE ONLY to show/hide admin controls —
// real enforcement is ADMIN_USER_ID in the VPS API server's environment.
export const ADMIN_UID = "6ac6cf72-1c88-4626-9124-27a6a2792e1e";

// VPS application API. This is a public origin, never a secret. The record is
// added only after staging passes; keeping it here does not change live DNS.
export const API_URL = "https://api.kkandfriends.com";

// Optional: Kakao JavaScript key for the KakaoTalk share button.
// Leave "" to fall back to a Kakao web-share link. Get one at developers.kakao.com.
export const KAKAO_JS_KEY = "";
