const required = (env, name) => {
  const value = env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

export function loadConfig(env = process.env) {
  const production = (env.NODE_ENV || 'development') === 'production';
  const config = {
    production,
    port: Number(env.PORT || 4000),
    publicOrigin: env.PUBLIC_ORIGIN || 'http://localhost:8080',
    apiOrigin: env.API_ORIGIN || 'http://localhost:4000',
    databaseUrl: env.DATABASE_URL,
    authSecret: env.BETTER_AUTH_SECRET,
    googleClientId: env.GOOGLE_CLIENT_ID,
    googleClientSecret: env.GOOGLE_CLIENT_SECRET,
    kakaoClientId: env.KAKAO_CLIENT_ID,
    kakaoClientSecret: env.KAKAO_CLIENT_SECRET,
    adminUserId: env.ADMIN_USER_ID,
    uploadRoot: env.UPLOAD_ROOT || '/srv/kkf/uploads',
    resendApiKey: env.RESEND_API_KEY,
    resendFrom: env.RESEND_FROM,
    adminEmail: env.ADMIN_EMAIL || 'kim.kiseok.1969@gmail.com',
    telegramBotToken: env.TELEGRAM_BOT_TOKEN,
    telegramChatId: env.TELEGRAM_CHAT_ID,
    editorialInternalToken: env.EDITORIAL_INTERNAL_TOKEN,
  };
  if (production) {
    for (const key of ['DATABASE_URL', 'BETTER_AUTH_SECRET', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'KAKAO_CLIENT_ID', 'KAKAO_CLIENT_SECRET', 'ADMIN_USER_ID', 'EDITORIAL_INTERNAL_TOKEN']) required(env, key);
    if (!config.publicOrigin.startsWith('https://') || !config.apiOrigin.startsWith('https://')) {
      throw new Error('Production origins must use HTTPS');
    }
  }
  return config;
}

