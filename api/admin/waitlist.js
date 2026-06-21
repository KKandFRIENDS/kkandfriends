// Admin waitlist API — token-protected.
//   GET    /api/admin/waitlist            list applicants (JSON), ?format=csv to export
//   DELETE /api/admin/waitlist?id=<id>    remove one applicant
//   Auth:  Authorization: Bearer <ADMIN_TOKEN>   or   ?token=<ADMIN_TOKEN>
import { db, ensureTable } from '../../lib/waitlist-db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'DELETE') {
    res.setHeader('Allow', 'GET, DELETE');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    return res.status(500).json({ ok: false, error: 'ADMIN_TOKEN not configured.' });
  }

  const auth = req.headers['authorization'] || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const provided = bearer || (req.query && req.query.token) || '';
  if (provided !== expected) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  try {
    await ensureTable();

    if (req.method === 'DELETE') {
      const id = parseInt((req.query && req.query.id) || '', 10);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ ok: false, error: 'A valid id is required.' });
      }
      const result = await db.sql`DELETE FROM waitlist WHERE id = ${id}`;
      return res.status(200).json({ ok: true, deleted: result.rowCount });
    }

    const { rows } = await db.sql`
      SELECT id, name, email, organization, role, tier, message, locale, source, created_at, updated_at
      FROM waitlist
      ORDER BY created_at DESC
    `;

    if (req.query && req.query.format === 'csv') {
      const header = [
        'id', 'name', 'email', 'organization', 'role', 'tier', 'message', 'locale', 'source', 'created_at',
      ];
      const csv = [
        header.join(','),
        ...rows.map((r) => header.map((h) => csvCell(r[h])).join(',')),
      ].join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="kkfriends-waitlist.csv"');
      return res.status(200).send('﻿' + csv); // BOM so Excel reads UTF-8
    }

    return res.status(200).json({ ok: true, count: rows.length, applicants: rows });
  } catch (err) {
    console.error('admin waitlist error:', err);
    return res.status(500).json({ ok: false, error: 'Query failed.' });
  }
}

function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
