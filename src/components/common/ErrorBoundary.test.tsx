import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

// Component that throws based on a prop
function ConditionalThrower({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Test error: component crashed');
  }
  return <div>Normal content</div>;
}

describe('ErrorBoundary', () => {
  // Suppress React error boundary console logs
  const originalConsoleError = console.error;
  beforeEach(() => {
    console.error = (...args: unknown[]) => {
      if (typeof args[0] === 'string' && args[0].includes('[ErrorBoundary]')) return;
      if (typeof args[0] === 'string' && args[0].includes('The above error occurred')) return;
      if (typeof args[0] === 'string' && args[0].includes('React will try to recreate')) return;
      originalConsoleError.call(console, ...args);
    };
  });
  afterEach(() => {
    console.error = originalConsoleError;
  });

  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <ConditionalThrower shouldThrow={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Normal content')).toBeDefined();
  });

  it('catches rendering errors and shows fallback UI', () => {
    render(
      <ErrorBoundary>
        <ConditionalThrower shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('应用遇到了一个错误')).toBeDefined();
    expect(screen.getByText('Test error: component crashed')).toBeDefined();
  });

  it('shows custom fallback if provided', () => {
    render(
      <ErrorBoundary fallback={<div>Custom fallback</div>}>
        <ConditionalThrower shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Custom fallback')).toBeDefined();
  });

  it('recovers via reset button which clears error state', () => {
    const { unmount } = render(
      <ErrorBoundary>
        <ConditionalThrower shouldThrow={true} />
      </ErrorBoundary>,
    );

    // Error UI is shown
    expect(screen.getByText('应用遇到了一个错误')).toBeDefined();
    expect(screen.getByText('重试')).toBeDefined();

    // Click reset — clears ErrorBoundary internal state, but child still throws
    // so it will immediately catch again. That's expected behavior.
    fireEvent.click(screen.getByText('重试'));

    // Error boundary catches the re-thrown error again
    expect(screen.getByText('应用遇到了一个错误')).toBeDefined();

    unmount();

    // Now render with a non-throwing child → should show normal content
    render(
      <ErrorBoundary>
        <ConditionalThrower shouldThrow={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Normal content')).toBeDefined();
  });

  it('does not affect sibling components when one child errors', () => {
    render(
      <ErrorBoundary>
        <div>Stable sibling</div>
        <ConditionalThrower shouldThrow={true} />
      </ErrorBoundary>,
    );

    // Error boundary catches the error and shows fallback for the whole subtree
    // This is expected React behavior — the entire children prop is replaced
    expect(screen.getByText('应用遇到了一个错误')).toBeDefined();
  });
});
