import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { resolveViewer, requireMember } from '../access.js';

const IMAGE_LIMIT = 5 * 1024 * 1024;
const FILE_LIMIT = 20 * 1024 * 1024;

const isZip = (b) => b.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
// Legacy Office (.doc/.xls/.ppt) and HWP 5 share the OLE compound-file header.
const isOle = (b) => b.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));

const IMAGES = {
  'image/jpeg': { ext: 'jpg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { ext: 'png', magic: (b) => b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) },
  'image/gif': { ext: 'gif', magic: (b) => ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString('ascii')) },
  'image/webp': { ext: 'webp', magic: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' },
};

// Document attachments. Only binary formats with a checkable signature: no
// HTML, SVG or plain text, which a browser could render as a page on the API
// origin. The stored extension always comes from this table, never the upload.
export const FILES = {
  'application/pdf': { ext: 'pdf', magic: (b) => b.subarray(0, 5).toString('ascii') === '%PDF-' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: 'docx', magic: isZip },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { ext: 'xlsx', magic: isZip },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { ext: 'pptx', magic: isZip },
  'application/msword': { ext: 'doc', magic: isOle },
  'application/vnd.ms-excel': { ext: 'xls', magic: isOle },
  'application/vnd.ms-powerpoint': { ext: 'ppt', magic: isOle },
  'application/x-hwp': { ext: 'hwp', magic: isOle },
  'application/hwp+zip': { ext: 'hwpx', magic: isZip },
};

export function validImage(buffer, contentType) {
  return Buffer.isBuffer(buffer) && buffer.length > 0 && buffer.length <= IMAGE_LIMIT && Boolean(IMAGES[contentType]?.magic(buffer));
}

export function validFile(buffer, contentType) {
  return Buffer.isBuffer(buffer) && buffer.length > 0 && buffer.length <= FILE_LIMIT && Boolean(FILES[contentType]?.magic(buffer));
}

// Keep the uploader's file name readable in the link, minus anything that
// could act as a path, a URL delimiter or a control character.
export function safeBaseName(raw) {
  let name = '';
  try { name = decodeURIComponent(String(raw || '')); } catch { name = ''; }
  name = name.split(/[\\/]/).pop().normalize('NFC').replace(/\.[^.]*$/, '')
    .replace(/[^\p{L}\p{N} ._()\-]/gu, '_').replace(/\s+/g, ' ').replace(/^[ ._]+|[ ._]+$/g, '');
  return [...name].slice(0, 80).join('') || 'file';
}

// encodeURIComponent leaves ( ) ! ' * alone; a ')' would end a Markdown link.
export const encodePathName = (name) => encodeURIComponent(name).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export async function registerUploadRoutes(app, { auth, pool, config }) {
  app.addContentTypeParser(Object.keys(IMAGES), { parseAs: 'buffer', bodyLimit: IMAGE_LIMIT }, (_request, body, done) => done(null, body));
  app.addContentTypeParser(Object.keys(FILES), { parseAs: 'buffer', bodyLimit: FILE_LIMIT }, (_request, body, done) => done(null, body));

  app.post('/api/v1/uploads', async (request, reply) => {
    const viewer = await resolveViewer(request, auth, pool, config.adminUserId);
    if (!requireMember(viewer, reply)) return;
    const contentType = String(request.headers['content-type'] || '').split(';')[0].toLowerCase();
    const now = new Date();
    const year = String(now.getUTCFullYear());
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');

    if (IMAGES[contentType]) {
      if (!validImage(request.body, contentType)) return reply.status(415).send({ error: 'JPEG, PNG, GIF or WebP image up to 5 MB required' });
      const filename = `${randomUUID()}.${IMAGES[contentType].ext}`;
      const directory = path.join(config.uploadRoot, year, month);
      await mkdir(directory, { recursive: true, mode: 0o750 });
      await writeFile(path.join(directory, filename), request.body, { flag: 'wx', mode: 0o640 });
      return reply.status(201).send({ url: `${config.apiOrigin}/uploads/${year}/${month}/${filename}`, kind: 'image', size: request.body.length });
    }

    if (!validFile(request.body, contentType)) {
      return reply.status(415).send({ error: 'PDF, Word, Excel, PowerPoint or HWP file up to 20 MB required' });
    }
    // Each document gets its own folder so the original name can stay as-is.
    const name = `${safeBaseName(request.headers['x-file-name'])}.${FILES[contentType].ext}`;
    const folder = randomUUID();
    const directory = path.join(config.uploadRoot, year, month, folder);
    await mkdir(directory, { recursive: true, mode: 0o750 });
    await writeFile(path.join(directory, name), request.body, { flag: 'wx', mode: 0o640 });
    return reply.status(201).send({
      url: `${config.apiOrigin}/uploads/${year}/${month}/${folder}/${encodePathName(name)}`,
      kind: 'file', name, size: request.body.length,
    });
  });
}
