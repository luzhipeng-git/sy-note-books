interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = '确认',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.5)',
      }}
      onClick={onCancel}
    >
      <div
        style={{
          width: 360,
          padding: 'var(--sp-6)',
          background: 'var(--bg-primary, var(--surface-1))',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,.25)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          style={{
            fontSize: 'var(--text-lg)',
            fontWeight: 600,
            marginBottom: 'var(--sp-2)',
          }}
        >
          {title}
        </h3>
        <p
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--main-text-secondary)',
            marginBottom: 'var(--sp-5)',
          }}
        >
          {message}
        </p>
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 'var(--sp-2)',
          }}
        >
          <button className="btn btn-secondary" onClick={onCancel}>
            取消
          </button>
          <button
            className="btn"
            style={{
              background: 'var(--accent-red)',
              color: 'white',
            }}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
