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

const HUMANIZER_REASONS = {
  numbers_changed: '숫자가 바뀌어 원문 유지', quotes_changed: '인용문이 바뀌어 원문 유지',
  dash_remaining: '줄표가 남아 원문 유지',
};
export function draftReadyMessage({ date, desk, content, qa }) {
  const series = desk.id === 'weekly' ? 'KK Weekly' : 'KK Daily';
  const characters = qa?.characters ? ` · 본문 ${qa.characters}자` : '';
  const reason = String(qa?.humanizer?.reason || '');
  const style = qa?.humanizer?.applied
    ? '문체 다듬기(humanizer) 적용'
    : `문체 다듬기 미적용: ${HUMANIZER_REASONS[reason] || reason.split(':')[0] || '기록 없음'}`;
  const notes = qa?.modelReview?.notes?.length ? `\n편집 검수 메모 ${qa.modelReview.notes.length}건 — 관리 화면에서 확인` : '';
  return {
    title: `[${series} 자동 초안] ${desk.label}`,
    text: `${content.title}${characters}\n${style}${notes}\n\n검토 후 발행: https://www.kkandfriends.com/admin-editorial?id=${date}-${desk.id}`,
  };
}
