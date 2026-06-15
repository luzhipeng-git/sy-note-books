/**
 * E2E 测试：共享夹具 — 每个测试的必达前提。
 *
 * 设计原则（修复「断言形同虚设」问题）：
 *   1. openWorkspace / openFirstFile 通过真实 UI 点击操作（点击最近列表项、点击文件树节点），
 *      不再直接调用 store action。这样如果点击事件链路断裂，测试会失败。
 *   2. openGlobalSearch / openExportDialog 通过真实快捷键触发（jsPressShortcut），
 *      验证「用户按键 → 事件监听 → store action → UI 渲染」的完整链路。
 *   3. 唯一的 store 直调场景：测试数据准备（如 seedRecentWorkspace 预置最近列表），
 *      以及 WebKitGTK 物理上无法模拟的操作（如 Drawnix 画板绘制）。
 *
 * WebKitGTK WebDriver 限制：
 *   - 不支持原生 click() → 用 browser.execute() JS click（真实派发 DOM click 事件）
 *   - 不支持 W3C Actions API (browser.keys()) → 用 JS 派发键盘事件
 *   - 原生文件选择对话框无法操作 → 预置最近列表，通过点击列表项打开 workspace
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

/** 通过 JS 点击元素（真实派发 DOM click 事件，触发 onClick handler） */
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

/**
 * 通过 JS 派发键盘快捷键（document-level keydown）。
 * 这模拟了真实的用户按键事件，验证 AppShell 的 keydown 监听器是否正确响应。
 */
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

// ─── 测试数据准备（store 直调，仅用于 setup） ─────────────

const TEST_WS = '/tmp/synote-test-workspace';

/**
 * 异步调用 store action（等待 Promise 完成）。
 * 仅用于测试 setup（如确保最近列表有数据），不用于验证。
 */
async function storeActionAsync(action: string, ...args: unknown[]): Promise<unknown> {
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

/**
 * 确保最近列表中有 TEST_WS 记录，这样 UI 的「最近打开」列表会显示它。
 * 通过 settingsStore 的 addRecentWorkspace 预置数据（setup，非验证）。
 * 需要先确保应用启动后 settings 已加载。
 */
async function seedRecentWorkspace(): Promise<void> {
  await browser.execute(() => {
    const settingsStore = (window as any).__SETTINGS_STORE__;
    if (settingsStore?.getState) {
      settingsStore.getState().addRecentWorkspace('/tmp/synote-test-workspace', 'E2E测试文档');
    }
  });
}

// ─── 视图状态切换（真实 UI 交互） ──────────────────────────

/** 确保回到欢迎页（如果当前在 workspace 中，通过点击返回按钮关闭） */
export async function ensureWelcome(): Promise<void> {
  const sidebar = await browser.$(S.sidebar);
  if (await sidebar.isExisting()) {
    // 通过真实点击「返回 Workspace 管理」按钮关闭 workspace
    await jsClickByTitle('button', T.backToManagement);
    await browser.pause(500);
  }
  await wait(S.welcomeTitle, 10000);
}

/**
 * 通过真实 UI 点击打开 workspace。
 *
 * 策略：
 *   1. 如果处于白板模式，先退出（store 直调，因为 WebKitGTK 无法模拟 Drawnix 交互）。
 *   2. 如果 sidebar 已存在（workspace 已打开），确保展开状态后返回。
 *   3. 如果在欢迎页且有最近列表，点击 TEST_WS 对应的列表项（真实 UI 交互）。
 *   4. 如果最近列表为空，先预置数据（seedRecentWorkspace），刷新后点击。
 *
 * 注意：此处不直接调用 store.openWorkspace()，而是模拟用户点击最近列表。
 * 如果点击事件链路断裂（onClick 没绑定），测试会失败。
 */
export async function openWorkspace(): Promise<void> {
  // 先检查是否处于白板模式 — 白板模式下 sidebar 不在 DOM 中但 rootPath 仍有值
  const wbFullscreen = await browser.$(S.wbFullscreen);
  if (await wbFullscreen.isExisting()) {
    // 退出白板模式（store 直调，WebKitGTK 无法模拟 Drawnix 的返回操作）
    await browser.execute(() => {
      const wbStore = (window as any).__WHITEBOARD_STORE__;
      const wsStore = (window as any).__WORKSPACE_STORE__;
      if (wbStore?.getState) wbStore.getState().setDirty(false);
      if (wsStore?.getState) wsStore.getState().exitWhiteboard();
    });
    await browser.pause(500);
  }

  const sidebar = await browser.$(S.sidebar);
  if (await sidebar.isExisting()) {
    // Workspace 已打开 — 如果折叠了则展开
    const collapsed = await browser.$(S.sidebarCollapsed);
    if (await collapsed.isExisting()) {
      await jsClickByTitle('button', T.expandSidebar);
      await browser.pause(500);
    }
    await wait(S.fileTree, 5000);
    return;
  }

  // 检查是否已有 workspace 打开但 sidebar 不可见（如刚退出白板后 React 尚未渲染）
  const hasRoot = await browser.execute(() => {
    const store = (window as any).__WORKSPACE_STORE__;
    return store?.getState()?.rootPath !== null && store?.getState()?.rootPath !== undefined;
  });
  if (hasRoot) {
    // rootPath 有值但 sidebar 不可见 — 等待 React 渲染
    await browser.pause(500);
    const sidebarRetry = await browser.$(S.sidebar);
    if (await sidebarRetry.isExisting()) {
      await wait(S.fileTree, 5000);
      return;
    }
  }

  // 确保在欢迎页
  await wait(S.welcomeTitle, 10000);

  // 确保最近列表有 TEST_WS（预置数据）
  await seedRecentWorkspace();
  await browser.pause(300);

  // 点击最近列表中的 TEST_WS 项（真实 UI 交互）
  const clicked = await browser.execute((targetPath: string) => {
    const buttons = document.querySelectorAll('.welcome button');
    for (const btn of buttons) {
      if (btn.textContent?.includes(targetPath)) {
        (btn as HTMLElement).click();
        return true;
      }
    }
    return false;
  }, TEST_WS);

  if (!clicked) {
    throw new Error(`openWorkspace: 最近列表中未找到 ${TEST_WS}，无法通过 UI 点击打开`);
  }

  await wait(S.sidebar, 15000);
  await wait(S.fileTree, 5000);
}

/**
 * 打开第一个文件（真实 UI 点击文件树节点）。
 * 返回被点击文件的名称。
 */
export async function openFirstFile(): Promise<string> {
  await openWorkspace();

  // 确保所有文件夹已展开，使文件树节点可见
  await browser.execute(() => {
    const folders = document.querySelectorAll('.tree-item.folder');
    folders.forEach(f => {
      const icon = f.querySelector('.tree-icon');
      if (icon?.textContent === '▶') (f as HTMLElement).click();
    });
  });
  await browser.pause(500);

  // 点击第一个非文件夹节点（真实 UI 交互）
  const fileName = await browser.execute(() => {
    const items = document.querySelectorAll('.tree-item:not(.folder):not(.missing)');
    if (items.length === 0) return null;
    const el = items[0] as HTMLElement;
    const name = el.textContent?.trim() ?? '';
    el.click();
    return name;
  });

  if (!fileName) throw new Error('文件树中没有可点击的文件');

  await wait(S.vditor, 15000);
  await browser.pause(1500);
  return fileName;
}

/**
 * 通过真实快捷键 Ctrl+Shift+D 进入白板模式。
 * 验证 AppShell 的 keydown 监听器 → store.enterWhiteboard 的完整链路。
 */
export async function enterWhiteboard(): Promise<string> {
  await wait(S.vditor, 10000);

  // 用真实快捷键触发（验证 keydown → store action 链路）
  await jsPressShortcut(K.whiteboard);
  await wait(S.wbFullscreen, 15000);
  await browser.pause(1000);

  const topbarTitle = await browser.$(S.wbTopbarTitle);
  return await topbarTitle.getText();
}

/**
 * 通过真实快捷键 Ctrl+Shift+F 打开全局搜索。
 * 验证 AppShell keydown 监听器 → searchStore.openGlobalSearch 链路。
 * 幂等：如果搜索已打开，不重复触发（避免 toggle 关闭）。
 */
export async function openGlobalSearch(): Promise<void> {
  // 先检查是否已打开
  const overlay = await browser.$(S.gsOverlay);
  if (await overlay.isExisting()) {
    return; // 已打开，无需重复触发
  }

  // 用真实快捷键触发
  await jsPressShortcut(K.globalSearch);
  await wait(S.gsOverlay, 5000);
}

/**
 * 关闭全局搜索。
 * 先尝试 ESC 键（GlobalSearchDialog 有 onKeyDown ESC 处理），
 * 如果没关掉再用快捷键 toggle，最后用 store 兜底。
 */
export async function closeGlobalSearch(): Promise<void> {
  // 方案 1: ESC 键（GlobalSearchDialog 监听 ESC 关闭）
  await jsPressShortcut(['Escape']);
  await browser.pause(300);
  const overlay = await browser.$(S.gsOverlay);
  if (!(await overlay.isExisting())) {
    return; // ESC 成功关闭
  }

  // 方案 2: 再次 Ctrl+Shift+F toggle
  await jsPressShortcut(K.globalSearch);
  await browser.pause(300);
  const overlay2 = await browser.$(S.gsOverlay);
  if (!(await overlay2.isExisting())) {
    return; // toggle 成功关闭
  }

  // 方案 3: store 兜底（确保测试 cleanup 可靠）
  await browser.execute(() => {
    const searchStore = (window as any).__SEARCH_STORE__;
    if (searchStore?.getState) searchStore.getState().closeGlobalSearch();
  });
  await browser.pause(300);
  await waitGone(S.gsOverlay, 3000);
}

/**
 * 通过真实快捷键 Ctrl+P 打开导出对话框。
 * 验证 AppShell keydown 监听器 → exportStore.openDialog 链路。
 */
export async function openExportDialog(): Promise<void> {
  await jsPressShortcut(K.export);
  await wait(S.exOverlay, 5000);
}

/** 关闭导出对话框 */
export async function closeExportDialog(): Promise<void> {
  // 先尝试 ESC 关闭
  await jsPressShortcut(['Escape']);
  await browser.pause(300);
  const overlay = await browser.$(S.exOverlay);
  if (await overlay.isExisting()) {
    // ESC 没关掉，用 store 兜底
    await browser.execute(() => {
      const exportStore = (window as any).__EXPORT_STORE__;
      if (exportStore?.getState) exportStore.getState().closeDialog();
    });
    await browser.pause(300);
  }
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
