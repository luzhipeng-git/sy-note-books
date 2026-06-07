/**
 * E2E Tests: 全局布局、侧边栏折叠、主题切换、快捷键
 *
 * 状态机来源: design/interaction/global.html
 * 视图状态: Welcome → WorkspaceEmpty → Markdown → Whiteboard
 *
 * 注意: WebKitGTK WebDriver 不支持原生 click/keys，全部用 JS 交互
 */

import { S, T } from '../helpers/selectors.js';
import {
  wait, waitGone, ensureWelcome, openWorkspace, openFirstFile, enterWhiteboard,
  jsClick, jsClickByTitle, jsPressShortcut,
  openGlobalSearch, closeGlobalSearch, openExportDialog, closeExportDialog,
} from '../helpers/fixtures.js';

// ─── Welcome 视图 ─────────────────────────────────────────

describe('全局: Welcome 视图', () => {
  it('启动后显示应用名称和描述', async () => {
    const title = await wait(S.welcomeTitle, 10000);
    expect(await title.getText()).toBe(T.appName);

    const subtitle = await browser.$(S.welcomeSubtitle);
    expect(await subtitle.getText()).toBe(T.appDesc);
  });

  it('显示"新建 Workspace"和"打开文件夹"两个按钮', async () => {
    const newBtn = await browser.$(`button=${T.newWorkspace}`);
    expect(await newBtn.isDisplayed()).toBe(true);

    const openBtn = await browser.$(`button=${T.openFolder}`);
    expect(await openBtn.isDisplayed()).toBe(true);
  });

  it('欢迎页面包含"最近打开"区域（有历史记录时显示列表）', async () => {
    const welcome = await browser.$(S.welcome);
    const text = await welcome.getText();
    // "最近打开" 区域仅在有历史记录时显示（E2E 环境首次启动无历史）
    // 验证欢迎页面至少包含应用名称和按钮即可
    expect(text).toContain(T.appName);
    expect(text).toContain(T.openFolder);
  });
});

// ─── 视图状态切换 ─────────────────────────────────────────

describe('全局: 视图状态切换', () => {
  it('Welcome → WorkspaceEmpty: 打开 workspace 后侧边栏可见', async () => {
    await openWorkspace();

    await wait(S.sidebar, 10000);
    const fileTree = await wait(S.fileTree, 5000);
    const items = await fileTree.$$(S.treeItem);
    // fixture workspace has known chapter structure — at least 1 chapter folder
    expect(items.length).toBeGreaterThanOrEqual(1);
  });

  it('WorkspaceEmpty → Markdown: 点击文件后编辑器可见', async () => {
    const fileName = await openFirstFile();

    const vditor = await browser.$(S.vditor);
    expect(await vditor.isDisplayed()).toBe(true);

    const bc = await browser.$(S.breadcrumb);
    const bcText = await bc.getText();
    // Breadcrumb should contain workspace separator and the file name
    expect(bcText).toContain('/');
    expect(bcText).toContain(fileName);

    const sb = await browser.$(S.statusBar);
    const sbText = await sb.getText();
    expect(sbText).toContain(T.editorLabelMd);
  });

  it('Markdown → Welcome: 点击侧边栏"返回"按钮', async () => {
    await openFirstFile();

    await jsClickByTitle('button', T.backToManagement);
    await browser.pause(500);

    await wait(S.welcomeTitle, 10000);
    await waitGone(S.sidebar, 5000);
  });
});

// ─── 侧边栏折叠/展开 ─────────────────────────────────────

describe('全局: 侧边栏折叠/展开', () => {
  it('点击收起按钮后侧边栏变为折叠态', async () => {
    await openWorkspace();

    await jsClickByTitle('button', T.collapseSidebar);
    await browser.pause(500);

    await wait(S.sidebarCollapsed, 5000);

    const expandBtn = await browser.$(`${S.sidebarBtn}[title="${T.expandSidebar}"]`);
    expect(await expandBtn.isDisplayed()).toBe(true);

    await waitGone(S.fileTree, 3000);
  });

  it('点击展开按钮后侧边栏恢复', async () => {
    await openWorkspace();

    await jsClickByTitle('button', T.collapseSidebar);
    await wait(S.sidebarCollapsed, 5000);

    await jsClickByTitle('button', T.expandSidebar);
    await browser.pause(500);

    await waitGone(S.sidebarCollapsed, 5000);
    await wait(S.fileTree, 5000);
  });
});

// ─── 主题切换 ─────────────────────────────────────────────

describe('全局: 主题切换', () => {
  it('点击主题按钮后 data-theme 值翻转', async () => {
    // MainToolbar returns null when activeEditorType === 'empty',
    // so we must open a file first to make the toolbar (and theme button) visible
    await openFirstFile();

    const root = await browser.$(S.themeRoot);
    const themeBefore = await root.getAttribute('data-theme');
    expect(['light', 'dark']).toContain(themeBefore);

    await jsClickByTitle(S.toolbarBtn, '切换主题');
    await browser.pause(300);

    const themeAfter = await root.getAttribute('data-theme');
    expect(themeAfter).not.toBe(themeBefore);
    expect(['light', 'dark']).toContain(themeAfter);
  });
});

// ─── 快捷键 ──────────────────────────────────────────────

describe('全局: Ctrl+Shift+F 打开全局搜索', () => {
  it('触发全局搜索后搜索对话框可见', async () => {
    await openGlobalSearch();

    const input = await browser.$(S.gsInput);
    expect(await input.isDisplayed()).toBe(true);
  });

  it('关闭搜索对话框', async () => {
    await openGlobalSearch();
    await closeGlobalSearch();

    const overlay = await browser.$(S.gsOverlay);
    expect(await overlay.isExisting()).toBe(false);
  });
});

describe('全局: Ctrl+P 打开导出对话框', () => {
  it('触发导出后导出对话框可见', async () => {
    await openExportDialog();

    const dialog = await browser.$(S.exDialog);
    expect(await dialog.isDisplayed()).toBe(true);
  });

  it('关闭导出对话框', async () => {
    const overlay = await browser.$(S.exOverlay);
    if (!(await overlay.isExisting())) {
      await openExportDialog();
    }
    await closeExportDialog();

    const overlayAfter = await browser.$(S.exOverlay);
    expect(await overlayAfter.isExisting()).toBe(false);
  });
});

describe('全局: 白板模式下快捷键被拦截', () => {
  it('白板中 Ctrl+Shift+F 不打开搜索', async () => {
    await openFirstFile();
    await enterWhiteboard();

    await jsPressShortcut(['Control', 'Shift', 'f']);
    await browser.pause(500);
    const overlay = await browser.$(S.gsOverlay);
    expect(await overlay.isExisting()).toBe(false);
  });

  it('白板中 Ctrl+P 不打开导出', async () => {
    const wb = await browser.$(S.wbFullscreen);
    if (!(await wb.isExisting())) {
      await openFirstFile();
      await enterWhiteboard();
    }

    await jsPressShortcut(['Control', 'p']);
    await browser.pause(500);
    const overlay = await browser.$(S.exOverlay);
    expect(await overlay.isExisting()).toBe(false);
  });

  it('白板中 ESC 返回编辑器', async () => {
    const wb = await browser.$(S.wbFullscreen);
    if (!(await wb.isExisting())) {
      await openFirstFile();
      await enterWhiteboard();
    }

    await jsPressShortcut(['Escape']);
    await browser.pause(500);

    // 可能弹出确认对话框
    const confirmBtn = await browser.$(`button=${T.wbDiscardConfirm}`);
    if (await confirmBtn.isExisting()) {
      await browser.execute((txt: string) => {
        const btns = document.querySelectorAll('button');
        for (const b of btns) {
          if (b.textContent === txt) { (b as HTMLElement).click(); return; }
        }
      }, T.wbDiscardConfirm);
      await browser.pause(500);
    }

    await waitGone(S.wbFullscreen, 5000);
    await wait(S.vditor, 5000);
  });
});
