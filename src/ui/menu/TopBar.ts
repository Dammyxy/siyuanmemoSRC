import { Menu } from 'siyuan';
import type FSRSPlugin from '@/index';
import { pushMsg } from '@/core/siyuan/api';

export class TopBarManager {
    private plugin: FSRSPlugin;
    private element: HTMLElement | null = null;
    private contextMenuHandler: ((ev: MouseEvent) => void) | null = null;
    private didWarnMount = false;

    constructor(plugin: FSRSPlugin) {
        this.plugin = plugin;
    }

    public init() {
        this.plugin.addIcons(`<svg xmlns="http://www.w3.org/2000/svg" style="display:none">
  <symbol id="iconSiyuanMemo" viewBox="0 0 24 24">
    <path d="M12 2a10 10 0 1 0 10 10A10.01 10.01 0 0 0 12 2Zm0 2a8 8 0 1 1-8 8 8.01 8.01 0 0 1 8-8Zm-1 3v5H8v2h5v3l5-4-5-4Z"/>
  </symbol>
</svg>`);

        this.element = this.plugin.addTopBar({
            icon: 'iconSiyuanMemo',
            title: this.plugin.i18n?.topbarTitle || '间隔重复系统 (左键SRS浏览器/右键菜单)',
            position: 'right',
            callback: () => {
                // @ts-ignore - accessing private or checking init status via public method if available,
                // but here relying on plugin.isInitialized which is public in current implementation
                if (!this.plugin.isInitialized) {
                    pushMsg(this.plugin.i18n?.loading || '插件初始化中，请稍后...');
                    return;
                }
                this.plugin.openSRSBrowser();
            },
        });
        this.element.classList.add('fsrs-topbar');

        this.contextMenuHandler = (ev: MouseEvent) => {
            ev.preventDefault();
            this.openMenu(ev);
        };
        this.element.addEventListener('contextmenu', this.contextMenuHandler);
    }

    public unload() {
        if (this.element && this.contextMenuHandler) {
            this.element.removeEventListener('contextmenu', this.contextMenuHandler);
        }
    }

    public ensureMounted(): void {
        const el = this.element;
        if (!el) return;
        if (el.isConnected) return;

        const right = document.querySelector('.toolbar__right') as HTMLElement | null;
        const left = document.querySelector('.toolbar__left') as HTMLElement | null;
        const container = right || left;
        if (container) {
            try {
                container.appendChild(el);
                el.style.display = '';
                el.style.opacity = '1';
                el.style.pointerEvents = '';
                return;
            } catch (err) {
                if (!this.didWarnMount) {
                    console.warn('[SiyuanMemo] Failed to remount topbar element:', err);
                    this.didWarnMount = true;
                }
                return;
            }
        }

        if (!this.didWarnMount) {
            console.warn('[SiyuanMemo] Topbar container not found; topbar button may be hidden by layout');
            this.didWarnMount = true;
        }
    }

    private openMenu(ev: MouseEvent) {
        this.ensureMounted();
        const menu = new Menu('fsrs-topbar-menu');

        // 添加菜单项
        menu.addItem({
            icon: 'iconCards',
            label: this.plugin.i18n?.startReview || 'Start Retrieval Practice',
            accelerator: 'Alt+R',
            click: () => {
                this.plugin.openReviewDialog();
            },
        });

        menu.addItem({
            icon: 'iconRefresh',
            label: this.plugin.i18n?.startIncrementalLearning || 'Start Incremental Learning',
            accelerator: 'Alt+I',
            click: () => {
                // TODO: 实现渐进学习功能
                pushMsg(this.plugin.i18n?.featureRemoved || 'This feature is temporarily removed');
            },
        });

        menu.addItem({
            icon: 'iconCards',
            label: this.plugin.i18n?.startDeliberatePractice || 'Start Deliberate Practice',
            accelerator: 'Alt+D',
            click: () => {
                (this.plugin as any).openFinalDrillDialog();
            },
        });

        menu.addItem({
            icon: 'iconRefresh',
            label: this.plugin.i18n?.startNeuralReview || 'Start Neural Roam',
            accelerator: 'Alt+N',
            click: () => {
                (this.plugin as any).openNeuralRoamDialog();
            },
        });

        // 难点攻坚功能已隐藏
        // menu.addItem({
        //     icon: 'iconHot',
        //     label: this.plugin.i18n?.startLeechPractice || '开始难点攻坚',
        //     accelerator: 'Alt+L',
        //     click: () => {
        //         (this.plugin as any).openLeechPracticeDialog();
        //     },
        // });

        menu.addItem({
            icon: 'iconList',
            label: this.plugin.i18n?.startFilterGroupPractice || 'Start Filtered Review',
            accelerator: 'Alt+G',
            click: () => {
                this.plugin.openFilterGroupPracticeDialog();
            },
        });

        menu.addItem({
            icon: 'iconLayoutRight',
            label: this.plugin.i18n?.srsBrowser || 'SRS Browser',
            accelerator: 'Alt+B',
            click: () => {
                this.plugin.openSRSBrowser();
            },
        });

        menu.addSeparator();

        menu.addItem({
            icon: 'iconSettings',
            label: this.plugin.i18n?.settings || 'Settings',
            click: () => {
                this.plugin.openSetting();
            },
        });

        menu.addSeparator();

        menu.addItem({
            icon: 'iconInfo',
            label: `${this.plugin.i18n?.dueCountLabel || 'Due'}: ${this.plugin.getDueCount()} / ${this.plugin.i18n?.totalCountLabel || 'Total'}: ${this.plugin.storage.getAllCards().length}`,
            type: 'readonly',
        });

        const anchor = (ev.currentTarget || ev.target) as HTMLElement | null;
        const rect = anchor?.getBoundingClientRect?.();
        if (rect) {
            menu.open({
                x: rect.right,
                y: rect.bottom,
                isLeft: true,
            });
        } else {
            menu.open({ x: ev.clientX, y: ev.clientY, isLeft: true });
        }
    }
}
