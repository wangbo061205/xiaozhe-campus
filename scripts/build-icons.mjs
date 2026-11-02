import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const names = ['house', 'map', 'search', 'compass', 'calendar-days', 'graduation-cap', 'utensils', 'users',
  'building-2', 'bell', 'book-open', 'gift', 'message-circle', 'user-round', 'backpack', 'arrow-right',
  'arrow-left', 'chevron-down', 'chevron-right', 'locate-fixed', 'navigation', 'route', 'x', 'refresh-cw',
  'layers', 'school', 'image', 'chart-no-axes-combined', 'check', 'log-out', 'shield-check', 'external-link',
  'heart', 'sun', 'coffee', 'ticket', 'settings-2'];
const output = path.resolve('miniprogram/assets/icons');
const { palette } = JSON.parse(await fs.readFile(path.resolve('miniprogram/design-config.json'), 'utf8'));
await fs.mkdir(output, { recursive: true });
for (const name of names) {
  const svg = await fs.readFile(path.resolve('node_modules/lucide-static/icons', name + '.svg'), 'utf8');
  for (const [suffix, color] of [['', palette.secondary], ['-green', palette.accentInk], ['-white', '#ffffff'], ['-on-accent', palette.onAccent]]) {
    await sharp(Buffer.from(svg.replaceAll('currentColor', color))).resize(72, 72).png()
      .toFile(path.join(output, name + suffix + '.png'));
  }
}
const marker = `<svg width="64" height="80" viewBox="0 0 64 80" xmlns="http://www.w3.org/2000/svg"><path d="M32 76C26 66 6 47 6 30a26 26 0 1 1 52 0c0 17-20 36-26 46Z" fill="${palette.accentInk}" stroke="white" stroke-width="4"/><circle cx="32" cy="30" r="10" fill="white"/></svg>`;
await sharp(Buffer.from(marker)).png().toFile(path.join(output, 'map-pin.png'));
console.log('Generated campus icons.');
