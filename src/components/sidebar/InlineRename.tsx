import { useRef, useEffect } from 'react';

interface InlineRenameProps {
  initialValue: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export function InlineRename({ initialValue, onConfirm, onCancel }: InlineRenameProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const value = inputRef.current?.value.trim();
      if (value) onConfirm(value);
      else onCancel();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  const handleBlur = () => {
    const value = inputRef.current?.value.trim();
    if (value && value !== initialValue) onConfirm(value);
    else onCancel();
  };

  return (
    <input
      ref={inputRef}
      className="inline-rename-input"
      defaultValue={initialValue}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
    />
  );
}
