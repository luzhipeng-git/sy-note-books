/**
 * E2E 测试：直接调用 Rust 后端 IPC 的工具。
 *
 * 在 E2E 测试中，前端 UI 走的是真实 Tauri IPC（非 mock）。
 * 但有些后端逻辑（如文件读取、workspace 验证、导出输出）
 * 需要直接验证 Rust 返回值，而不只是看 UI 变化。
 *
 * 原理：通过 browser.executeAsync() 在浏览器上下文中调用
 * window.__TAURI_INTERNALS__.invoke()，使用 done 回调正确处理 Promise。
 *
 * 注意：必须使用 executeAsync 而非 execute，因为 WebKitGTK WebDriver
 * 无法序列化 Promise 对象。executeAsync 通过回调机制绕过此限制。
 */

/**
 * 直接调用 Tauri IPC 命令，返回 Rust 后端的原始响应。
 *
 * 使用 browser.executeAsync() + done 回调模式，
 * 正确处理 __TAURI_INTERNALS__.invoke() 返回的 Promise。
 */
export async function invokeIPC<T = unknown>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const result = await browser.executeAsync(
    (
      cmd: string,
      cmdArgs: Record<string, unknown> | undefined,
      done: (result: { ok: boolean; value: unknown }) => void,
    ) => {
      (window as any).__TAURI_INTERNALS__
        .invoke(cmd, cmdArgs)
        .then((value: unknown) => done({ ok: true, value }))
        .catch((error: unknown) => done({ ok: false, value: error }));
    },
    command,
    args ?? {},
  ) as { ok: boolean; value: unknown };

  if (!result.ok) {
    const errMsg = result.value instanceof Error
      ? result.value.message
      : String(result.value);
    throw new Error(`IPC error [${command}]: ${errMsg}`);
  }
  return result.value as T;
}

// ─── 类型安全的 IPC 调用 ──────────────────────────────────

/** workspace.json 中的元数据 */
export interface WorkspaceMeta {
  title: string;
  author: string;
  language: string;
  version: string;
  created: string;
}

/** open_workspace 返回值 */
export interface WorkspaceInfo {
  rootPath: string;
  workspaceMeta: WorkspaceMeta;
  summary: SummaryNode[];
  repairs: RepairAction[];
}

/** 文件树节点 */
export interface SummaryNode {
  title: string;
  path: string;
  level: number;
  isMissing: boolean;
  children?: SummaryNode[];
}

/** 修复动作 — 对应 Rust RepairAction { kind, detail } */
export interface RepairAction {
  kind: string;
  detail: string;
}

/** 最近打开的 workspace 条目 */
export interface RecentWorkspace {
  path: string;
  title: string;
  lastOpened: string;
}

/** 用户设置 */
export interface UserSettings {
  recentWorkspaces: RecentWorkspace[];
  theme: 'light' | 'dark';
  sidebarWidth: number;
  sidebarCollapsed: boolean;
}

// ─── 便捷 IPC 调用函数 ───────────────────────────────────

/** 调用 open_workspace，验证 Rust 能正确解析 workspace */
export async function ipcOpenWorkspace(
  dirPath: string,
): Promise<WorkspaceInfo> {
  return await invokeIPC<WorkspaceInfo>('open_workspace', { path: dirPath });
}

/** 调用 read_file，验证 Rust 能正确读取磁盘文件 */
export async function ipcReadFile(filePath: string): Promise<string> {
  return await invokeIPC<string>('read_file', { path: filePath });
}

/** 文件元数据（stat_file 返回值） */
export interface FileStat {
  exists: boolean;
  size: number;
  isFile: boolean;
  isDir: boolean;
}

/** 调用 stat_file，获取文件元数据（存在性、大小、类型） */
export async function ipcStatFile(filePath: string): Promise<FileStat> {
  return await invokeIPC<FileStat>('stat_file', { path: filePath });
}

/** 调用 read_file_head，获取文件头部 N 字节的 hex（用于 magic bytes 校验） */
export async function ipcReadFileHead(filePath: string, bytes: number): Promise<string> {
  return await invokeIPC<string>('read_file_head', { path: filePath, bytes });
}

/** 调用 read_file_tail，获取文件尾部 N 字节的 UTF-8 字符串（用于 %%EOF 等校验） */
export async function ipcReadFileTail(filePath: string, bytes: number): Promise<string> {
  return await invokeIPC<string>('read_file_tail', { path: filePath, bytes });
}

/** 调用 save_file，验证 Rust 能正确写入磁盘 */
export async function ipcSaveFile(
  filePath: string,
  content: string,
): Promise<void> {
  return await invokeIPC<void>('save_file', { path: filePath, content });
}

/** 调用 read_all_md_files，验证 Rust 返回完整文件列表 */
export async function ipcReadAllMdFiles(
  workspacePath: string,
): Promise<Array<{ path: string; content: string }>> {
  return await invokeIPC<Array<{ path: string; content: string }>>(
    'read_all_md_files',
    { workspacePath },
  );
}

/** 调用 create_chapter，验证 Rust 修改了 SUMMARY.md */
export async function ipcCreateChapter(
  workspacePath: string,
  title: string,
): Promise<{ name: string; path: string; indexPath: string }> {
  return await invokeIPC<{ name: string; path: string; indexPath: string }>(
    'create_chapter',
    { workspacePath, title },
  );
}

/** 调用 create_page */
export async function ipcCreatePage(
  workspacePath: string,
  chapterPath: string,
  title: string,
): Promise<{ name: string; path: string }> {
  return await invokeIPC<{ name: string; path: string }>(
    'create_page',
    { workspacePath, chapterPath, title },
  );
}

/** 调用 rename_node */
export async function ipcRenameNode(
  workspacePath: string,
  nodePath: string,
  newTitle: string,
): Promise<void> {
  return await invokeIPC<void>('rename_node', {
    workspacePath,
    path: nodePath,
    newTitle,
  });
}

/** 调用 delete_node */
export async function ipcDeleteNode(
  workspacePath: string,
  nodePath: string,
): Promise<void> {
  return await invokeIPC<void>('delete_node', {
    workspacePath,
    path: nodePath,
  });
}

/** 调用 get_settings，验证 Rust 正确读取持久化设置 */
export async function ipcGetSettings(): Promise<UserSettings> {
  return await invokeIPC<UserSettings>('get_settings');
}

/** 调用 get_next_image_index */
export async function ipcGetNextImageIndex(
  assetsDir: string,
  docName: string,
): Promise<number> {
  return await invokeIPC<number>('get_next_image_index', { assetsDir, docName });
}

/** 调用 save_drawnix */
export async function ipcSaveDrawnix(
  path: string,
  data: string,
  svgContent: string,
): Promise<void> {
  return await invokeIPC<void>('save_drawnix', { path, data, svgContent });
}

/** 调用 export_chm，验证 Rust 返回输出路径 */
export async function ipcExportChm(
  workspacePath: string,
  outputPath: string,
): Promise<string> {
  return await invokeIPC<string>('export_chm', { workspacePath, outputPath });
}

/** 调用 export_nginx */
export async function ipcExportNginx(
  workspacePath: string,
  outputPath: string,
): Promise<string> {
  return await invokeIPC<string>('export_nginx', { workspacePath, outputPath });
}

/** 调用 list_assets，验证 Rust 能扫描 assets 目录 */
export async function ipcListAssets(
  dirPath: string,
): Promise<Array<{ name: string; size: number; fileType: string; path: string }>> {
  return await invokeIPC<Array<{ name: string; size: number; fileType: string; path: string }>>(
    'list_assets',
    { path: dirPath },
  );
}

/** 调用 reorder_chapters */
export async function ipcReorderChapters(
  workspacePath: string,
  chapterOrders: Array<{ path: string; newOrder: number }>,
): Promise<void> {
  return await invokeIPC<void>('reorder_chapters', { workspacePath, chapterOrders });
}

/** 调用 prepare_export_output，获取下一次导出的版本化路径 */
export async function ipcPrepareExportOutput(
  workspacePath: string,
  exportType: string,
): Promise<string> {
  return await invokeIPC<string>('prepare_export_output', { workspacePath, exportType });
}

/** 调用 prune_export_versions，清理旧版本 */
export async function ipcPruneExportVersions(
  workspacePath: string,
  exportType: string,
): Promise<number> {
  return await invokeIPC<number>('prune_export_versions', { workspacePath, exportType });
}

/** 调用 save_settings */
export async function ipcSaveSettings(settings: UserSettings): Promise<void> {
  return await invokeIPC<void>('save_settings', { settings });
}

/** 调用 export_chm 并指定输出路径和 title/author 覆盖 */
export async function ipcExportChmFull(
  workspacePath: string,
  outputPath: string,
  title?: string,
  author?: string,
): Promise<string> {
  return await invokeIPC<string>('export_chm', {
    workspacePath,
    outputPath,
    title: title ?? undefined,
    author: author ?? undefined,
  });
}
