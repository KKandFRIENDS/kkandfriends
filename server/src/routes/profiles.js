import { resolveViewer, requireAdmin, requireMember, requireViewer } from '../access.js';
import { notifyApplication, notifyApproval } from '../notifications.js';

const EDITABLE = new Set([
  'displayName', 'identityMode', 'realName', 'affiliation', 'showAffiliation',
  'field', 'careerSummary', 'noteToAdmin', 'onboarded', 'digestOptIn', 'dailyBriefOptin', 'avatarUrl',
]);
const COLUMNS = {
  displayName: 'display_name', identityMode: 'identity_mode', realName: 'real_name',
  affiliation: 'affiliation', showAffiliation: 'show_affiliation', field: 'field',
  careerSummary: 'career_summary', noteToAdmin: 'note_to_admin', onboarded: 'onboarded',
  digestOptIn: 'digest_opt_in', dailyBriefOptin: 'daily_brief_optin',
  avatarUrl: 'avatar_url',
};

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
    return { profile: viewer.profile, user: viewer.user, isAdmin: viewer.isAdmin };
  });

  app.patch('/api/v1/profile', async (request, reply) => {
    const viewer = await resolveViewer(request, auth, pool, config.adminUserId);
    if (!requireViewer(viewer, reply)) return;
    const entries = Object.entries(request.body || {}).filter(([key]) => EDITABLE.has(key));
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
    return { profile: result.rows[0] };
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
