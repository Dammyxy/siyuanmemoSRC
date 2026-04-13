/**
 * SiyuanBlockAdapter 单元测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SiyuanBlockAdapter } from '../SiyuanBlockAdapter';

describe('SiyuanBlockAdapter', () => {
  let adapter: SiyuanBlockAdapter;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    adapter = new SiyuanBlockAdapter();
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as Window & { Lute?: unknown }).Lute;
  });

  describe('getBlock', () => {
    it('should return block data when API calls succeed', async () => {
      const mockInfoData = {
        id: '20230101120000-abcdefg',
        parentID: '20230101110000-parent',
        rootID: '20230101000000-root',
        box: 'notebook-id',
        path: '/path/to/doc.sy',
      };

      const mockKramdownData = {
        id: '20230101120000-abcdefg',
        kramdown: '什么是 DDD？ >> 领域驱动设计',
      };

      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            code: 0,
            msg: '',
            data: mockInfoData,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            code: 0,
            msg: '',
            data: mockKramdownData,
          }),
        });

      const result = await adapter.getBlock('20230101120000-abcdefg');

      expect(result).toEqual({
        id: '20230101120000-abcdefg',
        content: '什么是 DDD？ >> 领域驱动设计',
        parentID: '20230101110000-parent',
      });

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/block/getBlockInfo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: '20230101120000-abcdefg' }),
      });
      expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/block/getBlockKramdown', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: '20230101120000-abcdefg' }),
      });
    });

    it('should return null when block info does not exist', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          code: 0,
          msg: '',
          data: null,
        }),
      });

      const result = await adapter.getBlock('nonexistent-block-id');

      expect(result).toBeNull();
    });

    it('should return null when getBlockInfo returns error code', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          code: 404,
          msg: 'Block not found',
          data: null,
        }),
      });

      const result = await adapter.getBlock('20230101120000-abcdefg');

      expect(result).toBeNull();
    });

    it('should return null when getBlockKramdown fails', async () => {
      const mockInfoData = {
        id: '20230101120000-abcdefg',
        parentID: '20230101110000-parent',
        rootID: '20230101000000-root',
        box: 'notebook-id',
        path: '/path/to/doc.sy',
      };

      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            code: 0,
            msg: '',
            data: mockInfoData,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            code: 404,
            msg: 'Kramdown not found',
            data: null,
          }),
        });

      const result = await adapter.getBlock('20230101120000-abcdefg');

      expect(result).toBeNull();
    });

    it('should return null when HTTP request fails', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const result = await adapter.getBlock('20230101120000-abcdefg');

      expect(result).toBeNull();
    });

    it('should return null when network error occurs', async () => {
      fetchMock.mockRejectedValue(new Error('Network error'));

      const result = await adapter.getBlock('20230101120000-abcdefg');

      expect(result).toBeNull();
    });

    it('should handle block without parentID', async () => {
      const mockInfoData = {
        id: '20230101120000-abcdefg',
        rootID: '20230101000000-root',
        box: 'notebook-id',
        path: '/path/to/doc.sy',
      };

      const mockKramdownData = {
        id: '20230101120000-abcdefg',
        kramdown: '什么是 DDD？ >> 领域驱动设计',
      };

      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            code: 0,
            msg: '',
            data: mockInfoData,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            code: 0,
            msg: '',
            data: mockKramdownData,
          }),
        });

      const result = await adapter.getBlock('20230101120000-abcdefg');

      expect(result).toEqual({
        id: '20230101120000-abcdefg',
        content: '什么是 DDD？ >> 领域驱动设计',
        parentID: undefined,
      });
    });
  });

  describe('renderQuickFaceHtml', () => {
    it('keeps visible SpinBlockDOM output without retrying Md2BlockDOM', () => {
      const spinBlockDOM = vi.fn(() => '<div class="p">北京</div>');
      const md2BlockDOM = vi.fn(() => '<div class="p">首都</div>');
      (window as Window & { Lute?: unknown }).Lute = {
        New: () => ({
          SpinBlockDOM: spinBlockDOM,
          Md2BlockDOM: md2BlockDOM,
        }),
      };

      const html = adapter.renderQuickFaceHtml('北京');

      expect(html).toBe('<div class="p">北京</div>');
      expect(spinBlockDOM).toHaveBeenCalledWith('北京');
      expect(md2BlockDOM).not.toHaveBeenCalled();
    });

    it('retries Md2BlockDOM when SpinBlockDOM returns structurally blank scaffold', () => {
      const spinBlockDOM = vi.fn(() => '<div class="p"><div class="protyle-action"></div><div class="protyle-attr"></div></div>');
      const md2BlockDOM = vi.fn(() => '<div class="p">北京</div>');
      (window as Window & { Lute?: unknown }).Lute = {
        New: () => ({
          SpinBlockDOM: spinBlockDOM,
          Md2BlockDOM: md2BlockDOM,
        }),
      };

      const html = adapter.renderQuickFaceHtml('北京');

      expect(html).toBe('<div class="p">北京</div>');
      expect(spinBlockDOM).toHaveBeenCalledWith('北京');
      expect(md2BlockDOM).toHaveBeenCalledWith('北京');
    });

    it('strips attribute-only lines and trailing attribute tails before rendering', () => {
      const spinBlockDOM = vi.fn(() => '<div class="p">北京</div>');
      const md2BlockDOM = vi.fn(() => '<div class="p">首都</div>');
      (window as Window & { Lute?: unknown }).Lute = {
        New: () => ({
          SpinBlockDOM: spinBlockDOM,
          Md2BlockDOM: md2BlockDOM,
        }),
      };

      adapter.renderQuickFaceHtml('北京 {: id="inline"}\n* {: id="line"}');

      expect(spinBlockDOM).toHaveBeenCalledWith('北京');
      expect(md2BlockDOM).not.toHaveBeenCalled();
    });

    it('falls back to normalized raw kramdown when both renderers stay structurally blank', () => {
      const blankShell = '<div class="p"><div class="protyle-action"></div><div class="protyle-attr"></div></div>';
      const spinBlockDOM = vi.fn(() => blankShell);
      const md2BlockDOM = vi.fn(() => blankShell);
      (window as Window & { Lute?: unknown }).Lute = {
        New: () => ({
          SpinBlockDOM: spinBlockDOM,
          Md2BlockDOM: md2BlockDOM,
        }),
      };

      const html = adapter.renderQuickFaceHtml('北京\n* {: id="line"}');

      expect(html).toBe('北京');
      expect(spinBlockDOM).toHaveBeenCalledWith('北京');
      expect(md2BlockDOM).toHaveBeenCalledWith('北京');
    });
  });
});
