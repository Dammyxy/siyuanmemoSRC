/**
 * SM-15 Regression Algorithms
 *
 * 回归算法集合，用于拟合遗忘曲线
 * 基于 MIT 许可证的原始 JavaScript 实现
 *
 * @author Kazuaki Tanida (原始实现)
 * @module SM-15 Regression
 */

import type { Point, RegressionModel, RegressionResult } from './types';

/**
 * 求和函数
 */
function sum(values: number[]): number {
    return values.reduce((a, b) => a + b, 0);
}

/**
 * 均方误差 (MSE)
 */
function mse(y: (x: number) => number, points: Point[]): number {
    const errors = points.map(([x, _]) => Math.pow(y(x) - points[0][1], 2));
    return sum(errors) / points.length;
}

/**
 * 计算 R² (决定系数)
 *
 * @param points 数据点
 * @param predictFn 预测函数
 * @returns R² 值 (0-1)
 */
function calculateR2(
    points: Point[],
    predictFn: (x: number) => number
): number {
    if (points.length === 0) return 0;

    // 计算 y 的平均值
    const yMean = sum(points.map(([, y]) => y)) / points.length;

    // 计算 SS_tot (总平方和)
    const ssTot = sum(points.map(([, y]) => {
        const diff = y - yMean;
        return diff * diff;
    }));

    // 计算 SS_res (残差平方和)
    const ssRes = sum(points.map(([x, y]) => {
        const predicted = predictFn(x);
        const diff = y - predicted;
        return diff * diff;
    }));

    // 计算 R²
    if (ssTot === 0) return 0;
    return 1 - (ssRes / ssTot);
}

/**
 * 指数回归
 *
 * 拟合模型: y = a * e^(bx)
 * 对数变换: ln(y) = ln(a) + bx
 */
export function exponentialRegression(points: Point[]): RegressionResult {
    const n = points.length;
    const X = points.map(([x]) => x);
    const Y = points.map(([, y]) => y);
    const logY = Y.map(y => Math.log(y));

    const sqX = X.map(x => x * x);
    const sumLogY = sum(logY);
    const sumSqX = sum(sqX);
    const sumX = sum(X);
    const sumXLogY = sum(X.map((x, i) => x * logY[i]));
    const sqSumX = sumX * sumX;

    const a_exp = (sumLogY * sumSqX - sumX * sumXLogY) / (n * sumSqX - sqSumX);
    const b = (n * sumXLogY - sumX * sumLogY) / (n * sumSqX - sqSumX);

    const y_func = (x: number) => Math.exp(a_exp) * Math.exp(b * x);

    return {
        x: (y: number) => (-a_exp + Math.log(y)) / b,
        y: y_func,
        r2: calculateR2(points, y_func),
        a: Math.exp(a_exp),
        b: b,
        mse: () => mse(y_func, points),
    };
}

/**
 * 线性回归
 *
 * 拟合模型: y = a + bx
 */
export function linearRegression(points: Point[]): RegressionResult {
    const n = points.length;
    const X = points.map(([x]) => x);
    const Y = points.map(([, y]) => y);
    const sqX = X.map(x => x * x);
    const sumY = sum(Y);
    const sumSqX = sum(sqX);
    const sumX = sum(X);
    const sumXY = sum(X.map((x, i) => x * Y[i]));
    const sqSumX = sumX * sumX;

    const a = (sumY * sumSqX - sumX * sumXY) / (n * sumSqX - sqSumX);
    const b = (n * sumXY - sumX * sumY) / (n * sumSqX - sqSumX);

    const y_func = (x: number) => a + b * x;

    return {
        x: (y: number) => (y - a) / b,
        y: y_func,
        r2: calculateR2(points, y_func),
        a: a,
        b: b,
        mse: () => mse(y_func, points),
    };
}

/**
 * 幂律模型工厂
 */
export function powerLawModel(a: number, b: number): RegressionModel {
    return {
        y: (x: number) => a * Math.pow(x, b),
        x: (y: number) => Math.pow(y / a, 1 / b),
        a: a,
        b: b,
    };
}

/**
 * 幂律回归
 *
 * 拟合模型: y = a * x^b
 * 对数变换: ln(y) = ln(a) + b*ln(x)
 */
export function powerLawRegression(points: Point[]): RegressionResult {
    const n = points.length;
    const X = points.map(([x]) => x);
    const Y = points.map(([, y]) => y);
    const logX = X.map(x => Math.log(x));
    const logY = Y.map(y => Math.log(y));

    const sumLogXLogY = sum(logX.map((x, i) => x * logY[i]));
    const sumLogX = sum(logX);
    const sumLogY = sum(logY);
    const sumSqLogX = sum(logX.map(x => x * x));
    const sqSumLogX = sumLogX * sumLogX;

    const b = (n * sumLogXLogY - sumLogX * sumLogY) / (n * sumSqLogX - sqSumLogX);
    const a_exp = (sumLogY - b * sumLogX) / n;

    const model = powerLawModel(Math.exp(a_exp), b);

    return {
        ...model,
        r2: calculateR2(points, model.y),
        a: Math.exp(a_exp),
        b: b,
        mse: () => mse(model.y, points),
    };
}

/**
 * 固定点幂律回归
 *
 * 拟合模型: y = q(x/p)^b
 * 其中 p, q 是固定点
 */
export function fixedPointPowerLawRegression(points: Point[], fixedPoint: Point): RegressionModel {
    const n = points.length;
    const p = fixedPoint[0];
    const q = fixedPoint[1];
    const logQ = Math.log(q);

    const X = points.map(([x]) => Math.log(x / p));
    const Y = points.map(([, y]) => Math.log(y) - logQ);

    const sumXY = sum(X.map((x, i) => x * Y[i]));
    const sumSqX = sum(X.map(x => x * x));

    // 使用通过原点的线性回归: b = sum(xy) / sum(x²)
    const b = sumXY / sumSqX;

    return powerLawModel(q / Math.pow(p, b), b);
}

/**
 * 通过原点的线性回归
 *
 * 拟合模型: y = bx
 */
export function linearRegressionThroughOrigin(points: Point[]): { b: number } {
    const X = points.map(([x]) => x);
    const Y = points.map(([, y]) => y);
    const sumXY = sum(X.map((x, i) => x * Y[i]));
    const sumSqX = sum(X.map(x => x * x));

    const b = sumXY / sumSqX;

    return { b };
}
