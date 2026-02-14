/**
 * 列表模版卡渲染逻辑
 * 
 * 生成渐进式显示的 HTML
 */

import type { XiuyuanCardMeta } from './cardMeta';
import { getBlockByID } from '@/core/siyuan/api';

/**
 * 生成列表模版卡的正面 HTML（问题 + 已学答案 + 当前提示）
 * 
 * @param meta Xiuyuan 卡片元数据
 * @param questionBlockId 问题块 ID
 * @returns HTML 字符串
 */
export async function generateListTemplateFront(
  meta: XiuyuanCardMeta,
  questionBlockId: string
): Promise<string> {
  const { allChildren, currentIndex, cue } = meta;
  
  // 获取问题块的 HTML
  const questionBlock = await getBlockByID(questionBlockId);
  const questionHtml = questionBlock?.markdown || '';
  
  // 构建 HTML
  let html = `<div class="xiuyuan-list-template-front">`;
  
  // 问题部分
  html += `<div class="xiuyuan-question">${questionHtml}</div>`;
  
  // 已学过的答案（灰色显示）
  if (currentIndex > 0) {
    html += `<div class="xiuyuan-previous-answers">`;
    for (let i = 0; i < currentIndex; i++) {
      const child = allChildren[i];
      html += `<div class="xiuyuan-answer-item xiuyuan-answer-learned">`;
      html += `<span class="xiuyuan-answer-marker">✓</span>`;
      html += `<span class="xiuyuan-answer-index">${i + 1}.</span>`;
      html += `<span class="xiuyuan-answer-text">${child.answer}</span>`;
      html += `</div>`;
    }
    html += `</div>`;
  }
  
  // 当前提示（高亮显示）
  if (cue) {
    html += `<div class="xiuyuan-current-cue">`;
    html += `<span class="xiuyuan-cue-marker">?</span>`;
    html += `<span class="xiuyuan-cue-index">${currentIndex + 1}.</span>`;
    html += `<span class="xiuyuan-cue-text">${cue}</span>`;
    html += `</div>`;
  }
  
  html += `</div>`;
  
  // 添加样式
  html += `
<style>
.xiuyuan-list-template-front {
  padding: 16px;
}

.xiuyuan-question {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 2px solid var(--b3-theme-primary);
}

.xiuyuan-previous-answers {
  margin-bottom: 12px;
}

.xiuyuan-answer-item {
  display: flex;
  align-items: flex-start;
  padding: 8px 0;
  gap: 8px;
}

.xiuyuan-answer-learned {
  opacity: 0.6;
  color: var(--b3-theme-on-surface-light);
}

.xiuyuan-answer-marker {
  color: var(--b3-theme-success);
  font-weight: bold;
  flex-shrink: 0;
}

.xiuyuan-answer-index {
  flex-shrink: 0;
  font-weight: 500;
}

.xiuyuan-answer-text {
  flex: 1;
}

.xiuyuan-current-cue {
  display: flex;
  align-items: flex-start;
  padding: 12px;
  gap: 8px;
  background: var(--b3-theme-primary-lightest);
  border-left: 4px solid var(--b3-theme-primary);
  border-radius: 4px;
  margin-top: 12px;
}

.xiuyuan-cue-marker {
  color: var(--b3-theme-primary);
  font-weight: bold;
  font-size: 20px;
  flex-shrink: 0;
}

.xiuyuan-cue-index {
  flex-shrink: 0;
  font-weight: 600;
  color: var(--b3-theme-primary);
}

.xiuyuan-cue-text {
  flex: 1;
  font-weight: 500;
  color: var(--b3-theme-on-primary-container);
}
</style>
  `;
  
  return html;
}

/**
 * 生成列表模版卡的背面 HTML（问题 + 所有已学答案）
 * 
 * @param meta Xiuyuan 卡片元数据
 * @param questionBlockId 问题块 ID
 * @returns HTML 字符串
 */
export async function generateListTemplateBack(
  meta: XiuyuanCardMeta,
  questionBlockId: string
): Promise<string> {
  const { allChildren, currentIndex } = meta;
  
  // 获取问题块的 HTML
  const questionBlock = await getBlockByID(questionBlockId);
  const questionHtml = questionBlock?.markdown || '';
  
  // 构建 HTML
  let html = `<div class="xiuyuan-list-template-back">`;
  
  // 问题部分
  html += `<div class="xiuyuan-question">${questionHtml}</div>`;
  
  // 所有已学过的答案（包括当前的）
  html += `<div class="xiuyuan-all-answers">`;
  for (let i = 0; i <= currentIndex; i++) {
    const child = allChildren[i];
    const isCurrent = i === currentIndex;
    
    html += `<div class="xiuyuan-answer-item ${isCurrent ? 'xiuyuan-answer-current' : 'xiuyuan-answer-learned'}">`;
    html += `<span class="xiuyuan-answer-marker">✓</span>`;
    html += `<span class="xiuyuan-answer-index">${i + 1}.</span>`;
    html += `<span class="xiuyuan-answer-text">${child.answer}</span>`;
    html += `</div>`;
  }
  html += `</div>`;
  
  // 未学习的答案（占位符，不显示内容）
  if (currentIndex < allChildren.length - 1) {
    html += `<div class="xiuyuan-remaining-hint">`;
    html += `还有 ${allChildren.length - currentIndex - 1} 个答案未学习`;
    html += `</div>`;
  }
  
  html += `</div>`;
  
  // 添加样式
  html += `
<style>
.xiuyuan-list-template-back {
  padding: 16px;
}

.xiuyuan-question {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 2px solid var(--b3-theme-primary);
}

.xiuyuan-all-answers {
  margin-top: 12px;
}

.xiuyuan-answer-item {
  display: flex;
  align-items: flex-start;
  padding: 8px 0;
  gap: 8px;
}

.xiuyuan-answer-learned {
  opacity: 0.7;
}

.xiuyuan-answer-current {
  background: var(--b3-theme-success-lightest);
  padding: 12px;
  border-left: 4px solid var(--b3-theme-success);
  border-radius: 4px;
  margin: 8px 0;
}

.xiuyuan-answer-marker {
  color: var(--b3-theme-success);
  font-weight: bold;
  flex-shrink: 0;
}

.xiuyuan-answer-index {
  flex-shrink: 0;
  font-weight: 500;
}

.xiuyuan-answer-text {
  flex: 1;
}

.xiuyuan-remaining-hint {
  margin-top: 16px;
  padding: 8px 12px;
  background: var(--b3-theme-background-light);
  border-radius: 4px;
  color: var(--b3-theme-on-surface-light);
  font-size: 14px;
  text-align: center;
}
</style>
  `;
  
  return html;
}
