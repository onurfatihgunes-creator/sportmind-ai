// One-off asset generator — run `npm install -D sharp` first, then `node scripts/generate-icons.mjs`.
// sharp isn't a regular dependency since nothing at runtime or build time needs it.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const OUT_DIR = fileURLToPath(new URL('../assets/images/', import.meta.url));
mkdirSync(OUT_DIR, { recursive: true });
const out = (name) => path.join(OUT_DIR, name);

// Same "zap" glyph Feather renders for the in-app avatar (feather-icons "zap"), filled
// solid rather than stroked so it reads clearly at small icon sizes.
const boltPoints = '13,2 3,14 12,14 11,22 21,10 12,10';

function boltSvg({ size, color }) {
  // Feather glyph is drawn in a 24x24 box; scale + center it within the target canvas.
  const scale = (size * 0.44) / 24;
  const offset = (size - 24 * scale) / 2;
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(${offset} ${offset}) scale(${scale})">
        <polygon points="${boltPoints}" fill="${color}" />
      </g>
    </svg>`;
}

async function gradientSquare(size) {
  const gradient = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#4F46E5"/>
          <stop offset="1" stop-color="#7C3AED"/>
        </linearGradient>
      </defs>
      <rect width="${size}" height="${size}" fill="url(#g)"/>
    </svg>`;
  const bolt = boltSvg({ size, color: '#ffffff' });
  return sharp(Buffer.from(gradient))
    .composite([{ input: Buffer.from(bolt) }])
    .png()
    .toBuffer();
}

async function main() {
  // App icon — full-bleed gradient square, OS applies its own corner mask.
  const icon = await gradientSquare(1024);
  await sharp(icon).toFile(out('icon.png'));

  // Android adaptive icon foreground — transparent, glyph only, sized within the safe zone.
  const adaptiveSvg = boltSvg({ size: 1024, color: '#ffffff' });
  await sharp(Buffer.from(adaptiveSvg)).png().toFile(out('adaptive-icon.png'));

  // Splash mark — same gradient mark, composited by Expo onto the dark splash background.
  const splash = await gradientSquare(512);
  await sharp(splash)
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(out('splash-icon.png'));

  // Favicon — small scaled copy of the icon.
  await sharp(icon).resize(64, 64).png().toFile(out('favicon.png'));

  console.log('Icons generated.');
}

main();
