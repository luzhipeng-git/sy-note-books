/**
 * E2E Tests: 导出 (CHM / Nginx / PDF)
 * 注意: WebKitGTK WebDriver 不支持原生 click/keys，全部用 JS 交互
 */

import { S, T } from '../helpers/selectors.js';
import { wait, waitGone, openWorkspace, jsClick, jsPressShortcut, openExportDialog, closeExportDialog } from '../helpers/fixtures.js';

async function cleanupExport(): Promise<void> {
  const overlay = await browser.$(S.exOverlay);
  if (await overlay.isExisting()) {
    await closeExportDialog();
  }
}

// ─── 打开/关闭 ────────────────────────────────────────────

describe('导出: 打开和关闭', () => {
  afterEach(cleanupExport);

  it('Ctrl+P 打开导出对话框，显示配置界面', async () => {
    await openWorkspace();
    await openExportDialog();

    const dialog = await browser.$(S.exDialog);
    expect(await dialog.isDisplayed()).toBe(true);

    const closeBtn = await browser.$(S.exCloseBtn);
    expect(await closeBtn.isDisplayed()).toBe(true);
  });

  it('ESC 关闭导出对话框', async () => {
    await openWorkspace();
    await openExportDialog();
    await closeExportDialog();

    const overlay = await browser.$(S.exOverlay);
    expect(await overlay.isExisting()).toBe(false);
  });

  it('点击关闭按钮关闭对话框', async () => {
    await openWorkspace();
    await openExportDialog();

    await browser.execute((sel: string) => {
      const btn = document.querySelector(sel) as HTMLElement;
      if (btn) btn.click();
    }, S.exCloseBtn);
    await browser.pause(300);

    const overlay = await browser.$(S.exOverlay);
    expect(await overlay.isExisting()).toBe(false);
  });
});

// ─── 选择导出类型 ─────────────────────────────────────────

describe('导出: 选择类型', () => {
  afterEach(cleanupExport);

  it('显示 3 张导出类型卡片', async () => {
    await openWorkspace();
    await openExportDialog();

    const cards = await browser.$$(S.exCard);
    expect(cards.length).toBe(3);
  });

  it('点击第一张卡片选中，出现 .selected class', async () => {
    await openWorkspace();
    await openExportDialog();

    // JS click 第一张卡片
    await browser.execute((sel: string) => {
      const cards = document.querySelectorAll(sel);
      if (cards.length > 0) (cards[0] as HTMLElement).click();
    }, S.exCard);
    await browser.pause(300);

    const cardClass = await browser.execute((sel: string) => {
      const cards = document.querySelectorAll(sel);
      return cards.length > 0 ? cards[0].getAttribute('class') : '';
    }, S.exCard);
    expect(cardClass).toContain('selected');

    // 其他卡片不应有 selected
    const card2Class = await browser.execute((sel: string) => {
      const cards = document.querySelectorAll(sel);
      return cards.length > 1 ? cards[1].getAttribute('class') : '';
    }, S.exCard);
    expect(card2Class).not.toContain('selected');
  });

  it('点击第二张卡片，选中状态从第一张移到第二张', async () => {
    await openWorkspace();
    await openExportDialog();

    // click first
    await browser.execute((sel: string) => {
      const cards = document.querySelectorAll(sel);
      if (cards.length > 0) (cards[0] as HTMLElement).click();
    }, S.exCard);
    await browser.pause(200);

    // click second
    await browser.execute((sel: string) => {
      const cards = document.querySelectorAll(sel);
      if (cards.length > 1) (cards[1] as HTMLElement).click();
    }, S.exCard);
    await browser.pause(200);

    const states = await browser.execute((sel: string) => {
      const cards = document.querySelectorAll(sel);
      return {
        first: cards.length > 0 ? cards[0].getAttribute('class') : '',
        second: cards.length > 1 ? cards[1].getAttribute('class') : '',
      };
    }, S.exCard);

    expect(states.first).not.toContain('selected');
    expect(states.second).toContain('selected');
  });
});

// ─── 配置选项 ─────────────────────────────────────────────

describe('导出: 配置选项', () => {
  afterEach(cleanupExport);

  it('选中 CHM/Nginx 后显示导出范围、书名、作者配置', async () => {
    await openWorkspace();
    await openExportDialog();

    await browser.execute((sel: string) => {
      const cards = document.querySelectorAll(sel);
      if (cards.length > 0) (cards[0] as HTMLElement).click();
    }, S.exCard);
    await browser.pause(300);

    const formGroups = await browser.$$(S.exFormGroup);
    // Export dialog has exactly 3 config fields: export range, book title, author
    expect(formGroups.length).toBe(3);

    const labelTexts = await browser.execute((sel: string) => {
      const labels = document.querySelectorAll(sel);
      return Array.from(labels).map(l => (l as HTMLElement).textContent?.trim() ?? '');
    }, S.exLabel);

    expect(labelTexts.some((t: string) => t === '导出范围')).toBe(true);
    expect(labelTexts.some((t: string) => t.includes('书名'))).toBe(true);
    expect(labelTexts.some((t: string) => t.includes('作者'))).toBe(true);
  });

  it('书名覆盖输入框可输入', async () => {
    await openWorkspace();
    await openExportDialog();

    await browser.execute((sel: string) => {
      const cards = document.querySelectorAll(sel);
      if (cards.length > 0) (cards[0] as HTMLElement).click();
    }, S.exCard);
    await browser.pause(300);

    const inputs = await browser.$$(S.exInput);
    // After selecting export card, input fields must appear
    expect(inputs.length).toBeGreaterThanOrEqual(1);

    // JS 设置值
    await browser.execute((sel: string, val: string) => {
      const inputs = document.querySelectorAll(sel);
      if (inputs.length > 0) {
        const input = inputs[0] as HTMLInputElement;
        const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        if (nativeSetter) nativeSetter.call(input, val);
        else input.value = val;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, S.exInput, '测试导出书名');

    const value = await browser.execute((sel: string) => {
      const inputs = document.querySelectorAll(sel);
      return inputs.length > 0 ? (inputs[0] as HTMLInputElement).value : '';
    }, S.exInput);
    expect(value).toBe('测试导出书名');
  });

  it('"开始导出"按钮可见', async () => {
    await openWorkspace();
    await openExportDialog();

    await browser.execute((sel: string) => {
      const cards = document.querySelectorAll(sel);
      if (cards.length > 0) (cards[0] as HTMLElement).click();
    }, S.exCard);
    await browser.pause(300);

    const startBtn = await browser.$(`button=${T.startExport}`);
    expect(await startBtn.isDisplayed()).toBe(true);
  });

  it('选中 PDF 时按钮文本变为"导出 PDF"', async () => {
    await openWorkspace();
    await openExportDialog();

    // click 第三张卡片 (PDF)
    await browser.execute((sel: string) => {
      const cards = document.querySelectorAll(sel);
      if (cards.length >= 3) (cards[2] as HTMLElement).click();
    }, S.exCard);
    await browser.pause(300);

    const pdfBtn = await browser.$(`button=${T.exportPdfBtn}`);
    expect(await pdfBtn.isDisplayed()).toBe(true);
  });
});

// ─── 执行导出 ─────────────────────────────────────────────

describe('导出: 执行和进度', () => {
  afterEach(cleanupExport);

  it('点击"开始导出"后进入进度或成功状态', async () => {
    await openWorkspace();
    await openExportDialog();

    await browser.execute((sel: string) => {
      const cards = document.querySelectorAll(sel);
      if (cards.length > 0) (cards[0] as HTMLElement).click();
    }, S.exCard);
    await browser.pause(300);

    // JS click 开始导出按钮
    await browser.execute((txt: string) => {
      const btns = document.querySelectorAll('button');
      for (const b of btns) {
        if (b.textContent?.trim() === txt) { (b as HTMLElement).click(); return; }
      }
    }, T.startExport);
    await browser.pause(1000);

    // Either progress bar or success result should appear
    // (IPC stub may complete instantly, skipping the progress animation)
    const progressBar = await browser.$(S.exProgressBar);
    const successIcon = await browser.$('.export-result-icon');
    const hasProgress = await progressBar.isExisting();
    const hasSuccess = await successIcon.isExisting();
    expect(hasProgress || hasSuccess).toBe(true);

    if (hasProgress) {
      const fill = await browser.$(S.exProgressFill);
      await fill.waitForExist({ timeout: 3000 });
    }
  });

  it('导出完成后显示成功结果（✅ + 输出路径）', async () => {
    await openWorkspace();
    await openExportDialog();

    await browser.execute((sel: string) => {
      const cards = document.querySelectorAll(sel);
      if (cards.length > 0) (cards[0] as HTMLElement).click();
    }, S.exCard);
    await browser.pause(300);

    await browser.execute((txt: string) => {
      const btns = document.querySelectorAll('button');
      for (const b of btns) {
        if (b.textContent?.trim() === txt) { (b as HTMLElement).click(); return; }
      }
    }, T.startExport);

    // Wait for export to complete and show result
    const resultIcon = await browser.$(S.exResultIcon);
    await resultIcon.waitForExist({ timeout: 15000 });
    expect(await resultIcon.getText()).toBe('✅');

    const resultTitle = await browser.$(S.exResultTitle);
    await resultTitle.waitForExist({ timeout: 5000 });
    expect(await resultTitle.getText()).toBe(T.exportSuccess);
  });
});

// ─── 无 workspace 时 ─────────────────────────────────────

describe('导出: 无 workspace 状态', () => {
  afterEach(cleanupExport);

  it('无 workspace 时显示 Workspace 选择步骤', async () => {
    // 确保 workspace 关闭
    const sidebar = await browser.$(S.sidebar);
    if (await sidebar.isExisting()) {
      await browser.execute((ttl: string) => {
        const btn = document.querySelector(`button[title="${ttl}"]`) as HTMLElement;
        if (btn) btn.click();
      }, T.backToManagement);
      await browser.pause(500);
    }

    await jsPressShortcut(['Control', 'p']);
    await wait(S.exOverlay, 5000);

    const dialog = await browser.$(S.exDialog);
    const dialogText = await dialog.getText();
    expect(dialogText).toContain(T.exportPickTitle);
  });
});
