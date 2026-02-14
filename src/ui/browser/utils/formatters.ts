/**
 * 格式化工具函数
 * 
 * 提供各种数据格式化功能
 */

/**
 * 格式化优先级
 */
export function formatPriority(priority: number | undefined): string {
  const p = priority ?? 50;
  return `${Math.round(p)}%`;
}

/**
 * 格式化间隔天数
 */
export function formatInterval(days: number | undefined): string {
  if (!days || days <= 0) return '-';
  if (days < 1) return '<1d';
  return `${Math.round(days)}d`;
}

/**
 * 格式化难度
 */
export function formatDifficulty(difficulty: number | undefined): string {
  if (typeof difficulty !== 'number' || difficulty <= 0) return '-';
  return difficulty.toFixed(1);
}

/**
 * 格式化可提取性
 */
export function formatRetrievability(retrievability: number | undefined): string {
  if (typeof retrievability !== 'number' || retrievability < 0) return '-';
  return `${(retrievability * 100).toFixed(0)}%`;
}

/**
 * 格式化稳定性
 */
export function formatStability(stability: number | undefined): string {
  if (typeof stability !== 'number' || stability <= 0) return '-';
  return `${stability.toFixed(1)}d`;
}

/**
 * 格式化相对时间（如"3天前"、"2小时后"）
 */
export function formatRelativeTime(date: Date | null | undefined, now: Date = new Date()): string {
  if (!date) return '-';

  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (Math.abs(diffDays) === 0) {
    if (Math.abs(diffHours) === 0) {
      if (Math.abs(diffMinutes) < 1) {
        return '刚刚';
      }
      return diffMinutes > 0 ? `${diffMinutes}分钟后` : `${Math.abs(diffMinutes)}分钟前`;
    }
    return diffHours > 0 ? `${diffHours}小时后` : `${Math.abs(diffHours)}小时前`;
  }

  if (diffDays === 0) return '今天';
  if (diffDays === 1) return '明天';
  if (diffDays === -1) return '昨天';
  if (diffDays > 1 && diffDays <= 7) return `${diffDays}天后`;
  if (diffDays < -1 && diffDays >= -7) return `${Math.abs(diffDays)}天前`;

  return date.toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * 格式化绝对时间
 */
export function formatAbsoluteTime(date: Date | null | undefined): string {
  if (!date) return '-';

  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * 格式化数字（千分位）
 */
export function formatNumber(num: number | undefined): string {
  if (typeof num !== 'number') return '-';
  return num.toLocaleString('zh-CN');
}

/**
 * 格式化百分比
 */
export function formatPercentage(value: number | undefined, decimals: number = 0): string {
  if (typeof value !== 'number' || value < 0) return '-';
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes: number | undefined): string {
  if (typeof bytes !== 'number' || bytes < 0) return '-';

  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * 格式化时长（秒 -> 可读格式）
 */
export function formatDuration(seconds: number | undefined): string {
  if (typeof seconds !== 'number' || seconds < 0) return '-';

  if (seconds < 60) return `${Math.round(seconds)}秒`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分钟`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours < 24) {
    return remainingMinutes > 0 ? `${hours}小时${remainingMinutes}分钟` : `${hours}小时`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;

  return remainingHours > 0 ? `${days}天${remainingHours}小时` : `${days}天`;
}

/**
 * 格式化卡片状态标签
 */
export function formatStateLabel(state: number): string {
  const labels: Record<number, string> = {
    0: '新卡',
    1: '学习中',
    2: '复习',
    3: '重学',
  };
  return labels[state] || '未知';
}

/**
 * 格式化卡片类型标签
 */
export function formatCardTypeLabel(type: 'topic' | 'item' | undefined): string {
  if (type === 'topic') return '📄 主题';
  if (type === 'item') return '❓ 卡片';
  return '-';
}

/**
 * 截断文本（带省略号）
 */
export function truncateText(text: string, maxLength: number = 100): string {
  if (!text) return '';
  const cleaned = text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, maxLength) + '...';
}

/**
 * 高亮搜索关键词
 */
export function highlightKeywords(text: string, keywords: string[]): string {
  if (!text || keywords.length === 0) return text;

  let result = text;
  for (const keyword of keywords) {
    if (!keyword) continue;
    const regex = new RegExp(`(${escapeRegex(keyword)})`, 'gi');
    result = result.replace(regex, '<mark>$1</mark>');
  }

  return result;
}

/**
 * 转义正则表达式特殊字符
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
