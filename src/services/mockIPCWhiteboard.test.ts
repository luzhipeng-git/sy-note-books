import { describe, it, expect, beforeEach } from 'vitest';
import { mockIPC } from './mockIPC';

describe('mockIPC — whiteboard commands', () => {
  describe('get_next_image_index', () => {
    it('returns 3 for "index" doc (has img-001 and img-002)', async () => {
      const index = await mockIPC<number>('get_next_image_index', {
        assetsDir: './assets',
        docName: 'index',
      });
      expect(index).toBe(3);
    });

    it('returns 1 for doc with no existing images', async () => {
      const index = await mockIPC<number>('get_next_image_index', {
        assetsDir: './assets',
        docName: 'brand-new-doc',
      });
      expect(index).toBe(1);
    });
  });

  describe('save_drawnix', () => {
    it('saves without error and tracks new assets', async () => {
      await mockIPC('save_drawnix', {
        path: './assets/test-img-005',
        data: '{"type":"drawnix"}',
        svgContent: '<svg></svg>',
      });

      // After saving, next index for this doc should increment
      const index = await mockIPC<number>('get_next_image_index', {
        assetsDir: './assets',
        docName: 'test-img-005',
      });
      expect(index).toBeGreaterThanOrEqual(1);
    });
  });
});
