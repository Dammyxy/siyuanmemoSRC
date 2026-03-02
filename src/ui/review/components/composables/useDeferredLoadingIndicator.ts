import { onUnmounted, ref, watch, type Ref } from 'vue';

const DEFAULT_DELAY_MS = 120;

type UseDeferredLoadingIndicatorOptions = {
  delayMs?: number;
};

export function useDeferredLoadingIndicator(
  loading: Ref<boolean>,
  options: UseDeferredLoadingIndicatorOptions = {}
) {
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;
  const showLoading = ref(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  watch(
    loading,
    (isLoading) => {
      if (!isLoading) {
        clearTimer();
        showLoading.value = false;
        return;
      }

      clearTimer();
      timer = setTimeout(() => {
        if (loading.value) {
          showLoading.value = true;
        }
      }, delayMs);
    },
    { immediate: true }
  );

  onUnmounted(() => {
    clearTimer();
  });

  return {
    showLoading,
  };
}
