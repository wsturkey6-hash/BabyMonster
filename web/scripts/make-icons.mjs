import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = join(__dirname, '../public/icon.svg');
const out = (name) => join(__dirname, '../public', name);

await sharp(src, { density: 300 }).resize(192, 192).png().toFile(out('icon-192.png'));
await sharp(src, { density: 300 }).resize(512, 512).png().toFile(out('icon-512.png'));
await sharp(src, { density: 300 }).resize(180, 180).png().toFile(out('apple-touch-icon.png'));
console.log('icons generated');
