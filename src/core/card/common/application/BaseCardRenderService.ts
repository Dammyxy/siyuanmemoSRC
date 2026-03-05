/**
 * 鍩虹鍗＄墖娓叉煋鏈嶅姟
 * 
 * 鑱岃矗锛?
 * - 鎻愪緵閫氱敤鐨勬覆鏌撹緟鍔╂柟娉?
 * - 涓嶅寘鍚笟鍔￠€昏緫锛屽彧鏄伐鍏锋柟娉曢泦鍚?
 * - 渚涘悇涓崱鐗囩被鍨嬬殑 RenderService 缁ф壙浣跨敤
 * 
 * 娉ㄦ剰锛氳繖涓嶆槸涓€涓畬鏁寸殑 DDD 灞傦紝鍙槸鍏变韩浠ｇ爜
 */

import { getBlockBreadcrumb } from '@/core/siyuan/api';
import { extractConceptName, hasConceptDefinitionSyntax } from '@/core/xiuyuan/cardMeta';
import type { BreadcrumbItem } from './types';
import { createLogger } from '@/utils/logger';

const logger = createLogger('BaseCardRenderService');

type RawBreadcrumbItem = {
  id?: string;
  name?: string;
  type?: string;
};

export abstract class BaseCardRenderService {
  /**
   * 鍔犺浇鍧楃殑闈㈠寘灞?
   * 
   * @param blockId 鍧?ID
   * @param excludeLast 鎺掗櫎鏈€鍚庡嚑椤癸紙榛樿 1锛屾帓闄ゅ綋鍓嶅潡锛?
   * @returns 闈㈠寘灞戝垪琛?
   * 
   * @description
   * CDF 瑙勫垯锛氭蹇靛潡鍙樉绀哄悕绉帮紝闅愯棌瀹氫箟
   * - 妫€鏌ュ潡灞炴€?custom-fsrs-card-type === 'concept'
   * - 鎴栨鏌ュ唴瀹规槸鍚﹀寘鍚?:: 璇硶
   * - 濡傛灉鏄蹇靛潡锛屼娇鐢?extractConceptName 鎻愬彇鍚嶇О
   * 
   * 馃啎 鍙樉绀哄埌鏂囨。鍧椾负姝紝杩囨护鎺夋枃妗ｅ潡涔嬪悗鐨勬墍鏈夊唴瀹癸紙閬垮厤鍓ч€忥級
   */
  protected async loadBreadcrumbs(
    blockId: string,
    excludeLast: number = 1
  ): Promise<BreadcrumbItem[]> {
    try {
      const breadcrumbResult = await getBlockBreadcrumb(blockId);
      
      if (!breadcrumbResult || !Array.isArray(breadcrumbResult)) {
        return [];
      }
      
      // 鎺掗櫎鏈€鍚?N 椤?
      const parentBreadcrumbs = breadcrumbResult.slice(0, -excludeLast);
      
      // 馃啎 鎵惧埌鏈€鍚庝竴涓枃妗ｅ潡鐨勪綅缃?
      let lastDocumentIndex = -1;
      for (let i = parentBreadcrumbs.length - 1; i >= 0; i--) {
        if (parentBreadcrumbs[i].type === 'NodeDocument') {
          lastDocumentIndex = i;
          break;
        }
      }
      
      // 馃啎 鍙繚鐣欏埌鏈€鍚庝竴涓枃妗ｅ潡锛堝寘鍚級
      const filteredBreadcrumbs = lastDocumentIndex >= 0 
        ? parentBreadcrumbs.slice(0, lastDocumentIndex + 1)
        : parentBreadcrumbs;
      
      // 澶勭悊姣忎釜闈㈠寘灞戦」锛屽簲鐢?CDF 瑙勫垯
      const processedBreadcrumbs = await Promise.all(
        filteredBreadcrumbs.map(async (item: RawBreadcrumbItem) => {
          const itemId = item.id || '';
          let itemName = item.name || '';
          
          // 妫€鏌ユ槸鍚︽槸姒傚康鍧?
          const isConcept = await this.isConceptBlock(itemId, itemName);
          
          // 濡傛灉鏄蹇靛潡锛屽彧鏄剧ず姒傚康鍚嶇О锛堥殣钘忓畾涔夛級
          if (isConcept) {
            itemName = extractConceptName(itemName);
          }
          
          return {
            id: itemId,
            name: itemName,
            type: item.type || 'NodeParagraph',
          };
        })
      );
      
      // 鍘婚噸锛氫娇鐢?Map 鎸夋爣鍑嗗寲鍚庣殑 name 鍘婚噸
      return this.deduplicateBreadcrumbs(processedBreadcrumbs);
    } catch (error) {
      logger.error('[BaseCardRenderService] Failed to load breadcrumbs:', error);
      return [];
    }
  }

  /**
   * 鍔犺浇姒傚康涓婁笅鏂囷紙浠呮蹇靛潡锛?
   * 
   * @param blockId 鍧?ID
   * @param excludeLast 鎺掗櫎鏈€鍚庡嚑椤癸紙榛樿 1锛屾帓闄ゅ綋鍓嶅潡锛?
   * @returns 姒傚康涓婁笅鏂囧垪琛?
   * 
   * @description
   * RemNote CDF 瑙勫垯锛氬彧鏄剧ず姒傚康灞傜骇锛岃繃婊ゆ帀鏂囨。銆佹爣棰樼瓑闈炴蹇靛潡
   * - 鍙繚鐣欐蹇靛潡锛坈ustom-fsrs-card-type === 'concept' 鎴栧寘鍚?:: 璇硶锛?
   * - 鎻愬彇姒傚康鍚嶇О锛堥殣钘忓畾涔夛級
   * - 馃啎 淇濈暀鏂囨。鍧椾綔涓鸿矾寰勶紝浣嗘爣璁颁负闈炴蹇?
   */
  protected async loadConceptContext(
    blockId: string,
    excludeLast: number = 1
  ): Promise<BreadcrumbItem[]> {
    try {
      const breadcrumbResult = await getBlockBreadcrumb(blockId);
      
      if (!breadcrumbResult || !Array.isArray(breadcrumbResult)) {
        return [];
      }
      
      logger.debug('[BaseCardRenderService] loadConceptContext - breadcrumbResult:', breadcrumbResult);
      
      // 鎺掗櫎鏈€鍚?N 椤?
      const parentBreadcrumbs = breadcrumbResult.slice(0, -excludeLast);
      
      logger.debug('[BaseCardRenderService] loadConceptContext - parentBreadcrumbs:', parentBreadcrumbs);
      
      // 馃啎 澶勭悊鎵€鏈夊潡锛屾爣璁版槸鍚︿负姒傚康鍧?
      const contextItems: Array<BreadcrumbItem & { isConcept: boolean }> = [];
      
      for (const item of parentBreadcrumbs) {
        const itemId = item.id || '';
        let itemName = item.name || '';
        const itemType = item.type || 'NodeParagraph';
        
        logger.debug('[BaseCardRenderService] loadConceptContext - checking item:', { itemId, itemName, itemType });
        
        // 妫€鏌ユ槸鍚︽槸姒傚康鍧?
        const isConcept = await this.isConceptBlock(itemId, itemName);
        
        logger.debug('[BaseCardRenderService] loadConceptContext - isConcept:', isConcept);
        
        if (isConcept) {
          // 鎻愬彇姒傚康鍚嶇О锛堥殣钘忓畾涔夛級
          itemName = extractConceptName(itemName);
          logger.debug('[BaseCardRenderService] loadConceptContext - extracted name:', itemName);
        }
        
        contextItems.push({
          id: itemId,
          name: itemName,
          type: itemType,
          isConcept, // 馃啎 鏍囪鏄惁涓烘蹇?
        });
      }
      
      logger.debug('[BaseCardRenderService] loadConceptContext - final contextItems:', contextItems);
      
      return contextItems;
    } catch (error) {
      logger.error('[BaseCardRenderService] Failed to load concept context:', error);
      return [];
    }
  }

  /**
   * 妫€鏌ュ潡鏄惁鏄蹇靛潡
   * 
   * @param blockId 鍧?ID
   * @param content 鍧楀唴瀹癸紙鍙兘鍙槸鏍囬锛屼笉瀹屾暣锛?
   * @returns 鏄惁鏄蹇靛潡
   * 
   * @description
   * 妫€鏌ラ『搴忥細
   * 1. 鍏堟帓闄ゆ枃妗ｅ潡锛坱ype === 'd'锛?
   * 2. 妫€鏌ュ潡灞炴€?custom-fsrs-card-type === 'concept'
   * 3. 濡傛灉鏄垪琛ㄩ」锛屾煡璇㈠叾娈佃惤瀛愬潡鐨勫唴瀹?
   * 4. 妫€鏌ュ唴瀹规槸鍚﹀寘鍚潡寮曠敤 ((block-id)) 鎴?:: 璇硶
   */
  private async isConceptBlock(blockId: string, content: string): Promise<boolean> {
    try {
      // 馃啎 鏂规硶 1锛氬厛鑾峰彇鍧椾俊鎭紝鎺掗櫎鏂囨。鍧?
      const { sql } = await import('@/core/siyuan/api');
      const blockResult = await sql(`
        SELECT content, markdown, type FROM blocks
        WHERE id = '${blockId}'
        LIMIT 1
      `);
      
      if (!blockResult || blockResult.length === 0) {
        return this.hasConceptSyntax(content);
      }
      
      const blockType = blockResult[0].type || '';
      
      // 馃啎 浼樺厛鎺掗櫎鏂囨。鍧?
      if (blockType === 'd') {
        logger.debug('[BaseCardRenderService] isConceptBlock - document block, excluded');
        return false;
      }
      
      
      // 鏂规硶 3锛氬鏋滄槸鍒楄〃椤癸紝鏌ヨ鍏舵钀藉瓙鍧楃殑鍐呭
      if (blockType === 'i') {
        const paragraphResult = await sql(`
          SELECT content, markdown FROM blocks
          WHERE parent_id = '${blockId}' AND type = 'p'
          LIMIT 1
        `);
        
        if (paragraphResult && paragraphResult.length > 0) {
          const paragraphContent = paragraphResult[0].content || '';
          const paragraphMarkdown = paragraphResult[0].markdown || '';
          logger.debug('[BaseCardRenderService] isConceptBlock - list item paragraph:', { 
            blockId, 
            paragraphContent, 
            paragraphMarkdown 
          });
          return this.hasConceptSyntax(paragraphContent) || this.hasBlockReference(paragraphMarkdown);
        }
      }
      
      // 鏂规硶 4锛氬叾浠栫被鍨嬪潡锛岀洿鎺ユ鏌?content 鍜?markdown
      const blockContent = blockResult[0].content || '';
      const blockMarkdown = blockResult[0].markdown || '';
      logger.debug('[BaseCardRenderService] isConceptBlock - block data:', { 
        blockId, 
        blockContent, 
        blockMarkdown, 
        blockType 
      });
      return this.hasConceptSyntax(blockContent) || this.hasBlockReference(blockMarkdown);
    } catch (error) {
      logger.error('[BaseCardRenderService] isConceptBlock error:', error);
      // 濡傛灉鏌ヨ澶辫触锛宖allback 鍒板唴瀹规鏌?
      return this.hasConceptSyntax(content);
    }
  }

  /**
   * 妫€鏌ュ唴瀹规槸鍚﹀寘鍚蹇佃娉?
   * 
   * @param content 鍐呭
   * @returns 鏄惁鍖呭惈 :: 璇硶
   */
  private hasConceptSyntax(content: string): boolean {
    return hasConceptDefinitionSyntax(content);
  }

  /**
   * 妫€鏌?markdown 鏄惁鍖呭惈鍧楀紩鐢?
   * 
   * @param markdown markdown 鍐呭
   * @returns 鏄惁鍖呭惈鍧楀紩鐢?((block-id))
   */
  private hasBlockReference(markdown: string): boolean {
    // 鍖归厤鍧楀紩鐢細((block-id)) 鎴?((block-id '鍚嶇О'))
    const blockRefPattern = /\(\((\d{14}-[a-z0-9]{7})[^\)]*\)\)/;
    return blockRefPattern.test(markdown);
  }

  /**
   * 鍘婚噸闈㈠寘灞?
   * 
   * @param breadcrumbs 鍘熷闈㈠寘灞戝垪琛?
   * @returns 鍘婚噸鍚庣殑闈㈠寘灞戝垪琛?
   */
  private deduplicateBreadcrumbs(breadcrumbs: BreadcrumbItem[]): BreadcrumbItem[] {
    const dedupMap = new Map<string, BreadcrumbItem>();
    
    for (const item of breadcrumbs) {
      // 鏍囧噯鍖栨枃鏈細鍘绘帀鍒楄〃绗﹀彿
      const normalizedName = item.name.replace(/^[鈥-\d]+\.?\s*/, '').trim();
      dedupMap.set(normalizedName, {
        id: item.id,
        name: normalizedName,
        type: item.type,
      });
    }
    
    return Array.from(dedupMap.values());
  }

  /**
   * 鍒涘缓绛旀鍒嗛殧绾?HTML
   * 
   * @param label 鍒嗛殧绾挎爣绛撅紙榛樿"绛旀"锛?
   * @returns HTML 瀛楃涓?
   */
  protected createAnswerDivider(label: string = '绛旀'): string {
    return `<div class="card-renderer__answer-divider"><span>${label}</span></div>`;
  }

  /**
   * 鍒涘缓姝ｉ潰棰勮 HTML锛堢伆鏄撅級
   * 
   * @param frontHtml 姝ｉ潰 HTML
   * @returns 鍖呰鍚庣殑 HTML
   */
  protected createFrontPreview(frontHtml: string): string {
    return `<div class="card-renderer__front-preview">${frontHtml}</div>`;
  }

  /**
   * 鍖呰绛旀 HTML
   * 
   * @param answerHtml 绛旀 HTML
   * @returns 鍖呰鍚庣殑 HTML
   */
  protected wrapAnswer(answerHtml: string): string {
    return `<div class="card-renderer__answer">${answerHtml}</div>`;
  }

  /**
   * 缁勫悎鑳岄潰 HTML锛堟闈㈤瑙?+ 鍒嗛殧绾?+ 绛旀锛?
   * 
   * @param frontHtml 姝ｉ潰 HTML
   * @param answerHtml 绛旀 HTML
   * @param dividerLabel 鍒嗛殧绾挎爣绛?
   * @returns 瀹屾暣鐨勮儗闈?HTML
   */
  protected composeBackHtml(
    frontHtml: string,
    answerHtml: string,
    dividerLabel: string = '绛旀'
  ): string {
    const preview = this.createFrontPreview(frontHtml);
    const divider = this.createAnswerDivider(dividerLabel);
    const answer = this.wrapAnswer(answerHtml);
    
    return `${preview}${divider}${answer}`;
  }
}
