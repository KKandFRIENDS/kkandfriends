// Admin waitlist API — token-protected.
//   GET    /api/admin/waitlist            list applicants (JSON), ?format=csv to export
//   DELETE /api/admin/waitlist?id=<id>    remove one applicant
//   Auth:  Authorization: Bearer <ADMIN_TOKEN>   or   ?token=<ADMIN_TOKEN>
import { sql, ensureTable } from '../../../../lib/waitlist-db.js';

function authorize(request) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    return Response.json({ ok: false, error: 'ADMIN_TOKEN not configured.' }, { status: 500 });
  }
  const auth = request.headers.get('authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const provided = bearer || new URL(request.url).searchParams.get('token') || '';
  if (provided !== expected) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

export async function GET(request) {
  const denied = authorize(request);
  if (denied) return denied;

  try {
    await ensureTable();

    const { rows } = await sql`
      SELECT id, name, email, organization, role, tier, message, locale, source, created_at, updated_at
      FROM waitlist
      ORDER BY created_at DESC
    `;

    if (new URL(request.url).searchParams.get('format') === 'csv') {
      const header = [
        'id', 'name', 'email', 'organization', 'role', 'tier', 'message', 'locale', 'source', 'created_at',
      ];
      const csv = [
        header.join(','),
        ...rows.map((r) => header.map((h) => csvCell(r[h])).join(',')),
      ].join('\n');
      return new Response('﻿' + csv, {
        // BOM so Excel reads UTF-8
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="kkfriends-waitlist.csv"',
        },
      });
    }

    return Response.json({ ok: true, count: rows.length, applicants: rows });
  } catch (err) {
    console.error('admin waitlist error:', err);
    return Response.json({ ok: false, error: 'Query failed.' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const denied = authorize(request);
  if (denied) return denied;

  try {
    await ensureTable();
    const id = parseInt(new URL(request.url).searchParams.get('id') || '', 10);
    if (!Number.isInteger(id) || id <= 0) {
      return Response.json({ ok: false, error: 'A valid id is required.' }, { status: 400 });
    }
    const result = await sql`DELETE FROM waitlist WHERE id = ${id}`;
    return Response.json({ ok: true, deleted: result.rowCount });
  } catch (err) {
    console.error('admin waitlist error:', err);
    return Response.json({ ok: false, error: 'Query failed.' }, { status: 500 });
  }
}

function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
