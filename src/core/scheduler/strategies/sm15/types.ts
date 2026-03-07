/**
 * SM-15 Types
 *
 * SuperMemo 15 算法类型定义
 * 基于 MIT 许可证的原始 JavaScript 实现
 */

/**
 * SM-15 常量
 */
export const SM15_CONSTANTS = {
    RANGE_AF: 20,          // A-Factor 范围数量
    RANGE_REPETITION: 20,  // 重复次数范围
    MIN_AF: 1.2,           // 最小 A-Factor
    NOTCH_AF: 0.3,         // A-Factor 步长
    MAX_AF: 1.2 * 0.3 * 19, // 最大 A-Factor = 6.0
    MAX_GRADE: 5,          // 最大评分
    THRESHOLD_RECALL: 3,   // 记忆阈值（评分≥3算记住）
    MAX_AFS_COUNT: 30,     // A-Factor 历史最大数量
    MAX_POINTS_COUNT: 5000, // FI_G 最大点数
    CURVE_MAX_POINTS: 500, // ForgettingCurve 最大点数
    FORGOTTEN: 1,          // 遗忘标记
    REMEMBERED: 101,       // 记忆标记 (100 + FORGOTTEN)
    GRADE_OFFSET: 1,       // 评分偏移
} as const;

/**
 * SM-15 卡片数据
 */
export interface SM15ItemData {
    value: string;               // 卡片标识
    repetition: number;          // 重复次数 (-1 表示新卡片)
    lapse: number;               // 遗忘次数
    of: number;                 // O-Factor (Optimal Factor)
    optimumInterval: number;    // 最优间隔（毫秒）
    dueDate: Date;              // 下次复习时间
    previousDate: Date | null;  // 上次复习时间
    _afs: number[];             // A-Factor 历史
}

/**
 * SM-15 数据（序列化）
 */
export interface SM15Data {
    requestedFI: number;        // 请求的遗忘指数 (0-100)
    intervalBase: number;       // 基础间隔（毫秒）
    fi_g: {
        points: Point[];        // FI-Grade 关系点
    };
    forgettingCurves: Point[][][]; // 遗忘曲线数据
}

/**
 * 回归模型接口
 */
export interface RegressionModel {
    x: (y: number) => number;  // 反函数
    y: (x: number) => number;  // 正函数
    a?: number;  // 系数 a (可选，用于某些回归模型)
    b?: number;  // 系数 b (可选，用于某些回归模型)
}

/**
 * 回归结果
 */
export interface RegressionResult extends RegressionModel {
    r2: number;  // 决定系数（拟合优度）
    mse: () => number;  // 均方误差
}

/**
 * 点坐标
 */
export type Point = [number, number];
