function cleanDetail(value, token) {
  return String(value ?? '')
    .replaceAll(token || '\u0000', '[REDACTED]')
    .replace(/https?:\/\/\S+/g, '[URL]')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 300);
}

export async function sendTelegramNotification({ title, text, env = process.env, fetchImpl = fetch }) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chat = env.TELEGRAM_CHANNEL_ID || env.TELEGRAM_CHAT_ID;
  if (!token || !chat) {
    return { ok: false, reason: 'not_configured', missing: [!token && 'TELEGRAM_BOT_TOKEN', !chat && 'TELEGRAM_CHAT_ID'].filter(Boolean) };
  }
  try {
    const response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: `${title}\n\n${text}`, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(15000),
    });
    let payload = null;
    try {
      if (typeof response.json === 'function') payload = await response.json();
    } catch {}
    if (response.ok && payload?.ok !== false) return { ok: true, status: response.status ?? 200 };
    return {
      ok: false,
      reason: 'telegram_rejected',
      status: response.status ?? null,
      errorCode: Number.isInteger(payload?.error_code) ? payload.error_code : null,
      description: cleanDetail(payload?.description || response.statusText || 'Telegram rejected the request', token),
      retryAfter: Number.isFinite(payload?.parameters?.retry_after) ? payload.parameters.retry_after : null,
    };
  } catch (error) {
    return { ok: false, reason: 'network_error', error: error?.name || 'Error', description: cleanDetail(error?.message, token) };
  }
}

export async function notifyTelegram(options) {
  return (await sendTelegramNotification(options)).ok;
}
