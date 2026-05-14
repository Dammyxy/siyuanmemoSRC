export type WriterBackendContainer =
  | 'std'
  | 'docker'
  | 'android'
  | 'ios'
  | 'harmony'
  | 'unknown';

export type WriterFrontendKind =
  | 'desktop'
  | 'desktop-window'
  | 'browser-desktop'
  | 'browser-mobile'
  | 'mobile'
  | 'unknown';

export type WriterUserAgentFamily =
  | 'electron'
  | 'browser'
  | 'mobile'
  | 'unknown';

export type WriterSurfaceRole =
  | 'primary-app'
  | 'document-window'
  | 'active-frontend'
  | 'auxiliary'
  | 'unknown';

export type WriterEligibility =
  | 'canonical'
  | 'follower-only'
  | 'provisional-candidate'
  | 'never'
  | 'unavailable';

export type WriterProfileConfidence = 'high' | 'medium' | 'low';

export interface WriterProfileObservation {
  backendContainer?: string | null;
  frontendKind?: string | null;
  isBrowser?: boolean | null;
  isMobile?: boolean | null;
  userAgentFamily?: string | null;
  locationHref?: string | null;
  bodyClass?: string | null;
}

export interface WriterProfileDetection {
  backendContainer: WriterBackendContainer;
  frontendKind: WriterFrontendKind;
  surfaceRole: WriterSurfaceRole;
  writerEligibility: WriterEligibility;
  confidence: WriterProfileConfidence;
  reason: string;
  sanitizedLocationHref: string | null;
}

const KNOWN_BACKEND_CONTAINERS: WriterBackendContainer[] = [
  'std',
  'docker',
  'android',
  'ios',
  'harmony',
  'unknown',
];

const KNOWN_FRONTEND_KINDS: WriterFrontendKind[] = [
  'desktop',
  'desktop-window',
  'browser-desktop',
  'browser-mobile',
  'mobile',
  'unknown',
];

const KNOWN_USER_AGENT_FAMILIES: WriterUserAgentFamily[] = [
  'electron',
  'browser',
  'mobile',
  'unknown',
];

export function sanitizeUrlForDiagnostics(value: string | null | undefined): string | null {
  const href = String(value || '').trim();
  if (!href) {
    return null;
  }
  try {
    const url = new URL(href);
    const queryKeys = Array.from(url.searchParams.keys()).sort();
    const query = queryKeys.length > 0
      ? `?${queryKeys.map((key) => `${key}=<redacted>`).join('&')}`
      : '';
    return `${url.origin}${url.pathname}${query}`;
  } catch {
    return '<unparseable>';
  }
}

export function sanitizeRuntimeIdForDiagnostics(value: string | null | undefined): string | null {
  const text = String(value || '').trim();
  return text ? text.slice(0, 18) : null;
}

export function detectWriterProfile(input: WriterProfileObservation): WriterProfileDetection {
  const backendContainer = normalizeBackendContainer(input.backendContainer);
  const frontendKind = normalizeFrontendKind(input.frontendKind);
  const userAgentFamily = normalizeUserAgentFamily(input.userAgentFamily);
  const href = String(input.locationHref || '').toLowerCase();
  const bodyClass = String(input.bodyClass || '').toLowerCase();
  const isBrowser = input.isBrowser === true;
  const isMobile = input.isMobile === true;
  const sanitizedLocationHref = sanitizeUrlForDiagnostics(input.locationHref);

  if (hasContradictoryDesktopSignals({ frontendKind, isBrowser, isMobile, href, bodyClass })) {
    return {
      backendContainer,
      frontendKind,
      surfaceRole: 'unknown',
      writerEligibility: 'unavailable',
      confidence: 'low',
      reason: 'contradictory desktop frontend signals',
      sanitizedLocationHref,
    };
  }

  if (isDesktopDocumentWindow({ frontendKind, isBrowser, isMobile, userAgentFamily, href, bodyClass })) {
    return {
      backendContainer,
      frontendKind: 'desktop-window',
      surfaceRole: 'document-window',
      writerEligibility: 'follower-only',
      confidence: 'high',
      reason: 'desktop Electron document window is follower-only',
      sanitizedLocationHref,
    };
  }

  if (isDesktopPrimaryApp({ frontendKind, isBrowser, isMobile, userAgentFamily, href, bodyClass })) {
    return {
      backendContainer,
      frontendKind: 'desktop',
      surfaceRole: 'primary-app',
      writerEligibility: 'canonical',
      confidence: 'high',
      reason: 'desktop Electron primary app is canonical writer',
      sanitizedLocationHref,
    };
  }

  if (isBrowserFrontend({ frontendKind, isBrowser, userAgentFamily, href })) {
    return {
      backendContainer,
      frontendKind: frontendKind === 'browser-mobile' ? 'browser-mobile' : 'browser-desktop',
      surfaceRole: 'active-frontend',
      writerEligibility: 'provisional-candidate',
      confidence: backendContainer === 'std' ? 'medium' : 'low',
      reason: 'browser frontend active-writer policy is provisional until backend-specific evidence exists',
      sanitizedLocationHref,
    };
  }

  return {
    backendContainer,
    frontendKind,
    surfaceRole: 'unknown',
    writerEligibility: 'unavailable',
    confidence: 'low',
    reason: 'missing writer profile evidence',
    sanitizedLocationHref,
  };
}

function normalizeBackendContainer(value: string | null | undefined): WriterBackendContainer {
  const normalized = String(value || '').trim().toLowerCase() as WriterBackendContainer;
  return KNOWN_BACKEND_CONTAINERS.includes(normalized) ? normalized : 'unknown';
}

function normalizeFrontendKind(value: string | null | undefined): WriterFrontendKind {
  const normalized = String(value || '').trim().toLowerCase() as WriterFrontendKind;
  return KNOWN_FRONTEND_KINDS.includes(normalized) ? normalized : 'unknown';
}

function normalizeUserAgentFamily(value: string | null | undefined): WriterUserAgentFamily {
  const normalized = String(value || '').trim().toLowerCase() as WriterUserAgentFamily;
  return KNOWN_USER_AGENT_FAMILIES.includes(normalized) ? normalized : 'unknown';
}

function hasContradictoryDesktopSignals(input: {
  frontendKind: WriterFrontendKind;
  isBrowser: boolean;
  isMobile: boolean;
  href: string;
  bodyClass: string;
}): boolean {
  return input.frontendKind === 'desktop'
    && input.isBrowser
    && !input.isMobile
    && !input.href.includes('/window.html')
    && !input.bodyClass.includes('body--window');
}

function isDesktopPrimaryApp(input: {
  frontendKind: WriterFrontendKind;
  isBrowser: boolean;
  isMobile: boolean;
  userAgentFamily: WriterUserAgentFamily;
  href: string;
  bodyClass: string;
}): boolean {
  return input.userAgentFamily === 'electron'
    && input.frontendKind === 'desktop'
    && !input.isBrowser
    && !input.isMobile
    && isPrimaryAppHref(input.href)
    && !input.bodyClass.includes('body--window');
}

function isDesktopDocumentWindow(input: {
  frontendKind: WriterFrontendKind;
  isBrowser: boolean;
  isMobile: boolean;
  userAgentFamily: WriterUserAgentFamily;
  href: string;
  bodyClass: string;
}): boolean {
  return input.userAgentFamily === 'electron'
    && !input.isMobile
    && (
      input.frontendKind === 'desktop-window'
      || input.bodyClass.includes('body--window')
      || input.href.includes('/window.html')
    )
    && input.isBrowser;
}

function isBrowserFrontend(input: {
  frontendKind: WriterFrontendKind;
  isBrowser: boolean;
  userAgentFamily: WriterUserAgentFamily;
  href: string;
}): boolean {
  return input.userAgentFamily === 'browser'
    && input.isBrowser
    && (
      input.frontendKind === 'browser-desktop'
      || input.frontendKind === 'browser-mobile'
      || input.href.includes('/stage/build/desktop')
    );
}

function isPrimaryAppHref(href: string): boolean {
  return href.includes('/stage/build/app')
    && !href.includes('/window.html')
    && !href.includes('enhance=true')
    && !href.includes('quicknote');
}
