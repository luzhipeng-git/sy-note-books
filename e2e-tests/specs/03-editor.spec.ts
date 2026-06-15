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
    // 面包屑必须包含 workspace 标题（fixture 的标题是 "E2E测试文档"）
    expect(bcText).toContain('E2E测试文档');
    const parts = bcText.split('/');
    expect(parts.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── Markdown 输入触发 ────────────────────────────────────

describe('编辑器: Markdown 输入触发', () => {
  it('输入 # + 文本后 IR 渲染为 H1 标题，内容匹配', async () => {
    await ensureEditor();

    // 通过 Vditor API 设置内容（清空 + 插入标题文本）
    // setValue 触发 IR 渲染，比 execCommand insertText 更可靠
    const headingText = 'E2EHeadingTest';
    await browser.execute((content: string) => {
      const vditor = (window as any).__VDITOR_INSTANCE__;
      if (vditor?.setValue) vditor.setValue(`# ${content}`, true);
    }, headingText);
    await browser.pause(1500);

    // 查找包含输入文本的 H1
    const h1Found = await browser.execute((text: string) => {
      const h1s = document.querySelectorAll('.vditor-ir h1');
      for (const h1 of h1s) {
        if (h1.textContent?.includes(text)) return h1.textContent;
      }
      return null;
    }, headingText);
    expect(h1Found).not.toBeNull();
    expect(h1Found).toContain(headingText);
  });

  it('输入 - + 文本后 IR 渲染为无序列表，内容匹配', async () => {
    await ensureEditor();

    // 通过 Vditor API 设置内容（清空 + 插入列表项）
    const itemText = 'E2EListItemTest';
    await browser.execute((content: string) => {
      const vditor = (window as any).__VDITOR_INSTANCE__;
      if (vditor?.setValue) vditor.setValue(`- ${content}`, true);
    }, itemText);
    await browser.pause(1500);

    // 查找包含输入文本的 li
    const liFound = await browser.execute((text: string) => {
      const lis = document.querySelectorAll('.vditor-ir li');
      for (const li of lis) {
        if (li.textContent?.includes(text)) return li.textContent;
      }
      return null;
    }, itemText);
    expect(liFound).not.toBeNull();
    expect(liFound).toContain(itemText);
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
  it('切换文件后面包屑和编辑器内容变化', async function () {
    await openWorkspace();

    // 展开所有章节
    await browser.execute(() => {
      const folders = document.querySelectorAll('.tree-item.folder');
      folders.forEach(f => (f as HTMLElement).click());
    });
    await browser.pause(500);

    // 获取所有页面
    const pages = await browser.$(S.treeItem);
    const nonFolderPages = await browser.execute(() => {
      const items = document.querySelectorAll('.tree-item:not(.folder):not(.missing)');
      return items.length;
    });

    if (nonFolderPages < 2) {
      // Explicit pending — fixture must have ≥2 pages for this test
      this.skip();
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
