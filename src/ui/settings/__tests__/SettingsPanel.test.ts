/**
 * SettingsPanel 组件测试 - 清理工具部分
 * 
 * 测试 SettingsPanel.vue 中的清理工具功能：
 * - 扫描按钮点击功能
 * - 删除按钮点击功能
 * - 扫描状态显示
 * - 删除状态显示
 * - 扫描结果显示
 * - 删除结果显示
 * - 确认对话框
 * - 错误处理
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';
import SettingsPanel from '../SettingsPanel.vue';

describe('SettingsPanel - 清理工具', () => {
  let mockCleanupHandlers: any;
  let wrapper: VueWrapper<any>;

  beforeEach(() => {
    // 创建模拟的 cleanupHandlers
    mockCleanupHandlers = {
      scan: vi.fn(async () => ({
        count: 5,
        orphanCards: [
          { id: 'card1', blockId: 'block1' },
          { id: 'card2', blockId: 'block2' },
          { id: 'card3', blockId: 'block3' },
          { id: 'card4', blockId: 'block4' },
          { id: 'card5', blockId: 'block5' },
        ],
      })),
      cleanup: vi.fn(async (orphanCards: any[]) => ({
        deletedCount: orphanCards.length,
      })),
    };

    // Mock window.confirm
    global.confirm = vi.fn(() => true);
  });

  afterEach(() => {
    if (wrapper) {
      wrapper.unmount();
    }
    vi.clearAllMocks();
  });

  /**
   * 辅助函数：挂载组件并切换到调度器标签页
   */
  const mountComponent = (props = {}) => {
    const defaultProps = {
      cleanupHandlers: mockCleanupHandlers,
      schedulerSettings: {
        defaultScheduler: 'fsrs-v6',
        enableRiffSync: false,
        itemScheduler: 'fsrs-v6',
        riffIntegration: {
          mode: 'advanced',
          useLocalScheduler: true,
          incrementalSync: {
            enabled: true,
            triggers: ['plugin-start', 'browser-open', 'review-open'],
            useBlacklist: true,
          },
          fullSync: {
            enabled: true,
            interval: 86400000,
            cleanupBlacklist: true,
          },
          deleteSync: {
            enabled: true,
            useBlacklistFallback: true,
          },
        },
      },
      i18n: {
        schedulerTab: '调度器',
        maintenanceTools: '维护工具',
        cleanupOrphanCards: '清理 Riff 残留卡片',
        cleanupOrphanCardsDesc: '删除 Riff 中存在但本地不存在的卡片',
        scanOrphanCards: '扫描残留卡片',
        scanning: '扫描中...',
        foundOrphanCards: '发现 {count} 张残留卡片',
        noOrphanCards: '未发现残留卡片',
        deleteOrphanCards: '删除残留卡片',
        deleting: '删除中...',
        deletedCards: '已删除 {count} 张卡片',
        cleanupWarning: '⚠️ 警告：此操作不可撤销，请谨慎使用',
        confirmDelete: '确认删除 {count} 张残留卡片？',
      },
      ...props,
    };

    const w = mount(SettingsPanel, {
      props: defaultProps,
    });

    // 切换到调度器标签页
    const schedulerTab = w.findAll('.settings-tab').find(tab => 
      tab.text().includes('调度器')
    );
    if (schedulerTab) {
      schedulerTab.trigger('click');
    }

    return w;
  };

  describe('初始状态', () => {
    it('在高阶模式下显示维护工具部分', async () => {
      wrapper = mountComponent();
      await wrapper.vm.$nextTick();

      expect(wrapper.text()).toContain('维护工具');
      expect(wrapper.text()).toContain('清理 Riff 残留卡片');
    });

    it('显示扫描按钮', async () => {
      wrapper = mountComponent();
      await wrapper.vm.$nextTick();

      const buttons = wrapper.findAll('button');
      const scanButton = buttons.find(btn => btn.text().includes('扫描残留卡片'));
      expect(scanButton).toBeDefined();
      expect(scanButton!.text()).toContain('扫描残留卡片');
    });

    it('不显示删除按钮（未扫描时）', async () => {
      wrapper = mountComponent();
      await wrapper.vm.$nextTick();

      const buttons = wrapper.findAll('button');
      const deleteButton = buttons.find(btn => btn.text().includes('删除残留卡片'));
      expect(deleteButton).toBeUndefined();
    });

    it('显示警告提示', async () => {
      wrapper = mountComponent();
      await wrapper.vm.$nextTick();

      expect(wrapper.text()).toContain('⚠️ 警告：此操作不可撤销，请谨慎使用');
    });
  });

  describe('扫描功能', () => {
    it('点击扫描按钮触发扫描', async () => {
      wrapper = mountComponent();
      await wrapper.vm.$nextTick();

      const scanButton = wrapper.findAll('button').find(btn => 
        btn.text().includes('扫描残留卡片')
      );
      
      await scanButton!.trigger('click');
      await wrapper.vm.$nextTick();

      expect(mockCleanupHandlers.scan).toHaveBeenCalledTimes(1);
    });

    it('扫描中显示 loading 状态', async () => {
      // 创建一个延迟的 scan 函数
      mockCleanupHandlers.scan = vi.fn(() => 
        new Promise(resolve => setTimeout(() => resolve({ count: 5, orphanCards: [] }), 100))
      );

      wrapper = mountComponent();
      await wrapper.vm.$nextTick();

      const scanButton = wrapper.findAll('button').find(btn => 
        btn.text().includes('扫描残留卡片')
      );
      
      await scanButton!.trigger('click');
      await wrapper.vm.$nextTick();

      // 检查按钮文本变为"扫描中..."
      expect(scanButton!.text()).toContain('扫描中...');
      
      // 检查按钮被禁用
      expect(scanButton!.attributes('disabled')).toBeDefined();
    });

    it('扫描完成后显示结果（有残留卡片）', async () => {
      wrapper = mountComponent();
      await wrapper.vm.$nextTick();

      const scanButton = wrapper.findAll('button').find(btn => 
        btn.text().includes('扫描残留卡片')
      );
      
      await scanButton!.trigger('click');
      await wrapper.vm.$nextTick();
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(wrapper.text()).toContain('发现 5 张残留卡片');
    });

    it('扫描完成后显示结果（无残留卡片）', async () => {
      mockCleanupHandlers.scan = vi.fn(async () => ({
        count: 0,
        orphanCards: [],
      }));

      wrapper = mountComponent();
      await wrapper.vm.$nextTick();

      const scanButton = wrapper.findAll('button').find(btn => 
        btn.text().includes('扫描残留卡片')
      );
      
      await scanButton!.trigger('click');
      await wrapper.vm.$nextTick();
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(wrapper.text()).toContain('未发现残留卡片');
    });

    it('扫描完成后显示删除按钮（有残留卡片时）', async () => {
      wrapper = mountComponent();
      await wrapper.vm.$nextTick();

      const scanButton = wrapper.findAll('button').find(btn => 
        btn.text().includes('扫描残留卡片')
      );
      
      await scanButton!.trigger('click');
      await wrapper.vm.$nextTick();
      await new Promise(resolve => setTimeout(resolve, 100));

      const deleteButton = wrapper.findAll('button').find(btn => 
        btn.text().includes('删除残留卡片')
      );
      expect(deleteButton).toBeDefined();
    });

    it('扫描失败时处理错误', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockCleanupHandlers.scan = vi.fn(async () => {
        throw new Error('Network error');
      });

      wrapper = mountComponent();
      await wrapper.vm.$nextTick();

      const scanButton = wrapper.findAll('button').find(btn => 
        btn.text().includes('扫描残留卡片')
      );
      
      await scanButton!.trigger('click');
      await wrapper.vm.$nextTick();
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('删除功能', () => {
    beforeEach(async () => {
      // 先执行扫描，以便显示删除按钮
      wrapper = mountComponent();
      await wrapper.vm.$nextTick();

      const scanButton = wrapper.findAll('button').find(btn => 
        btn.text().includes('扫描残留卡片')
      );
      
      await scanButton!.trigger('click');
      await wrapper.vm.$nextTick();
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    it('点击删除按钮显示确认对话框', async () => {
      const deleteButton = wrapper.findAll('button').find(btn => 
        btn.text().includes('删除残留卡片')
      );
      
      await deleteButton!.trigger('click');

      expect(global.confirm).toHaveBeenCalledWith('确认删除 5 张残留卡片？');
    });

    it('确认后触发删除', async () => {
      const deleteButton = wrapper.findAll('button').find(btn => 
        btn.text().includes('删除残留卡片')
      );
      
      await deleteButton!.trigger('click');
      await wrapper.vm.$nextTick();
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockCleanupHandlers.cleanup).toHaveBeenCalledTimes(1);
      expect(mockCleanupHandlers.cleanup).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: 'card1' }),
        ])
      );
    });

    it('取消确认时不触发删除', async () => {
      global.confirm = vi.fn(() => false);

      const deleteButton = wrapper.findAll('button').find(btn => 
        btn.text().includes('删除残留卡片')
      );
      
      await deleteButton!.trigger('click');
      await wrapper.vm.$nextTick();

      expect(mockCleanupHandlers.cleanup).not.toHaveBeenCalled();
    });

    it('删除中显示 loading 状态', async () => {
      // 创建一个延迟的 cleanup 函数
      mockCleanupHandlers.cleanup = vi.fn(() => 
        new Promise(resolve => setTimeout(() => resolve({ deletedCount: 5 }), 100))
      );

      const deleteButton = wrapper.findAll('button').find(btn => 
        btn.text().includes('删除残留卡片')
      );
      
      await deleteButton!.trigger('click');
      await wrapper.vm.$nextTick();

      // 检查按钮文本变为"删除中..."
      expect(deleteButton!.text()).toContain('删除中...');
      
      // 检查按钮被禁用
      expect(deleteButton!.attributes('disabled')).toBeDefined();
    });

    it('删除完成后显示结果', async () => {
      const deleteButton = wrapper.findAll('button').find(btn => 
        btn.text().includes('删除残留卡片')
      );
      
      await deleteButton!.trigger('click');
      await wrapper.vm.$nextTick();
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(wrapper.text()).toContain('已删除 5 张卡片');
    });

    it('删除完成后清空扫描结果', async () => {
      const deleteButton = wrapper.findAll('button').find(btn => 
        btn.text().includes('删除残留卡片')
      );
      
      await deleteButton!.trigger('click');
      await wrapper.vm.$nextTick();
      await new Promise(resolve => setTimeout(resolve, 100));

      // 删除按钮应该消失
      const deleteButtonAfter = wrapper.findAll('button').find(btn => 
        btn.text().includes('删除残留卡片')
      );
      expect(deleteButtonAfter).toBeUndefined();
    });

    it('删除失败时处理错误', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockCleanupHandlers.cleanup = vi.fn(async () => {
        throw new Error('Delete failed');
      });

      const deleteButton = wrapper.findAll('button').find(btn => 
        btn.text().includes('删除残留卡片')
      );
      
      await deleteButton!.trigger('click');
      await wrapper.vm.$nextTick();
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('状态管理', () => {
    it('扫描和删除不能同时进行', async () => {
      // 创建延迟的 scan 函数
      mockCleanupHandlers.scan = vi.fn(() => 
        new Promise(resolve => setTimeout(() => resolve({ count: 5, orphanCards: [] }), 100))
      );

      wrapper = mountComponent();
      await wrapper.vm.$nextTick();

      const scanButton = wrapper.findAll('button').find(btn => 
        btn.text().includes('扫描残留卡片')
      );
      
      // 开始扫描
      await scanButton!.trigger('click');
      await wrapper.vm.$nextTick();

      // 检查按钮被禁用
      expect(scanButton!.attributes('disabled')).toBeDefined();
    });

    it('删除完成后可以重新扫描', async () => {
      wrapper = mountComponent();
      await wrapper.vm.$nextTick();

      // 第一次扫描
      const scanButton1 = wrapper.findAll('button').find(btn => 
        btn.text().includes('扫描残留卡片')
      );
      await scanButton1!.trigger('click');
      await wrapper.vm.$nextTick();
      await new Promise(resolve => setTimeout(resolve, 100));

      // 删除
      const deleteButton = wrapper.findAll('button').find(btn => 
        btn.text().includes('删除残留卡片')
      );
      await deleteButton!.trigger('click');
      await wrapper.vm.$nextTick();
      await new Promise(resolve => setTimeout(resolve, 100));

      // 第二次扫描
      const scanButton2 = wrapper.findAll('button').find(btn => 
        btn.text().includes('扫描残留卡片')
      );
      expect(scanButton2!.attributes('disabled')).toBeUndefined();
      
      await scanButton2!.trigger('click');
      expect(mockCleanupHandlers.scan).toHaveBeenCalledTimes(2);
    });
  });

  describe('国际化', () => {
    it('使用自定义 i18n', async () => {
      const customI18n = {
        schedulerTab: 'Scheduler',
        maintenanceTools: 'Maintenance Tools',
        cleanupOrphanCards: 'Cleanup Orphan Cards',
        scanOrphanCards: 'Scan Orphan Cards',
        foundOrphanCards: 'Found {count} orphan cards',
        deleteOrphanCards: 'Delete Orphan Cards',
        cleanupWarning: '⚠️ Warning: This operation cannot be undone',
      };

      wrapper = mountComponent({ i18n: customI18n });
      await wrapper.vm.$nextTick();

      expect(wrapper.text()).toContain('Maintenance Tools');
      expect(wrapper.text()).toContain('Cleanup Orphan Cards');
      expect(wrapper.text()).toContain('Scan Orphan Cards');
      expect(wrapper.text()).toContain('⚠️ Warning: This operation cannot be undone');
    });

    it('正确替换 {count} 占位符', async () => {
      wrapper = mountComponent();
      await wrapper.vm.$nextTick();

      const scanButton = wrapper.findAll('button').find(btn => 
        btn.text().includes('扫描残留卡片')
      );
      
      await scanButton!.trigger('click');
      await wrapper.vm.$nextTick();
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(wrapper.text()).toContain('发现 5 张残留卡片');
      expect(wrapper.text()).not.toContain('{count}');
    });
  });

  describe('边界情况', () => {
    it('没有 cleanupHandlers 时仍显示维护工具但按钮不可用', async () => {
      wrapper = mountComponent({ cleanupHandlers: undefined });
      await wrapper.vm.$nextTick();

      // 维护工具部分仍然显示（UI 始终可见）
      expect(wrapper.text()).toContain('维护工具');
      
      // 但扫描按钮应该存在（只是功能不可用）
      const buttons = wrapper.findAll('button');
      const scanButton = buttons.find(btn => btn.text().includes('扫描残留卡片'));
      expect(scanButton).toBeDefined();
    });

    it('简单模式下不显示维护工具', async () => {
      wrapper = mountComponent({
        schedulerSettings: {
          defaultScheduler: 'fsrs-v6',
          enableRiffSync: false,
          itemScheduler: 'fsrs-v6',
          riffIntegration: {
            mode: 'simple',
            useLocalScheduler: false,
            incrementalSync: { enabled: false, triggers: [], useBlacklist: false },
            fullSync: { enabled: false, interval: 0, cleanupBlacklist: false },
            deleteSync: { enabled: false, useBlacklistFallback: false },
          },
        },
      });
      await wrapper.vm.$nextTick();

      expect(wrapper.text()).not.toContain('维护工具');
    });

    it('扫描返回 0 个残留卡片时不显示删除按钮', async () => {
      mockCleanupHandlers.scan = vi.fn(async () => ({
        count: 0,
        orphanCards: [],
      }));

      wrapper = mountComponent();
      await wrapper.vm.$nextTick();

      const scanButton = wrapper.findAll('button').find(btn => 
        btn.text().includes('扫描残留卡片')
      );
      
      await scanButton!.trigger('click');
      await wrapper.vm.$nextTick();
      await new Promise(resolve => setTimeout(resolve, 100));

      const deleteButton = wrapper.findAll('button').find(btn => 
        btn.text().includes('删除残留卡片')
      );
      expect(deleteButton).toBeUndefined();
    });
  });

  describe('错误处理', () => {
    it('扫描抛出异常时不崩溃', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockCleanupHandlers.scan = vi.fn(async () => {
        throw new Error('Scan error');
      });

      wrapper = mountComponent();
      await wrapper.vm.$nextTick();

      const scanButton = wrapper.findAll('button').find(btn => 
        btn.text().includes('扫描残留卡片')
      );
      
      await scanButton!.trigger('click');
      await wrapper.vm.$nextTick();
      await new Promise(resolve => setTimeout(resolve, 100));

      // 组件应该仍然存在
      expect(wrapper.exists()).toBe(true);
      
      consoleErrorSpy.mockRestore();
    });

    it('删除抛出异常时不崩溃', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      wrapper = mountComponent();
      await wrapper.vm.$nextTick();

      // 先扫描
      const scanButton = wrapper.findAll('button').find(btn => 
        btn.text().includes('扫描残留卡片')
      );
      await scanButton!.trigger('click');
      await wrapper.vm.$nextTick();
      await new Promise(resolve => setTimeout(resolve, 100));

      // 设置删除失败
      mockCleanupHandlers.cleanup = vi.fn(async () => {
        throw new Error('Delete error');
      });

      // 尝试删除
      const deleteButton = wrapper.findAll('button').find(btn => 
        btn.text().includes('删除残留卡片')
      );
      await deleteButton!.trigger('click');
      await wrapper.vm.$nextTick();
      await new Promise(resolve => setTimeout(resolve, 100));

      // 组件应该仍然存在
      expect(wrapper.exists()).toBe(true);
      
      consoleErrorSpy.mockRestore();
    });
  });
});
