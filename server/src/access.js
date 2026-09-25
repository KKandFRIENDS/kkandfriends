import { fromNodeHeaders } from 'better-auth/node';

export async function resolveViewer(request, auth, pool, adminUserId) {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
  if (!session) return null;
  const result = await pool.query(
    `select * from profiles where id = $1`,
    [session.user.id],
  );
  return {
    user: session.user,
    session: session.session,
    profile: result.rows[0] || null,
    isAdmin: session.user.id === adminUserId,
    isMember: result.rows[0]?.status === 'approved',
  };
}

export function requireViewer(viewer, reply) {
  if (viewer) return true;
  reply.status(401).send({ error: 'Unauthorized' });
  return false;
}

export function requireMember(viewer, reply) {
  if (!requireViewer(viewer, reply)) return false;
  if (viewer.isMember || viewer.isAdmin) return true;
  reply.status(403).send({ error: 'Approved membership required' });
  return false;
}

export function requireAdmin(viewer, reply) {
  if (!requireViewer(viewer, reply)) return false;
  if (viewer.isAdmin) return true;
  reply.status(403).send({ error: 'Admin required' });
  return false;
}
