import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WhiteboardFullscreen } from '../WhiteboardFullscreen';
import { useWhiteboardStore } from '../../../stores/whiteboardStore';
import { useWorkspaceStore } from '../../../stores/workspaceStore';

// Mock ResizeObserver for jsdom
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = MockResizeObserver as any;

// Mock getBoundingClientRect to return non-zero dimensions
const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
beforeAll(() => {
  Element.prototype.getBoundingClientRect = function () {
    if (this.classList?.contains('wb-canvas-area')) {
      return { width: 800, height: 600, x: 0, y: 0, top: 0, left: 0, bottom: 600, right: 800 } as DOMRect;
    }
    return originalGetBoundingClientRect.call(this);
  };
});
afterAll(() => {
  Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
});

import { beforeAll, afterAll } from 'vitest';

vi.mock('@drawnix/drawnix', () => ({
  Drawnix: ({ onValueChange }: { onValueChange: (v: unknown[]) => void }) => (
    <div data-testid="drawnix-canvas" onClick={() => onValueChange([{ id: '1' }])}>
      Mocked Drawnix
    </div>
  ),
}));

describe('WhiteboardFullscreen', () => {
  beforeEach(() => {
    useWhiteboardStore.getState().reset();
    useWorkspaceStore.getState().closeWorkspace();
  });

  it('renders topbar with back button and save button', () => {
    useWhiteboardStore.getState().initNew({
      sourceFilePath: '02-architecture/api-overview.md',
      cursorPosition: 5,
      nearestHeading: 'API 总览',
    });

    render(<WhiteboardFullscreen />);

    expect(screen.getByText('← 返回')).toBeDefined();
    expect(screen.getByText('保存并插入')).toBeDefined();
    expect(screen.getByText(/正在为「API 总览」段落绘制插图/)).toBeDefined();
  });

  it('shows "编辑插图" in edit mode', () => {
    useWhiteboardStore.getState().initEdit(
      {
        sourceFilePath: '02-architecture/api-overview.md',
        cursorPosition: 5,
        nearestHeading: 'API 总览',
      },
      'assets/api-overview-img-001.drawnix',
      [{ id: '1', type: 'rectangle', children: [] }],
    );

    render(<WhiteboardFullscreen />);

    expect(screen.getByText(/正在为「API 总览」段落编辑插图/)).toBeDefined();
  });

  it('exits whiteboard on back button click when not dirty', () => {
    useWhiteboardStore.getState().initNew({
      sourceFilePath: 'test.md',
      cursorPosition: 1,
      nearestHeading: 'Test',
    });

    // Open a workspace so exitWhiteboard has context
    useWorkspaceStore.getState().openWorkspace('/mock/ws');

    // Enter whiteboard mode
    useWorkspaceStore.getState().enterWhiteboard({
      sourceFilePath: 'test.md',
      cursorPosition: 1,
      nearestHeading: 'Test',
    });

    expect(useWorkspaceStore.getState().activeEditorType).toBe('whiteboard');

    render(<WhiteboardFullscreen />);
    fireEvent.click(screen.getByText('← 返回'));

    expect(useWorkspaceStore.getState().activeEditorType).toBe('markdown');
    expect(useWhiteboardStore.getState().anchor).toBeNull();
  });

  it('shows confirm dialog on back when dirty', async () => {
    useWhiteboardStore.getState().initNew({
      sourceFilePath: 'test.md',
      cursorPosition: 1,
      nearestHeading: 'Test',
    });
    useWhiteboardStore.getState().setDirty(true);

    render(<WhiteboardFullscreen />);
    fireEvent.click(screen.getByText('← 返回'));

    expect(screen.getByText('放弃当前绘制？')).toBeDefined();
    expect(screen.getByText('放弃并返回')).toBeDefined();
  });

  it('confirms discard and exits', () => {
    useWhiteboardStore.getState().initNew({
      sourceFilePath: 'test.md',
      cursorPosition: 1,
      nearestHeading: 'Test',
    });
    useWhiteboardStore.getState().setDirty(true);
    useWorkspaceStore.getState().openWorkspace('/mock/ws');
    useWorkspaceStore.getState().enterWhiteboard({
      sourceFilePath: 'test.md',
      cursorPosition: 1,
      nearestHeading: 'Test',
    });

    render(<WhiteboardFullscreen />);
    fireEvent.click(screen.getByText('← 返回'));
    fireEvent.click(screen.getByText('放弃并返回'));

    expect(useWorkspaceStore.getState().activeEditorType).toBe('markdown');
    expect(useWhiteboardStore.getState().isDirty).toBe(false);
  });

  it('cancel confirm dialog keeps whiteboard open', () => {
    useWhiteboardStore.getState().initNew({
      sourceFilePath: 'test.md',
      cursorPosition: 1,
      nearestHeading: 'Test',
    });
    useWhiteboardStore.getState().setDirty(true);
    useWorkspaceStore.getState().openWorkspace('/mock/ws');
    useWorkspaceStore.getState().enterWhiteboard({
      sourceFilePath: 'test.md',
      cursorPosition: 1,
      nearestHeading: 'Test',
    });

    render(<WhiteboardFullscreen />);
    fireEvent.click(screen.getByText('← 返回'));

    // Cancel button in ConfirmDialog
    const cancelBtn = screen.getAllByText('取消').find(
      (el) => el.closest('.confirm-dialog') || el.parentElement?.textContent?.includes('放弃'),
    );
    if (cancelBtn) fireEvent.click(cancelBtn);

    // Should still be in whiteboard mode
    expect(useWorkspaceStore.getState().activeEditorType).toBe('whiteboard');
  });

  it('renders Drawnix canvas', () => {
    useWhiteboardStore.getState().initNew({
      sourceFilePath: 'test.md',
      cursorPosition: 1,
      nearestHeading: 'Test',
    });

    render(<WhiteboardFullscreen />);
    expect(screen.getByTestId('drawnix-canvas')).toBeDefined();
  });

  it('shows default heading text when no nearest heading', () => {
    useWhiteboardStore.getState().initNew({
      sourceFilePath: 'test.md',
      cursorPosition: 1,
      nearestHeading: '',
    });

    render(<WhiteboardFullscreen />);
    expect(screen.getByText('白板画图')).toBeDefined();
  });
});
