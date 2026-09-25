import { createCipheriv, randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [outputFile, keyFile] = process.argv.slice(2);
if (!outputFile || !keyFile) throw new Error('Usage: node encrypt-backup.mjs <output-file> <key-file>');

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const plaintext = Buffer.concat(chunks);
const key = randomBytes(32);
const iv = randomBytes(12);
const cipher = createCipheriv('aes-256-gcm', key, iv);
const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
const tag = cipher.getAuthTag();
const payload = Buffer.concat([Buffer.from('KKF1'), iv, tag, ciphertext]);

await mkdir(path.dirname(path.resolve(outputFile)), { recursive: true });
await writeFile(outputFile, payload, { flag: 'wx', mode: 0o600 });
await writeFile(keyFile, `${key.toString('hex')}\n`, { flag: 'wx', mode: 0o600 });
console.error(JSON.stringify({ ok: true, encryptedBytes: payload.length }));
