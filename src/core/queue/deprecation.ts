/**
 * Deprecated queue warnings
 * 旧架构队列弃用提示
 */

const warnedTargets = new Set<string>();

export function warnDeprecatedQueueUsage(target: string, detail?: string): void {
    if (warnedTargets.has(target)) {
        return;
    }

    warnedTargets.add(target);
    const suffix = detail ? ` ${detail}` : '';
    console.warn(
        `[SiYuanMemo][Deprecated Queue] ${target} belongs to old queue architecture and will be removed in a future release.${suffix}`
    );
}

