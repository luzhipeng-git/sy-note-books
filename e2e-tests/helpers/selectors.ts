/**
 * E2E 测试：集中管理的选择器、文本、快捷键常量。
 * 基于 design/interaction/*.html 状态机 + 组件源码精确 DOM 结构。
 */

// ─── CSS 选择器 ────────────────────────────────────────────

export const S = {
  // ── 布局 ──
  themeRoot: '[data-theme]',
  appShell: '.app-shell',
  mainArea: '.main-area',

  // ── 侧边栏 ──
  sidebar: '.sidebar',
  sidebarCollapsed: '.sidebar.sidebar-collapsed',
  sidebarCollapsedIcons: '.sidebar-collapsed-icons',
  sidebarHeader: '.sidebar-header',
  sidebarActions: '.sidebar-actions',
  sidebarFooter: '.sidebar-footer',
  sidebarBtn: '.sidebar-btn',
  sidebarCollapsedIcon: '.sidebar-collapsed-icon',

  // ── 文件树 ──
  fileTree: '.file-tree',
  treeItem: '.tree-item',
  treeItemFolder: '.tree-item.folder',
  treeItemActive: '.tree-item.active',
  treeItemMissing: '.tree-item.missing',
  treeIcon: '.tree-icon',
  inlineRenameInput: '.inline-rename-input',

  // ── 上下文菜单 ──
  contextMenu: '.context-menu-item',

  // ── 工具栏 ──
  toolbar: '.toolbar',
  toolbarBtn: '.toolbar-btn',
  toolbarSeparator: '.toolbar-separator',

  // ── 面包屑 ──
  breadcrumb: '.breadcrumb',
  breadcrumbSep: '.breadcrumb-sep',
  breadcrumbCurrent: '.breadcrumb-current',

  // ── 状态栏 ──
  statusBar: '.status-bar',

  // ── 编辑器 ──
  editorArea: '.editor-area',
  welcome: '.welcome',
  welcomeTitle: '.welcome-title',
  welcomeSubtitle: '.welcome-subtitle',
  vditorContainer: '.vditor-container',
  vditorInstance: '.vditor-instance',
  vditor: '.vditor',
  vditorIR: '.vditor-ir',

  // ── 白板 ──
  wbFullscreen: '.wb-fullscreen',
  wbTopbar: '.wb-topbar',
  wbBackBtn: '.wb-back-btn',
  wbTopbarTitle: '.wb-topbar-title',
  wbSaveBtn: '.wb-save-btn',
  wbCanvasArea: '.wb-canvas-area',
  wbInitOverlay: '.wb-init-overlay',

  // ── 全局搜索 ──
  gsOverlay: '.global-search-overlay',
  gsDialog: '.global-search-dialog',
  gsInput: '.global-search-input',
  gsTabs: '.global-search-tabs',
  gsTab: '.global-search-tab',
  gsTabActive: '.global-search-tab.active',
  gsResults: '.global-search-results',
  gsResult: '.global-search-result',
  gsResultSelected: '.global-search-result.selected',
  gsResultTitle: '.global-search-result-title',
  gsResultBreadcrumb: '.global-search-result-breadcrumb',
  gsResultSnippet: '.global-search-result-snippet',
  gsEmpty: '.global-search-empty',
  gsFooter: '.global-search-footer',

  // ── 导出 ──
  exOverlay: '.export-overlay',
  exDialog: '.export-dialog',
  exCards: '.export-cards',
  exCard: '.export-card',
  exCardSelected: '.export-card.selected',
  exFormGroup: '.export-form-group',
  exLabel: '.export-label',
  exInput: '.export-input',
  exSelect: '.export-select',
  exProgressBar: '.export-progress-bar',
  exProgressFill: '.export-progress-fill',
  exProgressText: '.export-progress-text',
  exResult: '.export-result',
  exResultIcon: '.export-result-icon',
  exResultIconError: '.export-result-icon-error',
  exResultTitle: '.export-result-title',
  exCloseBtn: '.export-close-btn',
  exWsItem: '.export-workspace-item',

  // ── 确认对话框（无 CSS class，用按钮定位）──
  // ConfirmDialog 渲染为固定定位 div，内部有 h3 + p + 两个 button
  // 用 button 文字定位： browser.$('button=取消'), browser.$('button=放弃并返回')

  // ── Toast ──
  toast: '.toast',
  toastOpen: '.toast.open',

  // ── 新建 Workspace 对话框 ──
  modalCard: '.modal-card',

  // ── 侧边栏拖拽 ──
  sidebarResize: '.sidebar-resize',
} as const;

// ─── 文本常量 ──────────────────────────────────────────────

export const T = {
  // 应用
  appName: '书昀笔记电子书',
  appDesc: '面向技术写作者的桌面笔记应用',

  // 欢迎页按钮
  newWorkspace: '新建 Workspace',
  openFolder: '打开文件夹',
  recentOpen: '最近打开',
  selectFileHint: '从左侧选择一个文件开始编辑',

  // 侧边栏
  collapseSidebar: '收起侧边栏',
  expandSidebar: '展开侧边栏',
  backToManagement: '返回 Workspace 管理',
  newChapter: '新建章节',

  // 状态栏
  editorLabelMd: 'Markdown',
  editorLabelWb: 'Whiteboard',
  saveSaving: '保存中',
  saveSaved: '已保存',
  saveFailed: '保存失败',

  // 白板
  wbBack: '← 返回',
  wbSave: '保存并插入',
  wbSaving: '保存中...',
  wbDiscardTitle: '放弃当前绘制？',
  wbDiscardMsg: '未保存的内容将会丢失。',
  wbDiscardConfirm: '放弃并返回',

  // 搜索
  searchPlaceholder: '搜索全部文档...',
  tabAll: '全部',
  tabFilename: '文件名',
  tabContent: '内容',
  searchNoResult: '未找到匹配内容',

  // 导出
  exportPickTitle: '选择 Workspace 导出',
  exportConfigTitle: '导出配置',
  exportProgressTitle: '正在导出...',
  exportSuccess: '导出成功',
  exportFail: '导出失败',
  startExport: '开始导出',
  exportPdfBtn: '导出 PDF',
  cancel: '取消',
  delete: '删除',
  rename: '重命名',
  newPage: '新建子页面',
  confirmDelete: '确认删除',

  // 新建 Workspace
  createWsTitle: '新建 Workspace',
  createBtn: '创建',
} as const;

// ─── 快捷键 ────────────────────────────────────────────────

export const K = {
  globalSearch: ['Control', 'Shift', 'f'] as const,
  export:       ['Control', 'p'] as const,
  whiteboard:   ['Control', 'Shift', 'd'] as const,
  save:         ['Control', 's'] as const,
  escape:       'Escape' as const,
  enter:        'Enter' as const,
  arrowDown:    'ArrowDown' as const,
  arrowUp:      'ArrowUp' as const,
  tab:          'Tab' as const,
} as const;
