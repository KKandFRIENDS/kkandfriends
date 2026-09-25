import { betterAuth } from 'better-auth';
import { Pool } from 'pg';

export function createAuth(config) {
  const database = new Pool({ connectionString: config.databaseUrl, max: 5 });
  return betterAuth({
    appName: 'KK & Friends',
    baseURL: config.apiOrigin,
    basePath: '/api/auth',
    secret: config.authSecret,
    trustedOrigins: [config.publicOrigin],
    database,
    account: {
      // The default database strategy keeps its signed browser state cookie for
      // only five minutes. Social login and MFA can reasonably take longer, so
      // keep the complete encrypted state in a ten-minute cookie instead.
      // This preserves state/CSRF validation; it does not skip the check.
      storeStateStrategy: 'cookie',
    },
    advanced: {
      database: { generateId: 'uuid', joins: true },
      crossSubDomainCookies: { enabled: config.production, domain: '.kkandfriends.com' },
      useSecureCookies: config.production,
    },
    socialProviders: {
      google: { clientId: config.googleClientId, clientSecret: config.googleClientSecret },
      kakao: { clientId: config.kakaoClientId, clientSecret: config.kakaoClientSecret },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await database.query(
              `insert into profiles (id, contact_email, avatar_url, display_name, real_name)
               values ($1, $2, $3, $4, $4)
               on conflict (id) do update set
                 contact_email = coalesce(profiles.contact_email, excluded.contact_email),
                 avatar_url = coalesce(profiles.avatar_url, excluded.avatar_url)`,
              [user.id, user.email || null, user.image || null, user.name || null],
            );
          },
        },
      },
    },
  });
}

