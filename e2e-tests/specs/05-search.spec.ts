/**
 * E2E Tests: 全局搜索
 * 注意: 使用 store 直接调用搜索开关（WebKitGTK 键盘事件不可靠）
 */

import { S, T } from '../helpers/selectors.js';
import { wait, waitGone, openWorkspace, jsPressShortcut, jsSetValue, openGlobalSearch, closeGlobalSearch } from '../helpers/fixtures.js';

async function cleanupSearch(): Promise<void> {
  const overlay = await browser.$(S.gsOverlay);
  if (await overlay.isExisting()) {
    await closeGlobalSearch();
  }
}

/** Set search query via store action + execute search (jsSetValue doesn't trigger React onChange reliably) */
async function searchFor(query: string): Promise<void> {
  // Ensure search index is ready before querying
  for (let i = 0; i < 20; i++) {
    const ready = await browser.execute(() => {
      const store = (window as any).__SEARCH_STORE__;
      return store?.getState()?.isIndexReady ?? false;
    });
    if (ready) break;
    await browser.pause(250);
  }
  await browser.execute((q: string) => {
    const store = (window as any).__SEARCH_STORE__;
    if (store?.getState) {
      store.getState().setGlobalSearchQuery(q);
      store.getState().executeGlobalSearch();
    }
  }, query);
  await browser.pause(500);
}

/** Dispatch keyboard event directly on search input (document-level events don't reach React onKeyDown) */
async function searchKeyDown(key: string): Promise<void> {
  await browser.execute((k: string) => {
    const input = document.querySelector('.global-search-input');
    if (input) {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: k, bubbles: true, cancelable: true }));
    }
  }, key);
  await browser.pause(200);
}

// ─── 打开/关闭 ────────────────────────────────────────────

describe('搜索: 打开和关闭', () => {
  afterEach(cleanupSearch);

  it('打开搜索对话框，输入框可见且有 placeholder', async () => {
    await openGlobalSearch();

    const input = await browser.$(S.gsInput);
    expect(await input.isDisplayed()).toBe(true);

    const placeholder = await input.getAttribute('placeholder');
    expect(placeholder).toBe(T.searchPlaceholder);
  });

  it('关闭搜索对话框', async () => {
    await openGlobalSearch();
    await closeGlobalSearch();
    const overlay = await browser.$(S.gsOverlay);
    expect(await overlay.isExisting()).toBe(false);
  });
});

// ─── 查询和结果 ───────────────────────────────────────────

describe('搜索: 查询和结果', () => {
  afterEach(cleanupSearch);

  it('搜索查询执行后结果区域可见', async () => {
    await openWorkspace();
    await openGlobalSearch();

    // Use ASCII query — WebKitGTK may lack Intl.Segmenter for Chinese tokenization
    await searchFor('Tauri');

    // Search results or empty state should be visible
    // "Tauri" is known to exist in fixture content → expect results
    const results = await browser.$$(S.gsResult);
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it('查询不存在的词显示"未找到匹配内容"', async () => {
    await openWorkspace();
    await openGlobalSearch();

    await searchFor('zzz_no_such_content_12345');

    const empty = await browser.$(S.gsEmpty);
    await empty.waitForExist({ timeout: 5000 });
    expect(await empty.getText()).toBe(T.searchNoResult);
  });

  it('footer 显示结果数量和快捷键提示', async () => {
    await openWorkspace();
    await openGlobalSearch();

    await searchFor('Tauri');

    const footer = await browser.$(S.gsFooter);
    const footerText = await footer.getText();
    expect(footerText).toContain('↑↓');
    expect(footerText).toContain('Enter');
    expect(footerText).toContain('ESC');
  });
});

// ─── 过滤选项卡 ───────────────────────────────────────────

describe('搜索: 过滤选项卡', () => {
  afterEach(cleanupSearch);

  it('默认选中"全部"选项卡', async () => {
    await openGlobalSearch();
    const activeTab = await browser.$(S.gsTabActive);
    expect(await activeTab.getText()).toBe(T.tabAll);
  });

  it('点击"文件名"选项卡切换过滤', async () => {
    await openGlobalSearch();

    await browser.execute((txt: string) => {
      const tabs = document.querySelectorAll('.global-search-tab');
      for (const tab of tabs) {
        if (tab.textContent?.trim() === txt) {
          (tab as HTMLElement).click();
          return;
        }
      }
    }, T.tabFilename);
    await browser.pause(300);

    const activeTab = await browser.$(S.gsTabActive);
    expect(await activeTab.getText()).toBe(T.tabFilename);
  });

  it('Tab 键可切换过滤范围', async () => {
    await openGlobalSearch();

    // Dispatch Tab directly on the search input element
    await searchKeyDown('Tab');

    const activeTab = await browser.$(S.gsTabActive);
    const tabText = await activeTab.getText();
    // Tab key from "全部" should cycle to "文件名" (the next tab)
    expect(tabText).toBe(T.tabFilename);
  });
});

// ─── 键盘导航 ─────────────────────────────────────────────

describe('搜索: 键盘导航', () => {
  afterEach(cleanupSearch);

  it('↓ 键选择下一条结果，selected class 移动', async () => {
    await openWorkspace();
    await openGlobalSearch();
    await searchFor('Tauri');

    const results = await browser.$$(S.gsResult);
    // "Tauri" is known in fixture — must have ≥2 results for keyboard navigation
    expect(results.length).toBeGreaterThanOrEqual(2);

    const first = await browser.$(S.gsResultSelected);
    expect(await first.isDisplayed()).toBe(true);

    await searchKeyDown('ArrowDown');

    // After ArrowDown, exactly one item should be selected
    const selectedItems = await browser.$$(S.gsResultSelected);
    expect(selectedItems.length).toBe(1);
    // Verify the selected item moved to the second result
    const isSecondSelected = await browser.execute(() => {
      const results = document.querySelectorAll('.global-search-result');
      return results.length >= 2 ? results[1].classList.contains('selected') : false;
    });
    expect(isSecondSelected).toBe(true);
  });

  it('Enter 打开选中的结果文件，搜索关闭', async () => {
    await openWorkspace();
    await openGlobalSearch();
    await searchFor('Tauri');

    const results = await browser.$$(S.gsResult);
    // "Tauri" is known in fixture — must have results
    expect(results.length).toBeGreaterThanOrEqual(1);

    await searchKeyDown('Enter');
    // Use proper wait instead of fixed pause
    await waitGone(S.gsOverlay, 5000);

    // Editor should be visible with the opened file
    await wait(S.vditor, 10000);
    const vditor = await browser.$(S.vditor);
    expect(await vditor.isDisplayed()).toBe(true);
  });
});
