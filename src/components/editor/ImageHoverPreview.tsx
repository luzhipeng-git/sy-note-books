import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';

interface PreviewState {
  src: string;
  rect: DOMRect;
}

export function useImageHoverPreview(containerRef: React.RefObject<HTMLElement | null>) {
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseOver = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName !== 'IMG') return;

    const img = target as HTMLImageElement;
    const rect = img.getBoundingClientRect();

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setPreview({ src: img.src, rect });
    }, 300);
  }, []);

  const handleMouseOut = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName !== 'IMG') return;
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    el.addEventListener('mouseover', handleMouseOver);
    el.addEventListener('mouseout', handleMouseOut);

    return () => {
      el.removeEventListener('mouseover', handleMouseOver);
      el.removeEventListener('mouseout', handleMouseOut);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [containerRef, handleMouseOver, handleMouseOut]);

  return { preview, close: () => setPreview(null) };
}

interface ImageHoverPreviewProps {
  preview: PreviewState;
  onClose: () => void;
}

export function ImageHoverPreview({ preview, onClose }: ImageHoverPreviewProps) {
  const [scale, setScale] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (fullscreen) setFullscreen(false);
        else onClose();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, fullscreen]);

  useEffect(() => {
    setScale(1);
    setFullscreen(false);
  }, [preview.src]);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setScale((s) => Math.max(0.25, Math.min(5, s + (e.deltaY < 0 ? 0.25 : -0.25))));
  };

  if (fullscreen) {
    return createPortal(
      <div
        className="image-preview-overlay"
        onClick={() => setFullscreen(false)}
      >
        <img
          src={preview.src}
          alt="Preview"
          className="image-preview-fullscreen"
          style={{ transform: `scale(${scale})` }}
          onClick={(e) => e.stopPropagation()}
          onWheel={handleWheel}
        />
      </div>,
      document.body,
    );
  }

  const top = preview.rect.bottom + 8;
  const left = Math.max(8, preview.rect.left);

  return createPortal(
    <div
      className="image-preview-popup"
      style={{ top, left }}
      onMouseLeave={onClose}
    >
      <img
        src={preview.src}
        alt="Preview"
        style={{ transform: `scale(${scale})` }}
        onClick={() => setFullscreen(true)}
        onWheel={handleWheel}
      />
      <div className="image-preview-controls">
        <button onClick={() => setScale((s) => Math.min(s + 0.25, 3))}>+</button>
        <button onClick={() => setScale((s) => Math.max(s - 0.25, 0.5))}>−</button>
      </div>
    </div>,
    document.body,
  );
}
