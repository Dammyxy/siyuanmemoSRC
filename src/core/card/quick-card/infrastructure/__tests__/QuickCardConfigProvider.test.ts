import { describe, it, expect, vi } from 'vitest';
import {
  DefaultQuickCardConfigProvider,
  PluginQuickCardConfigProvider,
  getHiddenContentTypes,
} from '../QuickCardConfigProvider';

describe('QuickCardConfigProvider', () => {
  describe('DefaultQuickCardConfigProvider', () => {
    it('should return default config', () => {
      const provider = new DefaultQuickCardConfigProvider();
      const config = provider.getConfig();

      expect(config.enabled).toBe(true);
      expect(config.enabledSymbols.basic).toBe(true);
      expect(config.enabledSymbols.concept).toBe(true);
      expect(config.enabledSymbols.descriptor).toBe(true);
      expect(config.enabledSymbols.cloze).toBe(true);
      expect(config.enabledSymbols.multiLine).toBe(true);
      expect(config.descriptorUseXiuyuan).toBe(false);
    });

    it('should return consistent config across multiple calls', () => {
      const provider = new DefaultQuickCardConfigProvider();
      const config1 = provider.getConfig();
      const config2 = provider.getConfig();

      expect(config1).toEqual(config2);
    });
  });

  describe('PluginQuickCardConfigProvider', () => {
    it('should return config from plugin settings', () => {
      const mockSettings = {
        quickCard: {
          enabled: true,
          enabledSymbols: {
            basic: true,
            concept: false,
            descriptor: true,
            cloze: true,
            multiLine: false,
          },
          debounceDelay: {
            quick: 500,
            list: 3000,
          },
          descriptorUseXiuyuan: true,
        },
      };

      const getSettings = vi.fn(() => mockSettings);
      const provider = new PluginQuickCardConfigProvider(getSettings);
      const config = provider.getConfig();

      expect(config.enabled).toBe(true);
      expect(config.enabledSymbols.concept).toBe(false);
      expect(config.enabledSymbols.multiLine).toBe(false);
      expect(config.descriptorUseXiuyuan).toBe(true);
      expect(config.debounceDelay.quick).toBe(500);
    });

    it('should return default config when quickCard settings not found', () => {
      const mockSettings = {};
      const getSettings = vi.fn(() => mockSettings);
      const provider = new PluginQuickCardConfigProvider(getSettings);
      const config = provider.getConfig();

      expect(config.enabled).toBe(true);
      expect(config.descriptorUseXiuyuan).toBe(false);
    });

    it('should return default config when getSettings throws error', () => {
      const getSettings = vi.fn(() => {
        throw new Error('Settings not available');
      });
      const provider = new PluginQuickCardConfigProvider(getSettings);
      const config = provider.getConfig();

      expect(config.enabled).toBe(true);
      expect(config.descriptorUseXiuyuan).toBe(false);
    });

    it('should return default config when settings is null', () => {
      const getSettings = vi.fn(() => null);
      const provider = new PluginQuickCardConfigProvider(getSettings);
      const config = provider.getConfig();

      expect(config.enabled).toBe(true);
      expect(config.descriptorUseXiuyuan).toBe(false);
    });
  });

  describe('getHiddenContentTypes', () => {
    it('should return ["mark"] for concept cards', () => {
      const types = getHiddenContentTypes('concept');
      expect(types).toEqual(['mark']);
    });

    it('should return ["mark"] for cloze cards', () => {
      const types = getHiddenContentTypes('cloze');
      expect(types).toEqual(['mark']);
    });

    it('should return ["list"] for multiLine cards', () => {
      const types = getHiddenContentTypes('multiLine');
      expect(types).toEqual(['list']);
    });

    it('should return [] for descriptor cards', () => {
      const types = getHiddenContentTypes('descriptor');
      expect(types).toEqual([]);
    });

    it('should return [] for basic cards', () => {
      const types = getHiddenContentTypes('basic');
      expect(types).toEqual([]);
    });

    it('should return [] for unknown card types', () => {
      const types = getHiddenContentTypes('unknown');
      expect(types).toEqual([]);
    });
  });
});
