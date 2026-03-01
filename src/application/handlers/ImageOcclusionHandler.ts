import { Dialog, showMessage } from 'siyuan';
import type FSRSPlugin from '@/index';
import { getBlockAttrs, getBlockKramdown, setBlockAttrs } from '@/infrastructure/siyuan/api';
import { createLogger } from '@/utils/logger';

const logger = createLogger('ImageOcclusionHandler');
const TRACE_IMAGE_OCCLUSION = false;

const ATTR_IMAGE_OCCLUSION = 'custom-fsrs-image-occlusion';
const ATTR_IMAGE_OCCLUSION_VERSION = 'custom-fsrs-image-occlusion-version';
const ATTR_IMAGE_OCCLUSION_CARD_IDS = 'custom-fsrs-image-occlusion-card-ids';
const IMAGE_OCCLUSION_VERSION = 2;

interface OcclusionMask {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  groupId: string;
  prompt?: string;
}

interface OcclusionPayloadV1 {
  version: number;
  imageSrc: string;
  masks: OcclusionMask[];
  updatedAt: number;
}

interface OcclusionPayloadV2 {
  version: number;
  imageSrc: string;
  masks: OcclusionMask[];
  maskToCardId: Record<string, string>;
  updatedAt: number;
}

type OcclusionPayloadSchema = OcclusionPayloadV1 | OcclusionPayloadV2;

interface ImageOcclusionCardMeta {
  source?: string;
  imageOcclusion?: boolean;
  imageOcclusionMaskId?: string;
  imageOcclusionMaskIndex?: number;
  imageOcclusionMaskGroupId?: string;
  imageOcclusionMaskCount?: number;
  imageOcclusionPayloadVersion?: number;
  imageOcclusionImageSrc?: string;
  imageOcclusionPrompt?: string;
  content?: string;
  title?: string;
}

interface ImageMenuItem {
  icon?: string;
  label?: string;
  click?: () => void;
}

interface ImageMenuLike {
  addItem(item: ImageMenuItem): void;
}

interface ImageMenuDetail {
  menu?: ImageMenuLike;
  element?: HTMLElement;
}

interface DialogEditorState {
  masks: OcclusionMask[];
  selectedMaskId: string | null;
  nextGroupNumber: number;
}

interface SyncImageOcclusionResult {
  orderedCardIds: string[];
  maskToCardId: Record<string, string>;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function normalizeRect(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  width: number,
  height: number,
): Omit<OcclusionMask, 'id' | 'groupId'> | null {
  if (width <= 0 || height <= 0) return null;
  const left = Math.min(startX, endX);
  const top = Math.min(startY, endY);
  const rectWidth = Math.abs(endX - startX);
  const rectHeight = Math.abs(endY - startY);
  if (rectWidth < 6 || rectHeight < 6) return null;
  return {
    x: clamp01(left / width),
    y: clamp01(top / height),
    w: clamp01(rectWidth / width),
    h: clamp01(rectHeight / height),
  };
}

function parseImageSourceFromKramdown(kramdown: string): string | null {
  if (!kramdown) return null;

  const markdownMatch = /!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/.exec(kramdown);
  if (markdownMatch?.[1]) {
    return markdownMatch[1];
  }

  const htmlMatch = /<img[^>]+src="([^"]+)"/i.exec(kramdown);
  if (htmlMatch?.[1]) {
    return htmlMatch[1];
  }

  return null;
}

function parseGroupNumber(groupId: string): number {
  const match = /^g(\d+)$/.exec(groupId.trim());
  if (!match) return 0;
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) ? value : 0;
}

function normalizePrompt(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, Math.max(0, ms)));
}

function traceImageOcclusion(message: string, payload?: Record<string, unknown>): void {
  if (!TRACE_IMAGE_OCCLUSION) {
    return;
  }
  logger.warn(`[TRACE_IOC][Handler] ${message}`, payload || {});
  if (payload) {
    try {
      logger.warn(`[TRACE_IOC][Handler][JSON] ${message} ${JSON.stringify(payload)}`);
    } catch {
      // ignore stringify error
    }
  }
}

function parseTrackedCardIds(raw: unknown): string[] {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item) => item.length > 0);
  } catch {
    return [];
  }
}

function parseMaskCountFromPayload(raw: unknown): number {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return 0;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<OcclusionPayloadSchema>;
    return Array.isArray(parsed?.masks) ? parsed.masks.length : 0;
  } catch {
    return 0;
  }
}

function normalizeMaskToCardId(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  const entries = Object.entries(raw as Record<string, unknown>)
    .map(([maskId, cardId]) => [maskId.trim(), typeof cardId === 'string' ? cardId.trim() : ''] as const)
    .filter(([maskId, cardId]) => maskId.length > 0 && cardId.length > 0);

  if (entries.length === 0) {
    return {};
  }

  return Object.fromEntries(entries);
}

export class ImageOcclusionHandler {
  private readonly openDialogs = new Map<string, Dialog>();

  constructor(private readonly plugin: FSRSPlugin) {}

  private isMobileFrontend(): boolean {
    return this.plugin.isMobile === true;
  }

  private resolveEditorDialogSize(): { width: string; height: string } {
    if (this.isMobileFrontend()) {
      return { width: '100vw', height: '100vh' };
    }

    const screenWidth = window.innerWidth;
    if (screenWidth < 1024) return { width: '96vw', height: '94vh' };
    if (screenWidth < 1440) return { width: '94vw', height: '92vh' };
    if (screenWidth < 1920) return { width: '92vw', height: '92vh' };
    return { width: '90vw', height: '92vh' };
  }

  dispose(): void {
    for (const dialog of this.openDialogs.values()) {
      dialog.destroy();
    }
    this.openDialogs.clear();
  }

  handleImageMenu(event: unknown): void {
    const detail = this.getEventDetail<ImageMenuDetail>(event);
    const menu = detail?.menu;
    const element = detail?.element;
    if (!menu || !element) {
      return;
    }

    const imgElement = element.querySelector('img');
    const imageSrc = imgElement?.getAttribute('src')?.trim();
    const blockId = element.closest('[data-node-id]')?.getAttribute('data-node-id')?.trim();
    if (!imageSrc || !blockId) {
      return;
    }

    menu.addItem({
      icon: 'iconImage',
      label: this.t('imageOcclusionMenuLabel', 'Create Image Occlusion Card'),
      click: () => {
        void this.openEditor(blockId, imageSrc);
      },
    });
  }

  async openFromEditor(protyle: unknown): Promise<void> {
    const blockId = this.extractBlockIdFromProtyle(protyle);
    if (!blockId) {
      showMessage(this.t('imageOcclusionNeedEditor', 'Place cursor in an image block to create occlusion card'));
      return;
    }

    const imageSrc = await this.findImageSourceByBlockId(blockId);
    if (!imageSrc) {
      showMessage(this.t('imageOcclusionNoImage', 'No image found in current block'));
      return;
    }

    await this.openEditor(blockId, imageSrc);
  }

  async openFromActiveEditor(): Promise<void> {
    const blockId = this.extractBlockIdFromCurrentSelection();
    if (!blockId) {
      showMessage(this.t('imageOcclusionNeedEditor', 'Place cursor in an image block to create occlusion card'));
      return;
    }

    const imageSrc = await this.findImageSourceByBlockId(blockId);
    if (!imageSrc) {
      showMessage(this.t('imageOcclusionNoImage', 'No image found in current block'));
      return;
    }

    await this.openEditor(blockId, imageSrc);
  }

  private async openEditor(blockId: string, imageSrc: string): Promise<void> {
    const existedDialog = this.openDialogs.get(blockId);
    if (existedDialog) {
      showMessage(this.t('imageOcclusionAlreadyOpen', 'Image occlusion editor is already open'));
      return;
    }

    const initialState = await this.loadInitialState(blockId);
    const containerId = `siyuanmemo-image-occlusion-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const dialogSize = this.resolveEditorDialogSize();
    const dialog = new Dialog({
      title: this.t('imageOcclusionTitle', 'Image Occlusion Card'),
      width: dialogSize.width,
      height: dialogSize.height,
      content: `<div id="${containerId}" class="siyuanmemo-image-occlusion-root"></div>`,
      destroyCallback: () => {
        this.openDialogs.delete(blockId);
      },
    });
    this.openDialogs.set(blockId, dialog);

    const mountRoot = dialog.element.querySelector(`#${containerId}`) as HTMLElement | null;
    if (!mountRoot) {
      logger.error('Image occlusion mount root not found');
      return;
    }

    const cleanup = this.mountEditor(mountRoot, {
      blockId,
      imageSrc,
      state: initialState,
      onSaved: () => {
        dialog.destroy();
      },
    });

    const originalDestroy = dialog.destroy.bind(dialog);
    dialog.destroy = () => {
      cleanup();
      originalDestroy();
    };
  }

  private mountEditor(
    root: HTMLElement,
    options: {
      blockId: string;
      imageSrc: string;
      state: DialogEditorState;
      onSaved: () => void;
    },
  ): () => void {
    const { blockId, imageSrc, onSaved } = options;
    const state: DialogEditorState = {
      masks: [...options.state.masks],
      selectedMaskId: null,
      nextGroupNumber: options.state.nextGroupNumber,
    };

    root.innerHTML = `
      <div class="siyuanmemo-image-occlusion">
        <div class="siyuanmemo-image-occlusion__toolbar">
          <span class="siyuanmemo-image-occlusion__hint">${this.t('imageOcclusionHint', 'Drag to add masks. Click to select.')}</span>
          <button class="b3-button b3-button--outline" data-action="delete">${this.t('imageOcclusionDeleteSelected', 'Delete Selected')}</button>
          <button class="b3-button b3-button--outline" data-action="clear">${this.t('imageOcclusionClearAll', 'Clear All')}</button>
          <button class="b3-button b3-button--outline" data-action="review-all">${this.t('imageOcclusionReviewAll', '提取练习 - 全部')}</button>
          <button class="b3-button b3-button--outline" data-action="temporary-drill">${this.t('imageOcclusionTemporaryDrill', '临时练习')}</button>
        </div>
        <div class="siyuanmemo-image-occlusion__prompt">
          <span class="siyuanmemo-image-occlusion__prompt-label">${this.t('imageOcclusionPromptLabel', 'Mask prompt')}</span>
          <input
            class="b3-text-field fn__flex-1"
            data-role="prompt-input"
            type="text"
            placeholder="${this.t('imageOcclusionPromptPlaceholder', 'Type a prompt for selected mask')}"
          />
        </div>
        <div class="siyuanmemo-image-occlusion__canvas-wrap">
          <div class="siyuanmemo-image-occlusion__canvas">
            <img class="siyuanmemo-image-occlusion__image" alt="image-occlusion-source" />
            <div class="siyuanmemo-image-occlusion__overlay"></div>
          </div>
        </div>
        <div class="siyuanmemo-image-occlusion__footer">
          <div class="siyuanmemo-image-occlusion__footer-actions">
            <div class="siyuanmemo-image-occlusion__footer-tools">
              <button
                class="b3-button b3-button--outline siyuanmemo-image-occlusion__zoom-button"
                data-action="zoom-out"
                title="${this.t('imageOcclusionZoomOut', 'Zoom Out')}"
                aria-label="${this.t('imageOcclusionZoomOut', 'Zoom Out')}"
              >
                <svg><use xlink:href="#iconZoomOut"></use></svg>
              </button>
              <span class="siyuanmemo-image-occlusion__zoom-value" data-role="zoom-value">100%</span>
              <button
                class="b3-button b3-button--outline siyuanmemo-image-occlusion__zoom-button"
                data-action="zoom-in"
                title="${this.t('imageOcclusionZoomIn', 'Zoom In')}"
                aria-label="${this.t('imageOcclusionZoomIn', 'Zoom In')}"
              >
                <svg><use xlink:href="#iconZoomIn"></use></svg>
              </button>
            </div>
            <button class="b3-button b3-button--cancel" data-action="cancel">${this.t('imageOcclusionCancel', 'Cancel')}</button>
            <button class="b3-button b3-button--text" data-action="save">${this.t('imageOcclusionSave', 'Save')}</button>
          </div>
        </div>
      </div>
    `;

    const imageElement = root.querySelector('.siyuanmemo-image-occlusion__image') as HTMLImageElement | null;
    const overlayElement = root.querySelector('.siyuanmemo-image-occlusion__overlay') as HTMLElement | null;
    const canvasWrapElement = root.querySelector('.siyuanmemo-image-occlusion__canvas-wrap') as HTMLElement | null;
    const canvasElement = root.querySelector('.siyuanmemo-image-occlusion__canvas') as HTMLElement | null;
    const zoomOutButton = root.querySelector('button[data-action="zoom-out"]') as HTMLButtonElement | null;
    const zoomInButton = root.querySelector('button[data-action="zoom-in"]') as HTMLButtonElement | null;
    const zoomValueElement = root.querySelector('[data-role="zoom-value"]') as HTMLElement | null;
    const deleteButton = root.querySelector('button[data-action="delete"]') as HTMLButtonElement | null;
    const clearButton = root.querySelector('button[data-action="clear"]') as HTMLButtonElement | null;
    const reviewAllButton = root.querySelector('button[data-action="review-all"]') as HTMLButtonElement | null;
    const temporaryDrillButton = root.querySelector('button[data-action="temporary-drill"]') as HTMLButtonElement | null;
    const cancelButton = root.querySelector('button[data-action="cancel"]') as HTMLButtonElement | null;
    const saveButton = root.querySelector('button[data-action="save"]') as HTMLButtonElement | null;
    const promptInput = root.querySelector('input[data-role="prompt-input"]') as HTMLInputElement | null;
    if (
      !imageElement
      || !overlayElement
      || !canvasWrapElement
      || !canvasElement
      || !zoomOutButton
      || !zoomInButton
      || !zoomValueElement
      || !deleteButton
      || !clearButton
      || !reviewAllButton
      || !temporaryDrillButton
      || !cancelButton
      || !saveButton
      || !promptInput
    ) {
      return () => undefined;
    }
    let drawing = false;
    let actionsBusy = false;
    const MIN_ZOOM_PERCENT = 50;
    const MAX_ZOOM_PERCENT = 300;
    const ZOOM_STEP_PERCENT = 10;
    let zoomPercent = 100;
    let startX = 0;
    let startY = 0;
    let draftMask = document.createElement('div');
    draftMask.className = 'siyuanmemo-image-occlusion-mask siyuanmemo-image-occlusion-mask--draft';

    const cleanupFns: Array<() => void> = [];
    const bind = <T extends EventTarget>(
      target: T,
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: AddEventListenerOptions,
    ) => {
      target.addEventListener(type, listener, options);
      cleanupFns.push(() => target.removeEventListener(type, listener, options));
    };

    const clampZoomPercent = (value: number): number => Math.max(MIN_ZOOM_PERCENT, Math.min(MAX_ZOOM_PERCENT, value));

    const updateZoomControlState = () => {
      zoomOutButton.disabled = actionsBusy || zoomPercent <= MIN_ZOOM_PERCENT;
      zoomInButton.disabled = actionsBusy || zoomPercent >= MAX_ZOOM_PERCENT;
    };

    const applyZoomPercent = (nextZoomPercent: number) => {
      zoomPercent = clampZoomPercent(nextZoomPercent);
      canvasElement.style.setProperty('--siyuanmemo-image-occlusion-zoom', String(zoomPercent / 100));
      zoomValueElement.textContent = `${zoomPercent}%`;
      updateZoomControlState();
    };

    const applyCanvasBaseWidthByNaturalSize = (): boolean => {
      const naturalWidth = imageElement.naturalWidth;
      if (!Number.isFinite(naturalWidth) || naturalWidth <= 0) {
        return false;
      }
      canvasElement.style.setProperty('--siyuanmemo-image-occlusion-base-width', `${naturalWidth}px`);
      return true;
    };

    const createMaskElement = (mask: OcclusionMask, index: number): HTMLElement => {
      const el = document.createElement('div');
      el.className = 'siyuanmemo-image-occlusion-mask';
      if (state.selectedMaskId === mask.id) {
        el.classList.add('is-selected');
      }
      el.style.left = `${mask.x * 100}%`;
      el.style.top = `${mask.y * 100}%`;
      el.style.width = `${mask.w * 100}%`;
      el.style.height = `${mask.h * 100}%`;
      el.setAttribute('data-mask-id', mask.id);
      const label = document.createElement('span');
      label.className = 'siyuanmemo-image-occlusion-mask__label';
      label.textContent = mask.prompt?.trim() || String(index + 1);
      el.appendChild(label);
      bind(el, 'click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        state.selectedMaskId = mask.id;
        renderMasks();
      });
      return el;
    };

    const renderMasks = () => {
      overlayElement.innerHTML = '';
      for (let i = 0; i < state.masks.length; i += 1) {
        overlayElement.appendChild(createMaskElement(state.masks[i], i));
      }
      if (drawing) {
        overlayElement.appendChild(draftMask);
      }
      deleteButton.disabled = actionsBusy || !state.selectedMaskId;
      clearButton.disabled = actionsBusy || state.masks.length === 0;
      reviewAllButton.disabled = actionsBusy;
      temporaryDrillButton.disabled = actionsBusy;
      saveButton.disabled = actionsBusy;
      cancelButton.disabled = actionsBusy;
      updateZoomControlState();
      const selectedMask = state.selectedMaskId
        ? state.masks.find((mask) => mask.id === state.selectedMaskId) || null
        : null;
      promptInput.disabled = actionsBusy || !selectedMask;
      promptInput.value = selectedMask?.prompt || '';
    };

    const runWithBusyState = async (task: () => Promise<void>): Promise<void> => {
      if (actionsBusy) {
        return;
      }
      actionsBusy = true;
      renderMasks();
      try {
        await task();
      } finally {
        actionsBusy = false;
        renderMasks();
      }
    };

    const saveCurrentMasks = async (): Promise<void> => {
      await this.saveOcclusion(blockId, imageSrc, state.masks);
    };

    const beginDrawing = (event: MouseEvent) => {
      if (actionsBusy) return;
      if (event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('.siyuanmemo-image-occlusion-mask')) {
        return;
      }
      const bounds = overlayElement.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      drawing = true;
      startX = event.clientX - bounds.left;
      startY = event.clientY - bounds.top;
      draftMask.style.left = `${startX}px`;
      draftMask.style.top = `${startY}px`;
      draftMask.style.width = '0px';
      draftMask.style.height = '0px';
      state.selectedMaskId = null;
      renderMasks();
    };

    const updateDrawing = (event: MouseEvent) => {
      if (actionsBusy) return;
      if (!drawing) return;
      const bounds = overlayElement.getBoundingClientRect();
      const currentX = clamp01((event.clientX - bounds.left) / Math.max(bounds.width, 1)) * bounds.width;
      const currentY = clamp01((event.clientY - bounds.top) / Math.max(bounds.height, 1)) * bounds.height;
      const left = Math.min(startX, currentX);
      const top = Math.min(startY, currentY);
      const width = Math.abs(currentX - startX);
      const height = Math.abs(currentY - startY);
      draftMask.style.left = `${left}px`;
      draftMask.style.top = `${top}px`;
      draftMask.style.width = `${width}px`;
      draftMask.style.height = `${height}px`;
    };

    const finishDrawing = (event: MouseEvent) => {
      if (actionsBusy) return;
      if (!drawing) return;
      drawing = false;
      const bounds = overlayElement.getBoundingClientRect();
      const normalized = normalizeRect(
        startX,
        startY,
        event.clientX - bounds.left,
        event.clientY - bounds.top,
        bounds.width,
        bounds.height,
      );

      if (normalized) {
        const mask: OcclusionMask = {
          id: `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
          groupId: `g${state.nextGroupNumber}`,
          ...normalized,
        };
        state.nextGroupNumber += 1;
        state.masks.push(mask);
        state.selectedMaskId = mask.id;
      }
      renderMasks();
    };

    bind(overlayElement, 'mousedown', beginDrawing as EventListener);
    bind(window, 'mousemove', updateDrawing as EventListener);
    bind(window, 'mouseup', finishDrawing as EventListener);

    bind(deleteButton, 'click', () => {
      if (!state.selectedMaskId) return;
      state.masks = state.masks.filter((mask) => mask.id !== state.selectedMaskId);
      state.selectedMaskId = null;
      renderMasks();
    });

    bind(clearButton, 'click', () => {
      state.masks = [];
      state.selectedMaskId = null;
      renderMasks();
    });

    bind(cancelButton, 'click', () => {
      const dialog = this.openDialogs.get(blockId);
      dialog?.destroy();
    });

    bind(zoomOutButton, 'click', () => {
      if (actionsBusy) return;
      applyZoomPercent(zoomPercent - ZOOM_STEP_PERCENT);
    });

    bind(zoomInButton, 'click', () => {
      if (actionsBusy) return;
      applyZoomPercent(zoomPercent + ZOOM_STEP_PERCENT);
    });

    bind(canvasWrapElement, 'wheel', (event: WheelEvent) => {
      if (actionsBusy || !event.ctrlKey) {
        return;
      }
      event.preventDefault();
      const previousZoomPercent = zoomPercent;
      const centerX = canvasWrapElement.scrollLeft + canvasWrapElement.clientWidth / 2;
      const centerY = canvasWrapElement.scrollTop + canvasWrapElement.clientHeight / 2;
      const zoomDelta = event.deltaY < 0 ? ZOOM_STEP_PERCENT : -ZOOM_STEP_PERCENT;
      applyZoomPercent(zoomPercent + zoomDelta);
      if (zoomPercent === previousZoomPercent || previousZoomPercent <= 0) {
        return;
      }
      const ratio = zoomPercent / previousZoomPercent;
      canvasWrapElement.scrollLeft = centerX * ratio - canvasWrapElement.clientWidth / 2;
      canvasWrapElement.scrollTop = centerY * ratio - canvasWrapElement.clientHeight / 2;
    }, { passive: false });

    bind(promptInput, 'input', () => {
      if (!state.selectedMaskId) {
        return;
      }

      const selectedMask = state.masks.find((mask) => mask.id === state.selectedMaskId);
      if (!selectedMask) {
        return;
      }

      selectedMask.prompt = normalizePrompt(promptInput.value);
      renderMasks();
    });

    bind(saveButton, 'click', async () => {
      await runWithBusyState(async () => {
        try {
          await saveCurrentMasks();
          showMessage(this.t('imageOcclusionSaved', 'Image occlusion saved'));
          onSaved();
        } catch (error) {
          logger.error('Failed to save image occlusion:', error);
          showMessage(this.t('imageOcclusionSaveFailed', 'Failed to save image occlusion'));
        }
      });
    });

    bind(reviewAllButton, 'click', async () => {
      await runWithBusyState(async () => {
        try {
          await saveCurrentMasks();
          showMessage(this.t('imageOcclusionSaved', 'Image occlusion saved'));
        } catch (error) {
          logger.error('Failed to save image occlusion before opening retrieval practice:', error);
          showMessage(this.t('imageOcclusionSaveFailed', 'Failed to save image occlusion'));
          return;
        }

        try {
          await this.openImageOcclusionReviewAll(blockId);
        } catch (error) {
          logger.error('Failed to open retrieval practice from image occlusion editor:', error);
          showMessage(this.t('actionFailed', 'Action failed'));
        }
      });
    });

    bind(temporaryDrillButton, 'click', async () => {
      await runWithBusyState(async () => {
        try {
          await saveCurrentMasks();
          showMessage(this.t('imageOcclusionSaved', 'Image occlusion saved'));
        } catch (error) {
          logger.error('Failed to save image occlusion before opening temporary drill:', error);
          showMessage(this.t('imageOcclusionSaveFailed', 'Failed to save image occlusion'));
          return;
        }

        try {
          await this.openImageOcclusionTemporaryDrill(blockId);
        } catch (error) {
          logger.error('Failed to open temporary drill from image occlusion editor:', error);
          showMessage(this.t('actionFailed', 'Action failed'));
        }
      });
    });

    bind(window, 'keydown', (event) => {
      if (actionsBusy) return;
      if (event.key === 'Delete' && state.selectedMaskId) {
        state.masks = state.masks.filter((mask) => mask.id !== state.selectedMaskId);
        state.selectedMaskId = null;
        renderMasks();
      }
    });

    bind(canvasElement, 'click', (event) => {
      if (actionsBusy) return;
      const target = event.target as HTMLElement | null;
      if (!target?.closest('.siyuanmemo-image-occlusion-mask')) {
        state.selectedMaskId = null;
        renderMasks();
      }
    });

    imageElement.src = imageSrc;
    if (!applyCanvasBaseWidthByNaturalSize()) {
      bind(imageElement, 'load', () => {
        applyCanvasBaseWidthByNaturalSize();
      }, { once: true });
    }
    applyZoomPercent(100);
    renderMasks();
    return () => {
      cleanupFns.forEach((fn) => fn());
      cleanupFns.length = 0;
    };
  }

  private async saveOcclusion(blockId: string, imageSrc: string, masks: OcclusionMask[]): Promise<void> {
    const attrs = await getBlockAttrs(blockId);
    const trackedCardIds = parseTrackedCardIds(attrs[ATTR_IMAGE_OCCLUSION_CARD_IDS]);
    const previousMaskCount = parseMaskCountFromPayload(attrs[ATTR_IMAGE_OCCLUSION]);
    const previousPayloadVersion = Number.parseInt(String(attrs[ATTR_IMAGE_OCCLUSION_VERSION] || '0'), 10) || 0;

    traceImageOcclusion('saveOcclusion.begin', {
      blockId,
      imageSrc,
      maskCount: masks.length,
      maskIds: masks.map((mask) => mask.id),
      trackedCardIds,
      previousMaskCount,
      previousPayloadVersion,
    });

    const syncResult = await this.syncImageOcclusionCards(
      blockId,
      imageSrc,
      masks,
      trackedCardIds,
      Math.max(masks.length, previousMaskCount),
    );

    traceImageOcclusion('saveOcclusion.syncResult', {
      blockId,
      orderedCardIds: syncResult.orderedCardIds,
      maskToCardId: syncResult.maskToCardId,
    });

    const payload: OcclusionPayloadV2 = {
      version: IMAGE_OCCLUSION_VERSION,
      imageSrc,
      masks,
      maskToCardId: syncResult.maskToCardId,
      updatedAt: Date.now(),
    };

    await setBlockAttrs(blockId, {
      [ATTR_IMAGE_OCCLUSION]: JSON.stringify(payload),
      [ATTR_IMAGE_OCCLUSION_VERSION]: String(IMAGE_OCCLUSION_VERSION),
      // Keep this field for compatibility with old renderer/code path.
      [ATTR_IMAGE_OCCLUSION_CARD_IDS]: JSON.stringify(syncResult.orderedCardIds),
    });

    traceImageOcclusion('saveOcclusion.persisted', {
      blockId,
      version: IMAGE_OCCLUSION_VERSION,
      orderedCardIds: syncResult.orderedCardIds,
      maskToCardId: syncResult.maskToCardId,
    });
  }

  private async openImageOcclusionReviewAll(blockId: string): Promise<void> {
    const dialogManager = this.plugin.getContext().getDialogManager();
    await dialogManager.openRetrievalPracticeWithFilter({
      blockIds: [blockId],
      dueOnly: false,
    });
  }

  private async openImageOcclusionTemporaryDrill(blockId: string): Promise<void> {
    const dialogManager = this.plugin.getContext().getDialogManager();
    await dialogManager.openTemporaryDrill([blockId]);
  }

  private isImageOcclusionCardMeta(meta: unknown): meta is ImageOcclusionCardMeta {
    if (!meta || typeof meta !== 'object') {
      return false;
    }

    const source = (meta as Record<string, unknown>).source;
    const imageOcclusion = (meta as Record<string, unknown>).imageOcclusion;
    return source === 'image-occlusion' || imageOcclusion === true;
  }

  private toImageOcclusionCardMeta(
    imageSrc: string,
    masks: OcclusionMask[],
    mask: OcclusionMask,
    maskIndex: number,
  ): Record<string, unknown> {
    const prompt = normalizePrompt(mask.prompt);
    const defaultTitle = `${this.t('imageOcclusionDefaultCardTitle', 'Image Occlusion')} #${maskIndex + 1}`;
    const title = prompt || defaultTitle;

    return {
      source: 'image-occlusion',
      imageOcclusion: true,
      imageOcclusionMaskId: mask.id,
      imageOcclusionMaskIndex: maskIndex,
      imageOcclusionMaskGroupId: mask.groupId,
      imageOcclusionMaskCount: masks.length,
      imageOcclusionPayloadVersion: IMAGE_OCCLUSION_VERSION,
      imageOcclusionImageSrc: imageSrc,
      imageOcclusionPrompt: prompt,
      content: title,
      title,
    };
  }

  private sameCardMeta(
    current: ImageOcclusionCardMeta,
    next: Record<string, unknown>,
  ): boolean {
    return current.imageOcclusionMaskId === next.imageOcclusionMaskId
      && current.imageOcclusionMaskIndex === next.imageOcclusionMaskIndex
      && current.imageOcclusionMaskGroupId === next.imageOcclusionMaskGroupId
      && current.imageOcclusionMaskCount === next.imageOcclusionMaskCount
      && current.imageOcclusionPayloadVersion === next.imageOcclusionPayloadVersion
      && current.imageOcclusionImageSrc === next.imageOcclusionImageSrc
      && current.imageOcclusionPrompt === next.imageOcclusionPrompt
      && current.content === next.content
      && current.title === next.title;
  }

  private async queryLatestMaskMap(
    cardService: ReturnType<FSRSPlugin['getContext']>['getCardService'],
    blockId: string,
    masks: OcclusionMask[],
  ): Promise<Map<string, string>> {
    const latestByMaskId = new Map<string, string>();
    const maxRetry = 3;

    for (let attempt = 0; attempt < maxRetry; attempt += 1) {
      latestByMaskId.clear();
      const latestResult = await cardService.getCards({
        filter: {
          customFilter: (card) => card.blockId === blockId && this.isImageOcclusionCardMeta(card.meta),
        },
      });

      for (const card of latestResult.cards) {
        const meta = card.meta as ImageOcclusionCardMeta | undefined;
        const maskId = typeof meta?.imageOcclusionMaskId === 'string' ? meta.imageOcclusionMaskId.trim() : '';
        if (maskId) {
          latestByMaskId.set(maskId, card.id);
        }
      }

      traceImageOcclusion('queryLatestMaskMap.snapshot', {
        blockId,
        attempt,
        expectedMaskIds: masks.map((mask) => mask.id),
        latestMap: Object.fromEntries(latestByMaskId.entries()),
      });

      const allReady = masks.every((mask) => latestByMaskId.has(mask.id));
      if (allReady) {
        return latestByMaskId;
      }

      if (attempt < maxRetry - 1) {
        await sleep(60);
      }
    }

    return latestByMaskId;
  }

  private extractCreatedCardId(value: unknown): string {
    if (!value || typeof value !== 'object') {
      return '';
    }

    const directId = (value as { id?: unknown }).id;
    if (typeof directId === 'string' && directId.trim().length > 0) {
      return directId.trim();
    }

    const getId = (value as { getId?: () => unknown }).getId;
    if (typeof getId !== 'function') {
      return '';
    }

    const idValueObject = getId.call(value);
    if (!idValueObject || typeof idValueObject !== 'object') {
      return '';
    }

    const getValue = (idValueObject as { getValue?: () => unknown }).getValue;
    if (typeof getValue !== 'function') {
      return '';
    }

    const id = getValue.call(idValueObject);
    if (typeof id !== 'string') {
      return '';
    }

    const normalized = id.trim();
    return normalized.length > 0 ? normalized : '';
  }

  private async syncImageOcclusionCards(
    blockId: string,
    imageSrc: string,
    masks: OcclusionMask[],
    trackedCardIds: string[],
    legacyExpectedCount: number,
  ): Promise<SyncImageOcclusionResult> {
    const cardService = this.plugin.getContext().getCardService();
    const trackedCardIdSet = new Set(trackedCardIds.map((id) => id.trim()).filter((id) => id.length > 0));

    const cardsResult = await cardService.getCards({
      filter: {
        customFilter: (card) => card.blockId === blockId,
      },
    });
    let imageCards = cardsResult.cards.filter(
      (card) => trackedCardIdSet.has(card.id) || this.isImageOcclusionCardMeta(card.meta),
    );

    traceImageOcclusion('sync.begin', {
      blockId,
      imageSrc,
      masks: masks.map((mask, index) => ({ index, id: mask.id, prompt: mask.prompt || '' })),
      trackedCardIds: Array.from(trackedCardIdSet),
      allBlockCards: cardsResult.cards.map((card) => {
        const meta = (card.meta || {}) as ImageOcclusionCardMeta;
        return {
          cardId: card.id,
          maskId: meta.imageOcclusionMaskId || '',
          maskIndex: meta.imageOcclusionMaskIndex ?? '',
          source: meta.source || '',
        };
      }),
      selectedImageCards: imageCards.map((card) => {
        const meta = (card.meta || {}) as ImageOcclusionCardMeta;
        return {
          cardId: card.id,
          maskId: meta.imageOcclusionMaskId || '',
          maskIndex: meta.imageOcclusionMaskIndex ?? '',
        };
      }),
    });

    if (imageCards.length === 0 && trackedCardIdSet.size === 0 && legacyExpectedCount > 0) {
      const inferredLegacy = cardsResult.cards.filter((card) => {
        const templateId = (card.meta?.templateID as string) || '';
        return templateId === 'builtin-quick-card';
      });
      if (inferredLegacy.length === legacyExpectedCount) {
        imageCards = inferredLegacy;
      }
    }

    const existingByMaskId = new Map<string, (typeof imageCards)[number]>();
    const legacyCards: Array<(typeof imageCards)[number]> = [];
    const duplicatedMaskCards: Array<(typeof imageCards)[number]> = [];
    for (const card of imageCards) {
      const meta = card.meta as ImageOcclusionCardMeta | undefined;
      const maskId = typeof meta?.imageOcclusionMaskId === 'string' ? meta.imageOcclusionMaskId.trim() : '';
      if (maskId) {
        if (existingByMaskId.has(maskId)) {
          duplicatedMaskCards.push(card);
          continue;
        }
        existingByMaskId.set(maskId, card);
      } else {
        legacyCards.push(card);
      }
    }

    traceImageOcclusion('sync.partitioned', {
      blockId,
      existingMaskIds: Array.from(existingByMaskId.keys()),
      legacyCardIds: legacyCards.map((card) => card.id),
      duplicatedMaskCards: duplicatedMaskCards.map((card) => {
        const meta = (card.meta || {}) as ImageOcclusionCardMeta;
        return { cardId: card.id, maskId: meta.imageOcclusionMaskId || '' };
      }),
    });

    const expectedMaskIds = new Set(masks.map((mask) => mask.id.trim()));
    const assignedByMaskId = new Map<string, string>();

    for (let index = 0; index < masks.length; index += 1) {
      const mask = masks[index];
      const nextMeta = this.toImageOcclusionCardMeta(imageSrc, masks, mask, index);
      const existing = existingByMaskId.get(mask.id);

      if (existing) {
        existingByMaskId.delete(mask.id);
        const currentMeta = (existing.meta || {}) as ImageOcclusionCardMeta;
        if (!this.sameCardMeta(currentMeta, nextMeta)) {
          const updateResult = await cardService.updateFSRSCard({
            cardId: existing.id,
            updates: {
              meta: {
                ...(existing.meta || {}),
                ...nextMeta,
              },
            },
          });
          if (!updateResult.ok) {
            throw updateResult.error;
          }
          traceImageOcclusion('sync.updatedExisting', {
            blockId,
            maskId: mask.id,
            cardId: existing.id,
            maskIndex: index,
          });
        } else {
          traceImageOcclusion('sync.reusedExisting', {
            blockId,
            maskId: mask.id,
            cardId: existing.id,
            maskIndex: index,
          });
        }
        assignedByMaskId.set(mask.id, existing.id);
        continue;
      }

      const createResult = await cardService.createCard({
        blockId,
        templateId: 'builtin-quick-card',
        faces: [
          {
            question: blockId,
            answer: blockId,
            questionBlockId: blockId,
            answerBlockId: blockId,
          },
        ],
        cardType: 'item',
        priority: 50,
        meta: nextMeta,
      });
      if (!createResult.ok) {
        throw createResult.error;
      }

      const createdCardId = this.extractCreatedCardId(createResult.value);
      if (!createdCardId) {
        throw new Error(`Failed to resolve created card id for mask ${mask.id}`);
      }
      assignedByMaskId.set(mask.id, createdCardId);
      traceImageOcclusion('sync.createdCard', {
        blockId,
        maskId: mask.id,
        cardId: createdCardId,
        maskIndex: index,
      });
    }

    for (const leftover of existingByMaskId.values()) {
      const meta = leftover.meta as ImageOcclusionCardMeta | undefined;
      const maskId = typeof meta?.imageOcclusionMaskId === 'string' ? meta.imageOcclusionMaskId.trim() : '';
      if (!expectedMaskIds.has(maskId)) {
        const deleteResult = await cardService.deleteCard({ cardId: leftover.id });
        if (!deleteResult.ok) {
          throw deleteResult.error;
        }
        traceImageOcclusion('sync.deletedLeftover', {
          blockId,
          cardId: leftover.id,
          maskId,
        });
      }
    }

    for (const legacyCard of legacyCards) {
      const deleteResult = await cardService.deleteCard({ cardId: legacyCard.id });
      if (!deleteResult.ok) {
        throw deleteResult.error;
      }
      traceImageOcclusion('sync.deletedLegacy', {
        blockId,
        cardId: legacyCard.id,
      });
    }

    for (const duplicatedCard of duplicatedMaskCards) {
      const deleteResult = await cardService.deleteCard({ cardId: duplicatedCard.id });
      if (!deleteResult.ok) {
        throw deleteResult.error;
      }
      traceImageOcclusion('sync.deletedDuplicateMaskCard', {
        blockId,
        cardId: duplicatedCard.id,
      });
    }

    if (masks.length === 0) {
      return { orderedCardIds: [], maskToCardId: {} };
    }

    const missingMasks = masks.filter((mask) => !assignedByMaskId.has(mask.id));
    if (missingMasks.length > 0) {
      traceImageOcclusion('sync.missingMasksBeforeFallback', {
        blockId,
        missingMaskIds: missingMasks.map((mask) => mask.id),
      });
      const latestByMaskId = await this.queryLatestMaskMap(cardService, blockId, masks);
      for (const missingMask of missingMasks) {
        const cardId = latestByMaskId.get(missingMask.id);
        if (cardId) {
          assignedByMaskId.set(missingMask.id, cardId);
        }
      }
    }

    const orderedCardIds: string[] = [];
    const maskToCardId: Record<string, string> = {};

    for (const mask of masks) {
      const cardId = assignedByMaskId.get(mask.id);
      if (!cardId) {
        traceImageOcclusion('sync.mappingIncomplete', {
          blockId,
          maskId: mask.id,
          assignedByMaskId: Object.fromEntries(assignedByMaskId.entries()),
        });
        throw new Error(`Image occlusion mapping is incomplete for mask ${mask.id}`);
      }
      orderedCardIds.push(cardId);
      maskToCardId[mask.id] = cardId;
    }

    traceImageOcclusion('sync.final', {
      blockId,
      orderedCardIds,
      maskToCardId,
    });

    return {
      orderedCardIds,
      maskToCardId: normalizeMaskToCardId(maskToCardId),
    };
  }

  private async loadInitialState(blockId: string): Promise<DialogEditorState> {
    let masks: OcclusionMask[] = [];
    try {
      const attrs = await getBlockAttrs(blockId);
      const raw = attrs[ATTR_IMAGE_OCCLUSION];
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<OcclusionPayloadSchema>;
        if (Array.isArray(parsed?.masks)) {
          masks = parsed.masks
            .filter((mask): mask is OcclusionMask => {
              return Boolean(
                mask
                && typeof mask.id === 'string'
                && typeof mask.x === 'number'
                && typeof mask.y === 'number'
                && typeof mask.w === 'number'
                && typeof mask.h === 'number',
              );
            })
            .map((mask) => ({
              id: mask.id,
              x: clamp01(mask.x),
              y: clamp01(mask.y),
              w: clamp01(mask.w),
              h: clamp01(mask.h),
              groupId: typeof mask.groupId === 'string' && mask.groupId.length > 0 ? mask.groupId : 'g1',
              prompt: normalizePrompt(mask.prompt),
            }))
            .filter((mask) => mask.w > 0 && mask.h > 0);
        }
      }
    } catch (error) {
      logger.warn('Failed to parse existing image occlusion payload:', error);
    }

    const maxGroup = masks.reduce((max, mask) => Math.max(max, parseGroupNumber(mask.groupId)), 0);
    return {
      masks,
      selectedMaskId: null,
      nextGroupNumber: maxGroup > 0 ? maxGroup + 1 : 1,
    };
  }

  private async findImageSourceByBlockId(blockId: string): Promise<string | null> {
    const { kramdown } = await getBlockKramdown(blockId);
    return parseImageSourceFromKramdown(kramdown);
  }

  private extractBlockIdFromProtyle(protyle: unknown): string | null {
    if (!protyle || typeof protyle !== 'object') {
      return null;
    }
    const block = (protyle as { block?: { id?: string; rootID?: string } }).block;
    const blockId = typeof block?.id === 'string' ? block.id.trim() : '';
    if (blockId) return blockId;
    const rootId = typeof block?.rootID === 'string' ? block.rootID.trim() : '';
    return rootId || null;
  }

  private extractBlockIdFromCurrentSelection(): string | null {
    const activeElement = document.activeElement as HTMLElement | null;
    const activeBlockId = activeElement?.closest?.('[data-node-id]')?.getAttribute('data-node-id')?.trim();
    if (activeBlockId) {
      return activeBlockId;
    }

    const selection = window.getSelection();
    const anchorNode = selection?.anchorNode;
    if (anchorNode) {
      const element = anchorNode instanceof Element ? anchorNode : anchorNode.parentElement;
      const fromSelection = element?.closest?.('[data-node-id]')?.getAttribute('data-node-id')?.trim();
      if (fromSelection) {
        return fromSelection;
      }
    }
    return null;
  }

  private getEventDetail<T>(event: unknown): T | undefined {
    if (!event || typeof event !== 'object') {
      return undefined;
    }
    if ('detail' in event) {
      return (event as { detail?: T }).detail;
    }
    return event as T;
  }

  private t(key: string, fallback: string): string {
    const value = (this.plugin.i18n as Record<string, string> | undefined)?.[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
    return fallback;
  }
}
