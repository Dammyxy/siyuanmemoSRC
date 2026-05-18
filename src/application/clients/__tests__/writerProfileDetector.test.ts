import { describe, expect, it } from 'vitest';
import {
  detectWriterProfile,
  sanitizeRuntimeIdForDiagnostics,
  sanitizeUrlForDiagnostics,
} from '../writerProfileDetector';

describe('writerProfileDetector', () => {
  it('classifies desktop Electron primary app as canonical writer', () => {
    expect(detectWriterProfile({
      backendContainer: 'std',
      frontendKind: 'desktop',
      isBrowser: false,
      isMobile: false,
      userAgentFamily: 'electron',
      locationHref: 'http://127.0.0.1:61082/stage/build/app/?v=1778023002402',
      bodyClass: 'fn__flex-column body--toolbar-hide body--win32',
    })).toMatchObject({
      backendContainer: 'std',
      frontendKind: 'desktop',
      surfaceRole: 'primary-app',
      writerEligibility: 'canonical',
      confidence: 'high',
    });
  });

  it('classifies desktop Electron document window as follower-only', () => {
    expect(detectWriterProfile({
      backendContainer: 'std',
      frontendKind: 'desktop-window',
      isBrowser: true,
      isMobile: false,
      userAgentFamily: 'electron',
      locationHref: 'http://127.0.0.1:61082/stage/build/app/window.html?enWindowTitle=QuickNote&enhance=true',
      bodyClass: 'fn__flex-column body--window body--win32',
    })).toMatchObject({
      backendContainer: 'std',
      frontendKind: 'desktop-window',
      surfaceRole: 'document-window',
      writerEligibility: 'follower-only',
      confidence: 'high',
    });
  });

  it('classifies browser frontend against std backend as provisional active frontend', () => {
    expect(detectWriterProfile({
      backendContainer: 'std',
      frontendKind: 'browser-desktop',
      isBrowser: true,
      isMobile: false,
      userAgentFamily: 'browser',
      locationHref: 'http://127.0.0.1:6806/stage/build/desktop/?r=abc',
      bodyClass: 'fn__flex-column body--toolbar-hide',
    })).toMatchObject({
      backendContainer: 'std',
      frontendKind: 'browser-desktop',
      surfaceRole: 'active-frontend',
      writerEligibility: 'provisional-candidate',
    });
  });

  it('classifies mobile app frontend as canonical writer', () => {
    expect(detectWriterProfile({
      backendContainer: 'android',
      frontendKind: 'mobile',
      isBrowser: false,
      isMobile: true,
      userAgentFamily: 'mobile',
      locationHref: 'http://127.0.0.1:6806/stage/build/mobile/?v=1778023002402',
      bodyClass: 'fn__flex-column body--mobile',
    })).toMatchObject({
      backendContainer: 'android',
      frontendKind: 'mobile',
      surfaceRole: 'active-frontend',
      writerEligibility: 'canonical',
      confidence: 'high',
    });
  });

  it('keeps QuickNote/enhance surfaces ineligible even when URL includes app stage', () => {
    expect(detectWriterProfile({
      backendContainer: 'std',
      frontendKind: 'desktop-window',
      isBrowser: true,
      isMobile: false,
      userAgentFamily: 'electron',
      locationHref: 'http://127.0.0.1:61082/stage/build/app/window.html?enWindowTitle=QuickNote&enhance=true',
      bodyClass: 'fn__flex-column body--window body--win32',
    })).toMatchObject({
      surfaceRole: 'document-window',
      writerEligibility: 'follower-only',
    });
  });

  it('marks contradictory desktop signals unavailable with a reason', () => {
    const result = detectWriterProfile({
      backendContainer: 'std',
      frontendKind: 'desktop',
      isBrowser: true,
      isMobile: false,
      userAgentFamily: 'electron',
      locationHref: 'http://127.0.0.1:61082/stage/build/app/?v=1778023002402',
    });

    expect(result).toMatchObject({
      surfaceRole: 'unknown',
      writerEligibility: 'unavailable',
      confidence: 'low',
    });
    expect(result.reason).toContain('contradictory');
  });

  it('sanitizes URL and runtime identifiers for diagnostics', () => {
    expect(sanitizeUrlForDiagnostics('http://127.0.0.1:6806/stage/build/desktop/?r=secret&token=private')).toBe(
      'http://127.0.0.1:6806/stage/build/desktop/?r=<redacted>&token=<redacted>',
    );
    expect(sanitizeRuntimeIdForDiagnostics('memo-scope-mp478t9oabcdefgh')).toBe('memo-scope-mp478t9');
    expect(sanitizeRuntimeIdForDiagnostics('')).toBeNull();
  });
});
