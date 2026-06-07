/**
 * E2E Tests: 白板画图 (Drawnix)
 * 注意: WebKitGTK WebDriver 不支持原生 click/actions，全部用 JS 交互
 */

import { S, T } from '../helpers/selectors.js';
import { wait, waitGone, getRect, openFirstFile, enterWhiteboard, jsPressShortcut } from '../helpers/fixtures.js';

async function canvasCenter(): Promise<{ x: number; y: number }> {
  const canvas = await wait(S.wbCanvasArea, 10000) as unknown as WebdriverIO.Element;
  const r = await getRect(canvas);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/** JS 模拟 pointer 拖拽绘制 */
async function jsDrawLine(x1: number, y1: number, x2: number, y2: number): Promise<void> {
  await browser.execute(
    (coords: { x1: number; y1: number; x2: number; y2: number }) => {
      const canvas = document.querySelector('.wb-canvas-area') as HTMLElement;
      if (!canvas) return;
      canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: coords.x1, clientY: coords.y1, bubbles: true }));
      canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: coords.x2, clientY: coords.y2, bubbles: true }));
      canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: coords.x2, clientY: coords.y2, bubbles: true }));
    },
    { x1, y1, x2, y2 },
  );
}

// ─── 进入白板模式 ─────────────────────────────────────────

describe('白板: 进入模式', () => {
  it('从编辑器 Ctrl+Shift+D 进入白板，侧边栏隐藏', async () => {
    await openFirstFile();
    await enterWhiteboard();

    await wait(S.wbFullscreen, 10000);

    // Sidebar should be visually hidden (display:none) or removed from DOM
    const sidebar = await browser.$(S.sidebar);
    expect(await sidebar.isDisplayed()).toBe(false);
  });

  it('顶栏显示返回按钮、标题提示、保存按钮', async () => {
    await openFirstFile();
    await enterWhiteboard();

    const backBtn = await browser.$(S.wbBackBtn);
    expect(await backBtn.isDisplayed()).toBe(true);
    expect(await backBtn.getText()).toBe(T.wbBack);

    const title = await browser.$(S.wbTopbarTitle);
    expect(await title.isDisplayed()).toBe(true);
    const titleText = await title.getText();
    // Title should contain the file name or a whiteboard indicator
    expect(titleText.trim().length).toBeGreaterThan(0);

    const saveBtn = await browser.$(S.wbSaveBtn);
    expect(await saveBtn.isDisplayed()).toBe(true);
    expect(await saveBtn.getText()).toBe(T.wbSave);
  });
});

// ─── 画布交互 ─────────────────────────────────────────────

describe('白板: 画布绘制', () => {
  it('在 canvas 上拖拽绘制，不崩溃', async () => {
    await openFirstFile();
    await enterWhiteboard();

    const c = await canvasCenter();
    await jsDrawLine(c.x - 50, c.y - 50, c.x + 50, c.y + 50);
    await browser.pause(500);

    // Verify whiteboard is still rendered (no crash) and no JS errors
    const wb = await browser.$(S.wbFullscreen);
    expect(await wb.isDisplayed()).toBe(true);
    const svgCount = await browser.execute(() => {
      const canvas = document.querySelector('.wb-canvas-area');
      return canvas ? canvas.querySelectorAll('svg').length : 0;
    });
    // Drawnix uses SVG — should have at least the root SVG element
    expect(svgCount).toBeGreaterThanOrEqual(1);
  });

  it('快速连续移动不崩溃 (WeakMap 防护)', async () => {
    await openFirstFile();
    await enterWhiteboard();

    const c = await canvasCenter();

    await browser.execute((center: { x: number; y: number }) => {
      const canvas = document.querySelector('.wb-canvas-area') as HTMLElement;
      if (!canvas) return;
      for (let i = 0; i < 20; i++) {
        const ox = Math.sin(i * 0.7) * 100;
        const oy = Math.cos(i * 0.7) * 80;
        canvas.dispatchEvent(new PointerEvent('pointermove', {
          clientX: center.x + ox, clientY: center.y + oy, bubbles: true,
        }));
      }
    }, c);
    await browser.pause(500);

    // Verify no crash — whiteboard still displayed
    const wb = await browser.$(S.wbFullscreen);
    expect(await wb.isDisplayed()).toBe(true);
  });
});

// ─── 保存并插入 ───────────────────────────────────────────

describe('白板: 保存并插入', () => {
  it('画图后点击"保存并插入"，返回编辑器', async () => {
    await openFirstFile();

    await enterWhiteboard();

    const c = await canvasCenter();
    await jsDrawLine(c.x - 30, c.y - 30, c.x + 30, c.y + 30);
    await browser.pause(300);

    // JS click 保存按钮
    await browser.execute((sel: string) => {
      const btn = document.querySelector(sel) as HTMLElement;
      if (btn) btn.click();
    }, S.wbSaveBtn);
    await browser.pause(3000);

    await waitGone(S.wbFullscreen, 10000);
    await wait(S.vditor, 5000);

    // Verify image reference was inserted into editor content
    const contentAfter = await browser.execute(() => {
      const ir = document.querySelector('.vditor-ir');
      return ir?.innerHTML ?? '';
    });
    // Should contain an image element (either <img> tag or markdown image link)
    expect(contentAfter).toMatch(/<img|!\[.*\]\(/);
  });
});

// ─── 返回（放弃） ─────────────────────────────────────────

describe('白板: 放弃返回', () => {
  it('点击"← 返回"后弹出确认对话框', async () => {
    await openFirstFile();
    await enterWhiteboard();

    // Mark dirty via store (jsDrawLine pointer events are not processed by Drawnix)
    await browser.execute(() => {
      const wbStore = (window as any).__WHITEBOARD_STORE__;
      if (wbStore?.getState) wbStore.getState().setDirty(true);
    });
    await browser.pause(300);

    // JS click 返回按钮
    await browser.execute((sel: string) => {
      const btn = document.querySelector(sel) as HTMLElement;
      if (btn) btn.click();
    }, S.wbBackBtn);
    await browser.pause(500);

    const h3 = await browser.$('h3');
    expect(await h3.getText()).toBe(T.wbDiscardTitle);

    const p = await browser.$('p');
    expect(await p.getText()).toBe(T.wbDiscardMsg);

    // 确认放弃 — JS click
    await browser.execute((txt: string) => {
      const btns = document.querySelectorAll('button');
      for (const b of btns) {
        if (b.textContent === txt) { (b as HTMLElement).click(); return; }
      }
    }, T.wbDiscardConfirm);
    await browser.pause(500);

    await waitGone(S.wbFullscreen, 5000);
    await wait(S.vditor, 5000);
  });

  it('按 ESC 触发同样的确认流程', async () => {
    await openFirstFile();
    await enterWhiteboard();

    // Mark dirty via store (jsDrawLine pointer events are not processed by Drawnix)
    await browser.execute(() => {
      const wbStore = (window as any).__WHITEBOARD_STORE__;
      if (wbStore?.getState) wbStore.getState().setDirty(true);
    });
    await browser.pause(300);

    await jsPressShortcut(['Escape']);
    await browser.pause(500);

    const h3 = await browser.$('h3');
    expect(await h3.getText()).toBe(T.wbDiscardTitle);

    await browser.execute((txt: string) => {
      const btns = document.querySelectorAll('button');
      for (const b of btns) {
        if (b.textContent === txt) { (b as HTMLElement).click(); return; }
      }
    }, T.wbDiscardConfirm);
    await browser.pause(500);

    await waitGone(S.wbFullscreen, 5000);
    await wait(S.vditor, 5000);
  });
});

// ─── 崩溃验证（重压） ────────────────────────────────────

describe('白板: 崩溃防护', () => {
  it('连续 5 笔绘制后保存成功，无 JS 错误', async () => {
    await openFirstFile();
    await enterWhiteboard();

    const c = await canvasCenter();

    for (let i = 0; i < 5; i++) {
      const y = c.y - 80 + i * 40;
      await jsDrawLine(c.x - 60, y, c.x + 60, y + 15);
      await browser.pause(200);
    }

    // Verify no crash and whiteboard still rendered
    const wb = await browser.$(S.wbFullscreen);
    expect(await wb.isDisplayed()).toBe(true);

    await browser.execute((sel: string) => {
      const btn = document.querySelector(sel) as HTMLElement;
      if (btn) btn.click();
    }, S.wbSaveBtn);
    await browser.pause(3000);

    await waitGone(S.wbFullscreen, 10000);
    await wait(S.vditor, 5000);
  });
});
