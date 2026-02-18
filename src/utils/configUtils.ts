/**
 * 配置工具函数
 * 
 * 提供插件配置的读取和保存功能
 */

import type { PluginSettings, FSRSParameters } from '@/types/settings';
import type { Plugin } from 'siyuan';

/**
 * 获取dayStartHour配置
 * 
 * @param plugin - 插件实例
 * @returns dayStartHour值（0-23），默认4
 */
export function getDayStartHour(plugin: Plugin): number {
  try {
    const settings = (plugin as any).storage?.getSettings() as PluginSettings | undefined;
    const dayStartHour = settings?.fsrs?.dayStartHour;
    
    if (dayStartHour === undefined) {
      // 未配置，使用默认值
      return 4;
    }
    
    return validateDayStartHour(dayStartHour);
  } catch (error) {
    console.error('[SiYuanMemo][Config] Failed to load dayStartHour:', error);
    return 4;  // 使用默认值
  }
}

/**
 * 保存dayStartHour配置
 * 
 * @param plugin - 插件实例
 * @param dayStartHour - 新的dayStartHour值（0-23）
 */
export async function saveDayStartHour(plugin: Plugin, dayStartHour: number): Promise<void> {
  // 验证范围
  const validated = validateDayStartHour(dayStartHour);
  if (validated !== dayStartHour) {
    throw new Error(`Invalid dayStartHour: ${dayStartHour}, must be 0-23`);
  }
  
  try {
    const storage = (plugin as any).storage;
    if (!storage) {
      throw new Error('Storage not initialized');
    }
    
    const settings = storage.getSettings() as PluginSettings;
    const newSettings: PluginSettings = {
      ...settings,
      fsrs: {
        ...settings.fsrs,
        dayStartHour: validated,
      },
    };
    
    await storage.saveSettings(newSettings);
    console.log('[SiYuanMemo][Config] Saved dayStartHour:', validated);
  } catch (error) {
    console.error('[SiYuanMemo][Config] Failed to save dayStartHour:', error);
    throw error;
  }
}

/**
 * 验证dayStartHour值
 * 
 * @param value - 待验证的值
 * @returns 验证后的值（如果无效则返回默认值4）
 */
function validateDayStartHour(value: any): number {
  // 1. 检查类型和范围
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 23
  ) {
    console.warn('[SiYuanMemo][Config] Invalid dayStartHour:', value, 'using default 4');
    return 4;  // 使用默认值
  }
  
  return value;
}
