/**
 * E2E 测试：共享夹具 — 每个测试的必达前提。
 *
 * WebKitGTK WebDriver 限制：
 *   - 不支持原生 click() → 用 browser.execute() JS click
 *   - 不支持 W3C Actions API (browser.keys()) → 用 store 直接调用或 JS 派发键盘事件
 *   - 部分键盘事件派发不可靠 → 对搜索/导出/白板等操作直接用 store action
 */

import { S, T, K } from './selectors.js';

// ─── 基础等待 ──────────────────────────────────────────────

export async function wait(selector: string, timeout = 10000) {
  const el = await browser.$(selector);
  await el.waitForExist({ timeout });
  return el;
}

export async function waitGone(selector: string, timeout = 10000): Promise<void> {
  const el = await browser.$(selector);
  await el.waitForExist({ timeout, reverse: true });
}

// ─── JS 交互工具 ────────────────────────────────────────

/** 通过 JS 点击元素 */
export async function jsClick(selector: string): Promise<void> {
  await browser.execute((sel: string) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (el) el.click();
    else throw new Error(`jsClick: element not found: ${sel}`);
  }, selector);
}

/** 通过 JS 点击匹配 selector + title 属性的按钮 */
export async function jsClickByTitle(selector: string, title: string): Promise<void> {
  await browser.execute((sel: string, ttl: string) => {
    const el = document.querySelector(`${sel}[title="${ttl}"]`) as HTMLElement | null;
    if (el) el.click();
    else throw new Error(`jsClickByTitle: ${sel}[title="${ttl}"] not found`);
  }, selector, title);
}

/** 通过 JS 派发键盘快捷键（用于简单场景，复杂操作优先用 store） */
export async function jsPressShortcut(keys: readonly string[]): Promise<void> {
  await browser.execute((keyList: string[]) => {
    const modifiers = keyList.filter(k => ['Control', 'Shift', 'Alt', 'Meta'].includes(k));
    const mainKey = keyList.find(k => !['Control', 'Shift', 'Alt', 'Meta'].includes(k));
    if (!mainKey) throw new Error(`jsPressShortcut: no main key in [${keyList}]`);

    const codeMap: Record<string, string> = {
      'f': 'KeyF', 'p': 'KeyP', 'd': 'KeyD', 's': 'KeyS',
      'Escape': 'Escape', 'Enter': 'Enter',
      'ArrowDown': 'ArrowDown', 'ArrowUp': 'ArrowUp', 'Tab': 'Tab',
    };
    const code = codeMap[mainKey] || mainKey;
    const hasShift = modifiers.includes('Shift');
    let keyValue = mainKey;
    if (hasShift && mainKey.length === 1 && mainKey >= 'a' && mainKey <= 'z') {
      keyValue = mainKey.toUpperCase();
    }

    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: keyValue, code,
      ctrlKey: modifiers.includes('Control'),
      shiftKey: hasShift,
      altKey: modifiers.includes('Alt'),
      metaKey: modifiers.includes('Meta'),
      bubbles: true, cancelable: true, composed: true,
    }));
  }, [...keys]);
}

/** 通过 JS 设置 input 值（兼容 React controlled input） */
export async function jsSetValue(selector: string, value: string): Promise<void> {
  await browser.execute((sel: string, val: string) => {
    const el = document.querySelector(sel) as HTMLInputElement | null;
    if (!el) throw new Error(`jsSetValue: element not found: ${sel}`);
    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (nativeSetter) nativeSetter.call(el, val);
    else el.value = val;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, selector, value);
}

/** 通过 JS 在 contentEditable 中输入文本 */
export async function jsTypeInEditor(selector: string, text: string): Promise<void> {
  await browser.execute((sel: string, txt: string) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) throw new Error(`jsTypeInEditor: element not found: ${sel}`);
    el.focus();
    for (const ch of txt) {
      document.execCommand('insertText', false, ch);
    }
  }, selector, text);
}

// ─── Store 直接调用（绕过所有 WebDriver 交互问题）──────────

const TEST_WS = '/tmp/synote-test-workspace';

/** 直接调用 workspaceStore action */
async function storeAction(action: string, ...args: unknown[]): Promise<unknown> {
  return await browser.executeAsync(
    (act: string, a: unknown[], done: (result: { ok: boolean; value: unknown }) => void) => {
      const store = (window as any).__WORKSPACE_STORE__;
      if (!store?.getState) {
        done({ ok: false, value: new Error('Workspace store not exposed') });
        return;
      }
      const state = store.getState();
      if (typeof state[act] !== 'function') {
        done({ ok: false, value: new Error(`Action "${act}" not found`) });
        return;
      }
      Promise.resolve(state[act](...a))
        .then((v: unknown) => done({ ok: true, value: v }))
        .catch((e: unknown) => done({ ok: false, value: e }));
    },
    action, args,
  ).then((result: { ok: boolean; value: unknown }) => {
    if (!result.ok) throw new Error(String(result.value));
    return result.value;
  });
}

// ─── 视图状态切换 ──────────────────────────────────────────

export async function ensureWelcome(): Promise<void> {
  const sidebar = await browser.$(S.sidebar);
  if (await sidebar.isExisting()) {
    await storeAction('closeWorkspace');
    await browser.pause(500);
  }
  await wait(S.welcomeTitle, 10000);
}

export async function openWorkspace(): Promise<void> {
  const sidebar = await browser.$(S.sidebar);
  if (await sidebar.isExisting()) {
    // Sidebar exists but may be collapsed — expand it so file tree DOM is available
    const collapsed = await browser.$(S.sidebarCollapsed);
    if (await collapsed.isExisting()) {
      await browser.execute(() => {
        const store = (window as any).__SETTINGS_STORE__;
        if (!store?.getState) throw new Error('openWorkspace: settings store not exposed');
        store.getState().toggleSidebarCollapse();
      });
      await browser.pause(500);
    }
    // Guarantee fileTree is visible regardless of which branch we took
    await wait(S.fileTree, 5000);
    return;
  }

  await storeAction('openWorkspace', TEST_WS);
  await browser.pause(1000);
  await wait(S.sidebar, 15000);
  await wait(S.fileTree, 5000);
}

export async function openFirstFile(): Promise<string> {
  await openWorkspace();

  // Ensure all folders are expanded so tree items are visible in DOM
  await browser.execute(() => {
    const folders = document.querySelectorAll('.tree-item.folder');
    folders.forEach(f => {
      const icon = f.querySelector('.tree-icon');
      if (icon?.textContent === '▶') (f as HTMLElement).click();
    });
  });
  await browser.pause(500);

  // 文件树初始已展开所有章节，点击第一个非文件夹节点
  const fileName = await browser.execute(() => {
    const items = document.querySelectorAll('.tree-item:not(.folder):not(.missing)');
    if (items.length === 0) return null;
    const el = items[0] as HTMLElement;
    const name = el.textContent?.trim() ?? '';
    el.click();
    return name;
  }, S.treeItem);

  if (!fileName) throw new Error('文件树中没有可点击的文件');

  await wait(S.vditor, 15000);
  await browser.pause(1500);
  return fileName;
}

/** 通过 store action 进入白板模式 */
export async function enterWhiteboard(): Promise<string> {
  await wait(S.vditor, 10000);

  // Initialize whiteboard store AND enter whiteboard mode via workspace store
  await browser.executeAsync((done: (err: unknown) => void) => {
    const wsStore = (window as any).__WORKSPACE_STORE__;
    const wbStore = (window as any).__WHITEBOARD_STORE__;
    if (!wsStore?.getState) { done('no workspace store'); return; }

    const state = wsStore.getState();
    // WhiteboardAnchor shape must match: sourceFilePath, cursorPosition, nearestHeading
    const anchor = {
      sourceFilePath: state.activeFilePath,
      cursorPosition: 1,
      nearestHeading: '当前段落',
    };

    // Must call initNew on whiteboard store BEFORE enterWhiteboard
    if (!wbStore?.getState) { done('no whiteboard store'); return; }
    wbStore.getState().initNew(anchor);
    state.enterWhiteboard(anchor);
    done(null);
  });
  await wait(S.wbFullscreen, 15000);
  await browser.pause(1000);

  const topbarTitle = await browser.$(S.wbTopbarTitle);
  return await topbarTitle.getText();
}

/** 打开全局搜索（通过 store） */
export async function openGlobalSearch(): Promise<void> {
  await browser.execute(() => {
    // searchStore 暴露在 window 上
    const searchStore = (window as any).__SEARCH_STORE__;
    if (!searchStore?.getState) throw new Error('openGlobalSearch: search store not exposed');
    searchStore.getState().openGlobalSearch();
  });
  await wait(S.gsOverlay, 5000);
}

/** 关闭全局搜索（通过 store） */
export async function closeGlobalSearch(): Promise<void> {
  await browser.execute(() => {
    const searchStore = (window as any).__SEARCH_STORE__;
    if (!searchStore?.getState) throw new Error('closeGlobalSearch: search store not exposed');
    searchStore.getState().closeGlobalSearch();
  });
  await browser.pause(300);
  await waitGone(S.gsOverlay, 3000);
}

/** 打开导出对话框（通过 store） */
export async function openExportDialog(): Promise<void> {
  await browser.execute(() => {
    const exportStore = (window as any).__EXPORT_STORE__;
    const wsStore = (window as any).__WORKSPACE_STORE__;
    if (!exportStore?.getState) throw new Error('openExportDialog: export store not exposed');
    const hasWorkspace = wsStore?.getState?.()?.rootPath !== null;
    exportStore.getState().openDialog(hasWorkspace);
  });
  await wait(S.exOverlay, 5000);
}

/** 关闭导出对话框（通过 store） */
export async function closeExportDialog(): Promise<void> {
  await browser.execute(() => {
    const exportStore = (window as any).__EXPORT_STORE__;
    if (!exportStore?.getState) throw new Error('closeExportDialog: export store not exposed');
    exportStore.getState().closeDialog();
  });
  await browser.pause(300);
  await waitGone(S.exOverlay, 3000);
}

// ─── DOM 工具 ──────────────────────────────────────────────

export async function getRect(
  el: WebdriverIO.Element,
): Promise<{ x: number; y: number; w: number; h: number }> {
  const rect = await browser.execute(
    (domEl: HTMLElement) => {
      const r = domEl.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }, el,
  );
  return rect as { x: number; y: number; w: number; h: number };
}
