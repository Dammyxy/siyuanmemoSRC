/**
 * SM-15 Main Class
 *
 * SuperMemo 15 核心算法
 * 基于 MIT 许可证的原始 JavaScript 实现
 *
 * 移除了队列管理功能（addItem, nextItem），
 * 只保留核心调度算法（answer, _update）
 */

import { ForgettingCurves } from './ForgettingCurves';
import { FI_G } from './FI_G';
import { OFM, RFM } from './OFM';
import { SM15Item } from './SM15Item';
import { SM15_CONSTANTS } from './types';
import type { SM15Data } from './types';

/**
 * SM-15 核心类
 *
 * 协调所有组件，提供卡片复习调度功能
 */
export class SM15 {
    // 配置
    public requestedFI: number;      // 请求的遗忘指数 (0-100)
    public intervalBase: number;     // 基础间隔（毫秒）

    // 核心组件
    public fi_g: FI_G;              // FI-Grade 关系
    public forgettingCurves: ForgettingCurves; // 遗忘曲线集合
    public rfm: RFM;                // Retrievability Factor Matrix
    public ofm: OFM;                // Optimal Factor Matrix

    constructor(requestedFI: number = 10, intervalBase: number = 1 * 24 * 60 * 60 * 1000) {
        this.requestedFI = requestedFI;
        this.intervalBase = intervalBase;

        // 初始化组件
        this.fi_g = new FI_G(this);
        this.forgettingCurves = new ForgettingCurves(this);
        this.rfm = new RFM(this);
        this.ofm = new OFM(this);
    }

    /**
     * 处理卡片评分
     *
     * @param grade 评分 (1-5)
     * @param item SM15Item 实例
     * @param now 当前时间
     */
    answer(grade: number, item: SM15Item, now: Date = new Date()): void {
        // 更新遗忘曲线和 FI_G
        if (item.repetition >= 0) {
            this.forgettingCurves.registerPoint(grade, item, now);
            this.ofm.update();
            this.fi_g.update(grade, item, now);
        }

        // 处理评分
        item.answer(grade, now);
    }

    /**
     * 序列化数据
     *
     * 用于保存和加载状态
     */
    data(): SM15Data {
        return {
            requestedFI: this.requestedFI,
            intervalBase: this.intervalBase,
            fi_g: this.fi_g.data(),
            forgettingCurves: this.forgettingCurves.data(),
        };
    }

    /**
     * 加载 SM-15
     *
     * @param data 序列化的数据
     */
    static load(data: SM15Data): SM15 {
        const sm = new SM15(data.requestedFI, data.intervalBase);
        sm.fi_g = FI_G.load(sm, data.fi_g);
        sm.forgettingCurves = ForgettingCurves.load(sm, data.forgettingCurves);
        sm.ofm.update();
        return sm;
    }
}

/**
 * SM-15 工厂函数
 *
 * 创建默认配置的 SM-15 实例
 */
export function createDefaultSM15(): SM15 {
    return new SM15(10, 1 * 24 * 60 * 60 * 1000); // requestedFI=10, intervalBase=1天
}
