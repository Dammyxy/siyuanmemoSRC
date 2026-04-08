<template>
  <div class="ai-workbench-dialog">
    <AiWorkbenchPane :service="service" :i18n="i18n" />
  </div>
</template>

<script setup lang="ts">
import { AIWorkbenchService } from '@/application/services/AIWorkbenchService';
import AiWorkbenchPane from '@/ui/ai/AiWorkbenchPane.vue';

defineProps<{
  service: AIWorkbenchService;
  i18n?: Record<string, string>;
}>();
</script>

<style scoped>
.ai-workbench-dialog {
  height: 100%;
  min-height: 0;
}
</style>
