import { useCallback, useRef } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';

export function SidebarResizeHandle() {
  const { sidebarWidth, setSidebarWidth } = useSettingsStore();
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      dragging.current = true;
      startX.current = e.clientX;
      startWidth.current = sidebarWidth;
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      e.preventDefault();
    },
    [sidebarWidth],
  );

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging.current) return;
    const delta = e.clientX - startX.current;
    setSidebarWidth(startWidth.current + delta);
  }, []);

  const handleMouseUp = useCallback(() => {
    dragging.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }, []);

  return (
    <div
      className="sidebar-resize"
      onMouseDown={handleMouseDown}
    />
  );
}
