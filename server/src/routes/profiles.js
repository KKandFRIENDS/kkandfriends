import { resolveViewer, requireAdmin, requireMember, requireViewer } from '../access.js';
import { notifyApplication, notifyApproval } from '../notifications.js';
import { setNewsletterSubscription, stibeeConfigured } from '../stibee.js';

const EDITABLE = new Set([
  'displayName', 'identityMode', 'realName', 'affiliation', 'showAffiliation',
  'field', 'careerSummary', 'noteToAdmin', 'onboarded', 'digestOptIn', 'dailyBriefOptin', 'avatarUrl',
  'newsletterOptIn',
]);
const COLUMNS = {
  displayName: 'display_name', identityMode: 'identity_mode', realName: 'real_name',
  affiliation: 'affiliation', showAffiliation: 'show_affiliation', field: 'field',
  careerSummary: 'career_summary', noteToAdmin: 'note_to_admin', onboarded: 'onboarded',
  digestOptIn: 'digest_opt_in', dailyBriefOptin: 'daily_brief_optin',
  avatarUrl: 'avatar_url', newsletterOptIn: 'newsletter_opt_in',
};

// The /me checkbox renders only when the profile row carries newsletter_opt_in,
// so hiding the column while Stibee keys are unset keeps the option dormant.
function publicProfile(profile, config) {
  if (!profile || stibeeConfigured(config) || !('newsletter_opt_in' in profile)) return profile;
  const { newsletter_opt_in: _hidden, ...rest } = profile;
  return rest;
}

export async function registerProfileRoutes(app, { auth, pool, config }) {
  app.get('/api/v1/members', async (request, reply) => {
    const viewer = await resolveViewer(request, auth, pool, config.adminUserId);
    if (!requireMember(viewer, reply)) return;
    const ids = String(request.query?.ids || '').split(',').filter(Boolean).slice(0, 100);
    const result = ids.length
      ? await pool.query(`select id,display_name,identity_mode,field,avatar_url,is_founding,
          case when show_affiliation then affiliation else null end as affiliation
          from profiles where status='approved' and id=any($1::text[])`, [ids])
      : await pool.query(`select id,display_name,identity_mode,field,avatar_url,is_founding,
          case when show_affiliation then affiliation else null end as affiliation
          from profiles where status='approved' order by is_founding desc,display_name`);
    return { members: result.rows };
  });
  app.get('/api/v1/profile', async (request, reply) => {
    const viewer = await resolveViewer(request, auth, pool, config.adminUserId);
    if (!requireViewer(viewer, reply)) return;
    return { profile: publicProfile(viewer.profile, config), user: viewer.user, isAdmin: viewer.isAdmin };
  });

  app.patch('/api/v1/profile', async (request, reply) => {
    const viewer = await resolveViewer(request, auth, pool, config.adminUserId);
    if (!requireViewer(viewer, reply)) return;
    let entries = Object.entries(request.body || {}).filter(([key]) => EDITABLE.has(key));
    const newsletter = entries.find(([key]) => key === 'newsletterOptIn');
    if (newsletter) {
      const wanted = newsletter[1];
      if (typeof wanted !== 'boolean') return reply.status(400).send({ error: 'newsletterOptIn must be a boolean' });
      if (!stibeeConfigured(config)) {
        entries = entries.filter(([key]) => key !== 'newsletterOptIn');
      } else if (wanted !== Boolean(viewer.profile?.newsletter_opt_in)) {
        // Sync Stibee first: a saved flag that Stibee never received would
        // promise the member mail they will not get.
        const email = viewer.profile?.contact_email || viewer.user?.email;
        if (!email) return reply.status(400).send({ error: '뉴스레터를 받을 이메일 주소가 계정에 없습니다.' });
        try {
          await setNewsletterSubscription(config, email, wanted);
        } catch (error) {
          request.log.error({ err: error }, 'stibee newsletter sync failed');
          return reply.status(502).send({ error: '뉴스레터 설정을 스티비에 반영하지 못했습니다. 잠시 후 다시 시도해 주세요.' });
        }
      }
    }
    if (!entries.length) return reply.status(400).send({ error: 'No editable fields supplied' });
    const sets = entries.map(([key], index) => `${COLUMNS[key]} = $${index + 2}`);
    const values = entries.map(([, value]) => value);
    const result = await pool.query(
      `update profiles set ${sets.join(', ')} where id = $1 returning *`,
      [viewer.user.id, ...values],
    );
    if (!viewer.profile?.onboarded && result.rows[0]?.onboarded && result.rows[0]?.status === 'pending') {
      void notifyApplication(config, result.rows[0]).catch(error => request.log.error({ err: error }, 'application notification failed'));
    }
    return { profile: publicProfile(result.rows[0], config) };
  });

  app.get('/api/v1/admin/members', async (request, reply) => {
    const viewer = await resolveViewer(request, auth, pool, config.adminUserId);
    if (!requireAdmin(viewer, reply)) return;
    const status = request.query?.status;
    const result = status
      ? await pool.query('select * from profiles where status = $1 order by created_at desc', [status])
      : await pool.query('select * from profiles order by created_at desc');
    return { members: result.rows };
  });

  app.patch('/api/v1/admin/members/:id', async (request, reply) => {
    const viewer = await resolveViewer(request, auth, pool, config.adminUserId);
    if (!requireAdmin(viewer, reply)) return;
    const { status, isFounding } = request.body || {};
    if (status !== undefined && !['pending', 'approved', 'declined', 'suspended'].includes(status)) {
      return reply.status(400).send({ error: 'Invalid status' });
    }
    if (status === undefined && isFounding === undefined) {
      return reply.status(400).send({ error: 'No admin fields supplied' });
    }
    const result = await pool.query(
      `update profiles
          set status = coalesce($2, status),
              is_founding = coalesce($3, is_founding),
              approved_at = case when $2 = 'approved' then coalesce(approved_at, now()) else approved_at end
        where id = $1 returning *`,
      [request.params.id, status ?? null, isFounding ?? null],
    );
    if (!result.rows[0]) return reply.status(404).send({ error: 'Member not found' });
    if (status === 'approved') {
      void notifyApproval(config, result.rows[0]).catch(error => request.log.error({ err: error }, 'approval notification failed'));
    }
    return { profile: result.rows[0] };
  });
}
