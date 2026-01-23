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
  <symbol id="iconFSRS" viewBox="0 0 24 24">
    <path d="M12 2a10 10 0 1 0 10 10A10.01 10.01 0 0 0 12 2Zm0 2a8 8 0 1 1-8 8 8.01 8.01 0 0 1 8-8Zm-1 3v5H8v2h5v3l5-4-5-4Z"/>
  </symbol>
</svg>`);

        this.element = this.plugin.addTopBar({
            icon: 'iconFSRS',
            title: this.plugin.i18n?.topbarTitle || 'FSRS 闪卡 (左键制卡/右键菜单)',
            position: 'right',
            callback: () => {
                // @ts-ignore - accessing private or checking init status via public method if available, 
                // but here relying on plugin.isInitialized which is public in current implementation
                if (!this.plugin.isInitialized) {
                    pushMsg(this.plugin.i18n?.loading || '插件初始化中，请稍后...');
                    return;
                }
                pushMsg(this.plugin.i18n?.featureRemoved || '该功能已暂时移除');
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
                    console.warn('[FSRS] Failed to remount topbar element:', err);
                    this.didWarnMount = true;
                }
                return;
            }
        }

        if (!this.didWarnMount) {
            console.warn('[FSRS] Topbar container not found; topbar button may be hidden by layout');
            this.didWarnMount = true;
        }
    }

    private openMenu(ev: MouseEvent) {
        this.ensureMounted();
        const menu = new Menu('fsrs-topbar-menu');

        // 添加菜单项
        menu.addItem({
            icon: 'iconCards',
            label: this.plugin.i18n?.startReview || '开始提取练习',
            accelerator: 'Alt+R',
            click: () => {
                this.plugin.openRetrievalPracticeDialog();
            },
        });

        menu.addItem({
            icon: 'iconCards',
            label: this.plugin.i18n?.startQueuePractice || '开始队列练习',
            accelerator: 'Alt+D',
            click: () => {
                this.plugin.openFinalDrillDialog();
            },
        });

        menu.addItem({
            icon: 'iconRefresh',
            label: this.plugin.i18n?.startNeuralReview || '开始神经复习',
            accelerator: 'Alt+N',
            click: () => {
                this.plugin.openNeuralReviewDialog();
            },
        });

        menu.addItem({
            icon: 'iconCards',
            label: this.plugin.i18n?.startDeliberatePractice || '开始刻意练习',
            click: () => {
                this.plugin.openFinalDrillDialog();
            },
        });

        menu.addItem({
            icon: 'iconList',
            label: this.plugin.i18n?.startFilterGroupPractice || '开始分组队列',
            click: () => {
                this.plugin.openFilterGroupPracticeDialog();
            },
        });

        menu.addItem({
            icon: 'iconLayoutRight',
            label: this.plugin.i18n?.cardBrowser || '卡片浏览器',
            accelerator: 'Alt+B',
            click: () => {
                this.plugin.openCardBrowser();
            },
        });

        menu.addSeparator();

        menu.addItem({
            icon: 'iconSettings',
            label: this.plugin.i18n?.settings || '设置',
            click: () => {
                this.plugin.openSetting();
            },
        });

        menu.addSeparator();

        menu.addItem({
            icon: 'iconInfo',
            label: `${this.plugin.i18n?.dueCountLabel || '待复习'}: ${this.plugin.getDueCount()} / ${this.plugin.i18n?.totalCountLabel || '总卡片'}: ${this.plugin.storage.getAllCards().length}`,
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
