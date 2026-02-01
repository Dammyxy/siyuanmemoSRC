/**
 * Tests for Observer Pattern Interfaces
 * 
 * Verifies that IDataSourceObserver and IObservableDataSource
 * interfaces are correctly defined and can be implemented.
 */

import { describe, it, expect, vi } from 'vitest';
import type { IDataSourceObserver, IObservableDataSource } from '../types';

describe('Observer Pattern Interfaces', () => {
  describe('IDataSourceObserver', () => {
    it('should allow implementation of observer interface', () => {
      // Given: A class implementing IDataSourceObserver
      class TestObserver implements IDataSourceObserver {
        public notificationCount = 0;
        
        onDataChanged(): void {
          this.notificationCount++;
        }
      }
      
      // When: Creating an instance
      const observer = new TestObserver();
      
      // Then: Should have the required method
      expect(observer.onDataChanged).toBeDefined();
      expect(typeof observer.onDataChanged).toBe('function');
      
      // When: Calling onDataChanged
      observer.onDataChanged();
      
      // Then: Should execute without errors
      expect(observer.notificationCount).toBe(1);
    });
  });
  
  describe('IObservableDataSource', () => {
    it('should allow implementation of observable data source', async () => {
      // Given: A simple observable data source implementation
      class TestDataSource implements IObservableDataSource<string> {
        private observers: IDataSourceObserver[] = [];
        private items: string[] = [];
        
        async getAll(): Promise<string[]> {
          return [...this.items];
        }
        
        async add(items: string[]): Promise<number> {
          this.items.push(...items);
          this.notifyObservers();
          return items.length;
        }
        
        async remove(items: string[]): Promise<number> {
          const initialLength = this.items.length;
          this.items = this.items.filter(item => !items.includes(item));
          const removed = initialLength - this.items.length;
          if (removed > 0) {
            this.notifyObservers();
          }
          return removed;
        }
        
        addObserver(observer: IDataSourceObserver): void {
          if (!this.observers.includes(observer)) {
            this.observers.push(observer);
          }
        }
        
        removeObserver(observer: IDataSourceObserver): void {
          const index = this.observers.indexOf(observer);
          if (index !== -1) {
            this.observers.splice(index, 1);
          }
        }
        
        private notifyObservers(): void {
          for (const observer of this.observers) {
            observer.onDataChanged();
          }
        }
      }
      
      // When: Creating instances
      const dataSource = new TestDataSource();
      const observer = {
        onDataChanged: vi.fn()
      };
      
      // Then: Should have all required methods
      expect(dataSource.getAll).toBeDefined();
      expect(dataSource.addObserver).toBeDefined();
      expect(dataSource.removeObserver).toBeDefined();
      
      // When: Registering an observer
      dataSource.addObserver(observer);
      
      // And: Adding items
      await dataSource.add(['item1', 'item2']);
      
      // Then: Observer should be notified
      expect(observer.onDataChanged).toHaveBeenCalledTimes(1);
      
      // When: Removing items
      await dataSource.remove(['item1']);
      
      // Then: Observer should be notified again
      expect(observer.onDataChanged).toHaveBeenCalledTimes(2);
    });
    
    it('should support multiple observers', async () => {
      // Given: A data source with multiple observers
      class TestDataSource implements IObservableDataSource<number> {
        private observers: IDataSourceObserver[] = [];
        private items: number[] = [];
        
        async getAll(): Promise<number[]> {
          return [...this.items];
        }
        
        async add(items: number[]): Promise<number> {
          this.items.push(...items);
          this.notifyObservers();
          return items.length;
        }
        
        addObserver(observer: IDataSourceObserver): void {
          if (!this.observers.includes(observer)) {
            this.observers.push(observer);
          }
        }
        
        removeObserver(observer: IDataSourceObserver): void {
          const index = this.observers.indexOf(observer);
          if (index !== -1) {
            this.observers.splice(index, 1);
          }
        }
        
        private notifyObservers(): void {
          for (const observer of this.observers) {
            observer.onDataChanged();
          }
        }
      }
      
      const dataSource = new TestDataSource();
      const observer1 = { onDataChanged: vi.fn() };
      const observer2 = { onDataChanged: vi.fn() };
      const observer3 = { onDataChanged: vi.fn() };
      
      // When: Registering multiple observers
      dataSource.addObserver(observer1);
      dataSource.addObserver(observer2);
      dataSource.addObserver(observer3);
      
      // And: Modifying data
      await dataSource.add([1, 2, 3]);
      
      // Then: All observers should be notified
      expect(observer1.onDataChanged).toHaveBeenCalledTimes(1);
      expect(observer2.onDataChanged).toHaveBeenCalledTimes(1);
      expect(observer3.onDataChanged).toHaveBeenCalledTimes(1);
    });
    
    it('should not register the same observer twice', async () => {
      // Given: A data source
      class TestDataSource implements IObservableDataSource<string> {
        private observers: IDataSourceObserver[] = [];
        
        async getAll(): Promise<string[]> {
          return [];
        }
        
        async add(items: string[]): Promise<number> {
          this.notifyObservers();
          return items.length;
        }
        
        addObserver(observer: IDataSourceObserver): void {
          if (!this.observers.includes(observer)) {
            this.observers.push(observer);
          }
        }
        
        removeObserver(observer: IDataSourceObserver): void {
          const index = this.observers.indexOf(observer);
          if (index !== -1) {
            this.observers.splice(index, 1);
          }
        }
        
        private notifyObservers(): void {
          for (const observer of this.observers) {
            observer.onDataChanged();
          }
        }
        
        getObserverCount(): number {
          return this.observers.length;
        }
      }
      
      const dataSource = new TestDataSource();
      const observer = { onDataChanged: vi.fn() };
      
      // When: Registering the same observer multiple times
      dataSource.addObserver(observer);
      dataSource.addObserver(observer);
      dataSource.addObserver(observer);
      
      // Then: Should only be registered once
      expect(dataSource.getObserverCount()).toBe(1);
      
      // When: Triggering notification
      await dataSource.add(['test']);
      
      // Then: Should only be called once
      expect(observer.onDataChanged).toHaveBeenCalledTimes(1);
    });
    
    it('should safely remove observers', async () => {
      // Given: A data source with observers
      class TestDataSource implements IObservableDataSource<string> {
        private observers: IDataSourceObserver[] = [];
        
        async getAll(): Promise<string[]> {
          return [];
        }
        
        async add(items: string[]): Promise<number> {
          this.notifyObservers();
          return items.length;
        }
        
        addObserver(observer: IDataSourceObserver): void {
          if (!this.observers.includes(observer)) {
            this.observers.push(observer);
          }
        }
        
        removeObserver(observer: IDataSourceObserver): void {
          const index = this.observers.indexOf(observer);
          if (index !== -1) {
            this.observers.splice(index, 1);
          }
        }
        
        private notifyObservers(): void {
          for (const observer of this.observers) {
            observer.onDataChanged();
          }
        }
      }
      
      const dataSource = new TestDataSource();
      const observer1 = { onDataChanged: vi.fn() };
      const observer2 = { onDataChanged: vi.fn() };
      
      dataSource.addObserver(observer1);
      dataSource.addObserver(observer2);
      
      // When: Removing one observer
      dataSource.removeObserver(observer1);
      
      // And: Triggering notification
      await dataSource.add(['test']);
      
      // Then: Only the remaining observer should be notified
      expect(observer1.onDataChanged).not.toHaveBeenCalled();
      expect(observer2.onDataChanged).toHaveBeenCalledTimes(1);
      
      // When: Removing a non-existent observer
      const observer3 = { onDataChanged: vi.fn() };
      dataSource.removeObserver(observer3);
      
      // Then: Should not throw an error
      await dataSource.add(['test2']);
      expect(observer2.onDataChanged).toHaveBeenCalledTimes(2);
    });
  });
  
  describe('Integration with Sequencer pattern', () => {
    it('should allow sequencer to implement observer and invalidate cache', async () => {
      // Given: A sequencer that implements IDataSourceObserver
      class TestSequencer implements IDataSourceObserver {
        private loaded = false;
        private items: string[] = [];
        
        constructor(private fetchAll: () => Promise<string[]>) {}
        
        onDataChanged(): void {
          // Invalidate cache
          this.loaded = false;
          this.items.length = 0;
        }
        
        async next(): Promise<string | null> {
          if (!this.loaded) {
            this.loaded = true;
            const fetched = await this.fetchAll();
            this.items.push(...fetched);
          }
          return this.items.shift() || null;
        }
        
        isLoaded(): boolean {
          return this.loaded;
        }
      }
      
      // And: A data source
      class TestDataSource implements IObservableDataSource<string> {
        private observers: IDataSourceObserver[] = [];
        private items: string[] = ['item1', 'item2'];
        
        async getAll(): Promise<string[]> {
          return [...this.items];
        }
        
        async remove(items: string[]): Promise<number> {
          const initialLength = this.items.length;
          this.items = this.items.filter(item => !items.includes(item));
          const removed = initialLength - this.items.length;
          if (removed > 0) {
            this.notifyObservers();
          }
          return removed;
        }
        
        addObserver(observer: IDataSourceObserver): void {
          if (!this.observers.includes(observer)) {
            this.observers.push(observer);
          }
        }
        
        removeObserver(observer: IDataSourceObserver): void {
          const index = this.observers.indexOf(observer);
          if (index !== -1) {
            this.observers.splice(index, 1);
          }
        }
        
        private notifyObservers(): void {
          for (const observer of this.observers) {
            observer.onDataChanged();
          }
        }
      }
      
      const dataSource = new TestDataSource();
      const sequencer = new TestSequencer(() => dataSource.getAll());
      
      // When: Registering sequencer as observer
      dataSource.addObserver(sequencer);
      
      // And: Loading data
      const item1 = await sequencer.next();
      expect(item1).toBe('item1');
      expect(sequencer.isLoaded()).toBe(true);
      
      // When: Data source changes
      await dataSource.remove(['item1']);
      
      // Then: Sequencer cache should be invalidated
      expect(sequencer.isLoaded()).toBe(false);
      
      // When: Accessing sequencer again
      const item2 = await sequencer.next();
      
      // Then: Should reload and get updated data
      expect(item2).toBe('item2');
      expect(sequencer.isLoaded()).toBe(true);
    });
  });
});
