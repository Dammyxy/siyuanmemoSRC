/**
 * AG-Grid 列定义配置
 * 
 * SuperMemo 风格的列配置
 */

import type { ColDef } from 'ag-grid-community';

/** 状态颜色映射 */
export const STATE_COLORS: Record<string, string> = {
  'New': 'var(--b3-card-info-color)',
  'Learning': 'var(--b3-card-warning-color)',
  'Review': 'var(--b3-card-success-color)',
};

/**
 * 创建列定义
 * 
 * SuperMemo 风格的列配置
 */
export function createColumnDefs(): ColDef[] {
  return [
    // No - 行号（第一列，AG-Grid 会在其前自动添加复选框列）
    {
      colId: 'noColumn',
      headerName: 'No',
      width: 50,
      sortable: false,
      valueGetter: (params: any) => {
        if (params.node?.rowIndex != null) return params.node.rowIndex + 1;
        return '';
      },
    },
    // Title - 标题
    { 
      field: 'content', 
      headerName: 'Title', 
      flex: 1,
      minWidth: 100,
      suppressSizeToFit: false,
      tooltipField: 'fullContent',
    },
    // Prior - 优先级
    { 
      field: 'priority', 
      headerName: 'Prior', 
      width: 55,
      sortable: true,
      valueFormatter: (params) => `${params.value || 50}%`,
    },
    // Intrv - 间隔
    { 
      field: 'interval', 
      headerName: 'Intrv', 
      width: 55,
      sortable: true,
      valueFormatter: (params) => params.value > 0 ? `${params.value}d` : '-',
    },
    // LastRep - 上次复习
    { 
      field: 'lastReviewFormatted', 
      headerName: 'LastRep', 
      width: 110,
      sortable: true,
    },
    // NextRep - 下次复习
    { 
      field: 'dueFormatted', 
      headerName: 'NextRep', 
      width: 110,
      sortable: true,
    },
    // Reps - 复习次数
    { 
      field: 'reps', 
      headerName: 'Reps', 
      width: 50,
      sortable: true,
    },
    // Laps - 遗忘次数
    { 
      field: 'lapses', 
      headerName: 'Laps', 
      width: 50,
      sortable: true,
    },
    // Type - 状态
    {
      field: 'stateLabel',
      headerName: 'Type',
      width: 65,
      cellStyle: (params) => ({
        color: STATE_COLORS[params.data.state] || '',
        fontWeight: 500,
      }),
    },
    // CardType - 卡片类型 (Topic/Item)
    {
      field: 'cardType',
      headerName: 'CardType',
      width: 70,
      valueFormatter: (params) => {
        const type = params.value;
        if (type === 'topic') return '📄 Topic';
        if (type === 'item') return '❓ Item';
        return '-';
      },
      cellStyle: (params) => {
        const type = params.value;
        if (type === 'topic') {
          return { color: 'var(--b3-theme-info)', fontWeight: 500 };
        }
        if (type === 'item') {
          return { color: 'var(--b3-theme-success)', fontWeight: 500 };
        }
        return {};
      },
    },
    // FirstRep - 首次复习
    {
      field: 'firstReviewFormatted',
      headerName: 'FirstRep',
      width: 110,
      sortable: true,
    },
    // Retr - 可提取性
    {
      field: 'retrievability',
      headerName: 'Retr',
      width: 55,
      sortable: true,
      valueFormatter: (params) => {
        const r = Number(params.value);
        return Number.isFinite(r) ? `${(r * 100).toFixed(0)}%` : '-';
      },
    },
    // Diff - 难度
    {
      field: 'difficulty',
      headerName: 'Diff',
      width: 55,
      sortable: true,
      valueFormatter: (params) => {
        const d = Number(params.value);
        return Number.isFinite(d) ? d.toFixed(1) : '-';
      },
    },
    // Stab - 稳定性
    {
      field: 'stability',
      headerName: 'Stab',
      width: 55,
      sortable: true,
      valueFormatter: (params) => {
        const s = Number(params.value);
        return Number.isFinite(s) ? `${s.toFixed(1)}d` : '-';
      },
    },
  ];
}

/**
 * 默认列配置选项
 */
export const DEFAULT_COLUMN_OPTIONS = {
  sortable: true,
  filter: true,
  resizable: true,
};
