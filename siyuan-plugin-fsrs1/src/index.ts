/**
 * FSRS Plugin Entry
 * 插件入口文件
 */

import {
    Plugin,
    getFrontend,
} from 'siyuan';

import { StorageManager } from '@/core/storage';
import { FSRSScheduler } from '@/core/scheduler';
import { ReviewPanel } from '@/ui/review';
import { createVueDialog, inputDialog } from '@/utils/dialog';
import type { FSRSCard, Rating } from '@/types';
import { createReviewLog } from '@/types';
import '@/index.scss';

export default class FSRSPlugin extends Plugin {
    // 运行环境
    public isMobile: boolean = false;
    public isBrowser: boolean = false;

    // 核心模块
    public storage!: StorageManager;
    public scheduler!: FSRSScheduler;

    // UI 状态
    private reviewDialog: { dialog: any; destroy: () => void } | null = null;

    async onload() {
        console.log('[FSRS] Plugin loading...');

        // 检测运行环境
        const frontEnd = getFrontend();
        this.isMobile = frontEnd === 'mobile' || frontEnd === 'browser-mobile';
        this.isBrowser = frontEnd.includes('browser');

        // 初始化存储
        this.storage = new StorageManager(this.name);
        await this.storage.init();

        // 初始化调度器
        const settings = this.storage.getSettings();
        this.scheduler = new FSRSScheduler(settings.fsrs);

        // 注册顶栏按钮
        this.addTopBar({
            icon: 'iconCards',
            title: this.i18n?.reviewTitle || 'FSRS 复习',
            position: 'right',
            callback: () => {
                this.openReviewDialog();
            },
        });

        // 注册 Dock 面板
        this.addDock({
            config: {
                position: 'RightBottom',
                size: { width: 400, height: 500 },
                icon: 'iconCards',
                title: 'FSRS',
            },
            data: { plugin: this },
            type: 'fsrs-dock',
            init: (dock) => {
                this.initDockPanel(dock.element);
            },
        });

        // 注册快捷键
        this.addCommand({
            langKey: 'startReview',
            hotkey: 'Alt+R',
            callback: () => {
                this.openReviewDialog();
            },
        });

        // 注册块菜单
        this.eventBus.on('click-blockicon', this.handleBlockIconClick.bind(this));

        console.log('[FSRS] Plugin loaded successfully');
    }

    onunload() {
        console.log('[FSRS] Plugin unloading...');

        // 关闭复习对话框
        this.reviewDialog?.destroy();

        // 保存数据
        this.storage.saveCards();

        console.log('[FSRS] Plugin unloaded');
    }

    openSetting() {
        // TODO: 打开设置面板
        console.log('[FSRS] Open settings');
    }

    /**
     * 打开复习面板（弹窗模式）
     */
    openReviewDialog() {
        // 如果已经打开，先关闭
        if (this.reviewDialog) {
            this.reviewDialog.destroy();
        }

        // 获取到期卡片
        const dueCards = this.storage.getDueCards();

        // 创建复习对话框
        this.reviewDialog = createVueDialog({
            title: dueCards.length > 0
                ? `FSRS 复习 (${dueCards.length} 张待复习)`
                : 'FSRS 复习',
            component: ReviewPanel,
            props: {
                cards: dueCards,
                showStats: true,
                showTimer: true,
                onRating: this.handleRating.bind(this),
                onEdit: this.handleEditCard.bind(this),
                onSkip: this.handleSkipCard.bind(this),
                getPreview: this.getPreview.bind(this),
                getBlockContent: this.getBlockContent.bind(this),
            },
            width: '700px',
            height: '550px',
            onClose: () => {
                this.reviewDialog = null;
                // 保存所有更改
                this.storage.saveCards();
            },
        });
    }

    /**
     * 初始化 Dock 面板
     */
    private initDockPanel(element: HTMLElement) {
        const dueCount = this.storage.getDueCards().length;
        const totalCount = this.storage.getAllCards().length;

        element.innerHTML = `
      <div class="fsrs-dock-container">
        <div class="fsrs-dock-header">FSRS 闪卡</div>
        <div class="fsrs-dock-content">
          <div class="fsrs-dock-stats">
            <div class="stat-item">
              <span class="stat-value">${dueCount}</span>
              <span class="stat-label">待复习</span>
            </div>
            <div class="stat-item">
              <span class="stat-value">${totalCount}</span>
              <span class="stat-label">总卡片</span>
            </div>
          </div>
          <button class="fsrs-dock-btn" id="fsrs-start-review">
            开始复习
          </button>
        </div>
      </div>
    `;

        // 绑定按钮事件
        element.querySelector('#fsrs-start-review')?.addEventListener('click', () => {
            this.openReviewDialog();
        });
    }

    /**
     * 处理评分
     */
    private handleRating(card: FSRSCard, rating: Rating, isDrill: boolean) {
        // 使用调度器计算新状态
        const updatedCard = this.scheduler.review(card, rating);

        // 更新难点计数
        if (rating === 1) {
            updatedCard.leechCount++;
            const settings = this.storage.getSettings();
            if (updatedCard.leechCount >= settings.leech.threshold && !updatedCard.isLeech) {
                updatedCard.isLeech = true;
            }
        } else {
            updatedCard.leechCount = 0;
        }

        // 保存卡片
        this.storage.setCard(updatedCard);

        // 记录复习日志（非机械练习模式）
        if (!isDrill) {
            const log = createReviewLog(
                card.id,
                rating,
                card.state,
                card.stability,
                card.difficulty,
                updatedCard.scheduledDays,
                card.elapsedDays
            );
            this.storage.addReviewLog(log);
        }
    }

    /**
     * 处理编辑卡片
     */
    private async handleEditCard(card: FSRSCard) {
        // TODO: 打开编辑对话框
        console.log('[FSRS] Edit card:', card.id);
    }

    /**
     * 处理跳过卡片
     */
    private async handleSkipCard(card: FSRSCard) {
        const note = await inputDialog({
            title: '跳过原因',
            placeholder: '可选：输入跳过原因或备注',
        });

        if (note !== null) {
            card.skipped = true;
            card.skipNote = note || undefined;
            card.skipUntil = Date.now() + 24 * 60 * 60 * 1000; // 跳过 24 小时
            this.storage.setCard(card);
        }
    }

    /**
     * 获取评分预览
     */
    private getPreview(card: FSRSCard): Map<Rating, FSRSCard> {
        return this.scheduler.preview(card);
    }

    /**
     * 获取块内容
     */
    private async getBlockContent(blockId: string): Promise<string> {
        // TODO: 调用思源 API 获取块内容
        return `<p>Block ID: ${blockId}</p><p>内容加载中...</p>`;
    }

    /**
     * 处理块图标点击（添加闪卡菜单）
     */
    private handleBlockIconClick(e: any) {
        // TODO: 实现块菜单
    }

    /**
     * 获取到期卡片数量
     */
    getDueCount(): number {
        return this.storage.getDueCards().length;
    }
}
