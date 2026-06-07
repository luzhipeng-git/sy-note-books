import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('http://10.221.0.15:5173/');
await page.waitForTimeout(3000);

await page.click('.btn-ghost');
await page.waitForTimeout(2000);

const fileItem = await page.$('.tree-item:not(.folder)');
await fileItem.click();
await page.waitForTimeout(3000);

// Type content via page.evaluate to avoid focus issues
await page.evaluate(() => {
  // Find the vditor instance
  const el = document.querySelector('.vditor');
  // Vditor stores instance on the container element
  const keys = Object.keys(el || {});
  // Try to find __vditor or similar
  for (const key of keys) {
    if (key.startsWith('__')) console.log('found key:', key);
  }
});
await page.waitForTimeout(500);

// Use keyboard to type - first ensure editor is focused
await page.click('.vditor-ir .vditor-reset');
await page.waitForTimeout(500);

await page.keyboard.press('Control+a');
await page.waitForTimeout(200);
await page.keyboard.type('Some text before code.\n\n```java\npublic static class test {\n  int x = 1;\n  int y = 2;\n}\n```\n\nSome text after code.');
await page.waitForTimeout(3000);

// Click on "Some text before" to move cursor out of code block
// Use arrow keys to navigate away
for (let i = 0; i < 5; i++) {
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(200);
}
await page.waitForTimeout(1000);

const check1 = await page.evaluate(() => {
  const blocks = document.querySelectorAll('[data-type="code-block"]');
  return {
    total: blocks.length,
    expanded: Array.from(blocks).filter(b => b.classList.contains('vditor-ir__node--expand')).length,
  };
});
console.log('After navigating away:', JSON.stringify(check1));

// If still expanded, try clicking outside the code block
if (check1.expanded > 0) {
  // Click on the paragraph before the code block
  const para = await page.$('.vditor-ir p');
  if (para) {
    await para.click();
    await page.waitForTimeout(1500);
  }
}

const check2 = await page.evaluate(() => {
  const node = document.querySelector('[data-type="code-block"]:not(.vditor-ir__node--expand)');
  if (!node) return { error: 'still no collapsed block' };

  const preview = node.querySelector('pre.vditor-ir__preview');
  const copyBtn = preview?.querySelector('.vditor-copy');
  const copyStyle = copyBtn ? window.getComputedStyle(copyBtn) : null;
  const code = preview?.querySelector('code');

  return {
    copyExists: !!copyBtn,
    copyDisplay: copyStyle?.display,
    copyOpacity: copyStyle?.opacity,
    copyOverflow: copyStyle?.overflow,
    copyWidth: copyStyle?.width,
    copyHeight: copyStyle?.height,
    lang: code?.className?.match(/language-(\w+)/)?.[1],
    previewChildren: Array.from(preview?.children || []).map(c => ({
      tag: c.tagName,
      class: c.className?.substring(0, 60),
      display: window.getComputedStyle(c).display,
    })),
  };
});
console.log('\nCopy button check:', JSON.stringify(check2, null, 2));

await page.screenshot({ path: '/tmp/copy-check.png', fullPage: false });
console.log('Screenshot saved');

await browser.close();
