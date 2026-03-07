/**
 * SM-15 Item
 *
 * 单个卡片的 SM-15 状态管理
 * 基于 MIT 许可证的原始 JavaScript 实现
 */

import { SM15_CONSTANTS } from './types';
import type { SM15 } from './SM15';
import type { SM15ItemData } from './types';

const {
    RANGE_AF,
    RANGE_REPETITION,
    MIN_AF,
    NOTCH_AF,
    MAX_AF,
    THRESHOLD_RECALL,
    MAX_AFS_COUNT,
} = SM15_CONSTANTS;

/**
 * 求和函数（内联以避免循环依赖）
 */
function sum(values: number[]): number {
    return values.reduce((a, b) => a + b, 0);
}

/**
 * SM-15 卡片类
 *
 * 管理:
 * - A-Factor（难度因子）
 * - O-Factor（最优因子）
 * - 复习历史
 * - 间隔计算
 */
export class SM15Item {
    public sm: SM15;
    public value: string;              // 卡片标识
    public repetition: number;         // 重复次数 (-1 = 新卡片)
    public lapse: number;              // 遗忘次数
    public of: number;                 // O-Factor
    public optimumInterval: number;    // 最优间隔（毫秒）
    public dueDate: Date;             // 下次复习时间
    public previousDate: Date | null;  // 上次复习时间
    public _afs: number[] = [];         // A-Factor 历史

    constructor(sm: SM15, value: string) {
        this.sm = sm;
        this.value = value;
        this.repetition = -1;
        this.lapse = 0;
        this.of = 1;
        this.optimumInterval = sm.intervalBase;
        this.dueDate = new Date(0);
        this.previousDate = null;
        this._afs = [];
    }

    /**
     * 获取实际间隔（毫秒）
     *
     * @param now 当前时间
     * @returns 间隔（毫秒）
     */
    interval(now: Date = new Date()): number {
        if (this.previousDate == null) {
            return this.sm.intervalBase;
        }
        return now.getTime() - this.previousDate.getTime();
    }

    /**
     * 计算使用因子
     *
     * UF = 实际间隔 / (最优间隔 / O-Factor)
     *
     * @param now 当前时间
     * @returns 使用因子
     */
    uf(now: Date = new Date()): number {
        const actualInterval = this.interval(now);
        return actualInterval / (this.optimumInterval / this.of);
    }

    /**
     * 获取当前 A-Factor
     *
     * @param value 可选值（设置 A-Factor）
     * @returns A-Factor 值 (1.2-6.0)
     */
    af(value?: number): number {
        if (value === undefined) {
            return this._af;
        }

        // 量化到步长
        const a = Math.round((value - MIN_AF) / NOTCH_AF);
        this._af = Math.max(MIN_AF, Math.min(MAX_AF, MIN_AF + a * NOTCH_AF));
        return this._af;
    }

    /**
     * 获取 A-Factor 索引
     *
     * @returns A-Factor 索引 (0-19)
     */
    afIndex(): number {
        const afs = Array.from({ length: RANGE_AF }, (_, i) =>
            MIN_AF + i * NOTCH_AF
        );

        // 找到最接近当前 A-Factor 的索引
        return afs.reduce((bestIndex, af, i) => {
            if (Math.abs(this.af() - af) < Math.abs(this.af() - afs[bestIndex])) {
                return i;
            }
            return bestIndex;
        }, 0);
    }

    /**
     * 获取内部 A-Factor
     */
    private get _af(): number {
        // 如果没有历史，返回最小值
        if (this._afs.length === 0) {
            return MIN_AF;
        }
        // 返回加权平均值
        const sumWeighted = sum(this._afs.map((a, i) => a * (i + 1)));
        const sumWeights = sum(this._afs.map((_, i) => i + 1));
        return sumWeighted / sumWeights;
    }

    /**
     * 设置 A-Factor
     */
    private set _af(value: number) {
        this._afs.push(value);
        // 限制历史长度
        this._afs = this._afs.slice(Math.max(0, this._afs.length - MAX_AFS_COUNT));
    }

    /**
     * 更新 A-Factor
     *
     * @param grade 评分
     * @param now 当前时间
     */
    _updateAF(grade: number, now: Date): void {
        // 计算预期 FI
        const estimatedFI = Math.max(1, this.sm.fi_g.fi(grade));

        // 计算校正后的 UF
        const correctedUF = this.uf(now) * (this.sm.requestedFI / estimatedFI);

        // 估算新 A-Factor
        let estimatedAF: number;
        if (this.repetition > 0) {
            estimatedAF = this.sm.ofm.af(this.repetition, correctedUF);
        } else {
            estimatedAF = Math.max(MIN_AF, Math.min(MAX_AF, correctedUF));
        }

        // 保存到历史
        this._af = estimatedAF;
    }

    /**
     * 计算下次复习时间
     *
     * @param now 当前时间
     */
    _I(now: Date): void {
        // 获取 O-Factor
        const of_ = this.sm.ofm.of(this.repetition, this.repetition === 0 ? this.lapse : this.afIndex());

        // 更新 O-Factor
        this.of = Math.max(1, (of_ - 1) * (this.interval(now) / this.optimumInterval) + 1);

        // 更新最优间隔
        this.optimumInterval = Math.round(this.optimumInterval * this.of);

        // 设置时间
        this.previousDate = now;
        this.dueDate = new Date(now.getTime() + this.optimumInterval);
    }

    /**
     * 处理评分
     *
     * @param grade 评分 (1-5)
     * @param now 当前时间
     */
    answer(grade: number, now: Date = new Date()): void {
        // 更新 A-Factor
        if (this.repetition >= 0) {
            this._updateAF(grade, now);
        }

        // 根据评分决定下一步
        if (grade >= THRESHOLD_RECALL) {
            // 记住了
            if (this.repetition < (RANGE_REPETITION - 1)) {
                this.repetition++;
            }
            this._I(now);
        } else {
            // 遗忘了
            if (this.lapse < (RANGE_AF - 1)) {
                this.lapse++;
            }
            this.optimumInterval = this.sm.intervalBase;
            this.previousDate = null;
            this.dueDate = now;
            this.repetition = -1;
        }
    }

    /**
     * 序列化数据
     */
    data(): SM15ItemData {
        return {
            value: this.value,
            repetition: this.repetition,
            lapse: this.lapse,
            of: this.of,
            optimumInterval: this.optimumInterval,
            dueDate: this.dueDate,
            previousDate: this.previousDate,
            _afs: this._afs,
        };
    }

    /**
     * 加载 SM15Item
     *
     * @param sm SM15 实例
     * @param data 序列化的数据
     */
    static load(sm: SM15, data: SM15ItemData): SM15Item {
        const item = new SM15Item(sm, data.value);
        Object.assign(item, data);
        item.dueDate = new Date(item.dueDate);
        if (item.previousDate != null) {
            item.previousDate = new Date(item.previousDate);
        }
        return item;
    }
}
