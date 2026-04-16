/**
 * Siyuan API Client
 * 封装思源内核 HTTP API
 */

const API_BASE = '/api';
const DEFAULT_SQL_LIMIT = 100000;

type JsonRecord = Record<string, unknown>;

interface ApiEnvelope<T> {
    code: number;
    msg?: string;
    data: T;
}

interface ListDocsByPathResponse<TFile extends JsonRecord> {
    files?: TFile[];
}

export interface NotebookSummary {
    id: string;
    name: string;
    icon: string;
    sort: number;
    closed: boolean;
}

interface ListNotebooksResponse {
    notebooks?: NotebookSummary[];
}

interface NotebookConfRecord {
    name: string;
    closed: boolean;
    refCreateSavePath: string;
    createDocNameTemplate: string;
    dailyNoteSavePath: string;
    dailyNoteTemplatePath: string;
}

interface NotebookConfResponse {
    box: string;
    conf: NotebookConfRecord;
    name: string;
}

interface CreateDailyNoteResponse {
    id?: string;
}

export interface BlockMutationOperation {
    action?: string;
    data?: string;
    id?: string;
    parentID?: string;
    previousID?: string;
    retData?: unknown;
}

interface BlockMutationEntry {
    doOperations?: BlockMutationOperation[];
}

type BlockMutationResponse = BlockMutationEntry[];

export interface BlockMutationResult {
    doOperations: BlockMutationOperation[];
}

function isRecord(value: unknown): value is JsonRecord {
    return typeof value === 'object' && value !== null;
}

function isApiEnvelope(value: unknown): value is ApiEnvelope<unknown> {
    return isRecord(value) && typeof value.code === 'number';
}

function trimTrailingSemicolon(stmt: string): string {
    return stmt.trim().replace(/;+\s*$/u, '');
}

function normalizeSqlStatement(stmt: string): string {
    const normalized = trimTrailingSemicolon(String(stmt || ''));
    if (!normalized) {
        return normalized;
    }

    // Siyuan search settings can cap SQL-like query rows when LIMIT is omitted.
    const startsWithSelectOrWith = /^(SELECT|WITH)\b/ui.test(normalized);
    const hasLimitClause = /\bLIMIT\b/ui.test(normalized);
    if (!startsWithSelectOrWith || hasLimitClause) {
        return normalized;
    }

    return `${normalized} LIMIT ${DEFAULT_SQL_LIMIT}`;
}

/**
 * 发送 POST 请求到思源内核
 */
export async function request<T = unknown>(endpoint: string, data: unknown = {}): Promise<T> {
    const response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
    });

    const result: unknown = await response.json();
    if (!isApiEnvelope(result)) {
        throw new Error(`Siyuan API Error: invalid response envelope from ${endpoint}`);
    }

    if (result.code !== 0) {
        throw new Error(`Siyuan API Error: ${result.msg}`);
    }

    return result.data as T;
}

// ==================== 块操作 ====================

/**
 * 获取块信息
 */
export async function getBlockInfo(id: string): Promise<JsonRecord> {
    return request<JsonRecord>('/block/getBlockInfo', { id });
}

/**
 * 根据块 ID 获取块（兼容旧 API 命名）
 */
export async function getBlockByID(id: string): Promise<JsonRecord | null> {
    const rows = await sql<JsonRecord>(`SELECT * FROM blocks WHERE id = '${id}' LIMIT 1`);
    return rows[0] ?? null;
}

/**
 * 获取块 Kramdown 内容
 */
export async function getBlockKramdown(id: string): Promise<{ kramdown: string }> {
    return request('/block/getBlockKramdown', { id });
}

export async function copyStdMarkdown(id: string): Promise<string> {
    return request<string>('/lute/copyStdMarkdown', { id });
}

/**
 * 获取块 DOM
 */
export async function getBlockDOM(id: string): Promise<{ dom: string }> {
    return request('/block/getBlockDOM', { id });
}

/**
 * 获取块面包屑
 */
export async function getBlockBreadcrumb(id: string): Promise<JsonRecord[]> {
    return request<JsonRecord[]>('/block/getBlockBreadcrumb', { id });
}

/**
 * 根据块类型获取图标名称
 * 对应思源内核的 getIconByType 函数
 */
export function getIconByType(type: string, subType?: string): string {
    let iconName = '';
    switch (type) {
        case 'NodeDocument':
            iconName = 'iconFile';
            break;
        case 'NodeThematicBreak':
            iconName = 'iconLine';
            break;
        case 'NodeParagraph':
            iconName = 'iconParagraph';
            break;
        case 'NodeHeading':
            if (subType) {
                iconName = 'icon' + subType.toUpperCase();
            } else {
                iconName = 'iconHeadings';
            }
            break;
        case 'NodeBlockquote':
            iconName = 'iconQuote';
            break;
        case 'NodeCallout':
            iconName = 'iconCallout';
            break;
        case 'NodeList':
            if (subType === 't') {
                iconName = 'iconCheck';
            } else if (subType === 'o') {
                iconName = 'iconOrderedList';
            } else {
                iconName = 'iconList';
            }
            break;
        case 'NodeListItem':
            iconName = 'iconListItem';
            break;
        case 'NodeCodeBlock':
        case 'NodeYamlFrontMatter':
            iconName = 'iconCode';
            break;
        case 'NodeTable':
            iconName = 'iconTable';
            break;
        case 'NodeSuperBlock':
            iconName = 'iconSuper';
            break;
        case 'NodeAttributeView':
            iconName = 'iconDatabase';
            break;
        case 'NodeHTMLBlock':
            iconName = 'iconHTML5';
            break;
        case 'NodeMathBlock':
            iconName = 'iconMath';
            break;
        case 'NodeIFrame':
            iconName = 'icon iframe';
            break;
        case 'NodeWidget':
            iconName = 'iconWidget';
            break;
        case 'NodeAudio':
            iconName = 'iconRecord';
            break;
        case 'NodeVideo':
            iconName = 'iconVideo';
            break;
        default:
            iconName = 'iconParagraph';
            break;
    }
    return iconName;
}

export async function getBlockDocInfo(id: string): Promise<JsonRecord> {
    return request<JsonRecord>('/block/getDocInfo', { id });
}

// ==================== 块属性 ====================

/**
 * 获取块属性
 */
export async function getBlockAttrs(id: string): Promise<Record<string, string>> {
    return request('/attr/getBlockAttrs', { id });
}

/**
 * 设置块属性
 */
export async function setBlockAttrs(id: string, attrs: Record<string, string>): Promise<void> {
    return request('/attr/setBlockAttrs', { id, attrs });
}

// ==================== SQL 查询 ====================

/**
 * 执行 SQL 查询
 */
export async function sql<TRow extends JsonRecord = JsonRecord>(stmt: string): Promise<TRow[]> {
    return request<TRow[]>('/query/sql', { stmt: normalizeSqlStatement(stmt) });
}

/**
 * 根据块 ID 查询块信息
 */
export async function getBlocksByIds<TRow extends JsonRecord = JsonRecord>(ids: string[]): Promise<TRow[]> {
    if (ids.length === 0) return [];

    const idsStr = ids.map(id => `'${id}'`).join(',');
    return sql<TRow>(`SELECT * FROM blocks WHERE id IN (${idsStr})`);
}

/**
 * 查询带有指定属性的块
 */
export async function getBlocksByAttr<TRow extends JsonRecord = JsonRecord>(name: string, value?: string): Promise<TRow[]> {
    let stmt = `SELECT * FROM blocks WHERE id IN (
    SELECT block_id FROM attributes WHERE name = '${name}'`;

    if (value !== undefined) {
        stmt += ` AND value = '${value}'`;
    }

    stmt += ')';
    return sql<TRow>(stmt);
}

/**
 * 查询文档下的所有块
 */
export async function getBlocksByDoc<TRow extends JsonRecord = JsonRecord>(docId: string): Promise<TRow[]> {
    return sql<TRow>(`SELECT * FROM blocks WHERE root_id = '${docId}' AND type != 'd'`);
}

/**
 * 查询块的反向链接
 */
export async function getBacklinks<TRow extends JsonRecord = JsonRecord>(id: string): Promise<TRow[]> {
    return sql<TRow>(`SELECT * FROM blocks WHERE id IN (
    SELECT block_id FROM refs WHERE def_block_id = '${id}'
  )`);
}

// ==================== 文档操作 ====================

/**
 * 获取文档信息
 */
export async function getDocInfo(id: string): Promise<JsonRecord> {
    return request<JsonRecord>('/filetree/getDoc', { id, size: 0 });
}

export async function getDocContent(id: string, size = 102400, mode = 0): Promise<JsonRecord> {
    return request<JsonRecord>('/filetree/getDoc', { id, size, mode });
}

export async function createDocWithMd(notebook: string, path: string, markdown: string): Promise<string> {
    return request<string>('/filetree/createDocWithMd', { notebook, path, markdown });
}

export async function createDailyNote(notebook: string, app?: string): Promise<CreateDailyNoteResponse> {
    const payload = app ? { notebook, app } : { notebook };
    return request<CreateDailyNoteResponse>('/filetree/createDailyNote', payload);
}

/**
 * 获取笔记本列表
 */
export async function listNotebooks(): Promise<NotebookSummary[]> {
    const result = await request<ListNotebooksResponse>('/notebook/lsNotebooks', {});
    return Array.isArray(result.notebooks) ? result.notebooks : [];
}

/**
 * 获取子文档列表
 */
export async function listDocsByPath<TFile extends JsonRecord = JsonRecord>(notebook: string, path: string): Promise<TFile[]> {
    const result = await request<ListDocsByPathResponse<TFile>>('/filetree/listDocsByPath', { notebook, path });
    return Array.isArray(result.files) ? result.files : [];
}

export async function getNotebookConf(notebook: string): Promise<NotebookConfResponse> {
    return request<NotebookConfResponse>('/notebook/getNotebookConf', { notebook });
}

// ==================== 模板 / 内容写入 ====================

export async function renderSprig(template: string): Promise<string> {
    return request<string>('/template/renderSprig', { template });
}

function normalizeMutationResult(result: BlockMutationResponse): BlockMutationResult {
    return {
        doOperations: result.flatMap((entry) => Array.isArray(entry.doOperations) ? entry.doOperations : []),
    };
}

function extractFirstMutationId(result: BlockMutationResult): string {
    for (const operation of result.doOperations) {
        if (typeof operation.id === 'string' && operation.id.length > 0) {
            return operation.id;
        }
    }
    throw new Error('Failed to resolve block mutation id from Siyuan response');
}

export async function insertBlockDetailed(params: {
    dataType: 'markdown' | 'dom';
    data: string;
    nextID?: string;
    previousID?: string;
    parentID?: string;
}): Promise<BlockMutationResult> {
    const result = await request<BlockMutationResponse>('/block/insertBlock', params);
    return normalizeMutationResult(result);
}

export async function insertBlock(params: {
    dataType: 'markdown' | 'dom';
    data: string;
    nextID?: string;
    previousID?: string;
    parentID?: string;
}): Promise<string> {
    const result = await insertBlockDetailed(params);
    return extractFirstMutationId(result);
}

export async function prependBlock(params: {
    dataType: 'markdown' | 'dom';
    data: string;
    parentID?: string;
}): Promise<string> {
    const result = await request<BlockMutationResponse>('/block/prependBlock', params);
    return extractFirstMutationId(result);
}

export async function appendBlock(params: {
    dataType: 'markdown' | 'dom';
    data: string;
    parentID?: string;
}): Promise<string> {
    const result = await appendBlockDetailed(params);
    return extractFirstMutationId(result);
}

export async function appendBlockDetailed(params: {
    dataType: 'markdown' | 'dom';
    data: string;
    parentID?: string;
}): Promise<BlockMutationResult> {
    const result = await request<BlockMutationResponse>('/block/appendBlock', params);
    return normalizeMutationResult(result);
}

export async function updateBlock(params: {
    dataType: 'markdown' | 'dom';
    data: string;
    id: string;
}): Promise<string> {
    const result = await request<BlockMutationResponse>('/block/updateBlock', params);
    return extractFirstMutationId(result);
}

export async function moveBlock(params: {
    id: string;
    parentID?: string;
    previousID?: string;
}): Promise<void> {
    await request('/block/moveBlock', params);
}

export async function deleteBlock(id: string): Promise<void> {
    await request('/block/deleteBlock', { id });
}

// ==================== 文件存储 ====================

/**
 * 读取插件数据文件
 */
export async function getFile(path: string): Promise<string | null> {
    try {
        const response = await fetch(`${API_BASE}/file/getFile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path }),
        });

        if (!response.ok) return null;
        return await response.text();
    } catch {
        return null;
    }
}

/**
 * 写入插件数据文件
 */
export async function putFile(path: string, file: string | Blob, isDir = false): Promise<void> {
    const formData = new FormData();
    formData.append('path', path);
    formData.append('isDir', String(isDir));

    if (typeof file === 'string') {
        formData.append('file', new Blob([file], { type: 'application/json' }));
    } else {
        formData.append('file', file);
    }

    const response = await fetch(`${API_BASE}/file/putFile`, {
        method: 'POST',
        body: formData,
    });

    const result: unknown = await response.json();
    if (!isApiEnvelope(result)) {
        throw new Error('Failed to write file: invalid response envelope');
    }
    if (result.code !== 0) {
        throw new Error(`Failed to write file: ${result.msg}`);
    }
}

/**
 * 删除文件
 */
export async function removeFile(path: string): Promise<void> {
    return request('/file/removeFile', { path });
}

// ==================== 通知 ====================

/**
 * 显示通知消息
 */
export async function pushMsg(msg: string, timeout = 7000): Promise<void> {
    return request('/notification/pushMsg', { msg, timeout });
}

/**
 * 显示错误通知
 */
export async function pushErrMsg(msg: string, timeout = 7000): Promise<void> {
    return request('/notification/pushErrMsg', { msg, timeout });
}

// ==================== 工具函数 ====================

/**
 * 获取插件数据存储路径
 */
export function getPluginDataPath(pluginName: string): string {
    return `/data/storage/petal/${pluginName}`;
}

/**
 * 解析块 DOM 为纯文本
 */
export function domToText(dom: string): string {
    const div = document.createElement('div');
    div.innerHTML = dom;
    return div.textContent || '';
}

/**
 * 解析块 DOM 为 HTML（去除思源特殊属性）
 */
export function domToHtml(dom: string): string {
    const div = document.createElement('div');
    div.innerHTML = dom;

    // 移除思源特殊属性
    div.querySelectorAll('[data-node-id]').forEach(el => {
        el.removeAttribute('data-node-id');
        el.removeAttribute('data-type');
        el.removeAttribute('data-subtype');
    });

    return div.innerHTML;
}
