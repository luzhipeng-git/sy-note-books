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

// Type code block content
await page.click('.vditor-ir .vditor-reset');
await page.waitForTimeout(500);

await page.keyboard.press('Control+a');
await page.waitForTimeout(200);
await page.keyboard.type('Some text\n\n```java\npublic class Test {\n  int x = 1;\n}\n```\n\nMore text.');
await page.waitForTimeout(3000);

// Click the text BEFORE the code block to collapse it
const textNode = await page.$('.vditor-ir .vditor-reset p');
if (textNode) {
  await textNode.click();
  await page.waitForTimeout(2000);
}

// Check ALL code blocks - both expanded and collapsed
const check = await page.evaluate(() => {
  const allBlocks = document.querySelectorAll('[data-type="code-block"]');
  return Array.from(allBlocks).map(b => {
    const isExpanded = b.classList.contains('vditor-ir__node--expand');
    const preview = b.querySelector('pre.vditor-ir__preview');
    const previewStyle = preview ? window.getComputedStyle(preview) : null;
    const info = b.querySelector('.vditor-ir__marker--info');
    const infoStyle = info ? window.getComputedStyle(info) : null;
    const copyBtn = preview?.querySelector('.vditor-copy');
    const copyStyle = copyBtn ? window.getComputedStyle(copyBtn) : null;
    const code = preview?.querySelector('code');
    const dataLang = preview?.dataset.lang;
    const beforeStyle = preview ? window.getComputedStyle(preview, '::before') : null;

    return {
      isExpanded,
      previewDisplay: previewStyle?.display,
      infoText: info?.textContent?.trim(),
      infoDisplay: infoStyle?.display,
      dataLang,
      copyDisplay: copyStyle?.display,
      copyOpacity: copyStyle?.opacity,
      beforeContent: beforeStyle?.content,
      beforeDisplay: beforeStyle?.display,
    };
  });
});
console.log(JSON.stringify(check, null, 2));

await page.screenshot({ path: '/tmp/real-check.png', fullPage: false });

await browser.close();
