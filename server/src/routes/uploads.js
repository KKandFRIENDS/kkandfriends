import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { resolveViewer, requireMember } from '../access.js';

const TYPES = {
  'image/jpeg': { ext: 'jpg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { ext: 'png', magic: (b) => b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) },
  'image/gif': { ext: 'gif', magic: (b) => ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString('ascii')) },
  'image/webp': { ext: 'webp', magic: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' },
};

export function validImage(buffer, contentType) {
  return Buffer.isBuffer(buffer) && buffer.length > 0 && buffer.length <= 5 * 1024 * 1024 && Boolean(TYPES[contentType]?.magic(buffer));
}

export async function registerUploadRoutes(app, { auth, pool, config }) {
  app.addContentTypeParser(Object.keys(TYPES), { parseAs: 'buffer', bodyLimit: 5 * 1024 * 1024 }, (_request, body, done) => done(null, body));

  app.post('/api/v1/uploads', async (request, reply) => {
    const viewer = await resolveViewer(request, auth, pool, config.adminUserId);
    if (!requireMember(viewer, reply)) return;
    const contentType = String(request.headers['content-type'] || '').split(';')[0].toLowerCase();
    if (!validImage(request.body, contentType)) return reply.status(415).send({ error: 'JPEG, PNG, GIF or WebP image up to 5 MB required' });
    const now = new Date();
    const year = String(now.getUTCFullYear());
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const filename = `${randomUUID()}.${TYPES[contentType].ext}`;
    const directory = path.join(config.uploadRoot, year, month);
    await mkdir(directory, { recursive: true, mode: 0o750 });
    await writeFile(path.join(directory, filename), request.body, { flag: 'wx', mode: 0o640 });
    return reply.status(201).send({ url: `${config.apiOrigin}/uploads/${year}/${month}/${filename}` });
  });
}
