import type { Component } from 'vue';

type ComponentLoader = () => Promise<Component>;

function cacheComponentLoader(loader: ComponentLoader): ComponentLoader {
  let promise: Promise<Component> | null = null;
  return () => {
    promise ??= loader();
    return promise;
  };
}

export const loadSettingsPanelComponent = cacheComponentLoader(async () => {
  const module = await import('@/ui/settings');
  return module.SettingsPanel as Component;
});

export const loadArenaManagerDialogComponent = cacheComponentLoader(async () => {
  const module = await import('@/ui/arena/ArenaManagerDialog.vue');
  return module.default as Component;
});

export const loadSrsBrowserComponent = cacheComponentLoader(async () => {
  const module = await import('@/ui/browser/SRSBrowser.vue');
  return module.default as Component;
});

export const loadMobileReviewLauncherComponent = cacheComponentLoader(async () => {
  const module = await import('@/ui/mobile/MobileReviewLauncher.vue');
  return module.default as Component;
});

export const loadProgressiveSplitDialogComponent = cacheComponentLoader(async () => {
  const module = await import('@/ui/progressive/ProgressiveSplitDialog.vue');
  return module.default as Component;
});

export const loadReviewViewComponent = cacheComponentLoader(async () => {
  const module = await import('@/ui/review/v2');
  return module.ReviewView as Component;
});

export const loadTemplateSelectDialogComponent = cacheComponentLoader(async () => {
  const module = await import('@/ui/xiuyuan');
  return module.TemplateSelectDialog as Component;
});

type CreateUnifiedReviewDialog = typeof import('@/application/factories/createUnifiedReviewDialog').createUnifiedReviewDialog;

let createUnifiedReviewDialogPromise: Promise<CreateUnifiedReviewDialog> | null = null;

export async function loadCreateUnifiedReviewDialog(): Promise<CreateUnifiedReviewDialog> {
  createUnifiedReviewDialogPromise ??= import('@/application/factories/createUnifiedReviewDialog')
    .then((module) => module.createUnifiedReviewDialog);
  return createUnifiedReviewDialogPromise;
}
