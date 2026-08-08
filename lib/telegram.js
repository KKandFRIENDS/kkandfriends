// Telegram send helpers shared by the research-lab endpoints.
//
// The one thing worth knowing: sendMessage caps a message at 4096 characters
// and rejects the whole thing when you go over — it does not truncate. The
// research summary is written to a 2,800-character target precisely so this is
// never hit, but a model that ignores the target must not cost KK the send, so
// anything oversized is split on paragraph boundaries and numbered.
//
// Env:
//   TELEGRAM_BOT_TOKEN            required for anything to send
//   TELEGRAM_CHAT_ID              KK's own chat — approval requests, alerts
//   RESEARCH_TELEGRAM_CHAT_ID     optional: separate archive chat for research
//   TELEGRAM_CHANNEL_ID           the members' channel (never used here)

const API = (method) => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`;

export function telegramConfigured() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && researchChatId());
}

// Research output goes to KK, not to the members' channel — it names candidate
// topics and shows the editorial scoring, which is working material.
export function researchChatId() {
  return process.env.RESEARCH_TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID || null;
}

async function call(method, body) {
  if (!process.env.TELEGRAM_BOT_TOKEN) return { ok: false, error: 'no bot token' };
  try {
    const res = await fetch(API(method), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) {
      return { ok: false, error: json?.description || `HTTP ${res.status}` };
    }
    return { ok: true, result: json.result };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

/**
 * Send text, splitting when it would be rejected for length.
 * @param {object} opts
 * @param {string} opts.chatId
 * @param {string} opts.text
 * @param {Array}  [opts.buttons]   inline keyboard rows of {text, url}
 * @param {number} [opts.chunkChars]
 * @param {number} [opts.delayMs]   pause between chunks, to stay under the rate limit
 */
export async function sendMessage({ chatId, text, buttons, chunkChars = 3700, delayMs = 750 }) {
  const chunks = splitForTelegram(text, chunkChars);
  const sent = [];

  for (const [i, chunk] of chunks.entries()) {
    const isLast = i === chunks.length - 1;
    const label = chunks.length > 1 ? `(${i + 1}/${chunks.length})\n\n` : '';
    const r = await call('sendMessage', {
      chat_id: chatId,
      text: label + chunk,
      disable_web_page_preview: true,
      // Buttons belong on the final chunk only — a decision button attached to
      // part 1 of 3 invites a click before the thing being decided has arrived.
      ...(buttons && isLast ? { reply_markup: { inline_keyboard: buttons } } : {}),
    });
    if (!r.ok) return { ok: false, error: r.error, sent: sent.length };
    sent.push(r.result);
    if (!isLast && delayMs) await sleep(delayMs);
  }

  return { ok: true, chunks: chunks.length, messages: sent };
}

/** Attach the full report as a .md file — no length limit, and it drops
 *  straight into the Obsidian vault from the Telegram app. */
export async function sendDocument({ chatId, filename, content, caption }) {
  if (!process.env.TELEGRAM_BOT_TOKEN) return { ok: false, error: 'no bot token' };
  try {
    const form = new FormData();
    form.append('chat_id', chatId);
    if (caption) form.append('caption', caption.slice(0, 1024));
    form.append(
      'document',
      new Blob([content], { type: 'text/markdown; charset=utf-8' }),
      filename
    );

    const res = await fetch(API('sendDocument'), {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(20_000),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) return { ok: false, error: json?.description || `HTTP ${res.status}` };
    return { ok: true, result: json.result };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

/** Failure notice → KK's own chat, never the members' channel. */
export async function alertAdmin(text) {
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!chat) return { ok: false, error: 'no admin chat id' };
  return call('sendMessage', { chat_id: chat, text: text.slice(0, 4000), disable_web_page_preview: true });
}

/**
 * Split on paragraph breaks, then line breaks, then hard-cut. Never mid-word
 * if it can be helped — a sentence sliced in half reads as a bug.
 */
export function splitForTelegram(text, chunkChars = 3700) {
  const src = String(text ?? '');
  if (src.length <= chunkChars) return [src];

  const chunks = [];
  let current = '';

  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = '';
  };

  for (const para of src.split(/\n{2,}/)) {
    const block = para.trim();
    if (!block) continue;

    if (current && current.length + block.length + 2 > chunkChars) flush();

    if (block.length <= chunkChars) {
      current = current ? `${current}\n\n${block}` : block;
      continue;
    }

    // A single paragraph over the limit: fall back to lines, then to a hard cut.
    for (const line of block.split('\n')) {
      if (current && current.length + line.length + 1 > chunkChars) flush();
      if (line.length <= chunkChars) {
        current = current ? `${current}\n${line}` : line;
      } else {
        for (let i = 0; i < line.length; i += chunkChars) {
          flush();
          chunks.push(line.slice(i, i + chunkChars));
        }
      }
    }
  }

  flush();
  return chunks.length ? chunks : [src.slice(0, chunkChars)];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
