/**
 * E2E Tests: Workspace 管理、文件树 CRUD
 *
 * 状态机来源: design/interaction/workspace.html
 * 注意: WebKitGTK WebDriver 不支持原生 click/right-click/keys
 */

import { S, T } from '../helpers/selectors.js';
import { wait, waitGone, openWorkspace, jsClick, jsClickByTitle, jsPressShortcut, jsSetValue } from '../helpers/fixtures.js';

// ─── 文件树展开/折叠 ──────────────────────────────────────

describe('文件树: 章节展开与折叠', () => {
  it('点击已展开的章节折叠，子页面消失', async () => {
    await openWorkspace();

    // openWorkspace 默认展开所有章节，tree-item 包含子页面
    const beforeItems = await browser.$$(S.treeItem);

    // 点击第一个章节（已展开状态 → 折叠）
    await browser.execute((sel: string) => {
      const folders = document.querySelectorAll(sel);
      if (folders.length > 0) (folders[0] as HTMLElement).click();
    }, S.treeItemFolder);
    await browser.pause(500);

    const afterItems = await browser.$$(S.treeItem);
    // 折叠后数量应减少
    expect(afterItems.length).toBeLessThan(beforeItems.length);

    // 图标变为 ▶
    const iconText = await browser.execute((sel: string) => {
      const folder = document.querySelector(sel);
      if (!folder) return '';
      const icon = folder.querySelector('.tree-icon');
      return icon?.textContent ?? '';
    }, S.treeItemFolder);
    expect(iconText).toBe('▶');
  });

  it('再次点击同一章节展开，子页面恢复', async () => {
    await openWorkspace();

    // Ensure all folders start expanded (previous test may have collapsed one)
    await browser.execute(() => {
      const folders = document.querySelectorAll('.tree-item.folder');
      folders.forEach(f => {
        const icon = f.querySelector('.tree-icon');
        if (icon?.textContent === '▶') (f as HTMLElement).click();
      });
    });
    await browser.pause(500);

    // Record initial expanded item count (scoped to this it())
    const initialCount = (await browser.$$(S.treeItem)).length;

    // 先折叠
    await browser.execute((sel: string) => {
      const folders = document.querySelectorAll(sel);
      if (folders.length > 0) (folders[0] as HTMLElement).click();
    }, S.treeItemFolder);
    await browser.pause(500);
    const collapsedCount = (await browser.$$(S.treeItem)).length;

    // 再展开
    await browser.execute((sel: string) => {
      const folders = document.querySelectorAll(sel);
      if (folders.length > 0) (folders[0] as HTMLElement).click();
    }, S.treeItemFolder);
    await browser.pause(500);
    const expandedCount = (await browser.$$(S.treeItem)).length;

    expect(expandedCount).toBeGreaterThan(collapsedCount);
    // Expanded count should match the initial count before collapse
    expect(expandedCount).toBe(initialCount);

    // 图标恢复为 ▼
    const iconText = await browser.execute((sel: string) => {
      const folder = document.querySelector(sel);
      if (!folder) return '';
      const icon = folder.querySelector('.tree-icon');
      return icon?.textContent ?? '';
    }, S.treeItemFolder);
    expect(iconText).toBe('▼');
  });
});

// ─── 选中文件 ─────────────────────────────────────────────

describe('文件树: 选中文件', () => {
  it('点击文件后高亮选中，编辑器加载内容', async () => {
    await openWorkspace();

    // 展开第一个章节
    await browser.execute((sel: string) => {
      const folders = document.querySelectorAll(sel);
      if (folders.length > 0) (folders[0] as HTMLElement).click();
    }, S.treeItemFolder);
    await browser.pause(500);

    // 点击第一个非文件夹节点
    const fileName = await browser.execute((sel: string) => {
      const items = document.querySelectorAll(`${sel}:not(.folder):not(.missing)`);
      if (items.length === 0) return null;
      const el = items[0] as HTMLElement;
      const name = el.textContent?.trim() ?? '';
      el.click();
      return name;
    }, S.treeItem);

    expect(fileName).not.toBe('');
    expect(typeof fileName).toBe('string');
    // 文件名必须是有效内容（fixture 页面名是中文，如"快速开始"、"架构概览"等）
    expect(fileName!.trim().length).toBeGreaterThan(0);
    await browser.pause(1500);

    await wait(S.vditor, 10000);

    const bc = await browser.$(S.breadcrumb);
    const bcText = await bc.getText();
    // 面包屑必须包含 workspace 标题（fixture 标题为 "E2E测试文档"）
    expect(bcText).toContain('E2E测试文档');

    const sb = await browser.$(S.statusBar);
    const sbText = await sb.getText();
    // 状态栏必须包含 Markdown 标记和行列信息
    expect(sbText).toContain(T.editorLabelMd);
    expect(sbText).toMatch(/行\s*\d.*列\s*\d/);
  });

  it('点击另一个文件，前一个取消高亮，新文件高亮', async function () {
    await openWorkspace();

    // 找一个有 ≥2 子页面的章节
    const expanded = await browser.execute(() => {
      const folders = document.querySelectorAll('.tree-item.folder');
      for (const folder of folders) {
        (folder as HTMLElement).click();
      }
      return folders.length;
    });
    await browser.pause(500);

    // 点击第一页和第二页
    const result = await browser.execute(() => {
      const pages = document.querySelectorAll('.tree-item:not(.folder):not(.missing)');
      if (pages.length < 2) return { count: pages.length };
      (pages[0] as HTMLElement).click();
      return { first: (pages[0] as HTMLElement).getAttribute('class'), count: pages.length };
    });
    await browser.pause(1000);

    if (!result || result.count < 2) {
      // Explicit pending — fixture must have ≥2 pages for this test
      this.skip();
    }

    // 点击第二页
    await browser.execute(() => {
      const pages = document.querySelectorAll('.tree-item:not(.folder):not(.missing)');
      if (pages.length >= 2) (pages[1] as HTMLElement).click();
    });
    await browser.pause(1000);

    // 验证：第二页 active，第一页不再 active
    const states = await browser.execute(() => {
      const pages = document.querySelectorAll('.tree-item:not(.folder):not(.missing)');
      if (pages.length < 2) return null;
      return {
        first: pages[0].getAttribute('class'),
        second: pages[1].getAttribute('class'),
      };
    });
    if (!states) {
      this.skip();
    }
    expect(states!.first).not.toContain('active');
    expect(states!.second).toContain('active');
  });
});

// ─── 新建章节 ─────────────────────────────────────────────

describe('文件树: 新建章节', () => {
  it('点击"新建章节"按钮后输入标题，创建成功', async () => {
    await openWorkspace();

    const beforeCount = (await browser.$$(S.treeItemFolder)).length;

    // JS click "新建章节"按钮
    await browser.execute((ttl: string) => {
      const btn = document.querySelector(`button[title="${ttl}"]`) as HTMLElement;
      if (btn) btn.click();
    }, T.newChapter);
    await browser.pause(300);

    // 内联输入框出现 — 用 JS 设置值
    await wait(S.inlineRenameInput, 3000);
    await jsSetValue(S.inlineRenameInput, 'E2E测试章节');
    // Dispatch Enter directly on the input element (React onKeyDown won't catch document-level events)
    await browser.execute((sel: string) => {
      const input = document.querySelector(sel) as HTMLInputElement;
      if (input) {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      }
    }, S.inlineRenameInput);
    await browser.pause(2000);

    // 验证：树中出现新章节名（比计数更可靠）
    const treeText = await browser.$(S.fileTree).getText();
    expect(treeText).toContain('E2E测试章节');
  });
});

// ─── 右键菜单 ─────────────────────────────────────────────

describe('文件树: 右键菜单操作', () => {
  it('右键点击章节，出现"新建子页面/重命名/删除"菜单', async () => {
    await openWorkspace();

    // 用 JS contextmenu 事件替代 WebDriver right-click
    await browser.execute((sel: string) => {
      const folder = document.querySelector(sel);
      if (folder) {
        folder.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      }
    }, S.treeItemFolder);
    await browser.pause(300);

    // 菜单项全部可见
    const menuItems = await browser.execute(() => {
      const items = document.querySelectorAll('.context-menu-item');
      return Array.from(items).map(i => (i as HTMLElement).textContent?.trim());
    });
    expect(menuItems).toContain(T.newPage);
    expect(menuItems).toContain(T.rename);
    expect(menuItems).toContain(T.delete);
  });

  it('"重命名"打开内联编辑框，显示当前名称', async () => {
    await openWorkspace();

    // 右键 → 重命名
    await browser.execute((sel: string) => {
      const folder = document.querySelector(sel);
      if (folder) {
        folder.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      }
    }, S.treeItemFolder);
    await browser.pause(300);

    // 点击"重命名"菜单项
    await browser.execute((txt: string) => {
      const items = document.querySelectorAll('.context-menu-item');
      for (const item of items) {
        if (item.textContent?.trim() === txt) {
          (item as HTMLElement).click();
          return;
        }
      }
    }, T.rename);
    await browser.pause(300);

    const input = await wait(S.inlineRenameInput, 3000);
    const value = await input.getValue();
    // Rename input should be pre-filled with a non-whitespace folder name
    expect(value.trim().length).toBeGreaterThan(0);
  });

  it('"删除"弹出确认对话框，显示被删除节点名称', async () => {
    await openWorkspace();

    // 先新建一个章节作为删除目标
    await browser.execute((ttl: string) => {
      const btn = document.querySelector(`button[title="${ttl}"]`) as HTMLElement;
      if (btn) btn.click();
    }, T.newChapter);
    await browser.pause(300);
    await wait(S.inlineRenameInput, 3000);
    await jsSetValue(S.inlineRenameInput, '待删除章节');
    // Dispatch Enter directly on the input element (React onKeyDown won't catch document-level events)
    await browser.execute((sel: string) => {
      const input = document.querySelector(sel) as HTMLInputElement;
      if (input) {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      }
    }, S.inlineRenameInput);
    await browser.pause(1000);

    // 右键最后一个章节
    await browser.execute(() => {
      const folders = document.querySelectorAll('.tree-item.folder');
      if (folders.length > 0) {
        const last = folders[folders.length - 1];
        last.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      }
    });
    await browser.pause(300);

    // 点击"删除"
    await browser.execute((txt: string) => {
      const items = document.querySelectorAll('.context-menu-item');
      for (const item of items) {
        if (item.textContent?.trim() === txt) {
          (item as HTMLElement).click();
          return;
        }
      }
    }, T.delete);
    await browser.pause(300);

    // 确认对话框标题为"确认删除"
    const h3 = await browser.$('h3');
    expect(await h3.getText()).toBe(T.confirmDelete);

    // 对话框文本包含被删除节点名称 — use h3 + p to scope to confirm dialog paragraph
    const msg = await browser.$('h3 + p');
    const msgText = await msg.getText();
    // 确认消息中包含被删除节点名称
    expect(msgText).toMatch(/E2E测试章节|待删除章节/);

    // 取消删除 — JS click
    await browser.execute((txt: string) => {
      const btns = document.querySelectorAll('button');
      for (const b of btns) {
        if (b.textContent === txt) { (b as HTMLElement).click(); return; }
      }
    }, T.cancel);
    await browser.pause(300);
  });
});

// ─── 侧边栏 footer ──────────────────────────────────────

describe('文件树: Footer 统计', () => {
  it('footer 显示"X 章 · Y 页"', async () => {
    await openWorkspace();

    const footer = await wait(S.sidebarFooter, 5000);
    const text = await footer.getText();
    expect(text).toMatch(/\d+\s*章/);
    expect(text).toMatch(/\d+\s*页/);
  });
});
