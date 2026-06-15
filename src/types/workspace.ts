export interface WorkspaceMeta {
  title: string;
  author: string;
  language: string;
  version: string;
  created: string;
}

export interface SummaryNode {
  title: string;
  path: string;
  level: number;
  isMissing?: boolean;
  children?: SummaryNode[];
}

export interface RepairAction {
  kind: 'added_missing_chapter' | 'missing_file' | 'field_defaulted';
  detail: string;
}

export interface WorkspaceInfo {
  rootPath: string;
  workspaceMeta: WorkspaceMeta;
  summary: SummaryNode[];
  repairs: RepairAction[];
}

export interface ChapterInfo {
  name: string;
  path: string;
  indexPath: string;
}

export interface PageInfo {
  name: string;
  path: string;
}

export interface ChapterOrder {
  path: string;
  newOrder: number;
}

export interface RecentWorkspace {
  path: string;
  title: string;
  lastOpened: string;
}

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'folder' | 'file';
  children?: FileTreeNode[];
  isMissing?: boolean;
}

export interface WhiteboardAnchor {
  sourceFilePath: string;
  cursorPosition: number;
  nearestHeading: string;
}
