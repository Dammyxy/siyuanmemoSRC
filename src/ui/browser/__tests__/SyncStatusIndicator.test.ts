/**
 * SyncStatusIndicator 组件测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import SyncStatusIndicator from '../SyncStatusIndicator.vue';
import type { SyncStatus, SyncResult } from '@/services/HybridSyncService';

describe('SyncStatusIndicator', () => {
  let mockSyncService: any;

  beforeEach(() => {
    // 创建模拟的 HybridSyncService
    mockSyncService = {
      getSyncStatus: vi.fn(() => ({
        status: 'idle' as SyncStatus,
        lastSyncTime: 0,
        lastFullSyncTime: 0,
      })),
      incrementalSync: vi.fn(async () => ({
        success: true,
        addedCount: 5,
        deletedCount: 0,
        skippedCount: 2,
      } as SyncResult)),
      fullSync: vi.fn(async () => ({
        success: true,
        addedCount: 3,
        deletedCount: 2,
        skippedCount: 0,
        blacklistCleanedCount: 1,
      } as SyncResult)),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('显示控制', () => {
    it('当 show=false 时不显示', () => {
      const wrapper = mount(SyncStatusIndicator, {
        props: {
          show: false,
          syncService: mockSyncService,
        },
      });

      expect(wrapper.find('.sync-status-indicator').exists()).toBe(false);
    });

    it('当 show=true 且有 syncService 时显示', () => {
      const wrapper = mount(SyncStatusIndicator, {
        props: {
          show: true,
          syncService: mockSyncService,
        },
      });

      expect(wrapper.find('.sync-status-indicator').exists()).toBe(true);
    });

    it('当 show=true 但没有 syncService 时不显示', () => {
      const wrapper = mount(SyncStatusIndicator, {
        props: {
          show: true,
          syncService: undefined,
        },
      });

      expect(wrapper.find('.sync-status-indicator').exists()).toBe(false);
    });
  });

  describe('状态显示', () => {
    it('显示 idle 状态', () => {
      const wrapper = mount(SyncStatusIndicator, {
        props: {
          show: true,
          syncService: mockSyncService,
        },
      });

      expect(wrapper.find('.status.idle').exists()).toBe(true);
      expect(wrapper.text()).toContain('未同步');
    });

    it('显示 syncing 状态', async () => {
      mockSyncService.getSyncStatus.mockReturnValue({
        status: 'syncing' as SyncStatus,
        lastSyncTime: 0,
        lastFullSyncTime: 0,
      });

      const wrapper = mount(SyncStatusIndicator, {
        props: {
          show: true,
          syncService: mockSyncService,
        },
      });

      await wrapper.vm.$nextTick();

      expect(wrapper.find('.status.syncing').exists()).toBe(true);
      expect(wrapper.text()).toContain('正在同步');
    });

    it('显示 success 状态', async () => {
      const now = Date.now();
      mockSyncService.getSyncStatus.mockReturnValue({
        status: 'success' as SyncStatus,
        lastSyncTime: now - 60000, // 1 分钟前
        lastFullSyncTime: 0,
      });

      const wrapper = mount(SyncStatusIndicator, {
        props: {
          show: true,
          syncService: mockSyncService,
        },
      });

      await wrapper.vm.$nextTick();

      expect(wrapper.find('.status.success').exists()).toBe(true);
      expect(wrapper.text()).toContain('上次同步');
    });

    it('显示 error 状态', async () => {
      mockSyncService.getSyncStatus.mockReturnValue({
        status: 'error' as SyncStatus,
        lastSyncTime: 0,
        lastFullSyncTime: 0,
      });

      const wrapper = mount(SyncStatusIndicator, {
        props: {
          show: true,
          syncService: mockSyncService,
        },
      });

      await wrapper.vm.$nextTick();

      expect(wrapper.find('.status.error').exists()).toBe(true);
      expect(wrapper.text()).toContain('同步失败');
    });
  });

  describe('时间格式化', () => {
    it('显示"刚刚"（< 1 分钟）', async () => {
      const now = Date.now();
      mockSyncService.getSyncStatus.mockReturnValue({
        status: 'success' as SyncStatus,
        lastSyncTime: now - 30000, // 30 秒前
        lastFullSyncTime: 0,
      });

      const wrapper = mount(SyncStatusIndicator, {
        props: {
          show: true,
          syncService: mockSyncService,
        },
      });

      await wrapper.vm.$nextTick();

      expect(wrapper.text()).toContain('刚刚');
    });

    it('显示"X分钟前"（< 1 小时）', async () => {
      const now = Date.now();
      mockSyncService.getSyncStatus.mockReturnValue({
        status: 'success' as SyncStatus,
        lastSyncTime: now - 5 * 60 * 1000, // 5 分钟前
        lastFullSyncTime: 0,
      });

      const wrapper = mount(SyncStatusIndicator, {
        props: {
          show: true,
          syncService: mockSyncService,
        },
      });

      await wrapper.vm.$nextTick();

      expect(wrapper.text()).toMatch(/5分钟前/);
    });

    it('显示"X小时前"（< 24 小时）', async () => {
      const now = Date.now();
      mockSyncService.getSyncStatus.mockReturnValue({
        status: 'success' as SyncStatus,
        lastSyncTime: now - 2 * 60 * 60 * 1000, // 2 小时前
        lastFullSyncTime: 0,
      });

      const wrapper = mount(SyncStatusIndicator, {
        props: {
          show: true,
          syncService: mockSyncService,
        },
      });

      await wrapper.vm.$nextTick();

      expect(wrapper.text()).toMatch(/2小时前/);
    });

    it('显示"X天前"（>= 24 小时）', async () => {
      const now = Date.now();
      mockSyncService.getSyncStatus.mockReturnValue({
        status: 'success' as SyncStatus,
        lastSyncTime: now - 3 * 24 * 60 * 60 * 1000, // 3 天前
        lastFullSyncTime: 0,
      });

      const wrapper = mount(SyncStatusIndicator, {
        props: {
          show: true,
          syncService: mockSyncService,
        },
      });

      await wrapper.vm.$nextTick();

      expect(wrapper.text()).toMatch(/3天前/);
    });
  });

  describe('按钮交互', () => {
    it('点击手动同步按钮触发增量同步', async () => {
      const wrapper = mount(SyncStatusIndicator, {
        props: {
          show: true,
          syncService: mockSyncService,
        },
      });

      const manualSyncBtn = wrapper.findAll('.sync-btn')[0];
      await manualSyncBtn.trigger('click');

      expect(mockSyncService.incrementalSync).toHaveBeenCalledTimes(1);
    });

    it('点击全量同步按钮触发全量同步', async () => {
      const wrapper = mount(SyncStatusIndicator, {
        props: {
          show: true,
          syncService: mockSyncService,
        },
      });

      const fullSyncBtn = wrapper.findAll('.sync-btn')[1];
      await fullSyncBtn.trigger('click');

      expect(mockSyncService.fullSync).toHaveBeenCalledTimes(1);
    });

    it('同步中时禁用按钮', async () => {
      mockSyncService.getSyncStatus.mockReturnValue({
        status: 'syncing' as SyncStatus,
        lastSyncTime: 0,
        lastFullSyncTime: 0,
      });

      const wrapper = mount(SyncStatusIndicator, {
        props: {
          show: true,
          syncService: mockSyncService,
        },
      });

      await wrapper.vm.$nextTick();

      const buttons = wrapper.findAll('.sync-btn');
      buttons.forEach(btn => {
        expect(btn.attributes('disabled')).toBeDefined();
      });
    });

    it('点击重试按钮重新触发同步', async () => {
      mockSyncService.getSyncStatus.mockReturnValue({
        status: 'error' as SyncStatus,
        lastSyncTime: 0,
        lastFullSyncTime: 0,
      });

      const wrapper = mount(SyncStatusIndicator, {
        props: {
          show: true,
          syncService: mockSyncService,
        },
      });

      await wrapper.vm.$nextTick();

      const retryBtn = wrapper.find('.retry-btn');
      await retryBtn.trigger('click');

      expect(mockSyncService.incrementalSync).toHaveBeenCalledTimes(1);
    });
  });

  describe('事件发射', () => {
    it('手动同步成功后发射 sync 事件', async () => {
      const wrapper = mount(SyncStatusIndicator, {
        props: {
          show: true,
          syncService: mockSyncService,
        },
      });

      const manualSyncBtn = wrapper.findAll('.sync-btn')[0];
      await manualSyncBtn.trigger('click');

      // 等待异步操作完成
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(wrapper.emitted('sync')).toBeTruthy();
    });

    it('全量同步成功后发射 fullSync 事件', async () => {
      const wrapper = mount(SyncStatusIndicator, {
        props: {
          show: true,
          syncService: mockSyncService,
        },
      });

      const fullSyncBtn = wrapper.findAll('.sync-btn')[1];
      await fullSyncBtn.trigger('click');

      // 等待异步操作完成
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(wrapper.emitted('fullSync')).toBeTruthy();
    });
  });

  describe('国际化', () => {
    it('使用自定义 i18n', () => {
      const customI18n = {
        idle: 'Not synced',
        manualSync: 'Manual Sync',
        fullSync: 'Full Sync',
      };

      const wrapper = mount(SyncStatusIndicator, {
        props: {
          show: true,
          syncService: mockSyncService,
          i18n: customI18n,
        },
      });

      expect(wrapper.text()).toContain('Not synced');
      expect(wrapper.text()).toContain('Manual Sync');
      expect(wrapper.text()).toContain('Full Sync');
    });
  });
});
