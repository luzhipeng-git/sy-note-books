import { useEffect, useRef } from 'react';
import { useFloating, offset, flip } from '@floating-ui/react';

const HEADINGS = [
  { level: 1, label: 'H1', example: '一级标题', size: '1.5em' },
  { level: 2, label: 'H2', example: '二级标题', size: '1.3em' },
  { level: 3, label: 'H3', example: '三级标题', size: '1.15em' },
  { level: 4, label: 'H4', example: '四级标题', size: '1em' },
  { level: 5, label: 'H5', example: '五级标题', size: '0.9em' },
  { level: 6, label: 'H6', example: '六级标题', size: '0.85em' },
];

interface HeadingPickerProps {
  anchorEl: HTMLElement;
  onSelect: (level: number) => void;
  onClose: () => void;
}

export function HeadingPicker({ anchorEl, onSelect, onClose }: HeadingPickerProps) {
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
    <div ref={ref} className="heading-picker" style={floatingStyles}>
      {HEADINGS.map((h) => (
        <button
          key={h.level}
          className="heading-picker__item"
          onClick={() => {
            onSelect(h.level);
            onClose();
          }}
        >
          <span className="heading-picker__label" style={{ fontSize: h.size }}>
            {h.label}
          </span>
          <span className="heading-picker__example">{h.example}</span>
        </button>
      ))}
    </div>
  );
}
