/**
 * Quick-card WebSocket service.
 *
 * Responsibilities:
 * - Connect directly to Siyuan WebSocket
 * - Listen to transaction events
 * - Detect block content updates
 * - Trigger symbol detection / card creation pipeline
 * - Reconnect automatically
 * - Debounce burst updates
 */

import type FSRSPlugin from '@/index';
import { createLogger } from '@/utils/logger';
import { resolveWebSocketBaseUrl } from './runtime';
import { parseTransactionsPayload, parseWSMessage, type Transaction } from './transaction-types';

const logger = createLogger('QuickCardWebSocketService');

/**
 * Quick-card settings.
 */
export interface QuickCardSettings {
  enabled: boolean;
  enabledSymbols: {
    basic: boolean;
    concept: boolean;
    descriptor: boolean;
    cloze: boolean;
    multiLine: boolean;
  };
  debounceDelay: number;
  descriptorUseXiuyuan: boolean;
}

export class QuickCardWebSocketService {
  private plugin: FSRSPlugin;
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private pendingBlocks: Set<string> = new Set();
  private processing: Set<string> = new Set();
  private enabled = false;

  private readonly DEBOUNCE_DELAY = 300;
  private readonly RECONNECT_DELAY = 3000;

  constructor(plugin: FSRSPlugin) {
    this.plugin = plugin;
  }

  private getWebSocketURL(): string | null {
    const wsUrl = resolveWebSocketBaseUrl();
    if (!wsUrl) {
      logger.error('Unable to resolve WebSocket URL from runtime context');
      return null;
    }

    return wsUrl;
  }

  public start(): void {
    if (this.ws) {
      logger.info('Service already started');
      return;
    }

    logger.info('Starting service...');
    this.enabled = true;
    this.connect();
  }

  public stop(): void {
    logger.info('Stopping service...');
    this.enabled = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.ws) {
      this.ws.close(1000, 'Service stopped');
      this.ws = null;
    }

    this.pendingBlocks.clear();
    this.processing.clear();

    logger.info('Service stopped');
  }

  public setEnabled(enabled: boolean): void {
    logger.info('Setting enabled:', enabled);

    if (enabled && !this.enabled) {
      this.start();
    } else if (!enabled && this.enabled) {
      this.stop();
    }
  }

  private connect(): void {
    try {
      const wsUrl = this.getWebSocketURL();
      if (!wsUrl) {
        if (this.enabled) {
          this.reconnect();
        }
        return;
      }

      logger.info('Connecting to WebSocket:', wsUrl);
      const url = `${wsUrl}?app=siyuanmemo&type=main`;
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        logger.info('WebSocket connected');
      };

      this.ws.onmessage = event => {
        this.handleMessage(event);
      };

      this.ws.onerror = error => {
        logger.error('WebSocket error:', error);
      };

      this.ws.onclose = event => {
        logger.info('WebSocket closed:', event.code, event.reason);
        this.ws = null;

        if (event.code !== 1000 && this.enabled) {
          logger.info('Connection closed abnormally, reconnecting...');
          this.reconnect();
        }
      };
    } catch (error) {
      logger.error('Failed to connect:', error);

      if (this.enabled) {
        this.reconnect();
      }
    }
  }

  private reconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    logger.info(`Reconnecting in ${this.RECONNECT_DELAY}ms...`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.enabled) {
        this.connect();
      }
    }, this.RECONNECT_DELAY);
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const message = parseWSMessage(event.data);
      if (!message || message.cmd !== 'transactions') {
        return;
      }

      const transactions = parseTransactionsPayload(message.data);
      this.handleTransactions(transactions);
    } catch (error) {
      logger.error('Failed to parse message:', error);
    }
  }

  private handleTransactions(transactions: Transaction[]): void {
    if (transactions.length === 0) {
      return;
    }

    logger.info('Transaction received:', transactions.length);

    for (const transaction of transactions) {
      for (const operation of transaction.doOperations) {
        if (operation.action === 'insert' || operation.action === 'update') {
          logger.info('Operation:', operation.action, operation.id);
          this.queueBlockCheck(operation.id);
        }
      }
    }
  }

  private queueBlockCheck(blockId: string): void {
    this.pendingBlocks.add(blockId);

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.processQueue();
    }, this.DEBOUNCE_DELAY);
  }

  private async processQueue(): Promise<void> {
    const blocks = Array.from(this.pendingBlocks);
    logger.info('Processing queue, blocks:', blocks.length);

    this.pendingBlocks.clear();

    for (const blockId of blocks) {
      if (this.processing.has(blockId)) {
        logger.info(`Block ${blockId} is already being processed, skipping`);
        continue;
      }

      this.processing.add(blockId);
      try {
        await this.processBlock(blockId);
      } catch (error) {
        logger.error(`Failed to process block ${blockId}:`, error);
      } finally {
        this.processing.delete(blockId);
      }
    }
  }

  private async processBlock(blockId: string): Promise<void> {
    void this.plugin;
    logger.info(`Processing block: ${blockId}`);
    logger.info(`Block ${blockId} processed (placeholder)`);
  }
}
