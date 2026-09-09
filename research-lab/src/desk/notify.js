export async function notifyTelegram({ title, text, env = process.env, fetchImpl = fetch }) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chat = env.TELEGRAM_CHANNEL_ID || env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return false;
  const response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text: `${title}\n\n${text}`, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(15000),
  });
  return response.ok;
}
