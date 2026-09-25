begin;

-- Better Auth 1.7.x core schema. Quoted camelCase names match the library's
-- PostgreSQL adapter defaults. Apply before 001_app_schema.sql.
create table if not exists "user" (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  email text not null unique,
  "emailVerified" boolean not null default false,
  image text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table if not exists session (
  id text primary key default gen_random_uuid()::text,
  "expiresAt" timestamptz not null,
  token text not null unique,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  "ipAddress" text,
  "userAgent" text,
  "userId" text not null references "user"(id) on delete cascade
);
create index if not exists session_user_id_idx on session ("userId");

create table if not exists account (
  id text primary key default gen_random_uuid()::text,
  "accountId" text not null,
  "providerId" text not null,
  "userId" text not null references "user"(id) on delete cascade,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  scope text,
  password text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("providerId", "accountId")
);
create index if not exists account_user_id_idx on account ("userId");

create table if not exists verification (
  id text primary key default gen_random_uuid()::text,
  identifier text not null,
  value text not null,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
create index if not exists verification_identifier_idx on verification (identifier);

commit;
