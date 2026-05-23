import { detectDescriptorOrDefinitionKind } from '@/application/usecases/xiuyuan/shared/DescriptorTemplateStrategy';
import { detectAnswerSyntax } from '@/core/card-type/detectionRules';
import { parseCueAndAnswer } from '@/core/xiuyuan/parseCueAndAnswer';
import { ClozeDetector } from '@/utils/cloze-detector';

export interface AIFlashcardDecisionSelection {
  selectedText: string;
  blockType?: string | null;
}

export interface AIFlashcardToolDecisionInput {
  request: string;
  selection: AIFlashcardDecisionSelection;
  continuationAvailable: boolean;
}

export interface AIFlashcardToolDecision {
  recommendedTool: string;
  cardFamily: string;
  reason: string;
}

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
}

export class AIFlashcardToolDecisionRuntime {
  resolveCardCreationDecision(input: AIFlashcardToolDecisionInput): AIFlashcardToolDecision {
    const { request, selection, continuationAvailable } = input;
    const content = selection.selectedText;
    const blockType = normalizeString(selection.blockType);
    const descriptorKind = detectDescriptorOrDefinitionKind(content);
    const answerSyntax = detectAnswerSyntax(content, content, 'extended');
    const cueAnswer = parseCueAndAnswer(content);
    const lowerRequest = request.toLowerCase();

    if (continuationAvailable && /继续|已有\s*topic|topic\s*下|item|alt\+z|⌥⇧z/i.test(request)) {
      return {
        recommendedTool: 'CreateTopicItems',
        cardFamily: 'topic-item',
        reason: '当前请求明确指向已有 Topic 下的继续提取，优先沿用 Topic continuation。',
      };
    }

    if (/:::/u.test(content)) {
      return {
        recommendedTool: 'CreateCdfMultilineCards',
        cardFamily: 'cdf-concept-multiline',
        reason: '材料已经带有 ::: 概念多行结构，最适合走 CDF multiline 工具。',
      };
    }

    if (descriptorKind === 'descriptor-multiline') {
      return {
        recommendedTool: 'CreateCdfMultilineCards',
        cardFamily: 'cdf-descriptor-multiline',
        reason: '材料带有 ;;; 描述符分组结构，适合直接走 CDF multiline 工具。',
      };
    }

    if (descriptorKind.startsWith('definition-')) {
      return {
        recommendedTool: 'CreateConceptDefinitionCards',
        cardFamily: 'concept-definition',
        reason: '材料里已经有概念与定义方向标记，最适合创建概念定义卡。',
      };
    }

    if (descriptorKind.startsWith('descriptor-')) {
      return {
        recommendedTool: 'CreateDescriptorCards',
        cardFamily: 'descriptor',
        reason: '材料里已经有描述符方向标记，最适合创建描述符卡。',
      };
    }

    if (ClozeDetector.hasClozes(content)) {
      return {
        recommendedTool: 'CreateInlineCards',
        cardFamily: 'inline-multi-cloze',
        reason: '材料里已经有挖空标记，适合直接创建单块挖空卡。',
      };
    }

    if (blockType === 'h') {
      return {
        recommendedTool: 'CreateNativeHeadingCards',
        cardFamily: 'native-heading',
        reason: '当前块是标题块，优先使用原生标题卡工具能更贴近思源结构。',
      };
    }

    if (blockType === 's') {
      return {
        recommendedTool: 'CreateNativeSuperBlockCards',
        cardFamily: 'native-super-block',
        reason: '当前块是超级块，优先使用原生超级块卡工具。',
      };
    }

    if (blockType === 'i') {
      return {
        recommendedTool: 'CreateNativeListItemCards',
        cardFamily: 'native-list-item',
        reason: '当前块是列表项，优先尝试原生列表项卡工具。',
      };
    }

    if (answerSyntax === 'mark-equals' || answerSyntax === 'siyuan-mark-span') {
      return {
        recommendedTool: 'CreateNativeMarkCards',
        cardFamily: 'native-mark',
        reason: '材料里已经有高亮挖空标记，更适合原生标记卡工具。',
      };
    }

    if (content.includes('<>') || content.includes('<<')) {
      return {
        recommendedTool: 'CreateInlineCards',
        cardFamily: 'inline-bidirectional',
        reason: '材料里已经包含双向提示符，适合单块双向卡。',
      };
    }

    if (content.includes('>>')) {
      return {
        recommendedTool: 'CreateInlineCards',
        cardFamily: 'inline-quick',
        reason: '材料里已经包含快速问答提示符，适合单块 quick card。',
      };
    }

    if (/概念卡|concept/i.test(lowerRequest) && !cueAnswer.cue && content.length <= 80) {
      return {
        recommendedTool: 'CreateInlineCards',
        cardFamily: 'inline-concept',
        reason: '请求明显偏向概念卡，且材料较短，适合用单块 concept 卡。',
      };
    }

    return {
      recommendedTool: 'CreatePairCards',
      cardFamily: cueAnswer.cue && cueAnswer.answer ? 'pair-basic' : 'pair-basic-qa',
      reason: '当前材料更像普通问答或术语解释，优先走成对卡工具最稳妥。',
    };
  }
}
