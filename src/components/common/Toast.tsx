import { useState, useEffect } from 'react';

interface ToastProps {
  message: string;
  type?: 'default' | 'success' | 'error';
  duration?: number;
  onClose: () => void;
}

export function Toast({ message, type = 'default', duration = 3000, onClose }: ToastProps) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setOpen(false);
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  if (!open) return null;

  return (
    <div className={`toast open ${type !== 'default' ? type : ''}`}>
      {message}
    </div>
  );
}
