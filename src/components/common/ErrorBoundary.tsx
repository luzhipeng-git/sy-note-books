import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * React Error Boundary that catches rendering errors in child components.
 * Prevents a single component crash from white-screening the entire app.
 *
 * Usage: Wrap <AppShell /> or any subtree with <ErrorBoundary>.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Unhandled error:', error, info.componentStack);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          padding: '32px',
          background: 'var(--main-bg, #fff)',
          color: 'var(--main-text, #333)',
          gap: '16px',
        }}>
          <div style={{ fontSize: '48px', opacity: 0.3 }}>⚠️</div>
          <div style={{ fontSize: '18px', fontWeight: 600 }}>
            应用遇到了一个错误
          </div>
          <div style={{
            fontSize: '13px',
            color: 'var(--main-text-secondary, #666)',
            maxWidth: '480px',
            textAlign: 'center',
            wordBreak: 'break-word',
          }}>
            {this.state.error?.message || '未知错误'}
          </div>
          <button
            onClick={this.handleReset}
            style={{
              marginTop: '8px',
              padding: '8px 24px',
              fontSize: '14px',
              border: '1px solid var(--border-color, #ddd)',
              borderRadius: '6px',
              background: 'var(--btn-bg, #fff)',
              color: 'var(--btn-text, #333)',
              cursor: 'pointer',
            }}
          >
            重试
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
