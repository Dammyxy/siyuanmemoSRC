const FW_SEMICOLON = '\uFF1B';
const FW_COLON = '\uFF1A';
const L_ANGLE = '\u300A';
const R_ANGLE = '\u300B';

export type DescriptorDirection = 'forward' | 'reverse' | 'both';

export interface DescriptorTemplateSelection {
  templateId: string;
  isDefinition: boolean;
}

const DESCRIPTOR_TEMPLATE_IDS = new Set([
  'builtin-concept-descriptor',
  'builtin-concept-descriptor-reverse',
  'builtin-concept-descriptor-both',
]);

const DEFINITION_TEMPLATE_IDS = new Set([
  'builtin-concept-definition',
  'builtin-concept-definition-forward',
  'builtin-concept-definition-reverse',
]);

const DESCRIPTOR_BOTH_RE = new RegExp(`;<>|${FW_SEMICOLON}${L_ANGLE}${R_ANGLE}`);
const DESCRIPTOR_REVERSE_RE = new RegExp(`;<|${FW_SEMICOLON}${L_ANGLE}`);
const DEFINITION_BOTH_RE = new RegExp(`::|${FW_COLON}${FW_COLON}`);
const DEFINITION_FORWARD_RE = new RegExp(`:>|${FW_COLON}${R_ANGLE}`);
const DEFINITION_REVERSE_RE = new RegExp(`:<|${FW_COLON}${L_ANGLE}`);

export function detectDescriptorDirection(content: string): DescriptorDirection {
  const cleanContent = content.replace(/\{:[^}]*\}/g, '').trim();

  if (DESCRIPTOR_BOTH_RE.test(cleanContent)) {
    return 'both';
  }
  if (DESCRIPTOR_REVERSE_RE.test(cleanContent)) {
    return 'reverse';
  }
  return 'forward';
}

export function templateIdFromDescriptorDirection(direction: DescriptorDirection): string {
  if (direction === 'both') {
    return 'builtin-concept-descriptor-both';
  }
  if (direction === 'reverse') {
    return 'builtin-concept-descriptor-reverse';
  }
  return 'builtin-concept-descriptor';
}

export function containsDescriptorOrDefinitionSymbol(content: string): boolean {
  return (
    /;;/.test(content)
    || DESCRIPTOR_REVERSE_RE.test(content)
    || DESCRIPTOR_BOTH_RE.test(content)
    || DEFINITION_BOTH_RE.test(content)
    || DEFINITION_FORWARD_RE.test(content)
    || DEFINITION_REVERSE_RE.test(content)
  );
}

export function resolveDescriptorTemplateByMarkdown(markdown: string): DescriptorTemplateSelection {
  const hasBlockRef = /\(\(|\[\[/.test(markdown);

  if (hasBlockRef && DEFINITION_BOTH_RE.test(markdown)) {
    return {
      templateId: 'builtin-concept-definition',
      isDefinition: true,
    };
  }
  if (hasBlockRef && DEFINITION_FORWARD_RE.test(markdown)) {
    return {
      templateId: 'builtin-concept-definition-forward',
      isDefinition: true,
    };
  }
  if (hasBlockRef && DEFINITION_REVERSE_RE.test(markdown)) {
    return {
      templateId: 'builtin-concept-definition-reverse',
      isDefinition: true,
    };
  }

  return {
    templateId: templateIdFromDescriptorDirection(detectDescriptorDirection(markdown)),
    isDefinition: false,
  };
}

export function isDescriptorTemplate(templateId: string): boolean {
  return DESCRIPTOR_TEMPLATE_IDS.has(templateId);
}

export function isDefinitionTemplate(templateId: string): boolean {
  return DEFINITION_TEMPLATE_IDS.has(templateId);
}
