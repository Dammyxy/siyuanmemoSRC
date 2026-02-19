<template>
  <div class="sy-plugin-siyuanmemo-restore-tab">
    <div v-if="loading" class="loading">正在恢复复习界面...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { App } from 'siyuan';

const props = defineProps<{
  app: App;
  data: {
    reviewType: string; // 'retrieval' | 'final-drill' | 'neural-roam' | 'leech' | 'subset' | 'filter-group'
    seedBlockId?: string; // for neural-roam
    blockIds?: string[]; // for subset practice
  };
}>();

const loading = ref(true);
const error = ref('');

onMounted(async () => {
  console.log('[FSRS RestoreTab] Component mounted with data:', props.data);

  try {
    // 触发 FSRS 插件打开对应的复习界面
    // 使用事件总线或直接调用插件方法
    const fsrsPlugin = (window as any).siyuanMemoPlugin;

    if (!fsrsPlugin) {
      throw new Error('FSRS 插件未找到');
    }

    // 获取对话框管理器
    const dialogManager = fsrsPlugin.getContext().getDialogManager();

    // 根据复习类型调用对应的方法
    const { reviewType, seedBlockId, blockIds } = props.data;

    switch (reviewType) {
      case 'retrieval':
        dialogManager.openReviewDialog();
        break;
      case 'final-drill':
        dialogManager.openFinalDrillDialog();
        break;
      case 'neural-roam':
        dialogManager.openNeuralRoamDialog({ seedBlockId });
        break;
      case 'leech':
        dialogManager.openLeechReviewDialog();
        break;
      case 'filter-group':
        dialogManager.openFilterGroupPracticeDialog();
        break;
      case 'subset':
        if (blockIds && blockIds.length > 0) {
          dialogManager.openSubsetReviewDialog(blockIds);
        }
        break;
      default:
        throw new Error(`未知的复习类型: ${reviewType}`);
    }

    // 成功后关闭当前 Tab（因为会打开新的对话框）
    setTimeout(() => {
      const tab = props.app.editor?.findTab((tab: any) => tab.panel?.element?.classList.contains('sy-plugin-siyuanmemo-restore-tab'));
      if (tab) {
        tab.close();
      }
    }, 100);

  } catch (err) {
    console.error('[FSRS RestoreTab] Error:', err);
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.sy-plugin-siyuanmemo-restore-tab {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 20px;
}

.loading, .error {
  text-align: center;
}

.error {
  color: var(--b3-theme-on-error);
  background-color: var(--b3-theme-error);
  padding: 10px 20px;
  border-radius: 4px;
}
</style>
