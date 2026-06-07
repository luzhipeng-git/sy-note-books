import { test, expect } from '@playwright/test';
const BASE = 'http://10.221.0.15:5173';
async function enterWhiteboard(page) {
  await page.goto(BASE);
  await page.waitForTimeout(1500);
  await page.locator('button:has-text("我的技术文档")').click();
  await page.waitForTimeout(1000);
  await page.locator('.file-tree :text("快速开始")').first().click();
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    const container = document.querySelector('.vditor-instance') as HTMLElement;
    if (!container) return;
    container.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'D', code: 'KeyD', ctrlKey: true, shiftKey: true,
      bubbles: true, cancelable: true,
    }));
  });
  await page.waitForTimeout(3000);
}
test('whiteboard: crash verification', async ({ page }) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  await enterWhiteboard(page);
  const wb = page.locator('.wb-fullscreen');
  const visible = await wb.isVisible().catch(() => false);
  if (!visible) { console.log('WB not entered, errors:', errors.length); return; }
  const box = await page.locator('.wb-canvas-area').boundingBox();
  if (!box) return;
  const cx = box.x + box.width/2, cy = box.y + box.height/2;
  // Heavy interaction
  for (let i = 0; i < 30; i++) {
    await page.mouse.move(cx + (Math.random()-0.5)*200, cy + (Math.random()-0.5)*200);
  }
  await page.mouse.click(cx, cy);
  await page.mouse.move(cx-50, cy-50);
  await page.mouse.down();
  await page.mouse.move(cx+100, cy+50, {steps:10});
  await page.mouse.up();
  await page.waitForTimeout(500);
  const critical = errors.filter(e => e.includes('classList') || e.includes('getBoundingClientRect') || e.includes('Cannot read properties of undefined') || e.includes("'curve'"));
  console.log('Errors:', errors.length, 'Critical:', critical.length);
  if (critical.length) console.log('CRITICAL:', critical.slice(0,5));
  expect(critical).toHaveLength(0);
});
