// ============================================================================
//  config.js — public configuration for the kkandfriends discussion module.
//
//  SAFE TO COMMIT. These are Supabase's PUBLIC values (project URL + anon key).
//  They are safe in a public static site ONLY because Row Level Security (RLS)
//  enforces every read and write on the server — see db/migrations/001_comments.sql.
//
//  NEVER put the Supabase `service_role` key — or any secret — in this file or
//  anywhere else in the repo. All privileged actions are enforced by RLS.
// ============================================================================

// Supabase → Project Settings → API
export const SUPABASE_URL = "https://pahdwduqxxiugqjkbhvq.supabase.co"; // ← Project URL
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhaGR3ZHVxeHhpdWdxamtiaHZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzMjE1NTYsImV4cCI6MjA5ODg5NzU1Nn0.kpRXjVa_BKhUc5OOrkY_uNGdM2COSlnk0LjG5Z9a_W8"; // "anon / public" key (safe to commit — RLS protects data)

// The owner's auth UID. Used CLIENT-SIDE ONLY to show/hide the admin
// "Hide / Delete" buttons — real enforcement is the is_admin() RLS policy.
// After your first Google sign-in (SETUP.md step 4), paste your UID here AND
// into db/migrations/001_comments.sql (-- ADMIN_UID_HERE), then re-run that
// function in the Supabase SQL editor.
export const ADMIN_UID = "6ac6cf72-1c88-4626-9124-27a6a2792e1e";

// Optional: Kakao JavaScript key for the KakaoTalk share button.
// Leave "" to fall back to a Kakao web-share link. Get one at developers.kakao.com.
export const KAKAO_JS_KEY = "";
