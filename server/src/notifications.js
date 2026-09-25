const esc = (value) => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

async function postJson(url, headers, body) {
  const response = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body), signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Notification provider returned HTTP ${response.status}`);
}

export async function notifyApplication(config, applicant) {
  const jobs = [];
  if (config.resendApiKey && config.resendFrom && config.adminEmail) {
    jobs.push(postJson('https://api.resend.com/emails', { Authorization: `Bearer ${config.resendApiKey}` }, {
      from: config.resendFrom, to: config.adminEmail, reply_to: applicant.contact_email || undefined,
      subject: `새 가입 신청 — ${applicant.display_name || '이름 미기재'}`,
      html: `<h2>새 가입 신청</h2><p>표시 이름: ${esc(applicant.display_name)}</p><p>실명: ${esc(applicant.real_name)}</p><p>분야: ${esc(applicant.field)}</p><p>이메일: ${esc(applicant.contact_email)}</p><p>메시지: ${esc(applicant.note_to_admin)}</p><p><a href="${config.publicOrigin}/admin-members">심사하러 가기</a></p>`,
    }));
  }
  if (config.telegramBotToken && config.telegramChatId) {
    const text = ['🆕 새 가입 신청 — KK & Friends', `이름: ${applicant.display_name || '(미기재)'}`,
      applicant.field ? `분야: ${applicant.field}` : '', applicant.real_name ? `실명: ${applicant.real_name}` : '',
      applicant.note_to_admin ? `메시지: ${applicant.note_to_admin}` : '', '',
      `심사하러 가기: ${config.publicOrigin}/admin-members`].filter(Boolean).join('\n');
    jobs.push(postJson(`https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`, {}, {
      chat_id: config.telegramChatId, text, disable_web_page_preview: true,
    }));
  }
  return Promise.all(jobs);
}

export async function notifyApproval(config, member) {
  if (!config.resendApiKey || !config.resendFrom || !member.contact_email) return [];
  return Promise.all([postJson('https://api.resend.com/emails', { Authorization: `Bearer ${config.resendApiKey}` }, {
    from: config.resendFrom, to: member.contact_email,
    subject: 'KK & Friends — 가입이 승인되었습니다',
    html: `<h2>환영합니다, ${esc(member.display_name)}님</h2><p>KK & Friends 가입이 승인되었습니다.</p><p><a href="${config.publicOrigin}/voices">라운지 입장하기</a></p>`,
  })]);
}
