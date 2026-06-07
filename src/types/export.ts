export type ExportType = 'chm' | 'nginx' | 'pdf';

export type ExportStep = 'config' | 'progress' | 'success' | 'error';

export interface ExportConfig {
  type: ExportType;
  scope: 'workspace' | 'chapter';
  selectedChapter: string | null;
  titleOverride: string;
  authorOverride: string;
}
