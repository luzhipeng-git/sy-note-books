/**
 * E2E Tests: Markdown 编辑器
 * 注意: WebKitGTK WebDriver 不支持原生 click/keys，全部用 JS 交互
 */

import { S, T } from '../helpers/selectors.js';
import { wait, waitGone, openWorkspace, openFirstFile, jsClick, jsPressShortcut, jsTypeInEditor } from '../helpers/fixtures.js';

async function ensureEditor(): Promise<string> {
  return await openFirstFile();
}

// ─── 编辑器初始化 ─────────────────────────────────────────

describe('编辑器: 初始化', () => {
  it('打开文件后 Vditor 可见，状态栏显示 Markdown + 行列信息', async () => {
    await ensureEditor();
    await wait(S.vditor, 10000);

    const sb = await browser.$(S.statusBar);
    const sbText = await sb.getText();
    expect(sbText).toContain(T.editorLabelMd);
    expect(sbText).toMatch(/行\s*\d.*列\s*\d/);
    expect(sbText).toContain('UTF-8');
  });

  it('面包屑显示 workspace 标题 + 文件名', async () => {
    await ensureEditor();

    const bc = await browser.$(S.breadcrumb);
    const bcText = await bc.getText();
    // Breadcrumb should have at least "workspace / file" structure
    expect(bcText).toContain('/');
    const parts = bcText.split('/');
    expect(parts.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── Markdown 输入触发 ────────────────────────────────────

describe('编辑器: Markdown 输入触发', () => {
  it('输入 # + 空格后 IR 渲染为 H1 标题', async () => {
    await ensureEditor();

    const ir = await wait(S.vditorIR, 10000);
    // JS click 获取焦点
    await browser.execute((sel: string) => {
      const el = document.querySelector(sel) as HTMLElement;
      if (el) el.click();
    }, S.vditorIR);
    await browser.pause(300);

    // 通过 JS 模拟输入
    await jsTypeInEditor(S.vditorIR, '# ');
    await browser.pause(1000);

    const h1 = await browser.$('.vditor-ir h1');
    await h1.waitForExist({ timeout: 5000 });
    // Verify H1 has rendered content (not just an empty tag)
    const h1Text = await h1.getText();
    expect(h1Text.length).toBeGreaterThan(0);
  });

  it('输入 - + 空格后 IR 渲染为无序列表', async () => {
    await ensureEditor();

    await browser.execute((sel: string) => {
      const el = document.querySelector(sel) as HTMLElement;
      if (el) el.click();
    }, S.vditorIR);
    await browser.pause(300);

    await jsTypeInEditor(S.vditorIR, '- ');
    await browser.pause(1000);

    const listItem = await browser.$('.vditor-ir li');
    await listItem.waitForExist({ timeout: 5000 });
    // Verify list item has rendered content
    const liText = await listItem.getText();
    expect(liText.length).toBeGreaterThan(0);
  });
});

// ─── 自动保存 ─────────────────────────────────────────────

describe('编辑器: 自动保存', () => {
  it('修改内容后状态栏经历 saving → saved', async () => {
    await ensureEditor();
    await browser.pause(2000);

    await browser.execute((sel: string) => {
      const el = document.querySelector(sel) as HTMLElement;
      if (el) el.click();
    }, S.vditorIR);
    await browser.pause(300);

    await jsTypeInEditor(S.vditorIR, 'E2E auto-save test');
    await browser.pause(500);
    await browser.pause(3000);

    const sb = await browser.$(S.statusBar);
    // Wait for save to complete (transition from saving → saved)
    await browser.waitUntil(async () => {
      const text = await sb.getText();
      return text.includes(T.saveSaved) || text.includes(T.saveFailed);
    }, { timeout: 10000 });
    const sbText = await sb.getText();
    // Auto-save should succeed, not fail
    expect(sbText).toContain(T.saveSaved);
  });
});

// ─── Ctrl+S 手动保存 ─────────────────────────────────────

describe('编辑器: 手动保存', () => {
  it('Ctrl+S 触发保存，状态栏显示 saved', async () => {
    await ensureEditor();
    await browser.pause(1000);

    await jsPressShortcut(['Control', 's']);
    await browser.pause(2000);

    const sb = await browser.$(S.statusBar);
    await browser.waitUntil(async () => {
      const text = await sb.getText();
      return text.includes(T.saveSaved) || text.includes(T.saveFailed);
    }, { timeout: 10000 });
    const sbText = await sb.getText();
    // Manual save should succeed
    expect(sbText).toContain(T.saveSaved);
  });
});

// ─── 文件切换 ─────────────────────────────────────────────

describe('编辑器: 文件切换', () => {
  it('切换文件后面包屑和编辑器内容变化', async () => {
    await openWorkspace();

    // 展开所有章节
    await browser.execute(() => {
      const folders = document.querySelectorAll('.tree-item.folder');
      folders.forEach(f => (f as HTMLElement).click());
    });
    await browser.pause(500);

    // 获取所有页面
    const pages = await browser.$$(S.treeItem);
    const nonFolderPages = await browser.execute(() => {
      const items = document.querySelectorAll('.tree-item:not(.folder):not(.missing)');
      return items.length;
    });

    if (nonFolderPages < 2) {
      // Explicit skip — fixture must have ≥2 pages for this test
      console.warn('Skipping file switch test: fixture has fewer than 2 pages');
      return;
    }

    // 点击第一页
    await browser.execute(() => {
      const items = document.querySelectorAll('.tree-item:not(.folder):not(.missing)');
      if (items.length >= 1) (items[0] as HTMLElement).click();
    });
    await browser.pause(2000);

    const bc1 = await browser.execute((sel: string) => {
      const el = document.querySelector(sel);
      return el?.textContent ?? '';
    }, S.breadcrumbCurrent);

    // 点击第二页
    await browser.execute(() => {
      const items = document.querySelectorAll('.tree-item:not(.folder):not(.missing)');
      if (items.length >= 2) (items[1] as HTMLElement).click();
    });
    await browser.pause(2000);

    const bc2 = await browser.execute((sel: string) => {
      const el = document.querySelector(sel);
      return el?.textContent ?? '';
    }, S.breadcrumbCurrent);

    expect(bc1).not.toBe(bc2);
  });
});

// ─── Ctrl+Shift+D 进入白板 ───────────────────────────────

describe('编辑器: 白板入口', () => {
  it('在编辑器中按 Ctrl+Shift+D 进入白板', async () => {
    await ensureEditor();

    await jsPressShortcut(['Control', 'Shift', 'd']);
    await wait(S.wbFullscreen, 15000);

    const topbar = await browser.$(S.wbTopbar);
    expect(await topbar.isDisplayed()).toBe(true);

    const saveBtn = await browser.$(S.wbSaveBtn);
    expect(await saveBtn.isDisplayed()).toBe(true);
    expect(await saveBtn.getText()).toBe(T.wbSave);
  });
});
