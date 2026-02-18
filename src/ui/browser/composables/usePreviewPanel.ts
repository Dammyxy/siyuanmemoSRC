import { ref, computed, nextTick } from 'vue';
import { Protyle, openTab } from 'siyuan';
import { BrowserCard, IBreadcrumbItem } from '../types';
import { pushErrMsg } from '@/core/siyuan/api';

export interface PreviewPanelOptions {
  plugin?: any;
  app?: any;
  i18n?: Record<string, string>;
}

export function usePreviewPanel(props: PreviewPanelOptions) {
  // 预览状态
  const showPreview = ref(true);
  const previewCard = ref<BrowserCard | null>(null);
  const previewBodyRef = ref<HTMLElement | null>(null);
  let currentProtyle: Protyle | null = null;
  const breadcrumbs = ref<IBreadcrumbItem[]>([]); // 面包屑数据

  // 预览锁定状态
  const isPreviewLocked = ref(true);

  // 预览区域样式
  const previewSize = ref(350); // 默认大小
  const mode = computed(() => 'dialog'); // 可以从 props 获取模式

  const previewStyle = computed(() => {
    if (mode.value === 'dialog') {
      return { width: `${previewSize.value}px` };
    } else {
      return { height: `${previewSize.value}px` };
    }
  });

  // 切换锁定状态
  function togglePreviewLock() {
    isPreviewLocked.value = !isPreviewLocked.value;
    updateProtyleReadonly();
  }

  // 双击解锁
  function handlePreviewDoubleClick() {
    if (isPreviewLocked.value) {
      isPreviewLocked.value = false;
      updateProtyleReadonly();
    }
  }

  // 更新 Protyle 只读状态
  function updateProtyleReadonly() {
    if (currentProtyle && currentProtyle.protyle) { // Check if protyle instance exists
      if (isPreviewLocked.value) {
        // 思源 Protyle 没有公开的 readonly 属性切换方法，通常重新渲染或利用 disable() 方法
        // 这里假设 disable() 可以禁用编辑
        if (typeof (currentProtyle as any).disable === 'function') {
          (currentProtyle as any).disable();
        }
      } else {
        if (typeof (currentProtyle as any).enable === 'function') {
          (currentProtyle as any).enable();
        }
      }
    }
  }

  // 获取面包屑数据
  async function fetchBreadcrumbs(blockId: string) {
    breadcrumbs.value = [];
    if (!props.app) return;
    
    try {
      const response = await fetch('/api/block/getBlockBreadcrumb', {
        method: 'POST',
        body: JSON.stringify({ id: blockId }),
      });
      const data = await response.json();
      if (data.code === 0 && data.data) {
        breadcrumbs.value = data.data;
      }
    } catch (err) {
      console.error('[SiYuanMemo][CardBrowser] Fetch breadcrumbs error:', err);
    }
  }

  // 加载预览内容 - 使用 Protyle 渲染
  async function loadPreviewContent(blockId: string) {
    if (!previewBodyRef.value || !props.app) return;
    
    // 清理之前的 Protyle
    if (currentProtyle) {
      currentProtyle.destroy();
      currentProtyle = null;
    }
    
    // 清空容器
    previewBodyRef.value.innerHTML = '';
    
    try {
      // 创建新的 Protyle 实例 - wysiwyg 模式
      // 注意：如果遇到 Illegal invocation 错误，通常是第三方插件（如 sy-plugin-enhance）代理冲突导致，并非本插件代码问题。
      currentProtyle = new Protyle(props.app, previewBodyRef.value, {
        blockId: blockId,
        mode: 'wysiwyg',
        render: {
          background: false,
          title: false,
          gutter: true,
          breadcrumb: false, // 禁用原生面包屑，使用自定义垂直面包屑
          breadcrumbDocName: false,
        },
        after: (protyle: any) => {
          // 初始化时应用锁定状态
          if (isPreviewLocked.value) {
            protyle.disable();
          }
        }
      });

    } catch (err) {
      console.error('[SiYuanMemo][CardBrowser] Protyle load error:', err);
      previewBodyRef.value.innerHTML = `<div class="preview-error">加载失败</div>`;
    }
  }

  // 跳转到块
  function jumpToBlock() {
    if (previewCard.value && props.app) {
      openTab({
        app: props.app,
        doc: { id: previewCard.value.blockId },
      });
    }
  }

  // 返回预览面板相关的方法和状态
  return {
    showPreview,
    previewCard,
    previewBodyRef,
    breadcrumbs,
    isPreviewLocked,
    previewStyle,
    previewSize,
    togglePreviewLock,
    handlePreviewDoubleClick,
    fetchBreadcrumbs,
    loadPreviewContent,
    jumpToBlock,
  };
}