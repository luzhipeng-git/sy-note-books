import type { SummaryNode, WorkspaceInfo } from '../types/workspace';

const delay = () => new Promise<void>((r) => setTimeout(r, 50 + Math.random() * 100));

// === Error injection for testing ===

/** Map of command → error message. If set, mockIPC throws instead of returning data. */
const mockErrors = new Map<string, string>();

/**
 * Configure a command to always throw with the given message.
 * Call with `null` to clear the error injection.
 */
export function setMockError(command: string, message: string | null) {
  if (message === null) {
    mockErrors.delete(command);
  } else {
    mockErrors.set(command, message);
  }
}

/** Clear all error injections. */
export function clearMockErrors() {
  mockErrors.clear();
}

// === Settings persistence (localStorage for dev mode) ===

const SETTINGS_KEY = 'sy-note-books-dev-settings';

function loadMockSettings(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {};
}

function saveMockSettings(settings: Record<string, unknown>): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch { /* ignore */ }
}

// === Stateful mock data ===

function makeSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'chapter';
}

function defaultSummary(): SummaryNode[] {
  return [
    {
      title: '入门指南',
      path: '01-getting-started/index.md',
      level: 1,
      isMissing: false,
      children: [
        { title: '快速开始', path: '01-getting-started/index.md', level: 2, isMissing: false },
      ],
    },
    {
      title: '系统架构',
      path: '02-architecture/index.md',
      level: 1,
      isMissing: false,
      children: [
        { title: '架构概览', path: '02-architecture/index.md', level: 2, isMissing: false },
        { title: 'API 总览', path: '02-architecture/api-overview.md', level: 2, isMissing: false },
      ],
    },
    {
      title: 'API 参考',
      path: '03-api-reference/index.md',
      level: 1,
      isMissing: false,
      children: [
        { title: '接口文档', path: '03-api-reference/index.md', level: 2, isMissing: false },
        { title: '数据模型', path: '03-api-reference/data-models.md', level: 2, isMissing: false },
      ],
    },
    {
      title: '附录',
      path: 'appendix/index.md',
      level: 1,
      isMissing: false,
      children: [
        { title: '更新日志', path: 'appendix/changelog.md', level: 2, isMissing: false },
      ],
    },
  ];
}

function defaultWorkspaceMeta() {
  return {
    title: '我的技术文档',
    author: '开发者',
    language: 'zh-CN',
    version: '1.0.0',
    created: '2026-05-18',
  };
}

interface MockWorkspaceState {
  summary: SummaryNode[];
  meta: ReturnType<typeof defaultWorkspaceMeta>;
}

const workspaces = new Map<string, MockWorkspaceState>();

function getWorkspace(path: string): MockWorkspaceState {
  let ws = workspaces.get(path);
  if (!ws) {
    ws = { summary: defaultSummary(), meta: defaultWorkspaceMeta() };
    workspaces.set(path, ws);
  }
  return ws;
}

function nextChapterNum(summary: SummaryNode[]): number {
  let max = 0;
  for (const entry of summary) {
    const match = entry.path.match(/^(\d+)-/);
    if (match) max = Math.max(max, parseInt(match[1], 10));
  }
  return max + 1;
}

// === Mock asset tracking ===

const mockAssetNames: string[] = [
  'index-img-001.svg',
  'index-img-002.png',
];

// === Command handlers ===

const mockData: Record<string, (args?: Record<string, unknown>) => unknown> = {
  open_workspace: (args) => {
    const path = (args?.path as string) ?? '/mock/workspace';
    const ws = getWorkspace(path);
    return {
      rootPath: path,
      workspaceMeta: ws.meta,
      summary: ws.summary,
      repairs: [],
    } satisfies WorkspaceInfo;
  },

  create_workspace: (args) => {
    const path = (args?.path as string) ?? '/mock/new-workspace';
    const meta = {
      title: (args?.title as string) ?? '新文档',
      author: (args?.author as string) ?? '未知',
      language: (args?.language as string) ?? 'zh-CN',
      version: '1.0.0',
      created: '2026-05-24',
    };
    workspaces.set(path, { summary: [], meta });
    return {
      rootPath: path,
      workspaceMeta: meta,
      summary: [],
      repairs: [],
    };
  },

  get_recent_workspaces: () => [
    { path: '/mock/workspace', title: '我的技术文档', lastOpened: '2026-05-24' },
    { path: '/home/user/docs/api-docs', title: 'API 文档', lastOpened: '2026-05-23' },
  ],

  get_settings: () => {
    const persisted = loadMockSettings();
    return {
      recentWorkspaces: persisted.recentWorkspaces ?? [
        { path: '/mock/workspace', title: '我的技术文档', lastOpened: '2026-05-24' },
      ],
      theme: persisted.theme ?? 'light',
      sidebarWidth: persisted.sidebarWidth ?? 260,
      sidebarCollapsed: persisted.sidebarCollapsed ?? false,
    };
  },

  save_settings: (args) => {
    const settings = (args?.settings ?? {}) as Record<string, unknown>;
    saveMockSettings(settings);
    return undefined;
  },

  read_file: (args) => {
    const path = (args?.path as string) ?? '';
    if (path.includes('getting-started'))
      return '# 入门指南\n\n## 快速开始\n\n欢迎使用书昀笔记电子书。\n\n这是一个面向技术写作者的桌面应用。';
    if (path.includes('architecture'))
      return '# 系统架构\n\n## 架构概览\n\n应用采用 Tauri 2.x + React 19 架构。';
    if (path.includes('api'))
      return '# API 参考\n\n## 接口文档\n\n所有 IPC 调用通过 `invokeIPC()` 代理。';
    return '# 文档\n\n暂无内容。';
  },

  save_file: () => undefined,

  create_chapter: (args) => {
    const workspacePath = (args?.workspacePath as string) ?? '/mock/workspace';
    const title = (args?.title as string) ?? 'New Chapter';
    const ws = getWorkspace(workspacePath);
    const num = nextChapterNum(ws.summary);
    const slug = makeSlug(title);
    const dirName = `${String(num).padStart(2, '0')}-${slug}`;
    const indexPath = `${dirName}/index.md`;

    ws.summary.push({
      title,
      path: indexPath,
      level: 1,
      isMissing: false,
      children: [
        { title, path: indexPath, level: 2, isMissing: false },
      ],
    });

    return { name: dirName, path: `${dirName}/`, indexPath };
  },

  create_page: (args) => {
    const workspacePath = (args?.workspacePath as string) ?? '/mock/workspace';
    const chapterPath = (args?.chapterPath as string) ?? '01-getting-started';
    const title = (args?.title as string) ?? 'New Page';
    const ws = getWorkspace(workspacePath);
    const slug = makeSlug(title);
    const pagePath = `${chapterPath}/${slug}.md`;

    const chapterIndex = `${chapterPath}/index.md`;
    for (const entry of ws.summary) {
      if (entry.path === chapterIndex) {
        if (!entry.children) entry.children = [];
        entry.children.push({
          title,
          path: pagePath,
          level: 2,
          isMissing: false,
        });
        break;
      }
    }

    return { name: `${slug}.md`, path: pagePath };
  },

  rename_node: (args) => {
    const workspacePath = (args?.workspacePath as string) ?? '/mock/workspace';
    const path = (args?.path as string) ?? '';
    const newTitle = (args?.newTitle as string) ?? '';
    const ws = getWorkspace(workspacePath);

    for (const entry of ws.summary) {
      if (entry.path === path || entry.path === `${path}/index.md`) {
        entry.title = newTitle;
      }
      for (const child of entry.children ?? []) {
        if (child.path === path) {
          child.title = newTitle;
        }
      }
    }
    return undefined;
  },

  delete_node: (args) => {
    const workspacePath = (args?.workspacePath as string) ?? '/mock/workspace';
    const path = (args?.path as string) ?? '';
    const ws = getWorkspace(workspacePath);

    const chapterIdx = ws.summary.findIndex((e) => {
      const dir = e.path.replace('/index.md', '');
      return path === e.path || path === dir || path.startsWith(`${dir}/`);
    });

    if (chapterIdx >= 0) {
      const entry = ws.summary[chapterIdx];
      const children = entry.children ?? [];
      const childIdx = children.findIndex((c) => c.path === path);
      if (childIdx >= 0) {
        children.splice(childIdx, 1);
      } else {
        ws.summary.splice(chapterIdx, 1);
      }
    }
    return undefined;
  },

  get_next_image_index: (args) => {
    const docName = (args?.docName as string) ?? 'index';
    const existing = mockAssetNames.filter((n) => n.startsWith(`${docName}-img-`));
    let max = 0;
    for (const name of existing) {
      const match = name.match(/img-(\d+)\./);
      if (match) max = Math.max(max, parseInt(match[1], 10));
    }
    return max + 1;
  },

  save_drawnix: (args) => {
    const path = (args?.path as string) ?? '';
    const data = (args?.data as string) ?? '';
    const svgContent = (args?.svgContent as string) ?? '';
    console.log(`[mockIPC] save_drawnix: ${path}.drawnix + ${path}.svg`);
    console.log(`[mockIPC]   data length: ${data.length}, svg length: ${svgContent.length}`);
    const docName = path.split('/').pop() ?? 'unknown';
    mockAssetNames.push(`${docName}.drawnix`);
    mockAssetNames.push(`${docName}.svg`);
    return undefined;
  },

  list_assets: () => [
    { name: 'index-img-001.svg', size: 12000, type: 'svg' },
    { name: 'index-img-002.png', size: 45000, type: 'png' },
  ],

  export_chm: (args) => {
    // Return the outputPath passed from frontend (absolute path), matching real Rust backend behavior
    return (args?.outputPath as string) ?? '/mock/workspace/dist/chm-v1';
  },

  export_nginx: (args) => {
    return (args?.outputPath as string) ?? '/mock/workspace/dist/nginx-v1';
  },

  export_pdf: () => undefined,

  copy_export_output: () => {
    console.log('[mockIPC] copy_export_output: simulated');
    return undefined;
  },

  read_all_md_files: () => [
    { path: '01-getting-started/index.md', content: '# 入门指南\n\n## 快速开始\n\n欢迎使用书昀笔记电子书。这是一个面向技术写作者的桌面应用。\n\n### 安装\n\n下载安装包并按照提示安装即可。' },
    { path: '01-getting-started/install.md', content: '# 安装说明\n\n## 系统要求\n\n- macOS 12+、Windows 10+ 或 Linux\n- 配置 API 密钥前需要先注册开发者账号\n\n## 安装步骤\n\n1. 下载安装包\n2. 运行安装程序\n3. 配置环境变量' },
    { path: '02-architecture/index.md', content: '# 系统架构\n\n## 架构概览\n\n应用采用 Tauri 2.x + React 19 架构。系统由以下核心组件构成：\n\n- API 网关 — 请求路由、认证、限流\n- 业务服务 — 核心业务逻辑处理\n- 数据层 — PostgreSQL + Redis 缓存\n- 消息队列 — RabbitMQ 异步通信' },
    { path: '02-architecture/api-overview.md', content: '# API 总览\n\n## 接口文档\n\n所有 IPC 调用通过 `invokeIPC()` 代理。所有 API 请求需要在 Header 中携带 Bearer Token。\n\n### 认证接口\n\n- POST /auth/login — 用户登录\n- POST /auth/refresh — 刷新令牌\n\n### 用户接口\n\n- GET /users — 获取用户列表的 API 端点\n- GET /users/:id — 获取用户详情' },
    { path: '03-api-reference/index.md', content: '# API 参考\n\n## 接口文档\n\n所有 IPC 调用通过代理。\n\n### 请求格式\n\n所有请求使用 JSON 格式。' },
    { path: '03-api-reference/data-models.md', content: '# 数据模型\n\n## 用户模型\n\n| 字段 | 类型 | 说明 |\n|------|------|------|\n| id | number | 用户 ID |\n| name | string | 用户名 |\n| email | string | 邮箱地址 |' },
    { path: 'appendix/index.md', content: '# 附录\n\n## 更新日志\n\n### v1.0.0\n\n- 初始发布\n- 支持基础编辑功能' },
    { path: 'appendix/changelog.md', content: '# 更新日志\n\n## v1.0.0 (2026-05-24)\n\n### 新增\n\n- Workspace 管理\n- Markdown 编辑器\n- 白板画图\n- 全文搜索' },
  ],
};

export async function mockIPC<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  await delay();

  // Check error injection first
  const errorMsg = mockErrors.get(command);
  if (errorMsg) {
    throw new Error(errorMsg);
  }

  const handler = mockData[command];
  if (!handler) {
    console.warn(`[mockIPC] Unhandled command: ${command}`);
    return undefined as T;
  }

  return handler(args) as T;
}
