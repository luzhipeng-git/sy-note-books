import { useEffect, useRef, useState } from 'react';
import { useFloating, offset, flip } from '@floating-ui/react';

const MAX_SIZE = 8;

interface TableGridPickerProps {
  anchorEl: HTMLElement;
  onSelect: (rows: number, cols: number) => void;
  onClose: () => void;
}

export function TableGridPicker({ anchorEl, onSelect, onClose }: TableGridPickerProps) {
  const [hovered, setHovered] = useState({ row: 0, col: 0 });
  const ref = useRef<HTMLDivElement>(null);

  const { refs, floatingStyles } = useFloating({
    elements: { reference: anchorEl },
    placement: 'bottom-start',
    middleware: [offset(4), flip()],
  });

  useEffect(() => {
    refs.setFloating(ref.current);
  }, [refs]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && e.target !== anchorEl) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose, anchorEl]);

  return (
    <div ref={ref} className="table-grid-picker" style={floatingStyles}>
      <div className="table-grid-picker__grid">
        {Array.from({ length: MAX_SIZE }, (_, row) =>
          Array.from({ length: MAX_SIZE }, (_, col) => (
            <div
              key={`${row}-${col}`}
              className={`table-grid-picker__cell ${
                row <= hovered.row && col <= hovered.col ? 'table-grid-picker__cell--active' : ''
              }`}
              onMouseEnter={() => setHovered({ row, col })}
              onClick={() => {
                onSelect(row + 1, col + 1);
                onClose();
              }}
            />
          )),
        )}
      </div>
      <div className="table-grid-picker__label">
        {hovered.row + 1} x {hovered.col + 1} 表格
      </div>
    </div>
  );
}
