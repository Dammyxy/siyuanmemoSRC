/**
 * SM-15 Forgetting Curve
 *
 * 单条遗忘曲线，用于跟踪特定复习次数和 A-Factor 的遗忘模式
 * 基于 MIT 许可证的原始 JavaScript 实现
 */

import { exponentialRegression } from './regression';
import { SM15_CONSTANTS } from './types';
import type { Point, RegressionModel } from './types';

const { CURVE_MAX_POINTS, FORGOTTEN, REMEMBERED, THRESHOLD_RECALL } = SM15_CONSTANTS;

/**
 * 遗忘曲线类
 *
 * 跟踪特定 (repetition, afIndex) 组合的遗忘数据
 * 并使用指数回归拟合曲线
 */
export class ForgettingCurve {
    public points: Point[];
    private _curve: RegressionModel | null = null;

    constructor(points: Point[] = []) {
        this.points = points;
    }

    /**
     * 注册复习数据点
     *
     * @param grade 评分 (1-5)
     * @param uf 使用因子 (使用间隔 / 最优间隔)
     */
    registerPoint(grade: number, uf: number): void {
        const isRemembered = grade >= THRESHOLD_RECALL;
        const retention = isRemembered ? REMEMBERED : FORGOTTEN;

        this.points.push([uf, retention]);
        // 限制点数
        this.points = this.points.slice(Math.max(0, this.points.length - CURVE_MAX_POINTS));

        // 清除缓存的回归结果
        this._curve = null;
    }

    /**
     * 计算保持率
     *
     * @param uf 使用因子
     * @returns 保持率 (0-100)
     */
    retention(uf: number): number {
        if (this._curve == null) {
            this._curve = exponentialRegression(this.points);
        }

        const retention = this._curve.y(uf);
        return Math.max(FORGOTTEN, Math.min(retention, REMEMBERED)) - FORGOTTEN;
    }

    /**
     * 计算使用因子
     *
     * @param retention 保持率 (0-100)
     * @returns 使用因子
     */
    uf(retention: number): number {
        if (this._curve == null) {
            this._curve = exponentialRegression(this.points);
        }

        const uf = this._curve.x(retention + FORGOTTEN);
        return Math.max(0, uf);
    }

    /**
     * 序列化数据
     */
    data(): Point[] {
        return this.points;
    }
}
