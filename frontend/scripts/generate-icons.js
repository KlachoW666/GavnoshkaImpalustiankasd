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
const svgPath = join(publicDir, 'favicon.svg');

const SIZES = {
  'favicon-16x16.png': 16,
  'favicon-32x32.png': 32,
  'favicon-48x48.png': 48,
  'apple-touch-icon.png': 180,
  'icon-192.png': 192,
  'icon-512.png': 512,
  'logo.png': 512,
};

function renderSvgToPng(svgBuffer, size) {
  const resvg = new Resvg(svgBuffer, {
    fitTo: { mode: 'width', value: size },
  });
  const pngData = resvg.render();
  return pngData.asPng();
}

const svg = readFileSync(svgPath);
console.log('Rendering from favicon.svg...');

for (const [filename, size] of Object.entries(SIZES)) {
  const buf = renderSvgToPng(svg, size);
  const outPath = join(publicDir, filename);
  writeFileSync(outPath, buf);
  console.log(`  ${filename} (${size}x${size})`);
}

// Build favicon.ico from 16, 32, 48
const ico16 = renderSvgToPng(svg, 16);
const ico32 = renderSvgToPng(svg, 32);
const ico48 = renderSvgToPng(svg, 48);
const icoBuffer = await pngToIco([ico16, ico32, ico48]);
writeFileSync(join(publicDir, 'favicon.ico'), icoBuffer);
console.log('  favicon.ico (16, 32, 48)');

console.log('Done.');
