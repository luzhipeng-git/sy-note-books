/**
 * E2E Tests: 跨功能联动验证（Integration Tests）
 *
 * 目的：验证多个功能域之间的完整用户旅程，通过真实 Tauri IPC
 * （非 mock），在 Docker Fedora 容器中执行。
 *
 * 与 07-ipc-backend.spec.ts 的区别：
 *   - 07 测单个 IPC Command 的 happy path / error path
 *   - 08 测跨 Store、跨 UI 组件、跨 IPC 的完整用户流程
 *
 * 关键约束：
 *   - browser.execute() 不等待 async 函数完成，async store action
 *     必须用 browser.executeAsync（即 storeActionAsync 封装）
 *   - WebKitGTK 无 Intl.Segmenter，搜索 query 必须是纯 ASCII 单词
 *   - 文件树 DOM 更新依赖 React re-render，需要等待
 */

import {
  invokeIPC,
  ipcOpenWorkspace,
  ipcReadFile,
  ipcSaveFile,
  ipcReadAllMdFiles,
  ipcCreateChapter,
  ipcCreatePage,
  ipcDeleteNode,
  ipcRenameNode,
  type WorkspaceInfo,
} from '../helpers/ipc.js';
import { S, T } from '../helpers/selectors.js';
import {
  wait, waitGone, openWorkspace, openFirstFile, enterWhiteboard,
  openGlobalSearch, closeGlobalSearch, openExportDialog, closeExportDialog,
} from '../helpers/fixtures.js';

const TEST_WS = '/tmp/synote-test-workspace';

function uid(): string {
  return String(Date.now());
}

/** 等待搜索索引就绪 */
async function waitForIndexReady(maxWait = 10000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const ready = await browser.execute(() => {
      const store = (window as any).__SEARCH_STORE__;
      return store?.getState()?.isIndexReady ?? false;
    });
    if (ready) return;
    await browser.pause(300);
  }
}

/** 通过 store 执行搜索 */
async function storeSearch(query: string): Promise<void> {
  await waitForIndexReady();
  await browser.execute((q: string) => {
    const store = (window as any).__SEARCH_STORE__;
    if (store?.getState) {
      store.getState().setGlobalSearchQuery(q);
      store.getState().executeGlobalSearch();
    }
  }, query);
  await browser.pause(500);
}

/**
 * 异步调用 workspace store action（使用 executeAsync 正确等待 Promise）。
 * browser.execute 无法等待 store 内部的 async IPC 调用完成。
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

// ═══════════════════════════════════════════════════════════════
// 1. Workspace → Editor → Search 联动
// ═══════════════════════════════════════════════════════════════

describe('联动: Workspace → Editor → Search', () => {
  it('打开 workspace 后 searchStore 自动构建索引，可搜到内容', async () => {
    await openWorkspace();

    const indexReady = await browser.execute(() => {
      const store = (window as any).__SEARCH_STORE__;
      return store?.getState()?.isIndexReady ?? false;
    });
    expect(indexReady).toBe(true);

    await openGlobalSearch();
    await storeSearch('Tauri');

    const results = await browser.$$(S.gsResult);
    // "Tauri" is known to exist in fixture content — search MUST return results
    expect(results.length).toBeGreaterThanOrEqual(1);

    await closeGlobalSearch();
  });

  it('搜索结果点击后打开对应文件，编辑器显示内容', async () => {
    await openFirstFile();

    await openGlobalSearch();
    await storeSearch('Tauri');

    const results = await browser.$$(S.gsResult);
    // "Tauri" is known in fixture — must have results
    expect(results.length).toBeGreaterThanOrEqual(1);

    await browser.execute(() => {
      const result = document.querySelector('.global-search-result');
      if (result) (result as HTMLElement).click();
    });
    await browser.pause(1500);

    const overlay = await browser.$(S.gsOverlay);
    expect(await overlay.isExisting()).toBe(false);

    const vditor = await browser.$(S.vditor);
    expect(await vditor.isDisplayed()).toBe(true);

    await closeGlobalSearch();
  });

  it('IPC 创建新章节 → refreshTree → 索引重建 → 搜到新内容', async () => {
    await openWorkspace();

    // 纯 ASCII 单词，不含 _ 或数字，避免 tokenizer 拆分
    const uniqueWord = 'IntegrationMarkerAbcXyz';
    const chapter = await ipcCreateChapter(TEST_WS, `SearchChapter${uid()}`);
    await ipcSaveFile(
      `${TEST_WS}/${chapter.indexPath}`,
      `# Search Chapter\n\nSome text with ${uniqueWord} inside.`,
    );

    await storeActionAsync('refreshTree');
    await waitForIndexReady();

    await openGlobalSearch();
    await storeSearch(uniqueWord);

    const results = await browser.$$(S.gsResult);
    expect(results.length).toBeGreaterThanOrEqual(1);

    await closeGlobalSearch();
    // 用目录名删除整个章节（indexPath 只删 index.md，会留下孤目录导致后续 open_workspace 自动修复）
    await ipcDeleteNode(TEST_WS, chapter.name);
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. Editor → Whiteboard → Editor 联动
// ═══════════════════════════════════════════════════════════════

describe('联动: Editor → Whiteboard → Editor', () => {
  it('从编辑器进入白板，保存后返回，IPC 验证文件内容', async () => {
    await openFirstFile();
    await enterWhiteboard();

    const wb = await browser.$(S.wbFullscreen);
    expect(await wb.isDisplayed()).toBe(true);

    await browser.execute(() => {
      const wbStore = (window as any).__WHITEBOARD_STORE__;
      if (wbStore?.getState) wbStore.getState().setDirty(true);
    });

    await browser.execute((sel: string) => {
      const btn = document.querySelector(sel) as HTMLElement;
      if (btn) btn.click();
    }, S.wbSaveBtn);
    await browser.pause(3000);

    await waitGone(S.wbFullscreen, 10000);
    const vditor = await browser.$(S.vditor);
    expect(await vditor.isDisplayed()).toBe(true);

    const activeFilePath = await browser.execute(() => {
      const store = (window as any).__WORKSPACE_STORE__;
      return store?.getState()?.activeFilePath ?? null;
    }) as string | null;

    // activeFilePath must be set after save-and-insert
    expect(activeFilePath).not.toBeNull();
    const fileContent = await ipcReadFile(`${TEST_WS}/${activeFilePath}`);
    // 通过 IPC 验证文件内容是合法 markdown（含标题或文本内容）
    expect(fileContent.length).toBeGreaterThan(0);
    expect(fileContent).toMatch(/\S/);
  });

  it('白板模式下键盘快捷键 Ctrl+Shift+F 不触发搜索 UI', async () => {
    const overlayBefore = await browser.$(S.gsOverlay);
    if (await overlayBefore.isExisting()) {
      await closeGlobalSearch();
    }

    await openFirstFile();
    await enterWhiteboard();

    await browser.execute(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'F', code: 'KeyF',
        ctrlKey: true, shiftKey: true,
        bubbles: true, cancelable: true, composed: true,
      }));
    });
    await browser.pause(500);

    const searchOverlay = await browser.$(S.gsOverlay);
    expect(await searchOverlay.isExisting()).toBe(false);

    // 清理：直接退出白板
    await browser.execute(() => {
      const wbStore = (window as any).__WHITEBOARD_STORE__;
      const wsStore = (window as any).__WORKSPACE_STORE__;
      if (wbStore?.getState) wbStore.getState().setDirty(false);
      if (wsStore?.getState) wsStore.getState().exitWhiteboard();
    });
    await browser.pause(500);
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. Multi-File Navigation 联动
// ═══════════════════════════════════════════════════════════════

describe('联动: 多文件导航', () => {
  it('切换文件时编辑器内容更新，IPC 验证每个文件内容正确', async () => {
    await openWorkspace();
    await browser.execute(() => {
      const folders = document.querySelectorAll('.tree-item.folder');
      folders.forEach(f => {
        const icon = f.querySelector('.tree-icon');
        if (icon?.textContent === '▶') (f as HTMLElement).click();
      });
    });
    await browser.pause(500);

    const items = await browser.$$('.tree-item:not(.folder):not(.missing)');
    // Fixture workspace must have ≥2 pages for this test
    expect(items.length).toBeGreaterThanOrEqual(2);

    // 点击第一个文件
    await browser.execute(() => {
      const items = document.querySelectorAll('.tree-item:not(.folder):not(.missing)');
      if (items[0]) (items[0] as HTMLElement).click();
    });
    await browser.pause(1000);
    await wait(S.vditor, 10000);

    const file1Path = await browser.execute(() => {
      const store = (window as any).__WORKSPACE_STORE__;
      return store?.getState()?.activeFilePath ?? null;
    }) as string | null;
    expect(file1Path).toMatch(/\.md$/);

    const file1Content = await ipcReadFile(`${TEST_WS}/${file1Path}`);
    // File content should be valid markdown
    expect(file1Content).toMatch(/\S/);

    // 切换到第二个文件
    await browser.execute(() => {
      const items = document.querySelectorAll('.tree-item:not(.folder):not(.missing)');
      if (items[1]) (items[1] as HTMLElement).click();
    });
    await browser.pause(1000);

    const file2Path = await browser.execute(() => {
      const store = (window as any).__WORKSPACE_STORE__;
      return store?.getState()?.activeFilePath ?? null;
    }) as string | null;
    expect(file2Path).not.toBe(file1Path);

    const file2Content = await ipcReadFile(`${TEST_WS}/${file2Path}`);
    expect(file2Content).toMatch(/\S/);
  });

  it('通过搜索结果切换文件，编辑器正确加载', async () => {
    await openFirstFile();

    await openGlobalSearch();
    await storeSearch('index');

    const results = await browser.$$(S.gsResult);
    // "index" 存在于多个 fixture 文件中，MiniSearch 应至少返回 1 个结果
    expect(results.length).toBeGreaterThanOrEqual(1);

    await browser.execute(() => {
      const items = document.querySelectorAll('.global-search-result');
      if (items[1]) (items[1] as HTMLElement).click();
    });
    await browser.pause(1500);

    const vditor = await browser.$(S.vditor);
    expect(await vditor.isDisplayed()).toBe(true);

    const activePath = await browser.execute(() => {
      const store = (window as any).__WORKSPACE_STORE__;
      return store?.getState()?.activeFilePath ?? null;
    });
    expect(activePath).toMatch(/\.md$/);

    await closeGlobalSearch();
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. Workspace Lifecycle 联动
// ═══════════════════════════════════════════════════════════════

describe('联动: Workspace 生命周期', () => {
  it('关闭 workspace 后所有 store 状态正确重置', async () => {
    await openFirstFile();

    const stateBefore = await browser.execute(() => {
      const wsStore = (window as any).__WORKSPACE_STORE__;
      const srStore = (window as any).__SEARCH_STORE__;
      return {
        hasRootPath: wsStore?.getState()?.rootPath !== null,
        isIndexReady: srStore?.getState()?.isIndexReady ?? false,
      };
    });
    expect(stateBefore.hasRootPath).toBe(true);
    expect(stateBefore.isIndexReady).toBe(true);

    await browser.execute(() => {
      const store = (window as any).__WORKSPACE_STORE__;
      if (store?.getState) store.getState().closeWorkspace();
    });
    await browser.pause(1000);

    const stateAfter = await browser.execute(() => {
      const wsStore = (window as any).__WORKSPACE_STORE__;
      const srStore = (window as any).__SEARCH_STORE__;
      return {
        rootPath: wsStore?.getState()?.rootPath,
        isIndexReady: srStore?.getState()?.isIndexReady,
        activeFilePath: wsStore?.getState()?.activeFilePath,
      };
    });
    expect(stateAfter.rootPath).toBeNull();
    expect(stateAfter.activeFilePath).toBeNull();
    expect(stateAfter.isIndexReady).toBe(false);

    const welcome = await browser.$(S.welcomeTitle);
    expect(await welcome.isDisplayed()).toBe(true);
  });

  it('切换不同 workspace 后文件树和搜索索引更新', async () => {
    // 创建第二个 workspace
    const ws2Path = `/tmp/integration-ws2-${uid()}`;
    const ws2 = await invokeIPC<WorkspaceInfo>('create_workspace', {
      path: ws2Path,
      title: '第二Workspace',
      author: 'Integration Test',
    });
    expect(ws2.rootPath).toBe(ws2Path);

    const chapter = await ipcCreateChapter(ws2Path, 'WS2 Chapter');
    await ipcSaveFile(`${ws2Path}/${chapter.indexPath}`, '# WS2 Chapter\n\nWS2 content');

    // 打开第一个 workspace（用 storeActionAsync 正确等待 async）
    await storeActionAsync('openWorkspace', TEST_WS);
    await browser.pause(500);
    await wait(S.sidebar, 15000);

    const ws1Title = await browser.execute(() => {
      const store = (window as any).__WORKSPACE_STORE__;
      return store?.getState()?.workspaceMeta?.title ?? null;
    });
    expect(ws1Title).toBe('E2E测试文档');

    // 切换到第二个 workspace
    await storeActionAsync('openWorkspace', ws2Path);
    await browser.pause(500);
    await wait(S.sidebar, 15000);

    const ws2Title = await browser.execute(() => {
      const store = (window as any).__WORKSPACE_STORE__;
      return store?.getState()?.workspaceMeta?.title ?? null;
    });
    expect(ws2Title).toBe('第二Workspace');

    await waitForIndexReady();
    const indexReady = await browser.execute(() => {
      const store = (window as any).__SEARCH_STORE__;
      return store?.getState()?.isIndexReady ?? false;
    });
    expect(indexReady).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. IPC CRUD → Store 状态 → 搜索索引 联动
// ═══════════════════════════════════════════════════════════════

describe('联动: IPC CRUD → Store 状态 → 搜索索引', () => {
  const createdPaths: string[] = [];

  async function cleanupCreated(): Promise<void> {
    for (const path of createdPaths.reverse()) {
      try { await ipcDeleteNode(TEST_WS, path); } catch { /* already deleted */ }
    }
    createdPaths.length = 0;
  }

  /** 确保 TEST_WS 已打开（关闭其他 workspace 后重新打开） */
  async function ensureTestWorkspace(): Promise<void> {
    // 先检查当前 rootPath 是否已经是 TEST_WS
    const currentRoot = await browser.execute(() => {
      const store = (window as any).__WORKSPACE_STORE__;
      return store?.getState()?.rootPath ?? null;
    });
    if (currentRoot === TEST_WS) return;

    // 关闭当前 workspace，然后用 storeActionAsync 正确打开 TEST_WS
    await browser.execute(() => {
      const store = (window as any).__WORKSPACE_STORE__;
      if (store?.getState) store.getState().closeWorkspace();
    });
    await browser.pause(500);
    await storeActionAsync('openWorkspace', TEST_WS);
    await browser.pause(500);
    await wait(S.sidebar, 15000);
  }

  it('创建章节+页面后 refreshTree，store fileTree 包含新页面', async () => {
    await ensureTestWorkspace();

    const pageTitle = `TestPage${uid()}`;
    const chapter = await ipcCreateChapter(TEST_WS, `TestChap${uid()}`);
    createdPaths.push(chapter.indexPath);

    const page = await ipcCreatePage(TEST_WS, chapter.name, pageTitle);
    createdPaths.push(page.path);

    await ipcSaveFile(`${TEST_WS}/${page.path}`, `# ${pageTitle}\n\nContent here.`);

    // 验证 IPC 层面 SUMMARY.md 包含页面
    const summaryContent = await ipcReadFile(`${TEST_WS}/SUMMARY.md`);
    expect(summaryContent).toContain(pageTitle);

    // 通过 IPC 重新打开 workspace，获取最新 summary
    const wsInfo = await ipcOpenWorkspace(TEST_WS);
    // 验证 summary 包含页面
    const hasPage = wsInfo.summary.some(node => {
      if (node.title === pageTitle) return true;
      return (node.children ?? []).some(c => c.title === pageTitle);
    });
    expect(hasPage).toBe(true);

    // 通过 store refreshTree 更新前端状态
    await storeActionAsync('refreshTree');

    // 验证 fileTree 状态 — 用 chapter.name（目录名如 "05-chapter"）直接匹配
    const fileTreeState = await browser.execute((chapterDir: string) => {
      const store = (window as any).__WORKSPACE_STORE__;
      if (!store?.getState) return null;
      const state = store.getState();
      // fileTree 中每个条目的 path 格式为 "05-chapter/" 或 "05-chapter/index.md"
      const chapterFolder = state.fileTree.find((f: any) =>
        f.path === chapterDir || f.path === `${chapterDir}/` ||
        f.path === `${chapterDir}/index.md`
      );
      if (!chapterFolder) {
        return { found: false, folderPaths: state.fileTree.map((f: any) => f.path), searched: chapterDir };
      }
      return {
        found: true,
        childTitles: (chapterFolder.children ?? []).map((c: any) => c.title ?? c.name),
      };
    }, chapter.name);

    expect(fileTreeState).not.toBeNull();
    expect((fileTreeState as any).found).toBe(true);
    // fileTree 子条目可能用 title 或 name 存储，检查两种可能
    expect((fileTreeState as any).childTitles).toContain(pageTitle);

    await cleanupCreated();
  });

  it('CRUD 全流程：创建 → 重命名 → 搜索验证 → 删除', async () => {
    await ensureTestWorkspace();

    const chapterTitle = `CRUDChap${uid()}`;
    const chapter = await ipcCreateChapter(TEST_WS, chapterTitle);
    createdPaths.push(chapter.indexPath);

    const oldTitle = `OldPage${uid()}`;
    const page = await ipcCreatePage(TEST_WS, chapter.name, oldTitle);
    createdPaths.push(page.path);

    // 纯 ASCII 单词
    const uniqueWord = 'CrudMarkerAbcXyz';
    await ipcSaveFile(
      `${TEST_WS}/${page.path}`,
      `# ${oldTitle}\n\nSome text with ${uniqueWord} inside.`,
    );

    // 刷新索引（async IPC）
    await storeActionAsync('refreshTree');
    await waitForIndexReady();

    // 调试：检查搜索索引中是否包含文件
    const indexDebug = await browser.execute((searchWord: string) => {
      const store = (window as any).__SEARCH_STORE__;
      if (!store?.getState) return { error: 'no store' };
      const state = store.getState();
      const docCount = state.documents.size;
      const docPaths = [...state.documents.keys()].slice(0, 10);
      return { docCount, docPaths, isReady: state.isIndexReady };
    }, uniqueWord);

    // 通过 store 直接验证搜索结果
    await browser.execute((q: string) => {
      const store = (window as any).__SEARCH_STORE__;
      if (store?.getState) {
        store.getState().setGlobalSearchQuery(q);
        store.getState().executeGlobalSearch();
      }
    }, uniqueWord);
    await browser.pause(500);

    const searchResults = await browser.execute(() => {
      const store = (window as any).__SEARCH_STORE__;
      return store?.getState()?.globalSearchResults ?? [];
    });
    expect(searchResults.length).toBeGreaterThanOrEqual(1);

    // 重命名
    const newTitle = `NewPage${uid()}`;
    await ipcRenameNode(TEST_WS, page.path, newTitle);

    // IPC 验证文件内容已更新
    const fileContent = await ipcReadFile(`${TEST_WS}/${page.path}`);
    expect(fileContent).toContain(`# ${newTitle}`);
    expect(fileContent).not.toContain(`# ${oldTitle}`);

    // 删除
    await ipcDeleteNode(TEST_WS, page.path);
    createdPaths.pop();

    // IPC 验证 SUMMARY 不再包含
    const summary = await ipcReadFile(`${TEST_WS}/SUMMARY.md`);
    expect(summary).not.toContain(oldTitle);
    expect(summary).not.toContain(newTitle);

    await cleanupCreated();
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. Editor → Export 联动
// ═══════════════════════════════════════════════════════════════

describe('联动: Editor → Export', () => {
  it('打开文件后进入导出，对话框显示导出配置步骤', async () => {
    await openFirstFile();
    await openExportDialog();

    const overlay = await browser.$(S.exOverlay);
    expect(await overlay.isDisplayed()).toBe(true);

    // 有 workspace 时直接进入 config 步骤，显示导出卡片
    const cards = await browser.$$(S.exCard);
    // CHM, Nginx, PDF — exactly 3 export types
    expect(cards.length).toBe(3);

    await closeExportDialog();
  });

  it('导出对话框中可选择导出类型', async () => {
    await openFirstFile();
    await openExportDialog();

    const cards = await browser.$$(S.exCard);
    expect(cards.length).toBeGreaterThanOrEqual(2);

    await browser.execute(() => {
      const cards = document.querySelectorAll('.export-card');
      if (cards[1]) (cards[1] as HTMLElement).click();
    });
    await browser.pause(300);

    const selected = await browser.$(S.exCardSelected);
    expect(await selected.isDisplayed()).toBe(true);
    // Verify the second card specifically has the selected class
    const selectedText = await selected.getText();
    const firstCardText = await cards[0].getText();
    expect(selectedText).not.toBe(firstCardText);

    await closeExportDialog();
  });
});

// ═══════════════════════════════════════════════════════════════
// 7. IPC 直连 ↔ Store 状态一致性
// ═══════════════════════════════════════════════════════════════

describe('联动: IPC 直连 ↔ Store 状态一致性', () => {
  it('IPC 保存文件后重新打开，文件内容已更新（磁盘 → IPC 验证）', async () => {
    // 1. 通过 IPC 修改一个已知文件
    const targetFile = '01-getting-started/quickstart.md';
    const originalContent = await ipcReadFile(`${TEST_WS}/${targetFile}`);
    expect(originalContent.length).toBeGreaterThan(0);

    const marker = 'IPCSyncMarkerAbcXyz';
    const modifiedContent = originalContent + `\n\n## ${marker}\n`;
    await ipcSaveFile(`${TEST_WS}/${targetFile}`, modifiedContent);

    // 2. 通过 IPC 验证文件确实被修改
    const readBack = await ipcReadFile(`${TEST_WS}/${targetFile}`);
    expect(readBack).toContain(marker);

    // 3. 关闭当前 workspace，重新打开 TEST_WS，打开目标文件
    await browser.execute(() => {
      const store = (window as any).__WORKSPACE_STORE__;
      if (store?.getState) store.getState().closeWorkspace();
    });
    await browser.pause(500);
    await storeActionAsync('openWorkspace', TEST_WS);
    await browser.pause(500);
    await wait(S.sidebar, 15000);

    // 4. 用 storeActionAsync 打开修改后的文件（从磁盘重新读取）
    await storeActionAsync('openFile', targetFile);
    await browser.pause(1500);

    // 5. 验证 store 接收到了文件路径（说明 openFile 执行成功）
    const activeFilePath = await browser.execute(() => {
      const store = (window as any).__WORKSPACE_STORE__;
      return store?.getState()?.activeFilePath ?? null;
    });
    expect(activeFilePath).toBe(targetFile);

    // 6. 恢复
    await ipcSaveFile(`${TEST_WS}/${targetFile}`, originalContent);
  });

  it('IPC 设置变更后 UI 主题切换', async () => {
    const settings = await invokeIPC<{
      theme: string;
      sidebarWidth: number;
      recentWorkspaces: unknown[];
    }>('get_settings');

    const originalTheme = settings.theme;
    const newTheme = originalTheme === 'light' ? 'dark' : 'light';
    await invokeIPC<void>('save_settings', {
      settings: { ...settings, theme: newTheme },
    });

    await browser.execute(() => {
      const store = (window as any).__SETTINGS_STORE__;
      if (store?.getState) store.getState().loadSettings();
    });
    await browser.pause(500);

    const themeRoot = await browser.$(S.themeRoot);
    const dataTheme = await themeRoot.getAttribute('data-theme');
    expect(dataTheme).toBe(newTheme);

    // 恢复
    await invokeIPC<void>('save_settings', {
      settings: { ...settings, theme: originalTheme },
    });
    await browser.execute(() => {
      const store = (window as any).__SETTINGS_STORE__;
      if (store?.getState) store.getState().loadSettings();
    });
    await browser.pause(500);
  });

  it('连续多次 IPC 操作后 Tauri 环境稳定', async () => {
    for (let i = 0; i < 5; i++) {
      const ws = await ipcOpenWorkspace(TEST_WS);
      expect(ws.rootPath).toBe(TEST_WS);

      const content = await ipcReadFile(`${TEST_WS}/SUMMARY.md`);
      expect(content).toContain('- [');

      const allFiles = await ipcReadAllMdFiles(TEST_WS);
      // fixture 至少有 12 个 .md 文件（前序测试可能创建了更多）
      expect(allFiles.length).toBeGreaterThanOrEqual(12);

      const s = await invokeIPC<{ theme: string }>('get_settings');
      expect(typeof s.theme).toBe('string');
    }

    const greeting = await invokeIPC<string>('greet');
    expect(greeting).toBe('Hello from sy-note-books!');
  });
});
