// GET /api/admin/waitlist — list applicants (JSON or CSV). Token-protected.
//   Authorization: Bearer <ADMIN_TOKEN>   or   ?token=<ADMIN_TOKEN>
//   ?format=csv   to download a spreadsheet
import { db, ensureTable } from '../../lib/waitlist-db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
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
