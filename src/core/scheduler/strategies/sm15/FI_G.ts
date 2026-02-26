/**
 * SM-15 FI_G (Forgetting Index - Grade)
 *
 * 管理 FI-Grade 关系映射
 * 基于 MIT 许可证的原始 JavaScript 实现
 */

import { exponentialRegression } from './regression';
import { SM15_CONSTANTS } from './types';
import type { SM15 } from './SM15';
import type { SM15Item } from './SM15Item';
import type { Point, RegressionModel } from './types';

const { MAX_POINTS_COUNT, GRADE_OFFSET, MAX_GRADE } = SM15_CONSTANTS;

/**
 * FI-G 关系映射类
 *
 * 管理遗忘指数 (FI) 和评分 (Grade) 之间的关系
 * 使用指数回归拟合
 */
export class FI_G {
    public points: Point[];
    private _graph: RegressionModel | null = null;

    constructor(sm: SM15, points?: Point[] | undefined) {
        if (points === undefined) {
            // 初始化默认点
            this.points = [];
            this._registerPoint(0, MAX_GRADE);
            this._registerPoint(100, 0);
        } else {
            this.points = points;
        }
    }

    /**
     * 注册 FI-Grade 数据点
     *
     * @param fi 遗忘指数 (0-100)
     * @param g 评分 (1-5)
     */
    private _registerPoint(fi: number, g: number): void {
        this.points.push([fi, g + GRADE_OFFSET]);
        // 限制点数
        this.points = this.points.slice(Math.max(0, this.points.length - MAX_POINTS_COUNT));
    }

    /**
     * 更新 FI-G 关系
     *
     * @param grade 评分 (1-5)
     * @param item SM15Item 实例
     * @param now 当前时间
     */
    update(grade: number, item: SM15Item, now: Date): void {
        // 计算预期 FI
        const expectedFI = (item.uf(now) / item.of) * item.sm.requestedFI;

        // 注册点
        this._registerPoint(expectedFI, grade);

        // 清除缓存
        this._graph = null;
    }

    /**
     * 获取给定评分对应的遗忘指数
     *
     * @param grade 评分 (1-5)
     * @returns 遗忘指数 (0-100)
     */
    fi(grade: number): number {
        if (this._graph == null) {
            this._graph = exponentialRegression(this.points);
        }

        const fi = this._graph.x(grade + GRADE_OFFSET);
        return Math.max(0, Math.min(100, fi));
    }

    /**
     * 获取给定 FI 对应的评分
     *
     * @param fi 遗忘指数 (0-100)
     * @returns 评分 (1-5)
     */
    grade(fi: number): number {
        if (this._graph == null) {
            this._graph = exponentialRegression(this.points);
        }

        const grade = this._graph.y(fi) - GRADE_OFFSET;
        return grade;
    }

    /**
     * 序列化数据
     */
    data(): { points: Point[] } {
        return { points: this.points };
    }

    /**
     * 加载 FI_G
     *
     * @param sm SM15 实例
     * @param data 序列化的数据
     */
    static load(sm: SM15, data: { points: Point[] }): FI_G {
        return new FI_G(sm, data.points);
    }
}
