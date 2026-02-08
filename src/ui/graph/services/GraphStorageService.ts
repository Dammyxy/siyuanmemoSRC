/**
 * GraphStorageService - 配置持久化服务
 * 
 * 负责图谱配置的保存和加载，使用 localStorage 进行持久化。
 * 包括方向选择、窗口配置等用户偏好设置。
 * 
 * Requirements: 4.6, 6.5, 13.1, 13.2, 13.3, 13.4
 */

import type { WindowConfig, AssociationType } from '../types/graph';

/**
 * 存储键常量
 */
const STORAGE_KEYS = {
    DIRECTIONS: 'neural-roam-graph-directions',
    WINDOW_SIZE: 'neural-roam-graph-window-size',
    WINDOW_POSITION: 'neural-roam-graph-window-position',
    WINDOW_VISIBLE: 'neural-roam-graph-window-visible',
    WINDOW_CONFIG: 'neural-roam-graph-window-config', // 统一的窗口配置
} as const;

/**
 * 图谱配置存储服务类
 */
export class GraphStorageService {
    /**
     * 保存方向选择
     * 
     * @param directions 选中的方向集合
     * Requirements: 4.6, 13.1
     */
    saveDirections(directions: Set<string>): void {
        try {
            const directionsArray = Array.from(directions);
            localStorage.setItem(STORAGE_KEYS.DIRECTIONS, JSON.stringify(directionsArray));
            console.log('[GraphStorageService] Directions saved:', directionsArray);
        } catch (error) {
            this.handleStorageError('saveDirections', error);
        }
    }
    
    /**
     * 加载方向选择
     * 
     * @returns 选中的方向集合，如果没有保存则返回默认值
     * Requirements: 4.6, 13.1
     */
    loadDirections(): Set<string> {
        try {
            const stored = localStorage.getItem(STORAGE_KEYS.DIRECTIONS);
            if (stored) {
                const directionsArray = JSON.parse(stored) as string[];
                const directions = new Set(directionsArray);
                console.log('[GraphStorageService] Directions loaded:', directionsArray);
                return directions;
            }
        } catch (error) {
            this.handleStorageError('loadDirections', error);
        }
        
        // 返回默认值：所有方向
        return new Set(['ref', 'context', 'tag', 'sibling']);
    }
    
    /**
     * 保存窗口配置
     * 
     * @param config 窗口配置
     * Requirements: 6.5, 13.2, 13.3, 13.4
     */
    saveWindowConfig(config: WindowConfig): void {
        try {
            localStorage.setItem(STORAGE_KEYS.WINDOW_CONFIG, JSON.stringify(config));
            console.log('[GraphStorageService] Window config saved:', config);
        } catch (error) {
            this.handleStorageError('saveWindowConfig', error);
        }
    }
    
    /**
     * 加载窗口配置
     * 
     * @returns 窗口配置，如果没有保存则返回 null
     * Requirements: 6.5, 13.2, 13.3, 13.4
     */
    loadWindowConfig(): WindowConfig | null {
        try {
            const stored = localStorage.getItem(STORAGE_KEYS.WINDOW_CONFIG);
            if (stored) {
                const config = JSON.parse(stored) as WindowConfig;
                console.log('[GraphStorageService] Window config loaded:', config);
                return config;
            }
        } catch (error) {
            this.handleStorageError('loadWindowConfig', error);
        }
        
        return null;
    }
    
    /**
     * 保存窗口大小
     * 
     * @param size 窗口大小
     * @deprecated 使用 saveWindowConfig 代替
     */
    saveWindowSize(size: { width: number; height: number }): void {
        try {
            localStorage.setItem(STORAGE_KEYS.WINDOW_SIZE, JSON.stringify(size));
            console.log('[GraphStorageService] Window size saved:', size);
        } catch (error) {
            this.handleStorageError('saveWindowSize', error);
        }
    }
    
    /**
     * 加载窗口大小
     * 
     * @returns 窗口大小，如果没有保存则返回默认值
     * @deprecated 使用 loadWindowConfig 代替
     */
    loadWindowSize(): { width: number; height: number } {
        try {
            const stored = localStorage.getItem(STORAGE_KEYS.WINDOW_SIZE);
            if (stored) {
                const size = JSON.parse(stored);
                console.log('[GraphStorageService] Window size loaded:', size);
                return size;
            }
        } catch (error) {
            this.handleStorageError('loadWindowSize', error);
        }
        
        // 返回默认值
        return { width: 800, height: 600 };
    }
    
    /**
     * 保存窗口位置
     * 
     * @param position 窗口位置
     * @deprecated 使用 saveWindowConfig 代替
     */
    saveWindowPosition(position: { x: number; y: number }): void {
        try {
            localStorage.setItem(STORAGE_KEYS.WINDOW_POSITION, JSON.stringify(position));
            console.log('[GraphStorageService] Window position saved:', position);
        } catch (error) {
            this.handleStorageError('saveWindowPosition', error);
        }
    }
    
    /**
     * 加载窗口位置
     * 
     * @returns 窗口位置，如果没有保存则返回默认值
     * @deprecated 使用 loadWindowConfig 代替
     */
    loadWindowPosition(): { x: number; y: number } {
        try {
            const stored = localStorage.getItem(STORAGE_KEYS.WINDOW_POSITION);
            if (stored) {
                const position = JSON.parse(stored);
                console.log('[GraphStorageService] Window position loaded:', position);
                return position;
            }
        } catch (error) {
            this.handleStorageError('loadWindowPosition', error);
        }
        
        // 返回默认值（居中）
        return { x: 100, y: 100 };
    }
    
    /**
     * 保存窗口可见性
     * 
     * @param visible 是否可见
     */
    saveWindowVisible(visible: boolean): void {
        try {
            localStorage.setItem(STORAGE_KEYS.WINDOW_VISIBLE, JSON.stringify(visible));
            console.log('[GraphStorageService] Window visible saved:', visible);
        } catch (error) {
            this.handleStorageError('saveWindowVisible', error);
        }
    }
    
    /**
     * 加载窗口可见性
     * 
     * @returns 是否可见，如果没有保存则返回 false
     */
    loadWindowVisible(): boolean {
        try {
            const stored = localStorage.getItem(STORAGE_KEYS.WINDOW_VISIBLE);
            if (stored) {
                const visible = JSON.parse(stored);
                console.log('[GraphStorageService] Window visible loaded:', visible);
                return visible;
            }
        } catch (error) {
            this.handleStorageError('loadWindowVisible', error);
        }
        
        return false;
    }
    
    /**
     * 清空所有配置
     */
    clearAll(): void {
        try {
            Object.values(STORAGE_KEYS).forEach(key => {
                localStorage.removeItem(key);
            });
            console.log('[GraphStorageService] All config cleared');
        } catch (error) {
            this.handleStorageError('clearAll', error);
        }
    }
    
    /**
     * 获取存储使用情况
     * 
     * @returns 存储使用情况（字节）
     */
    getStorageUsage(): number {
        try {
            let totalSize = 0;
            Object.values(STORAGE_KEYS).forEach(key => {
                const value = localStorage.getItem(key);
                if (value) {
                    totalSize += value.length * 2; // UTF-16 编码，每个字符 2 字节
                }
            });
            return totalSize;
        } catch (error) {
            this.handleStorageError('getStorageUsage', error);
            return 0;
        }
    }
    
    // ========================================================================
    // 私有辅助方法
    // ========================================================================
    
    /**
     * 处理存储错误
     * 
     * @param operation 操作名称
     * @param error 错误对象
     * @private
     */
    private handleStorageError(operation: string, error: unknown): void {
        console.error(`[GraphStorageService] ${operation} failed:`, error);
        
        // 检查是否是配额超出错误
        if (error instanceof Error) {
            if (error.name === 'QuotaExceededError' || error.message.includes('quota')) {
                console.warn('[GraphStorageService] localStorage quota exceeded');
                // 可以在这里触发清理旧数据的逻辑
            } else if (error.name === 'SecurityError') {
                console.warn('[GraphStorageService] localStorage access denied (private mode?)');
            }
        }
    }
}

/**
 * 单例实例
 */
export const graphStorageService = new GraphStorageService();
