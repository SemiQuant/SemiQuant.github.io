// Generates the favicon set and web manifest in public/ from the SQ mark.
// Usage: node scripts/make-icons.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src/assets/brand/sq-512.png');
const out = join(root, 'public');
const BG = '#0B0D10';
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };

/** The mark scaled to `size`, on a transparent canvas. */
const plain = (size) =>
  sharp(src)
    .resize(size, size, { fit: 'contain', background: transparent, kernel: 'lanczos3' })
    .png({ compressionLevel: 9 })
    .toBuffer();

/** The mark centered on the dark background, filling `scale` of the canvas. */
async function padded(size, scale) {
  const inner = Math.round(size * scale);
  const mark = await sharp(src)
    .resize(inner, inner, { fit: 'contain', background: transparent, kernel: 'lanczos3' })
    .toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: mark, gravity: 'center' }])
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** ICO container: 6-byte header, one 16-byte entry per image, then the PNGs. */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1: icon
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + 16 * images.length;
  for (const { size, data } of images) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 means 256)
    e.writeUInt8(size >= 256 ? 0 : size, 1); // height
    e.writeUInt8(0, 2); // palette size
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // color planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

await mkdir(out, { recursive: true });

const files = {
  'favicon-16.png': await plain(16),
  'favicon-32.png': await plain(32),
  // iOS has no transparency and rounds the corners itself.
  'apple-touch-icon.png': await padded(180, 0.7),
  // Maskable: the mark stays inside the central 80% safe zone.
  'icon-192.png': await padded(192, 0.6),
  'icon-512.png': await padded(512, 0.6),
};
files['favicon.ico'] = ico([
  { size: 16, data: files['favicon-16.png'] },
  { size: 32, data: files['favicon-32.png'] },
  { size: 48, data: await plain(48) },
]);

const manifest = {
  name: 'Jason D. Limberis',
  short_name: 'SemiQuant',
  start_url: '/',
  display: 'browser',
  theme_color: BG,
  background_color: BG,
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};
files['site.webmanifest'] = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');

for (const [name, data] of Object.entries(files)) {
  await writeFile(join(out, name), data);
  console.log(`${name}  ${data.length} bytes`);
}
