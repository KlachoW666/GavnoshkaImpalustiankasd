/**
 * Generate logo/favicon in all needed formats from favicon.svg.
 * Run: npm run generate-icons (from frontend dir)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Resvg } from '@resvg/resvg-js';
import pngToIco from 'png-to-ico';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');
const faviconSvgPath = join(publicDir, 'favicon.svg');
const logoSvgPath = join(publicDir, 'logo.svg');

const FAVICON_SIZES = {
  'favicon-16x16.png': 16,
  'favicon-32x32.png': 32,
  'favicon-48x48.png': 48,
  'apple-touch-icon.png': 180,
  'icon-192.png': 192,
  'icon-512.png': 512,
};
const LOGO_OG_SIZE = 512; // logo.png для og:image и превью (Telegram, соцсети)

function renderSvgToPng(svgBuffer, size) {
  const resvg = new Resvg(svgBuffer, {
    fitTo: { mode: 'width', value: size },
  });
  const pngData = resvg.render();
  return pngData.asPng();
}

const faviconSvg = readFileSync(faviconSvgPath);
console.log('Rendering from favicon.svg (favicons)...');
for (const [filename, size] of Object.entries(FAVICON_SIZES)) {
  const buf = renderSvgToPng(faviconSvg, size);
  writeFileSync(join(publicDir, filename), buf);
  console.log(`  ${filename} (${size}x${size})`);
}

// logo.png для og:image (превью в Telegram и соцсетях) — из logo.svg
try {
  const logoSvg = readFileSync(logoSvgPath);
  const logoPng = renderSvgToPng(logoSvg, LOGO_OG_SIZE);
  writeFileSync(join(publicDir, 'logo.png'), logoPng);
  console.log(`  logo.png (${LOGO_OG_SIZE}x${LOGO_OG_SIZE}) from logo.svg [og:image]`);
} catch (e) {
  console.warn('  logo.svg not found, skipping logo.png (using favicon.svg fallback)');
  const logoPng = renderSvgToPng(faviconSvg, LOGO_OG_SIZE);
  writeFileSync(join(publicDir, 'logo.png'), logoPng);
  console.log(`  logo.png (${LOGO_OG_SIZE}x${LOGO_OG_SIZE}) from favicon.svg`);
}

// Build favicon.ico from 16, 32, 48
const ico16 = renderSvgToPng(faviconSvg, 16);
const ico32 = renderSvgToPng(faviconSvg, 32);
const ico48 = renderSvgToPng(faviconSvg, 48);
const icoBuffer = await pngToIco([ico16, ico32, ico48]);
writeFileSync(join(publicDir, 'favicon.ico'), icoBuffer);
console.log('  favicon.ico (16, 32, 48)');

console.log('Done.');
