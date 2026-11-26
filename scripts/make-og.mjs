// Renders the social card public/og.png (1200x630) with headless Chrome.
// Usage: node scripts/make-og.mjs [scratch-dir]
// The HTML and the Chrome profile go to the scratch dir (default: OS temp).
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = process.argv[2] ?? process.env.OG_SCRATCH ?? join(tmpdir(), 'semiquant-og');
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const W = 1200;
const H = 630;
const SCALE = 2; // render at 2x, then downsample for cleaner edges

const fileUrl = (p) => pathToFileURL(join(root, p)).href;
const inter = fileUrl('node_modules/@fontsource-variable/montserrat/files/montserrat-latin-wght-normal.woff2');
const mono = fileUrl('node_modules/@fontsource-variable/roboto-mono/files/roboto-mono-latin-wght-normal.woff2');
const mark = fileUrl('src/assets/brand/sq-512.png');

// qPCR motif: sigmoid amplification curves with shifted Ct values.
const plot = { x: 640, y: 64, w: 488, h: 250 };
const cycles = 40;
function curve(ct, plateau) {
  const pts = [];
  for (let c = 0; c <= cycles; c += 0.5) {
    const f = plateau / (1 + Math.exp(-(c - ct) / 1.7));
    const x = plot.x + (c / cycles) * plot.w;
    const y = plot.y + plot.h - f * plot.h;
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return `M${pts.join(' L')}`;
}
const curves = [
  { ct: 15, plateau: 0.95, color: '#EF4A37', opacity: 0.95 },
  { ct: 19, plateau: 0.92, color: '#F7941D', opacity: 0.95 },
  { ct: 23, plateau: 0.88, color: '#FBB040', opacity: 0.9 },
  { ct: 27, plateau: 0.83, color: '#F7941D', opacity: 0.55 },
  { ct: 31, plateau: 0.76, color: '#FBB040', opacity: 0.4 },
];
const grid = [];
for (let i = 0; i <= 4; i++) {
  const y = plot.y + (i / 4) * plot.h;
  grid.push(`<line x1="${plot.x}" y1="${y}" x2="${plot.x + plot.w}" y2="${y}"/>`);
}
for (let i = 0; i <= 8; i++) {
  const x = plot.x + (i / 8) * plot.w;
  grid.push(`<line x1="${x}" y1="${plot.y}" x2="${x}" y2="${plot.y + plot.h}"/>`);
}
const threshold = plot.y + plot.h * 0.82;

const html = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<style>
@font-face { font-family: Inter; src: url("${inter}") format("woff2"); font-weight: 100 900; }
@font-face { font-family: Mono; src: url("${mono}") format("woff2"); font-weight: 100 800; }
* { box-sizing: border-box; margin: 0; }
html, body { width: ${W}px; height: ${H}px; background: #1d1f23; overflow: hidden; }
body { position: relative; color: #E6E8EB; font-family: Inter, sans-serif; -webkit-font-smoothing: antialiased; }
svg { position: absolute; inset: 0; }
.brand { position: absolute; left: 72px; top: 64px; display: flex; align-items: center; gap: 22px; }
.brand img { width: 92px; height: 92px; }
.brand span { font-family: Mono, monospace; font-size: 26px; font-weight: 500; letter-spacing: 0.02em; color: #9AA3AF; }
.name { position: absolute; left: 68px; top: 352px; font-size: 92px; font-weight: 680; letter-spacing: -0.035em; line-height: 1; }
.focus { position: absolute; left: 72px; top: 474px; font-family: Mono, monospace; font-size: 23.5px; font-weight: 400; color: #9AA3AF; white-space: nowrap; }
.focus i { font-style: normal; color: #F7941D; padding: 0 0.15em; }
.rule { position: absolute; left: 72px; right: 72px; top: 540px; height: 2px; background: linear-gradient(90deg, #EF4A37, #F7941D 35%, #FBB040 70%, rgba(251,176,64,0)); }
.url { position: absolute; left: 72px; top: 562px; font-family: Mono, monospace; font-size: 24px; font-weight: 500; color: #F7941D; }
.aff { position: absolute; right: 72px; top: 564px; font-family: Mono, monospace; font-size: 20px; color: #7D8794; }
</style>
<body>
<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" fill="none">
  <g stroke="#2A303A" stroke-width="1" opacity="0.7">${grid.join('')}</g>
  <line x1="${plot.x}" y1="${threshold}" x2="${plot.x + plot.w}" y2="${threshold}" stroke="#647082" stroke-width="1.5" stroke-dasharray="6 6"/>
  ${curves
    .map(
      (c) =>
        `<path d="${curve(c.ct, c.plateau)}" stroke="${c.color}" stroke-opacity="${c.opacity}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
    )
    .join('\n  ')}
</svg>
<div class="brand"><img src="${mark}" alt=""><span>SemiQuant</span></div>
<div class="name">Jason D. Limberis</div>
<div class="focus">Molecular diagnostics <i>·</i> M. tuberculosis genomics <i>·</i> Computational biology</div>
<div class="rule"></div>
<div class="url">semiquant.com</div>
<div class="aff">UCSF</div>
</body>
</html>
`;

mkdirSync(join(scratch, 'chrome'), { recursive: true });
const htmlPath = join(scratch, 'og.html');
const rawPath = join(scratch, 'og-raw.png');
writeFileSync(htmlPath, html);

execFileSync(
  chrome,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    `--user-data-dir=${join(scratch, 'chrome')}`,
    `--window-size=${W},${H}`,
    `--force-device-scale-factor=${SCALE}`,
    '--virtual-time-budget=3000',
    `--screenshot=${rawPath}`,
    pathToFileURL(htmlPath).href,
  ],
  { stdio: 'ignore' },
);

const outPath = join(root, 'public/og.png');
await sharp(rawPath)
  .resize(W, H, { fit: 'cover', position: 'top', kernel: 'lanczos3' })
  .png({ compressionLevel: 9, palette: true, quality: 95, colors: 256, dither: 0.6 })
  .toFile(outPath);

const meta = await sharp(outPath).metadata();
console.log(`og.png  ${meta.width}x${meta.height}  ${statSync(outPath).size} bytes`);
