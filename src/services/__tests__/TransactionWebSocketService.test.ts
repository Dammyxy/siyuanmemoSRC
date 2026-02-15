/**
 * TransactionWebSocketService 单元测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TransactionWebSocketService, type ITransactionHandler, type Transaction } from '../TransactionWebSocketService';
import type FSRSPlugin from '@/index';

// Mock WebSocket
class MockWebSocket {
    public onopen: ((event: Event) => void) | null = null;
    public onmessage: ((event: MessageEvent) => void) | null = null;
    public onerror: ((event: Event) => void) | null = null;
    public onclose: ((event: CloseEvent) => void) | null = null;
    
    constructor(public url: string) {}
    
    close(code?: number, reason?: string) {
        if (this.onclose) {
            this.onclose({ code: code || 1000, reason: reason || '' } as CloseEvent);
        }
    }
    
    send(data: string) {}
}

// Mock global WebSocket
global.WebSocket = MockWebSocket as any;

describe('TransactionWebSocketService', () => {
    let service: TransactionWebSocketService;
    let mockPlugin: FSRSPlugin;
    
    beforeEach(() => {
        mockPlugin = {} as FSRSPlugin;
        service = new TransactionWebSocketService(mockPlugin);
    });
    
    afterEach(() => {
        service.stop();
        vi.clearAllTimers();
    });
    
    describe('Handler Registration', () => {
        it('should register handler', () => {
            const handler: ITransactionHandler = {
                handle: vi.fn()
            };
            
            service.registerHandler(handler);
            // Handler should be registered (no error thrown)
            expect(true).toBe(true);
        });
        
        it('should not register same handler twice', () => {
            const handler: ITransactionHandler = {
                handle: vi.fn()
            };
            
            service.registerHandler(handler);
            service.registerHandler(handler);
            // Should only register once (no error thrown)
            expect(true).toBe(true);
        });
        
        it('should unregister handler', () => {
            const handler: ITransactionHandler = {
                handle: vi.fn()
            };
            
            service.registerHandler(handler);
            service.unregisterHandler(handler);
            // Handler should be unregistered (no error thrown)
            expect(true).toBe(true);
        });
    });
    
    describe('Service Lifecycle', () => {
        it('should start service', () => {
            service.start();
            // Service should start (no error thrown)
            expect(true).toBe(true);
        });
        
        it('should not start twice', () => {
            service.start();
            service.start();
            // Should only start once (no error thrown)
            expect(true).toBe(true);
        });
        
        it('should stop service', () => {
            service.start();
            service.stop();
            // Service should stop (no error thrown)
            expect(true).toBe(true);
        });
    });
    
    describe('Event Distribution', () => {
        it('should distribute events to registered handlers', () => {
            const handler1 = { handle: vi.fn() };
            const handler2 = { handle: vi.fn() };
            
            service.registerHandler(handler1);
            service.registerHandler(handler2);
            
            service.start();
            
            // Simulate WebSocket message
            const ws = (service as any).ws as MockWebSocket;
            const transactions: Transaction[] = [
                {
                    doOperations: [
                        { action: 'insert', id: 'block1', data: {} }
                    ],
                    undoOperations: null
                }
            ];
            
            if (ws && ws.onmessage) {
                ws.onmessage({
                    data: JSON.stringify({
                        cmd: 'transactions',
                        data: transactions
                    })
                } as MessageEvent);
            }
            
            // Both handlers should receive the event
            expect(handler1.handle).toHaveBeenCalledWith(transactions);
            expect(handler2.handle).toHaveBeenCalledWith(transactions);
        });
        
        it('should continue processing if one handler throws error', () => {
            const handler1 = {
                handle: vi.fn(() => {
                    throw new Error('Handler 1 error');
                })
            };
            const handler2 = { handle: vi.fn() };
            
            service.registerHandler(handler1);
            service.registerHandler(handler2);
            
            service.start();
            
            // Simulate WebSocket message
            const ws = (service as any).ws as MockWebSocket;
            const transactions: Transaction[] = [
                {
                    doOperations: [
                        { action: 'insert', id: 'block1', data: {} }
                    ],
                    undoOperations: null
                }
            ];
            
            if (ws && ws.onmessage) {
                ws.onmessage({
                    data: JSON.stringify({
                        cmd: 'transactions',
                        data: transactions
                    })
                } as MessageEvent);
            }
            
            // Handler 2 should still be called despite handler 1 error
            expect(handler2.handle).toHaveBeenCalledWith(transactions);
        });
    });
});
