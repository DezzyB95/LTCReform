import { chromium } from 'playwright';
import fs from 'fs';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 1300, height: 1400 }, deviceScaleFactor: 1 });
await p.goto('file://' + process.cwd() + '/slides.html');
await p.waitForTimeout(1200);
fs.mkdirSync('png', { recursive: true });
const els = await p.$$('.slide');
for (const el of els) {
  const id = await el.evaluate(n => n.id);
  const box = await el.boundingBox();
  const over = await el.evaluate(n => n.scrollHeight - n.clientHeight);
  await el.screenshot({ path: `png/${id}.png` });
  console.log(id.padEnd(14), `${Math.round(box.width)}x${Math.round(box.height)}`, over > 1 ? `*** OVERFLOW ${over}px ***` : 'ok');
}
await b.close();
