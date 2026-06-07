import { useWorkspaceStore } from '../../stores/workspaceStore';

export function Breadcrumb() {
  const { activeFilePath, fileTree, workspaceMeta } = useWorkspaceStore();

  if (!activeFilePath) return null;

  const parts = activeFilePath.split('/');
  const fileName = parts[parts.length - 1]?.replace(/\.md$/, '') ?? '';
  const chapter = fileTree.find((f) =>
    activeFilePath.startsWith(f.path),
  );

  // Don't show chapter name if file IS the index (it's redundant)
  const isIndexFile = activeFilePath.endsWith('/index.md');

  return (
    <div className="breadcrumb">
      {workspaceMeta && (
        <>
          <span>{workspaceMeta.title}</span>
          <span className="breadcrumb-sep">/</span>
        </>
      )}
      {chapter && !isIndexFile && (
        <>
          <span>{chapter.name}</span>
          <span className="breadcrumb-sep">/</span>
        </>
      )}
      <span className="breadcrumb-current">
        {isIndexFile ? chapter?.name ?? fileName : fileName}
      </span>
    </div>
  );
}
