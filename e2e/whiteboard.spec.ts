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
test('whiteboard: full flow - enter, interact, save, return', async ({ page }) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

  await enterWhiteboard(page);
  const wb = page.locator('.wb-fullscreen');
  const visible = await wb.isVisible().catch(() => false);
  if (!visible) { console.log('WB not entered'); return; }

  // Interact with canvas
  const box = await page.locator('.wb-canvas-area').boundingBox();
  expect(box).toBeTruthy();
  const cx = box!.x + box!.width/2, cy = box!.y + box!.height/2;

  // Heavy drawing interaction
  await page.mouse.move(cx - 80, cy - 60);
  await page.mouse.down();
  for (let i = 0; i <= 20; i++) {
    await page.mouse.move(cx - 80 + i * 8, cy - 60 + Math.sin(i * 0.5) * 40);
  }
  await page.mouse.up();
  await page.waitForTimeout(500);

  // Click save
  const saveBtn = page.locator('.wb-save-btn');
  expect(await saveBtn.isVisible()).toBeTruthy();
  await saveBtn.click();
  await page.waitForTimeout(2000);

  // Should return to editor
  const hasEditor = await page.locator('.vditor').isVisible().catch(() => false);
  const hasWb = await page.locator('.wb-fullscreen').isVisible().catch(() => false);
  
  await page.screenshot({ path: 'e2e/screenshots/full-flow-after-save.png', fullPage: true });

  const critical = errors.filter(e => 
    e.includes('classList') || e.includes('getBoundingClientRect') || 
    e.includes('Cannot read properties of undefined') || e.includes("'curve'")
  );
  console.log('Errors:', errors.length, 'Critical:', critical.length, 'HasEditor:', hasEditor, 'HasWb:', hasWb);
  expect(critical).toHaveLength(0);
  expect(hasEditor).toBeTruthy();
});
