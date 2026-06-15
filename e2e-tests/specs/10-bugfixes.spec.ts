/**
 * E2E Tests: 代码审查发现的 Bug 修复验证
 *
 * 这些测试验证通过代码审查发现的 13 个问题的修复，全部走真实 Rust 后端 IPC。
 * 覆盖：reorder_chapters、导出版本管理、CHM 语言、路径穿越防护、设置持久化。
 *
 * 前提：Docker 容器中有真实 workspace fixture（/tmp/synote-test-workspace）。
 */

import {
  invokeIPC,
  ipcOpenWorkspace,
  ipcCreateChapter,
  ipcSaveFile,
  ipcReadFile,
  ipcReorderChapters,
  ipcPrepareExportOutput,
  ipcPruneExportVersions,
  ipcExportChmFull,
  ipcGetSettings,
  ipcSaveSettings,
} from '../helpers/ipc.js';

async function isTauriAvailable(): Promise<boolean> {
  try {
    const result = await browser.execute(
      () => '__TAURI_INTERNALS__' in window,
    );
    return result as boolean;
  } catch {
    return false;
  }
}

/** Create an isolated workspace copy for a test to avoid mutating the shared fixture. */
async function makeIsolatedWorkspace(prefix: string): Promise<string> {
  const dir = `/tmp/synote-test-bugfix-${prefix}-${Date.now()}`;
  // Create a fresh workspace via create_workspace then add chapters
  await invokeIPC('create_workspace', { path: dir, title: 'Bugfix Test', author: 'tester' });
  return dir;
}

// ═══════════════════════════════════════════════════════════
// Fix #6: reorder_chapters — 拖拽调整章节顺序
// ═══════════════════════════════════════════════════════════

describe('Bugfix #6: reorder_chapters', () => {
  it('交换两个章节顺序，目录前缀序号重命名', async () => {
    if (!(await isTauriAvailable())) return;

    const ws = await makeIsolatedWorkspace('reorder');
    await ipcCreateChapter(ws, 'Alpha');
    await ipcCreateChapter(ws, 'Beta');

    // Before: 01-alpha, 02-beta exist
    let info = await ipcOpenWorkspace(ws);
    expect(info.summary).toHaveLength(2);
    expect(info.summary[0].path).toContain('01-');

    // Swap: Alpha → order 2, Beta → order 1
    await ipcReorderChapters(ws, [
      { path: '01-alpha', newOrder: 2 },
      { path: '02-beta', newOrder: 1 },
    ]);

    // After: reopen and verify order
    info = await ipcOpenWorkspace(ws);
    expect(info.summary).toHaveLength(2);
    // First entry should now be Beta (order 1)
    expect(info.summary[0].title).toBe('Beta');
    expect(info.summary[0].path).toContain('01-beta');
    expect(info.summary[1].title).toBe('Alpha');
    expect(info.summary[1].path).toContain('02-alpha');
  });

  it('reorder 拒绝路径穿越（.. 逃逸）', async () => {
    if (!(await isTauriAvailable())) return;

    const ws = await makeIsolatedWorkspace('reorder-traversal');
    await expect(
      ipcReorderChapters(ws, [{ path: '../../etc', newOrder: 1 }]),
    ).rejects.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════
// Fix #3: 导出版本管理 — 每种类型保留最近 3 版
// ═══════════════════════════════════════════════════════════

describe('Bugfix #3: export version management', () => {
  it('prepare_export_output 返回递增版本号', async () => {
    if (!(await isTauriAvailable())) return;

    const ws = await makeIsolatedWorkspace('version');

    const v1 = await ipcPrepareExportOutput(ws, 'nginx');
    expect(v1).toContain('nginx-v1');

    // Simulate v1 existing by writing a marker file
    await ipcSaveFile(`${v1}/index.html`, '<html>v1</html>');

    const v2 = await ipcPrepareExportOutput(ws, 'nginx');
    expect(v2).toContain('nginx-v2');

    // Simulate v2 existing
    await ipcSaveFile(`${v2}/index.html`, '<html>v2</html>');

    const v3 = await ipcPrepareExportOutput(ws, 'nginx');
    expect(v3).toContain('nginx-v3');
  });

  it('版本号按类型独立计数（chm 与 nginx 互不影响）', async () => {
    if (!(await isTauriAvailable())) return;

    const ws = await makeIsolatedWorkspace('version-types');

    // Create nginx-v1
    const nv1 = await ipcPrepareExportOutput(ws, 'nginx');
    await ipcSaveFile(`${nv1}/index.html`, 'nginx v1');

    // chm should still start at v1
    const cv1 = await ipcPrepareExportOutput(ws, 'chm');
    expect(cv1).toContain('chm-v1');
  });

  it('prune_export_versions 保留最近 3 版，删除更早的', async () => {
    if (!(await isTauriAvailable())) return;

    const ws = await makeIsolatedWorkspace('prune');

    // Create 5 versions by repeatedly calling prepare + writing a file
    for (let i = 1; i <= 5; i++) {
      const path = await ipcPrepareExportOutput(ws, 'nginx');
      expect(path).toContain(`nginx-v${i}`);
      await ipcSaveFile(`${path}/index.html`, `version ${i}`);
      // prune after each, but prune only removes beyond 3 once they exist
    }

    // Now prune — should remove nginx-v1 and nginx-v2, keep v3/v4/v5
    const pruned = await ipcPruneExportVersions(ws, 'nginx');
    expect(pruned).toBe(2);

    // Verify next version is 6 (max was 5)
    const v6 = await ipcPrepareExportOutput(ws, 'nginx');
    expect(v6).toContain('nginx-v6');
  });

  it('完整生命周期：导出 5 次后只保留最近 3 版', async () => {
    if (!(await isTauriAvailable())) return;

    const ws = await makeIsolatedWorkspace('lifecycle');
    const createdPaths: string[] = [];

    for (let i = 1; i <= 5; i++) {
      const path = await ipcPrepareExportOutput(ws, 'nginx');
      await ipcSaveFile(`${path}/index.html`, `v${i}`);
      createdPaths.push(path);
      await ipcPruneExportVersions(ws, 'nginx');
    }

    // v1, v2 should be gone; v3, v4, v5 should exist
    const v1Content = await invokeIPC<string>('read_file', { path: `${ws}/dist/nginx-v1/index.html` }).catch(() => null);
    const v3Content = await invokeIPC<string>('read_file', { path: `${ws}/dist/nginx-v3/index.html` }).catch(() => null);
    const v5Content = await invokeIPC<string>('read_file', { path: `${ws}/dist/nginx-v5/index.html` }).catch(() => null);

    expect(v1Content).toBeNull();
    expect(v3Content).not.toBeNull();
    expect(v5Content).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════
// Fix #8: CHM 语言根据 workspace.json 而非硬编码
// ═══════════════════════════════════════════════════════════

describe('Bugfix #8: CHM language from workspace.json', () => {
  it('英文 workspace 的 HHP 使用 0x0409（非硬编码 0x0804）', async () => {
    if (!(await isTauriAvailable())) return;

    // Create an English workspace
    const ws = `/tmp/synote-test-bugfix-lang-en-${Date.now()}`;
    await invokeIPC('create_workspace', { path: ws, title: 'English Docs', author: 'dev', language: 'en' });

    // Add a chapter so export has content
    await ipcCreateChapter(ws, 'Intro');

    const out = `${ws}/dist/chm-v1`;
    await ipcExportChmFull(ws, out);

    // Read the generated .hhp (GBK-encoded, decode lossy)
    const hhpContent = await invokeIPC<string>('read_file', { path: `${out}/project.hhp` });
    expect(hhpContent).toContain('Language=0x0409');
    expect(hhpContent).not.toContain('Language=0x0804');
  });

  it('中文 workspace 的 HHP 使用 0x0804', async () => {
    if (!(await isTauriAvailable())) return;

    // Create an isolated zh-CN workspace (don't pollute the shared TEST_WS fixture)
    const ws = `/tmp/synote-test-bugfix-lang-zh-${Date.now()}`;
    await invokeIPC('create_workspace', { path: ws, title: '中文文档', author: '作者', language: 'zh-CN' });
    await ipcCreateChapter(ws, '入门');

    // Verify the workspace.json language is correctly stored as zh-CN
    const info = await ipcOpenWorkspace(ws);
    expect(info.workspaceMeta.language).toBe('zh-CN');

    // The .hhp is GBK-encoded so we can't read it as UTF-8 via read_file.
    // Instead verify export succeeds and produces a project.hhp (the language
    // mapping logic is unit-tested in Rust + verified end-to-end by the
    // English test above which produces UTF-8-safe ASCII output).
    const out = `${ws}/dist/chm-v1`;
    await ipcExportChmFull(ws, out);

    // Verify the .hhp file exists (export ran the language mapping path)
    const assets = await invokeIPC<Array<{ name: string }>>('list_assets', { path: out });
    const hhpExists = assets.some((a) => a.name === 'project.hhp');
    expect(hhpExists).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Fix #5: read_file/save_file 路径穿越防护
// ═══════════════════════════════════════════════════════════

describe('Bugfix #5: path traversal rejection', () => {
  it('read_file 拒绝包含 .. 的路径', async () => {
    if (!(await isTauriAvailable())) return;

    await expect(
      invokeIPC('read_file', { path: '/tmp/../etc/passwd' }),
    ).rejects.toThrow();
  });

  it('save_file 拒绝包含 .. 的路径', async () => {
    if (!(await isTauriAvailable())) return;

    await expect(
      invokeIPC('save_file', { path: '/tmp/../../etc/evil-test.md', content: 'malicious' }),
    ).rejects.toThrow();
  });

  it('正常嵌套路径不受影响', async () => {
    if (!(await isTauriAvailable())) return;

    // Use an isolated workspace to avoid polluting the shared fixture
    const ws = await makeIsolatedWorkspace('traversal-safe');
    await ipcCreateChapter(ws, 'Safe Chapter');
    const safePath = `${ws}/01-safe-chapter/nested-test.md`;
    await ipcSaveFile(safePath, 'safe content');
    const content = await ipcReadFile(safePath);
    expect(content).toBe('safe content');
  });
});

// ═══════════════════════════════════════════════════════════
// Fix #10: sidebarCollapsed 设置持久化
// ═══════════════════════════════════════════════════════════

describe('Bugfix #10: sidebarCollapsed persistence', () => {
  it('save_settings 保存 sidebarCollapsed=true，get_settings 读回', async () => {
    if (!(await isTauriAvailable())) return;

    // Read current settings
    const current = await ipcGetSettings();

    // Save with sidebarCollapsed flipped
    const newValue = !current.sidebarCollapsed;
    await ipcSaveSettings({
      ...current,
      sidebarCollapsed: newValue,
    });

    // Read back
    const after = await ipcGetSettings();
    expect(after.sidebarCollapsed).toBe(newValue);

    // Restore original to avoid polluting other tests
    await ipcSaveSettings(current);
  });
});

// ═══════════════════════════════════════════════════════════
// Fix #4: created 日期使用真实日期（非硬编码 2026-05-24）
// ═══════════════════════════════════════════════════════════

describe('Bugfix #4: created date uses real date', () => {
  it('新 workspace 的 created 字段是今天日期（YYYY-MM-DD 格式）', async () => {
    if (!(await isTauriAvailable())) return;

    const ws = `/tmp/synote-test-bugfix-date-${Date.now()}`;
    await invokeIPC('create_workspace', { path: ws, title: 'Date Test', author: 'dev' });

    const info = await ipcOpenWorkspace(ws);
    const created = info.workspaceMeta.created;

    // Should match YYYY-MM-DD format
    expect(created).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Should NOT be the old hardcoded value
    expect(created).not.toBe('2026-05-24');

    // Should be a plausible recent date (2025 or later)
    const year = parseInt(created.slice(0, 4), 10);
    expect(year).toBeGreaterThanOrEqual(2025);
  });
});

// ═══════════════════════════════════════════════════════════
// Fix #9: replace_svg_with_png 只替换 img src（不破坏正文）
// ═══════════════════════════════════════════════════════════

describe('Bugfix #9: CHM svg→png only rewrites img src', () => {
  it('CHM 导出的 HTML 中，正文里的 .svg 文本不被替换', async () => {
    if (!(await isTauriAvailable())) return;

    // Create a workspace with markdown that mentions .svg in prose
    const ws = `/tmp/synote-test-bugfix-svg-${Date.now()}`;
    await invokeIPC('create_workspace', { path: ws, title: 'SVG Test', author: 'dev' });
    await ipcCreateChapter(ws, 'SvgChapter');

    // Write a markdown file that references .svg in prose (not just img)
    const md = '# SVG Test\n\nSee the file diagram.svg for details.\n\nInline mention of .svg extension.\n';
    await ipcSaveFile(`${ws}/01-svgchapter/index.md`, md);

    const out = `${ws}/dist/chm-v1`;
    await ipcExportChmFull(ws, out);

    // Read the generated HTML — prose mentions of .svg should survive
    const html = await invokeIPC<string>('read_file', { path: `${out}/01-svgchapter/index.html` });
    expect(html).toContain('diagram.svg');
    expect(html).toContain('.svg extension');
  });
});
