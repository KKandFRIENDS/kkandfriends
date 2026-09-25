import { createDecipheriv } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const [inputFile, keyFile] = process.argv.slice(2);
if (!inputFile || !keyFile) throw new Error('Usage: node decrypt-backup.mjs <input-file> <key-file>');

const payload = await readFile(inputFile);
if (payload.subarray(0, 4).toString() !== 'KKF1') throw new Error('Invalid backup format');
const key = Buffer.from((await readFile(keyFile, 'utf8')).trim(), 'hex');
if (key.length !== 32) throw new Error('Invalid backup key');
const iv = payload.subarray(4, 16);
const tag = payload.subarray(16, 32);
const ciphertext = payload.subarray(32);
const decipher = createDecipheriv('aes-256-gcm', key, iv);
decipher.setAuthTag(tag);
process.stdout.write(Buffer.concat([decipher.update(ciphertext), decipher.final()]));
