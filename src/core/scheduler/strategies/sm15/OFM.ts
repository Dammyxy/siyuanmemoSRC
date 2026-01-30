/**
 * SM-15 OFM (Optimum Factor Matrix)
 *
 * 管理 O-Factor 矩阵
 * 基于 MIT 许可证的原始 JavaScript 实现
 */

import { exponentialRegression, fixedPointPowerLawRegression, linearRegression, powerLawModel } from './regression';
import { SM15_CONSTANTS } from './types';
import type { SM15 } from './SM15';
import type { RegressionModel } from './types';

const { RANGE_AF, RANGE_REPETITION, MIN_AF, NOTCH_AF } = SM15_CONSTANTS;

/**
 * 辅助函数：A-Factor 索引 → A-Factor 值
 */
function afFromIndex(a: number): number {
    return a * NOTCH_AF + MIN_AF;
}

/**
 * 辅助函数：重复次数索引 → 重复次数值
 */
function repFromIndex(r: number): number {
    return r + 1;
}

/**
 * Optimal Factor Matrix 类
 *
 * 管理最优间隔矩阵
 * 跟踪不同 (repetition, afIndex) 组合的最优间隔
 */
export class OFM {
    private sm: SM15;
    private _ofm: ((a: number) => RegressionModel) | null = null;
    private _ofm0: ((a: number) => number) | null = null;

    constructor(sm: SM15) {
        this.sm = sm;
        this.update();
    }

    /**
     * 更新 O-Factor 矩阵
     *
     * 根据当前 forgettingCurves 数据重新计算所有 O-Factor
     */
    update(): void {
        // 计算衰减因子
        const dfs: number[] = [];
        for (let a = 0; a < RANGE_AF; a++) {
            // 使用固定点幂律回归拟合
            const points: Point[] = [];
            for (let r = 1; r < RANGE_REPETITION; r++) {
                const rf = this.sm.rfm.rf(r, a);
                points.push([repFromIndex(r), rf]);
            }
            const model = fixedPointPowerLawRegression(points, [repFromIndex(1), afFromIndex(a)]);
            dfs[a] = model.b; // 存储衰减指数
        }

        // 拟合衰减曲线
        const decay = linearRegression(
            Array.from({ length: RANGE_AF }, (_, i) => [i, dfs[i]])
        );

        // 创建 O-Factor 函数
        this._ofm = (a: number) => {
            const af = afFromIndex(a);
            const b = decay.y(a);
            const model = powerLawModel(af / Math.pow(repFromIndex(1), b), b);
            return model;
        };

        // 创建初始 O-Factor 函数（repetition = 0）
        const points0: Point[] = [];
        for (let a = 0; a < RANGE_AF; a++) {
            points0.push([a, this.sm.rfm.rf(0, a)]);
        }
        const ofm0 = exponentialRegression(points0);
        this._ofm0 = (a: number) => ofm0.y(a);
    }

    /**
     * 获取 O-Factor
     *
     * @param repetition 重复次数
     * @param afIndex A-Factor 索引
     * @returns O-Factor 值
     */
    of(repetition: number, afIndex: number): number {
        if (repetition === 0) {
            // 新卡片
            return this._ofm0 ? this._ofm0(afIndex) : 1;
        } else {
            // 复习卡片
            return this._ofm ? this._ofm(afIndex).y(repetition) : 1;
        }
    }

    /**
     * 根据 O-Factor 反向查找 A-Factor 索引
     *
     * @param repetition 重复次数
     * @param of O-Factor 值
     * @returns A-Factor 索引
     */
    af(repetition: number, of: number): number {
        // 遍历所有 A-Factor，找到最接近 of 值的索引
        let bestIndex = 0;
        let minDiff = Math.abs(this.of(repetition, 0) - of);

        for (let a = 1; a < RANGE_AF; a++) {
            const diff = Math.abs(this.of(repetition, a) - of);
            if (diff < minDiff) {
                minDiff = diff;
                bestIndex = a;
            }
        }

        return bestIndex;
    }
}

/**
 * RFM (Retrievability Factor Matrix) 类
 *
 * 管理可提取性因子矩阵
 * 用于计算特定 (repetition, afIndex) 组合的 RF 值
 */
export class RFM {
    private sm: SM15;

    constructor(sm: SM15) {
        this.sm = sm;
    }

    /**
     * 获取可提取性因子
     *
     * RF = 使用因子，用于计算特定 (repetition, afIndex) 组合下的使用因子
     *
     * @param repetition 重复次数
     * @param afIndex A-Factor 索引
     * @returns RF 值
     */
    rf(repetition: number, afIndex: number): number {
        const curve = this.sm.forgettingCurves.curves[repetition][afIndex];
        // 获取对应 requestedFI 的使用因子
        return curve.uf(100 - this.sm.requestedFI);
    }
}
