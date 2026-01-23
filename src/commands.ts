import type FSRSPlugin from '@/index';

export class CommandManager {
    constructor(private plugin: FSRSPlugin) { }

    public registerAll() {
        // 注册快捷键 - 复习
        this.plugin.addCommand({
            langKey: 'startReview',
            hotkey: 'Alt+R',
            callback: () => {
                this.plugin.openReviewDialog();
            },
        });

        this.plugin.addCommand({
            langKey: 'startDrill',
            hotkey: 'Alt+D',
            callback: () => {
                this.plugin.openDrillDialog();
            },
        });

        // 注册快捷键 - 打开卡片浏览器
        this.plugin.addCommand({
            langKey: 'openCardBrowser',
            hotkey: 'Alt+B',
            callback: () => {
                this.plugin.openCardBrowser();
            },
        });
    }
}
