/**
 * SM-15 Forgetting Curves
 *
 * 管理 400 条遗忘曲线 (20 repetition × 20 A-Factor)
 * 基于 MIT 许可证的原始 JavaScript 实现
 */

import { ForgettingCurve } from './ForgettingCurve';
import { SM15_CONSTANTS } from './types';
import type { SM15 } from './SM15';
import type { SM15Item } from './SM15Item';
import type { Point } from './types';

const { RANGE_REPETITION, RANGE_AF, MIN_AF, NOTCH_AF, REMEMBERED } = SM15_CONSTANTS;

/**
 * 遗忘曲线集合
 *
 * curves[repetition][afIndex] 表示特定复习次数和 A-Factor 索引的遗忘曲线
 */
export class ForgettingCurves {
    public readonly curves: ForgettingCurve[][];

    constructor(sm: SM15, points?: Point[][][]) {
        this.curves = this._initializeCurves(sm, points);
    }

    /**
     * 初始化 400 条遗忘曲线 (20 × 20)
     */
    private _initializeCurves(sm: SM15, points?: Point[][][]): ForgettingCurve[][] {
        const curves: ForgettingCurve[][] = [];

        for (let r = 0; r < RANGE_REPETITION; r++) {
            curves[r] = [];
            for (let a = 0; a < RANGE_AF; a++) {
                let partialPoints: Point[];

                if (points && points[r] && points[r][a]) {
                    // 从加载数据恢复
                    partialPoints = points[r][a];
                } else {
                    // 创建默认曲线
                    partialPoints = this._createDefaultCurve(sm, r, a);
                }

                curves[r][a] = new ForgettingCurve(partialPoints);
            }
        }

        return curves;
    }

    /**
     * 创建默认遗忘曲线
     *
     * @param r 重复次数
     * @param a A-Factor 索引
     * @returns 默认点集
     */
    private _createDefaultCurve(sm: SM15, r: number, a: number): Point[] {
        const points: Point[] = [];

        if (r > 0) {
            // 重复次数 > 0: 使用衰减指数模型
            const exponent = -(r + 1) / 200;
            for (let i = 0; i <= 20; i++) {
                const af = MIN_AF + NOTCH_AF * i;
                const value = Math.min(
                    REMEMBERED,
                    Math.exp(exponent * (i - a * Math.sqrt(2 / (r + 1)))) *
                    (REMEMBERED - sm.requestedFI)
                );
                points.push([af, value]);
            }
        } else {
            // 新卡片 (r = 0): 使用不同的初始模型
            const exponent = -1 / (10 + 1 * (a + 1));
            for (let i = 0; i <= 20; i++) {
                const af = MIN_AF + NOTCH_AF * i;
                const value = Math.min(
                    REMEMBERED,
                    Math.exp(exponent * (i - Math.pow(a, 0.6))) *
                    (REMEMBERED - sm.requestedFI)
                );
                points.push([af, value]);
            }
        }

        // 添加默认点 (0, REMEMBERED)
        points.unshift([0, REMEMBERED]);

        return points;
    }

    /**
     * 注册复习数据
     *
     * @param grade 评分 (1-5)
     * @param item SM15Item 实例
     * @param now 当前时间
     */
    registerPoint(grade: number, item: SM15Item, now: Date): void {
        // 计算 A-Factor 索引
        const afIndex = item.repetition > 0 ? item.afIndex() : item.lapse;

        // 注册到对应的曲线
        this.curves[item.repetition][afIndex].registerPoint(grade, item.uf(now));
    }

    /**
     * 序列化数据
     */
    data(): Point[][][] {
        return this.curves.map((repRow) =>
            repRow.map((curve) => curve.data())
        );
    }

    /**
     * 加载 ForgettingCurves
     *
     * @param sm SM15 实例
     * @param data 序列化的数据
     */
    static load(sm: SM15, data: Point[][][]): ForgettingCurves {
        return new ForgettingCurves(sm, data);
    }
}
