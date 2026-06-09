/**
 * E2E Tests: Rust 后端 IPC 直连验证（全量 21 个 Command）
 *
 * 目的：绕过前端 UI，直接调用 Rust 后端 command 函数，
 * 验证真实文件系统操作、数据解析、错误处理。
 * 这是 E2E 测试的核心价值——单元测试中前端用 mock IPC，
 * 这里走真实 Rust 后端。
 *
 * 每个 Command 测试：happy path、error paths、edge cases。
 *
 * 前提：Docker 容器中有真实 workspace fixture 目录。
 * Docker 脚本会在运行测试前创建 /tmp/synote-test-workspace。
 */

import {
  invokeIPC,
  ipcOpenWorkspace,
  ipcReadFile,
  ipcSaveFile,
  ipcReadAllMdFiles,
  ipcCreateChapter,
  ipcCreatePage,
  ipcRenameNode,
  ipcDeleteNode,
  ipcGetSettings,
  ipcGetNextImageIndex,
  ipcExportChm,
  ipcExportNginx,
  ipcListAssets,
  ipcSaveDrawnix,
  type WorkspaceInfo,
  type SummaryNode,
} from '../helpers/ipc.js';

/**
 * Docker 测试环境的 workspace fixture 路径。
 * 由 scripts/e2e-docker.sh 在运行测试前创建。
 */
const TEST_WS = '/tmp/synote-test-workspace';

/**
 * 检查 Tauri IPC 是否可用（即运行在真实 Tauri 环境中）。
 * 如果在 pnpm dev（mock）模式下运行，这些测试应跳过。
 */
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

/** 生成唯一测试标识，避免并发冲突 */
function uid(): string {
  return String(Date.now());
}

// ═══════════════════════════════════════════════════════════
// 0. 环境验证
// ═══════════════════════════════════════════════════════════

describe('Rust IPC: 环境验证', () => {
  it('__TAURI_INTERNALS__ 存在，说明运行在真实 Tauri 环境中', async () => {
    const available = await isTauriAvailable();
    expect(available).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// 1. greet — 无参数，返回固定字符串
// ═══════════════════════════════════════════════════════════

describe('Command 1: greet', () => {
  it('返回 "Hello from sy-note-books!"', async () => {
    const result = await invokeIPC<string>('greet');
    expect(result).toBe('Hello from sy-note-books!');
  });

  it('忽略多余参数，仍返回固定字符串', async () => {
    const result = await invokeIPC<string>('greet', { extra: 'ignored' });
    expect(result).toBe('Hello from sy-note-books!');
  });
});

// ═══════════════════════════════════════════════════════════
// 2. parse_summary — 解析 SUMMARY.md 内容
// ═══════════════════════════════════════════════════════════

describe('Command 2: parse_summary', () => {
  it('合法 SUMMARY.md → 正确解析层级、标题、路径', async () => {
    const content = [
      '# Summary',
      '',
      '- [入门指南](01-getting-started/index.md)',
      '  - [快速开始](01-getting-started/quickstart.md)',
      '- [系统架构](02-architecture/index.md)',
    ].join('\n');

    const entries = await invokeIPC<SummaryNode[]>('parse_summary', { content });

    expect(entries).toHaveLength(2);

    // 第一项：入门指南
    expect(entries[0].title).toBe('入门指南');
    expect(entries[0].path).toBe('01-getting-started/index.md');
    expect(entries[0].level).toBe(1);
    expect(entries[0].isMissing).toBe(false);
    // 子节点
    expect(entries[0].children).toHaveLength(1);
    expect(entries[0].children[0].title).toBe('快速开始');
    expect(entries[0].children[0].path).toBe('01-getting-started/quickstart.md');
    expect(entries[0].children[0].level).toBe(2);

    // 第二项：系统架构
    expect(entries[1].title).toBe('系统架构');
    expect(entries[1].path).toBe('02-architecture/index.md');
    expect(entries[1].level).toBe(1);
    expect(entries[1].children).toHaveLength(0);
  });

  it('空字符串 → 空数组', async () => {
    const entries = await invokeIPC<SummaryNode[]>('parse_summary', { content: '' });
    expect(entries).toEqual([]);
  });

  it('仅含注释和标题 → 空数组', async () => {
    const content = '# Summary\n\n<!-- This is a comment -->\n';
    const entries = await invokeIPC<SummaryNode[]>('parse_summary', { content });
    expect(entries).toEqual([]);
  });

  it('格式错误的链接 → 静默跳过', async () => {
    const content = [
      '# Summary',
      '- [Valid Entry](valid/index.md)',
      '- broken link without brackets',
      '- [Missing paren](path',
      '  text line',
      '- [Another](another/index.md)',
    ].join('\n');

    const entries = await invokeIPC<SummaryNode[]>('parse_summary', { content });
    expect(entries).toHaveLength(2);
    expect(entries[0].title).toBe('Valid Entry');
    expect(entries[1].title).toBe('Another');
  });

  it('嵌套缩进 → level 2 子节点', async () => {
    const content = [
      '# Summary',
      '- [Chapter A](a/index.md)',
      '  - [Child 1](a/child1.md)',
      '  - [Child 2](a/child2.md)',
    ].join('\n');

    const entries = await invokeIPC<SummaryNode[]>('parse_summary', { content });
    expect(entries).toHaveLength(1);
    expect(entries[0].children).toHaveLength(2);
    expect(entries[0].children[0].title).toBe('Child 1');
    expect(entries[0].children[1].title).toBe('Child 2');
  });
});

// ═══════════════════════════════════════════════════════════
// 3. parse_workspace_json — 解析 workspace.json
// ═══════════════════════════════════════════════════════════

describe('Command 3: parse_workspace_json', () => {
  it('合法 JSON → 所有字段正确', async () => {
    const content = JSON.stringify({
      title: '测试文档',
      author: '测试作者',
      language: 'zh-CN',
      version: '2.0.0',
      created: '2026-06-01',
    });

    const meta = await invokeIPC<{
      title: string; author: string; language: string;
      version: string; created: string;
    }>('parse_workspace_json', { content });

    expect(meta.title).toBe('测试文档');
    expect(meta.author).toBe('测试作者');
    expect(meta.language).toBe('zh-CN');
    expect(meta.version).toBe('2.0.0');
    expect(meta.created).toBe('2026-06-01');
  });

  it('空对象 {} → 所有字段使用默认值', async () => {
    const meta = await invokeIPC<{
      title: string; author: string; language: string;
    }>('parse_workspace_json', { content: '{}' });

    expect(meta.title).toBe('Untitled');
    expect(meta.author).toBe('Unknown');
    expect(meta.language).toBe('zh-CN');
  });

  it('非 JSON 字符串 → 报错', async () => {
    try {
      await invokeIPC('parse_workspace_json', { content: 'not json at all' });
      fail('should have thrown');
    } catch (e) {
      expect((e as Error).message).toContain('Invalid JSON');
    }
  });

  it('JSON 数组而非对象 → 报错', async () => {
    try {
      await invokeIPC('parse_workspace_json', { content: '[1,2,3]' });
      fail('should have thrown');
    } catch (e) {
      expect((e as Error).message).toContain('not an object');
    }
  });

  it('部分缺失字段 → 缺失字段使用默认值', async () => {
    const content = JSON.stringify({ title: '只有标题' });

    const meta = await invokeIPC<{
      title: string; author: string; language: string;
    }>('parse_workspace_json', { content });

    expect(meta.title).toBe('只有标题');
    expect(meta.author).toBe('Unknown');
    expect(meta.language).toBe('zh-CN');
  });

  it('多余字段 → 被忽略', async () => {
    const content = JSON.stringify({
      title: 'T',
      author: 'A',
      language: 'en',
      extraField: 'should be ignored',
      nested: { foo: 1 },
    });

    const meta = await invokeIPC<{
      title: string; author: string;
    }>('parse_workspace_json', { content });

    expect(meta.title).toBe('T');
    expect(meta.author).toBe('A');
    // No error thrown, extra fields silently ignored
  });
});

// ═══════════════════════════════════════════════════════════
// 4. open_workspace — 打开已有 workspace
// ═══════════════════════════════════════════════════════════

describe('Command 4: open_workspace', () => {
  it('打开存在的 workspace → 返回完整结构', async () => {
    const ws = await ipcOpenWorkspace(TEST_WS);

    // 根路径
    expect(ws.rootPath).toBe(TEST_WS);

    // 元数据
    expect(ws.workspaceMeta).toBeDefined();
    expect(ws.workspaceMeta.title).toBe('E2E测试文档');
    expect(ws.workspaceMeta.author).toBe('E2E Tester');
    expect(ws.workspaceMeta.language).toBe('zh-CN');

    // 文件树
    expect(ws.summary).toBeDefined();
    expect(ws.summary.length).toBeGreaterThan(0);

    // 每个 summary 节点有 title、path、level
    for (const node of ws.summary) {
      // title and path should be non-whitespace strings
      expect(node.title).toMatch(/\S/);
      expect(node.path).toMatch(/\S/);
      expect(typeof node.level).toBe('number');
    }

    // 修复动作数组 — fixture workspace 所有文件完整，应为空数组
    expect(ws.repairs).toEqual([]);
  });

  it('summary 条目包含 isMissing 布尔标记', async () => {
    const ws = await ipcOpenWorkspace(TEST_WS);
    for (const node of ws.summary) {
      expect(typeof node.isMissing).toBe('boolean');
      // fixture 的文件应该都存在
      expect(node.isMissing).toBe(false);
    }
  });

  it('不存在的路径 → 报错包含 "路径不存在"', async () => {
    try {
      await ipcOpenWorkspace('/tmp/no-such-directory-12345');
      fail('should have thrown');
    } catch (e) {
      expect((e as Error).message).toContain('路径不存在');
    }
  });

  it('路径是文件而非目录 → 报错包含 "路径不是目录"', async () => {
    const testFilePath = `${TEST_WS}/workspace.json`;
    try {
      await ipcOpenWorkspace(testFilePath);
      fail('should have thrown');
    } catch (e) {
      expect((e as Error).message).toContain('路径不是目录');
    }
  });

  it('目录缺少 workspace.json → 报错', async () => {
    // 创建一个只有 SUMMARY.md 没有 workspace.json 的目录
    const tmpDir = `/tmp/ws-no-json-${uid()}`;
    await invokeIPC<void>('save_file', {
      path: `${tmpDir}/SUMMARY.md`,
      content: '# Test\n',
    });

    try {
      await ipcOpenWorkspace(tmpDir);
      fail('should have thrown');
    } catch (e) {
      expect((e as Error).message).toContain('workspace.json');
    }
  });

  it('目录缺少 SUMMARY.md → 报错', async () => {
    const tmpDir = `/tmp/ws-no-summary-${uid()}`;
    await invokeIPC<void>('save_file', {
      path: `${tmpDir}/workspace.json`,
      content: '{"title":"T","author":"A"}',
    });

    try {
      await ipcOpenWorkspace(tmpDir);
      fail('should have thrown');
    } catch (e) {
      expect((e as Error).message).toContain('SUMMARY.md');
    }
  });
});

// ═══════════════════════════════════════════════════════════
// 5. create_workspace — 创建新 workspace
// ═══════════════════════════════════════════════════════════

describe('Command 5: create_workspace', () => {
  it('创建新 workspace → 目录结构完整', async () => {
    const newPath = `/tmp/new-ws-${uid()}`;

    const ws = await invokeIPC<WorkspaceInfo>('create_workspace', {
      path: newPath,
      title: '新测试文档',
      author: 'E2E',
    });

    // rootPath 匹配输入
    expect(ws.rootPath).toBe(newPath);

    // 元数据正确
    expect(ws.workspaceMeta.title).toBe('新测试文档');
    expect(ws.workspaceMeta.author).toBe('E2E');
    // 默认 language；created 使用 chrono_now() 固定值
    expect(ws.workspaceMeta.language).toBe('zh-CN');
    expect(ws.workspaceMeta.version).toBe('1.0.0');

    // 空的 summary 和 repairs
    expect(ws.summary).toEqual([]);
    expect(ws.repairs).toEqual([]);

    // 验证磁盘文件
    const jsonContent = await ipcReadFile(`${newPath}/workspace.json`);
    const parsed = JSON.parse(jsonContent);
    expect(parsed.title).toBe('新测试文档');

    const summaryContent = await ipcReadFile(`${newPath}/SUMMARY.md`);
    expect(summaryContent).toContain('新测试文档');

    // assets 目录存在（list_assets returns empty array for new workspace）
    const assets = await ipcListAssets(`${newPath}/assets`);
    expect(assets).toEqual([]);
  });

  it('带 language 参数 → language 字段正确', async () => {
    const newPath = `/tmp/new-ws-lang-${uid()}`;

    const ws = await invokeIPC<WorkspaceInfo>('create_workspace', {
      path: newPath,
      title: 'English Doc',
      author: 'Tester',
      language: 'en',
    });

    expect(ws.workspaceMeta.language).toBe('en');
  });

  it('不带 language → 默认 "zh-CN"', async () => {
    const newPath = `/tmp/new-ws-deflang-${uid()}`;

    const ws = await invokeIPC<WorkspaceInfo>('create_workspace', {
      path: newPath,
      title: 'Default Lang',
      author: 'Tester',
    });

    expect(ws.workspaceMeta.language).toBe('zh-CN');
  });

  it('覆盖已存在的 workspace → 成功', async () => {
    const newPath = `/tmp/new-ws-overwrite-${uid()}`;

    // 先创建一个
    await invokeIPC<WorkspaceInfo>('create_workspace', {
      path: newPath,
      title: 'First',
      author: 'A',
    });

    // 再覆盖
    const ws = await invokeIPC<WorkspaceInfo>('create_workspace', {
      path: newPath,
      title: 'Overwritten',
      author: 'B',
    });

    expect(ws.workspaceMeta.title).toBe('Overwritten');
    expect(ws.workspaceMeta.author).toBe('B');
  });
});

// ═══════════════════════════════════════════════════════════
// 6. read_file — 读取文件
// ═══════════════════════════════════════════════════════════

describe('Command 6: read_file', () => {
  it('读取已有 .md 文件 → 返回正确内容', async () => {
    const content = await ipcReadFile(`${TEST_WS}/01-getting-started/index.md`);
    expect(typeof content).toBe('string');
    expect(content.length).toBeGreaterThan(0);
    expect(content).toContain('# 入门指南');
  });

  it('读取 SUMMARY.md → 包含 Markdown 链接', async () => {
    const content = await ipcReadFile(`${TEST_WS}/SUMMARY.md`);
    expect(content).toContain('- [');
    expect(content).toContain('](01-getting-started/index.md)');
  });

  it('不存在的文件 → 报错包含 "文件不存在"', async () => {
    try {
      await ipcReadFile('/tmp/no-such-file-12345.md');
      fail('should have thrown');
    } catch (e) {
      expect((e as Error).message).toContain('文件不存在');
    }
  });
});

// ═══════════════════════════════════════════════════════════
// 7. save_file — 保存文件
// ═══════════════════════════════════════════════════════════

describe('Command 7: save_file', () => {
  it('保存新文件 → 读取内容一致', async () => {
    const testPath = `/tmp/test-save-${uid()}.md`;
    const testContent = '# E2E Save Test\n\nThis content was saved by E2E test.';

    await ipcSaveFile(testPath, testContent);
    const readBack = await ipcReadFile(testPath);
    expect(readBack).toBe(testContent);
  });

  it('覆盖已有文件 → 新内容替换旧内容', async () => {
    const testPath = `/tmp/test-overwrite-${uid()}.md`;

    await ipcSaveFile(testPath, 'old content');
    await ipcSaveFile(testPath, 'new content');

    const readBack = await ipcReadFile(testPath);
    expect(readBack).toBe('new content');
  });

  it('保存到不存在的子目录 → 自动创建父目录', async () => {
    const testPath = `/tmp/test-subdir-${uid()}/nested/deep/file.md`;

    await ipcSaveFile(testPath, 'deeply nested');
    const readBack = await ipcReadFile(testPath);
    expect(readBack).toBe('deeply nested');
  });

  it('保存空内容 → 文件存在但内容为空', async () => {
    const testPath = `/tmp/test-empty-${uid()}.md`;

    await ipcSaveFile(testPath, '');
    const readBack = await ipcReadFile(testPath);
    expect(readBack).toBe('');
  });

  it('在 workspace 内保存文件 → 可通过 read_all_md_files 检索', async () => {
    const testPath = `${TEST_WS}/01-getting-started/test-search-${uid()}.md`;
    const testContent = '# Searchable Content';

    await ipcSaveFile(testPath, testContent);

    const allFiles = await ipcReadAllMdFiles(TEST_WS);
    const found = allFiles.find(f => f.path.includes('test-search-'));
    expect(found).toBeDefined();
    expect(found!.content).toBe(testContent);
  });
});

// ═══════════════════════════════════════════════════════════
// 8. read_all_md_files — 读取全部 .md 文件
// ═══════════════════════════════════════════════════════════

describe('Command 8: read_all_md_files', () => {
  it('返回 workspace 下所有 .md 文件及其内容', async () => {
    const files = await ipcReadAllMdFiles(TEST_WS);

    expect(Array.isArray(files)).toBe(true);
    // fixture: 4 章 × 3 文件 + appendix × 2 + SUMMARY.md = 12（不含 assets/）
    // 前序测试可能创建了额外章节，使用 toBeGreaterThanOrEqual
    expect(files.length).toBeGreaterThanOrEqual(12);

    // 每个文件有 path 和 content
    for (const file of files) {
      expect(file.path).toMatch(/\.md$/);
      expect(file.content).toMatch(/\S/);
    }
  });

  it('路径是相对路径（不含 workspace 根路径）', async () => {
    const files = await ipcReadAllMdFiles(TEST_WS);

    for (const file of files) {
      // 不应该以 / 开头（相对路径）
      expect(file.path.startsWith('/')).toBe(false);
      // 路径格式合法：子目录文件含 /，根级文件（如 SUMMARY.md）不含 /
      // 只要不以 / 开头即可确认是相对路径
    }
  });

  it('跳过 assets/ 目录中的文件', async () => {
    const files = await ipcReadAllMdFiles(TEST_WS);

    for (const file of files) {
      // 路径不应包含 assets
      expect(file.path).not.toContain('/assets/');
    }
  });

  it('不存在的路径 → 报错', async () => {
    try {
      await ipcReadAllMdFiles('/tmp/no-such-workspace-12345');
      fail('should have thrown');
    } catch (e) {
      expect((e as Error).message).toContain('路径不存在');
    }
  });

  it('路径是文件而非目录 → 报错', async () => {
    try {
      await ipcReadAllMdFiles(`${TEST_WS}/SUMMARY.md`);
      fail('should have thrown');
    } catch (e) {
      expect((e as Error).message).toContain('路径不是目录');
    }
  });
});

// ═══════════════════════════════════════════════════════════
// 9. create_chapter — 创建章节
// ═══════════════════════════════════════════════════════════

describe('Command 9: create_chapter', () => {
  it('创建章节 → 返回 name、path、indexPath', async () => {
    const result = await ipcCreateChapter(TEST_WS, `测试章节_${uid()}`);

    expect(result.name).toMatch(/^\d+-/);
    expect(result.path).toMatch(/^\d+-/);
    expect(result.indexPath).toMatch(/^\d+-.*\.md$/);
  });

  it('SUMMARY.md 新增对应条目', async () => {
    const uniqueTitle = `SUM验证_${uid()}`;
    const wsBefore = await ipcOpenWorkspace(TEST_WS);
    const countBefore = wsBefore.summary.length;

    await ipcCreateChapter(TEST_WS, uniqueTitle);

    const wsAfter = await ipcOpenWorkspace(TEST_WS);
    expect(wsAfter.summary.length).toBe(countBefore + 1);

    const titles = wsAfter.summary.map(n => n.title);
    expect(titles).toContain(uniqueTitle);
  });

  it('创建章节目录含 index.md 和 assets/', async () => {
    const result = await ipcCreateChapter(TEST_WS, `结构验证_${uid()}`);

    // index.md 可以读取
    const indexPath = `${TEST_WS}/${result.indexPath}`;
    const content = await ipcReadFile(indexPath);
    expect(content).toContain('# 结构验证_');

    // assets 目录存在（list_assets returns empty array for new chapter）
    const assetsPath = `${TEST_WS}/${result.name}/assets`;
    const assets = await ipcListAssets(assetsPath);
    expect(assets).toEqual([]);
  });

  it('中文标题 → slug 变为 "chapter"（带编号前缀）', async () => {
    const result = await ipcCreateChapter(TEST_WS, '纯中文标题测试');
    // slugify 对纯中文返回 "chapter"（无 ASCII 字符时回退）
    expect(result.name).toMatch(/^\d+-chapter$/);
  });

  it('英文标题 → slug 化（小写 + 连字符）', async () => {
    const result = await ipcCreateChapter(TEST_WS, `API Reference ${uid()}`);
    expect(result.name).toMatch(/^\d+-api-reference-\d+$/);
  });
});

// ═══════════════════════════════════════════════════════════
// 10. create_page — 创建页面
// ═══════════════════════════════════════════════════════════

describe('Command 10: create_page', () => {
  it('在章节下创建子页面 → 返回 name、path', async () => {
    // 先创建一个独立章节
    const chapter = await ipcCreateChapter(TEST_WS, `页面测试章节_${uid()}`);
    const chapterDir = chapter.name;

    const result = await ipcCreatePage(TEST_WS, chapterDir, `测试页面_${uid()}`);

    expect(result.name).toMatch(/\.md$/);
    expect(result.path).toMatch(/\.md$/);
  });

  it('SUMMARY.md 新增子条目', async () => {
    const chapter = await ipcCreateChapter(TEST_WS, `SUMMARY页面_${uid()}`);
    const chapterDir = chapter.name;

    const pageTitle = `子页面_${uid()}`;
    await ipcCreatePage(TEST_WS, chapterDir, pageTitle);

    const ws = await ipcOpenWorkspace(TEST_WS);
    const chap = ws.summary.find(n => n.path.startsWith(chapter.name));
    expect(chap).toBeDefined();
    const childTitles = chap!.children.map(c => c.title);
    // create_chapter 添加自引用 child（同一 title + index.md），create_page 再追加实际页面
    expect(childTitles).toContain(pageTitle);
  });

  it('页面文件包含正确标题', async () => {
    const chapter = await ipcCreateChapter(TEST_WS, `标题验证_${uid()}`);
    const pageTitle = `标题验证页面_${uid()}`;
    const page = await ipcCreatePage(TEST_WS, chapter.name, pageTitle);

    const content = await ipcReadFile(`${TEST_WS}/${page.path}`);
    expect(content).toContain(`# ${pageTitle}`);
  });

  it('不存在的章节目录 → 报错', async () => {
    try {
      await ipcCreatePage(TEST_WS, '99-nonexistent-chapter', `错误页面_${uid()}`);
      fail('should have thrown');
    } catch (e) {
      expect((e as Error).message).toContain('章节目录不存在');
    }
  });
});

// ═══════════════════════════════════════════════════════════
// 11. rename_node — 重命名节点
// ═══════════════════════════════════════════════════════════

describe('Command 11: rename_node', () => {
  it('重命名章节 → index.md 标题更新 + SUMMARY.md 标题更新', async () => {
    const uniqueOld = `待重命名_${uid()}`;
    const uniqueNew = `已重命名_${uid()}`;

    await ipcCreateChapter(TEST_WS, uniqueOld);
    const ws = await ipcOpenWorkspace(TEST_WS);
    const target = ws.summary.find(n => n.title === uniqueOld);
    expect(target).toBeDefined();

    await ipcRenameNode(TEST_WS, target!.path, uniqueNew);

    // SUMMARY 标题更新
    const wsAfter = await ipcOpenWorkspace(TEST_WS);
    const titles = wsAfter.summary.map(n => n.title);
    expect(titles).toContain(uniqueNew);
    expect(titles).not.toContain(uniqueOld);

    // index.md 标题更新
    const content = await ipcReadFile(`${TEST_WS}/${target!.path}`);
    expect(content).toContain(`# ${uniqueNew}`);
    expect(content).not.toContain(`# ${uniqueOld}`);
  });

  it('重命名页面 → 文件内容标题更新 + SUMMARY.md 标题更新', async () => {
    const chapter = await ipcCreateChapter(TEST_WS, `重命名页面章节_${uid()}`);
    const oldTitle = `旧页面_${uid()}`;
    const newTitle = `新页面_${uid()}`;

    const page = await ipcCreatePage(TEST_WS, chapter.name, oldTitle);

    await ipcRenameNode(TEST_WS, page.path, newTitle);

    // 文件标题更新
    const content = await ipcReadFile(`${TEST_WS}/${page.path}`);
    expect(content).toContain(`# ${newTitle}`);
    expect(content).not.toContain(`# ${oldTitle}`);

    // SUMMARY 更新
    const ws = await ipcOpenWorkspace(TEST_WS);
    const chap = ws.summary.find(n => n.path.startsWith(chapter.name));
    expect(chap).toBeDefined();
    const childTitles = chap!.children.map(c => c.title);
    expect(childTitles).toContain(newTitle);
    expect(childTitles).not.toContain(oldTitle);
  });

  it('不存在的路径 → 报错', async () => {
    try {
      await ipcRenameNode(TEST_WS, '99-nonexistent/index.md', `不存在_${uid()}`);
      fail('should have thrown');
    } catch (e) {
      expect((e as Error).message).toContain('路径不存在');
    }
  });
});

// ═══════════════════════════════════════════════════════════
// 12. delete_node — 删除节点
// ═══════════════════════════════════════════════════════════

describe('Command 12: delete_node', () => {
  it('删除章节 → 目录递归删除 + SUMMARY.md 移除条目', async () => {
    const uniqueName = `待删除章节_${uid()}`;
    await ipcCreateChapter(TEST_WS, uniqueName);

    const wsBefore = await ipcOpenWorkspace(TEST_WS);
    const target = wsBefore.summary.find(n => n.title === uniqueName);
    expect(target).toBeDefined();

    // 记住目录路径
    const chapterDir = target!.path.replace(/\/index\.md$/, '').replace(/\/$/, '');

    await ipcDeleteNode(TEST_WS, target!.path);

    // SUMMARY 不再包含
    const wsAfter = await ipcOpenWorkspace(TEST_WS);
    const titles = wsAfter.summary.map(n => n.title);
    expect(titles).not.toContain(uniqueName);

    // 目录已删除（读文件应报错）
    try {
      await ipcReadFile(`${TEST_WS}/${target!.path}`);
      fail('file should be deleted');
    } catch (e) {
      expect((e as Error).message).toContain('文件不存在');
    }
  });

  it('删除页面 → 文件删除 + SUMMARY 子条目移除', async () => {
    const chapter = await ipcCreateChapter(TEST_WS, `删除页面章节_${uid()}`);
    const pageTitle = `待删除页面_${uid()}`;
    const page = await ipcCreatePage(TEST_WS, chapter.name, pageTitle);

    await ipcDeleteNode(TEST_WS, page.path);

    // SUMMARY 子条目移除
    const ws = await ipcOpenWorkspace(TEST_WS);
    const chap = ws.summary.find(n => n.path.startsWith(chapter.name));
    expect(chap).toBeDefined();
    const childTitles = chap!.children.map(c => c.title);
    expect(childTitles).not.toContain(pageTitle);

    // 文件已删除
    try {
      await ipcReadFile(`${TEST_WS}/${page.path}`);
      fail('file should be deleted');
    } catch (e) {
      expect((e as Error).message).toContain('文件不存在');
    }
  });

  it('不存在的路径 → 报错', async () => {
    try {
      await ipcDeleteNode(TEST_WS, '99-nonexistent/index.md');
      fail('should have thrown');
    } catch (e) {
      expect((e as Error).message).toContain('路径不存在');
    }
  });
});

// ═══════════════════════════════════════════════════════════
// 13. get_settings — 获取设置
// ═══════════════════════════════════════════════════════════

describe('Command 13: get_settings', () => {
  it('返回有效 Settings 结构', async () => {
    const settings = await ipcGetSettings();

    expect(settings).toBeDefined();
    expect(typeof settings.theme).toBe('string');
    expect(typeof settings.sidebarWidth).toBe('number');
  });

  it('默认 theme 为 "light"', async () => {
    // Reset to defaults first to ensure clean state
    // (previous tests may have persisted non-default values)
    const defaults = { theme: 'light', sidebarWidth: 260, recentWorkspaces: [] };
    await invokeIPC<void>('save_settings', { settings: defaults });

    const settings = await ipcGetSettings();
    expect(settings.theme).toBe('light');
  });

  it('默认 sidebarWidth 为 260', async () => {
    const settings = await ipcGetSettings();
    expect(settings.sidebarWidth).toBe(260);
  });

  it('recentWorkspaces 为数组', async () => {
    const settings = await ipcGetSettings();
    expect(Array.isArray(settings.recentWorkspaces)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// 14. save_settings — 保存设置
// ═══════════════════════════════════════════════════════════

describe('Command 14: save_settings', () => {
  it('保存设置后可通过 get_settings 读回', async () => {
    // 先读取当前设置
    const original = await ipcGetSettings();

    // 修改并保存
    const modified = {
      ...original,
      theme: 'dark',
      sidebarWidth: 300,
    } as const;

    await invokeIPC<void>('save_settings', { settings: modified });

    // 读回验证
    const loaded = await ipcGetSettings();
    expect(loaded.theme).toBe('dark');
    expect(loaded.sidebarWidth).toBe(300);

    // 恢复原始设置
    await invokeIPC<void>('save_settings', { settings: original });
  });

  it('保存部分自定义值 → 正确保存', async () => {
    const original = await ipcGetSettings();

    const customSettings = {
      recentWorkspaces: [
        { path: '/tmp/test-ws', title: '测试', lastOpened: '2026-06-01' },
      ],
      theme: 'dark',
      sidebarWidth: 200,
    };

    await invokeIPC<void>('save_settings', { settings: customSettings });

    const loaded = await ipcGetSettings();
    expect(loaded.recentWorkspaces).toHaveLength(1);
    expect(loaded.recentWorkspaces[0].path).toBe('/tmp/test-ws');
    expect(loaded.theme).toBe('dark');
    expect(loaded.sidebarWidth).toBe(200);

    // 恢复
    await invokeIPC<void>('save_settings', { settings: original });
  });
});

// ═══════════════════════════════════════════════════════════
// 15. get_recent_workspaces — 获取最近打开的 workspace
// ═══════════════════════════════════════════════════════════

describe('Command 15: get_recent_workspaces', () => {
  it('返回数组', async () => {
    const recent = await invokeIPC<Array<{
      path: string; title: string; lastOpened: string;
    }>>('get_recent_workspaces');

    expect(Array.isArray(recent)).toBe(true);
  });

  it('每个条目包含 path、title、lastOpened 字段', async () => {
    // 先写入一个 recent workspace 确保有数据
    const original = await ipcGetSettings();
    const modified = {
      ...original,
      recentWorkspaces: [
        { path: '/tmp/test-recent', title: '测试Recent', lastOpened: '2026-06-02' },
      ],
    };
    await invokeIPC<void>('save_settings', { settings: modified });

    const recent = await invokeIPC<Array<{
      path: string; title: string; lastOpened: string;
    }>>('get_recent_workspaces');

    expect(recent.length).toBeGreaterThanOrEqual(1);
    const entry = recent[0];
    expect(typeof entry.path).toBe('string');
    expect(typeof entry.title).toBe('string');
    expect(typeof entry.lastOpened).toBe('string');

    // 恢复
    await invokeIPC<void>('save_settings', { settings: original });
  });
});

// ═══════════════════════════════════════════════════════════
// 16. get_next_image_index — 获取下一个图片编号
// ═══════════════════════════════════════════════════════════

describe('Command 16: get_next_image_index', () => {
  it('有已有图片 (index-img-001.svg) → 返回 2', async () => {
    // fixture 中 assets/index-img-001.svg 存在
    const index = await ipcGetNextImageIndex(`${TEST_WS}/assets`, 'index');
    expect(index).toBe(2);
  });

  it('不存在的目录 → 返回 1（不报错）', async () => {
    const index = await ipcGetNextImageIndex('/tmp/no-assets-dir-12345', 'index');
    expect(index).toBe(1);
  });

  it('不同 docName → 返回 1（独立计数）', async () => {
    // fixture 只有 index-img-001.svg，没有 other-img-*
    const index = await ipcGetNextImageIndex(`${TEST_WS}/assets`, 'other-doc');
    expect(index).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════
// 17. list_assets — 列出资源文件
// ═══════════════════════════════════════════════════════════

describe('Command 17: list_assets', () => {
  it('已有 assets 目录 → 返回资源列表', async () => {
    const assets = await ipcListAssets(`${TEST_WS}/assets`);

    expect(Array.isArray(assets)).toBe(true);
    expect(assets.length).toBeGreaterThan(0);

    // 每个条目有 name, size, fileType, path（绝对路径）
    for (const asset of assets) {
      expect(typeof asset.name).toBe('string');
      expect(typeof asset.size).toBe('number');
      expect(typeof asset.fileType).toBe('string');
      expect(typeof asset.path).toBe('string');
      expect(asset.path).toMatch(/^\//); // Rust 返回绝对路径
    }
  });

  it('SVG 文件 → fileType 为 "image"', async () => {
    const assets = await ipcListAssets(`${TEST_WS}/assets`);
    const svg = assets.find(a => a.name.endsWith('.svg'));
    expect(svg).toBeDefined();
    expect(svg!.fileType).toBe('image');
  });

  it('不存在的目录 → 返回空数组（不报错）', async () => {
    const assets = await ipcListAssets('/tmp/no-assets-12345');
    expect(assets).toEqual([]);
  });

  it('PNG/JPG/GIF/WEBP → fileType 也为 "image"', async () => {
    // 创建临时目录放一张 png
    const tmpDir = `/tmp/test-assets-types-${uid()}`;
    await invokeIPC<void>('save_file', {
      path: `${tmpDir}/test.png`,
      content: 'fake png data',
    });

    const assets = await ipcListAssets(tmpDir);
    expect(assets).toHaveLength(1);
    expect(assets[0].fileType).toBe('image');
  });

  it('非图片文件 → fileType 为 "other"', async () => {
    const tmpDir = `/tmp/test-assets-other-${uid()}`;
    await invokeIPC<void>('save_file', {
      path: `${tmpDir}/data.json`,
      content: '{}',
    });

    const assets = await ipcListAssets(tmpDir);
    expect(assets).toHaveLength(1);
    expect(assets[0].fileType).toBe('other');
  });
});

// ═══════════════════════════════════════════════════════════
// 18. save_drawnix — 保存白板文件
// ═══════════════════════════════════════════════════════════

describe('Command 18: save_drawnix', () => {
  it('保存 .drawnix + .svg 文件对 → 两个文件都存在', async () => {
    const drawnixPath = `/tmp/test-drawnix-${uid()}.drawnix`;
    const svgPath = drawnixPath.replace('.drawnix', '.svg');
    const data = '{"type":"drawnix","elements":[]}';
    const svgContent = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';

    await ipcSaveDrawnix(drawnixPath, data, svgContent);

    // 读回 data 文件
    const readData = await ipcReadFile(drawnixPath);
    expect(readData).toBe(data);

    // 读回 SVG 文件
    const readSvg = await ipcReadFile(svgPath);
    expect(readSvg).toBe(svgContent);
  });

  it('保存到不存在的子目录 → 自动创建', async () => {
    const drawnixPath = `/tmp/test-drawnix-subdir-${uid()}/board/test.drawnix`;
    const data = '{"test":true}';
    const svgContent = '<svg></svg>';

    await ipcSaveDrawnix(drawnixPath, data, svgContent);

    const readData = await ipcReadFile(drawnixPath);
    expect(readData).toBe(data);
  });
});

// ═══════════════════════════════════════════════════════════
// 19. export_chm — 导出 CHM
// ═══════════════════════════════════════════════════════════

describe('Command 19: export_chm', () => {
  it('合法 workspace → 返回 outputPath 参数原值（stub）', async () => {
    const outputPath = await ipcExportChm(TEST_WS, '/tmp/dist/chm-e2e');
    // stub 直接返回传入的 outputPath
    expect(outputPath).toBe('/tmp/dist/chm-e2e');
    expect(outputPath).toMatch(/^\//);
  });

  it('带 chapter 参数 → 仍返回 outputPath（stub）', async () => {
    const outputPath = await invokeIPC<string>('export_chm', {
      workspacePath: TEST_WS,
      outputPath: '/tmp/dist/chm-chapter-e2e',
      chapter: '01-getting-started',
    });
    expect(outputPath).toBe('/tmp/dist/chm-chapter-e2e');
  });

  it('不存在的 workspace → 报错含 "路径不存在"', async () => {
    try {
      await ipcExportChm('/tmp/no-such-ws-12345', '/tmp/dist/chm-err');
      fail('should have thrown');
    } catch (e) {
      // Rust: "Workspace 路径不存在：{path}"（全角冒号）
      expect((e as Error).message).toContain('路径不存在');
    }
  });
});

// ═══════════════════════════════════════════════════════════
// 20. export_nginx — 导出 Nginx 站点
// ═══════════════════════════════════════════════════════════

describe('Command 20: export_nginx', () => {
  it('合法 workspace → 返回 outputPath 参数原值（stub）', async () => {
    const outputPath = await ipcExportNginx(TEST_WS, '/tmp/dist/nginx-e2e');
    // stub 直接返回传入的 outputPath
    expect(outputPath).toBe('/tmp/dist/nginx-e2e');
  });

  it('带 chapter 参数 → 仍返回 outputPath（stub）', async () => {
    const outputPath = await invokeIPC<string>('export_nginx', {
      workspacePath: TEST_WS,
      outputPath: '/tmp/dist/nginx-chapter-e2e',
      chapter: '02-architecture',
    });
    expect(outputPath).toBe('/tmp/dist/nginx-chapter-e2e');
  });

  it('不存在的 workspace → 报错含 "路径不存在"', async () => {
    try {
      await ipcExportNginx('/tmp/no-such-ws-12345', '/tmp/dist/nginx-err');
      fail('should have thrown');
    } catch (e) {
      // Rust: "Workspace 路径不存在：{path}"（全角冒号）
      expect((e as Error).message).toContain('路径不存在');
    }
  });
});

// ═══════════════════════════════════════════════════════════
// 21. export_pdf — 导出 PDF
// ═══════════════════════════════════════════════════════════

describe('Command 21: export_pdf', () => {
  it('存在的文件 → Ok（stub，仅验证文件存在）', async () => {
    const result = await invokeIPC<void>('export_pdf', {
      filePath: `${TEST_WS}/01-getting-started/index.md`,
    });
    // void 返回，WebDriver JSON 序列化将 undefined 转为 null
    expect(result).toBeNull();
  });

  it('不存在的文件 → 报错含 "文件不存在"', async () => {
    try {
      await invokeIPC<void>('export_pdf', {
        filePath: '/tmp/no-such-file-for-pdf-12345.md',
      });
      fail('should have thrown');
    } catch (e) {
      // Rust: "文件不存在：{path}"（全角冒号）
      expect((e as Error).message).toContain('文件不存在');
    }
  });
});

// ═══════════════════════════════════════════════════════════
// 跨 Command 联动验证
// ═══════════════════════════════════════════════════════════

describe('跨 Command 联动: CRUD 完整流程', () => {
  it('create_chapter → create_page → rename → delete 完整闭环', async () => {
    const chapterTitle = `CRUD章节_${uid()}`;

    // Create chapter
    const chapter = await ipcCreateChapter(TEST_WS, chapterTitle);
    expect(chapter.name).toMatch(/^\d+-/);

    // Read (verify chapter exists in workspace)
    let ws = await ipcOpenWorkspace(TEST_WS);
    let found = ws.summary.find(n => n.title === chapterTitle);
    expect(found).toBeDefined();

    // Create page within chapter
    const pageTitle = `CRUD页面_${uid()}`;
    const page = await ipcCreatePage(TEST_WS, chapter.name, pageTitle);
    expect(page.path).toContain('.md');

    // Verify page in SUMMARY
    ws = await ipcOpenWorkspace(TEST_WS);
    found = ws.summary.find(n => n.title === chapterTitle);
    expect(found).toBeDefined();
    expect(found!.children.map(c => c.title)).toContain(pageTitle);

    // Rename page
    const newPageTitle = `CRUD已重命名_${uid()}`;
    await ipcRenameNode(TEST_WS, page.path, newPageTitle);

    ws = await ipcOpenWorkspace(TEST_WS);
    found = ws.summary.find(n => n.title === chapterTitle);
    expect(found).toBeDefined();
    expect(found!.children.map(c => c.title)).toContain(newPageTitle);
    expect(found!.children.map(c => c.title)).not.toContain(pageTitle);

    // Delete page
    await ipcDeleteNode(TEST_WS, page.path);

    ws = await ipcOpenWorkspace(TEST_WS);
    found = ws.summary.find(n => n.title === chapterTitle);
    expect(found).toBeDefined();
    expect(found!.children.map(c => c.title)).not.toContain(newPageTitle);

    // Delete chapter（通过 SUMMARY 中的 path 删除，如 "05-chapter/index.md"）
    const chapterEntry = ws.summary.find(n => n.title === chapterTitle);
    expect(chapterEntry).toBeDefined();
    // delete_node 接受文件路径或目录名；使用 chapter.name（目录名）更直接
    await ipcDeleteNode(TEST_WS, chapterEntry!.path);

    ws = await ipcOpenWorkspace(TEST_WS);
    expect(ws.summary.map(n => n.title)).not.toContain(chapterTitle);
  });

  it('create_workspace → open → read_all_md_files → read_file 完整闭环', async () => {
    const wsPath = `/tmp/cross-ws-${uid()}`;

    // Create workspace
    const created = await invokeIPC<WorkspaceInfo>('create_workspace', {
      path: wsPath,
      title: '联动测试',
      author: 'E2E',
      language: 'zh-CN',
    });
    expect(created.rootPath).toBe(wsPath);

    // Add a chapter with content
    const chapter = await ipcCreateChapter(wsPath, '联动章节');
    const page = await ipcCreatePage(wsPath, chapter.name, '联动页面');

    // Open workspace
    const ws = await ipcOpenWorkspace(wsPath);
    expect(ws.workspaceMeta.title).toBe('联动测试');
    expect(ws.summary.length).toBeGreaterThan(0);

    // Read all md files
    const allFiles = await ipcReadAllMdFiles(wsPath);
    expect(allFiles.length).toBeGreaterThan(0);

    // Read specific file
    const content = await ipcReadFile(`${wsPath}/${page.path}`);
    expect(content).toContain('# 联动页面');
  });

  it('IPC 操作后 __TAURI_INTERNALS__ 仍然可用', async () => {
    // 执行一些 IPC 操作
    await ipcOpenWorkspace(TEST_WS);

    // 验证 Tauri 环境仍然健康
    const available = await browser.execute(() => {
      return '__TAURI_INTERNALS__' in window;
    });
    expect(available).toBe(true);

    // greet 仍然可用
    const greeting = await invokeIPC<string>('greet');
    expect(greeting).toBe('Hello from sy-note-books!');
  });
});
