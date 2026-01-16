/**
 * Unit tests for lib/db.js - IndexedDB wrapper
 */

import {
  openDB,
  addHttpEntry,
  addWsFrame,
  addSseEvent,
  getHttpEntries,
  getWsFrames,
  getSseEvents,
  deleteEntriesOlderThan,
  deleteOldestEntries,
  getStoreCount,
  getBufferTimeRange,
  setMetadata,
  getMetadata,
  clearAllData,
  getUniqueHostnames,
  getTotalCounts,
  STORES
} from '../../../lib/db.js';

describe('IndexedDB Wrapper', () => {
  beforeEach(async () => {
    // Clear all data before each test
    await clearAllData();
  });

  describe('Database Initialization', () => {
    it('should open database successfully', async () => {
      const db = await openDB();
      expect(db).toBeDefined();
      expect(db.name).toBe('BrowserClipDB');
    });

    it('should create all required object stores', async () => {
      const db = await openDB();
      expect(db.objectStoreNames.contains(STORES.HTTP_ENTRIES)).toBe(true);
      expect(db.objectStoreNames.contains(STORES.WS_FRAMES)).toBe(true);
      expect(db.objectStoreNames.contains(STORES.SSE_EVENTS)).toBe(true);
      expect(db.objectStoreNames.contains(STORES.METADATA)).toBe(true);
    });

    it('should return same instance on subsequent calls', async () => {
      const db1 = await openDB();
      const db2 = await openDB();
      expect(db1).toBe(db2);
    });
  });

  describe('HTTP Entries', () => {
    const sampleHttpEntry = {
      timestamp: Date.now(),
      tabId: 1,
      hostname: 'example.com',
      startedDateTime: new Date().toISOString(),
      request: {
        method: 'GET',
        url: 'https://example.com/api/data',
        httpVersion: 'HTTP/1.1',
        headers: [{ name: 'Accept', value: 'application/json' }],
        queryString: [],
        cookies: [],
        headersSize: -1,
        bodySize: 0
      },
      response: {
        status: 200,
        statusText: 'OK',
        httpVersion: 'HTTP/1.1',
        headers: [{ name: 'Content-Type', value: 'application/json' }],
        cookies: [],
        content: {
          size: 100,
          mimeType: 'application/json',
          text: '{"data": "test"}'
        },
        redirectURL: '',
        headersSize: -1,
        bodySize: 100
      },
      time: 150,
      resourceType: 'XHR'
    };

    it('should add HTTP entry successfully', async () => {
      const id = await addHttpEntry(sampleHttpEntry);
      expect(id).toBeDefined();
    });

    it('should retrieve HTTP entries by time range', async () => {
      const now = Date.now();

      // Add entries with different timestamps
      await addHttpEntry({ ...sampleHttpEntry, timestamp: now - 5000 });
      await addHttpEntry({ ...sampleHttpEntry, timestamp: now - 3000 });
      await addHttpEntry({ ...sampleHttpEntry, timestamp: now - 1000 });

      const entries = await getHttpEntries(now - 4000, now);
      expect(entries.length).toBe(2);
    });

    it('should filter HTTP entries by tabId', async () => {
      const now = Date.now();

      await addHttpEntry({ ...sampleHttpEntry, timestamp: now, tabId: 1 });
      await addHttpEntry({ ...sampleHttpEntry, timestamp: now, tabId: 2 });
      await addHttpEntry({ ...sampleHttpEntry, timestamp: now, tabId: 1 });

      const entries = await getHttpEntries(now - 1000, now + 1000, [1]);
      expect(entries.length).toBe(2);
      expect(entries.every(e => e.tabId === 1)).toBe(true);
    });

    it('should return all entries when tabIds is null', async () => {
      const now = Date.now();

      await addHttpEntry({ ...sampleHttpEntry, timestamp: now, tabId: 1 });
      await addHttpEntry({ ...sampleHttpEntry, timestamp: now, tabId: 2 });

      const entries = await getHttpEntries(now - 1000, now + 1000, null);
      expect(entries.length).toBe(2);
    });
  });

  describe('WebSocket Frames', () => {
    const sampleWsFrame = {
      timestamp: Date.now(),
      tabId: 1,
      hostname: 'example.com',
      connectionId: 'ws-123',
      url: 'wss://example.com/socket',
      direction: 'receive' as const,
      opcode: 1,
      data: '{"message": "hello"}',
      size: 20
    };

    it('should add WebSocket frame successfully', async () => {
      const id = await addWsFrame(sampleWsFrame);
      expect(id).toBeDefined();
    });

    it('should retrieve WebSocket frames by time range', async () => {
      const now = Date.now();

      await addWsFrame({ ...sampleWsFrame, timestamp: now - 2000, direction: 'send' });
      await addWsFrame({ ...sampleWsFrame, timestamp: now - 1000, direction: 'receive' });

      const frames = await getWsFrames(now - 3000, now);
      expect(frames.length).toBe(2);
    });

    it('should filter WebSocket frames by tabId', async () => {
      const now = Date.now();

      await addWsFrame({ ...sampleWsFrame, timestamp: now, tabId: 1 });
      await addWsFrame({ ...sampleWsFrame, timestamp: now, tabId: 2 });

      const frames = await getWsFrames(now - 1000, now + 1000, [2]);
      expect(frames.length).toBe(1);
      expect(frames[0].tabId).toBe(2);
    });
  });

  describe('SSE Events', () => {
    const sampleSseEvent = {
      timestamp: Date.now(),
      tabId: 1,
      hostname: 'example.com',
      url: 'https://example.com/events',
      eventType: 'message',
      data: '{"update": "new data"}',
      eventId: 'evt-123'
    };

    it('should add SSE event successfully', async () => {
      const id = await addSseEvent(sampleSseEvent);
      expect(id).toBeDefined();
    });

    it('should retrieve SSE events by time range', async () => {
      const now = Date.now();

      await addSseEvent({ ...sampleSseEvent, timestamp: now - 2000 });
      await addSseEvent({ ...sampleSseEvent, timestamp: now - 1000 });

      const events = await getSseEvents(now - 3000, now);
      expect(events.length).toBe(2);
    });
  });

  describe('Cleanup Operations', () => {
    it('should delete entries older than timestamp', async () => {
      const now = Date.now();

      await addHttpEntry({
        timestamp: now - 10000,
        tabId: 1,
        hostname: 'old.com',
        request: {},
        response: {}
      } as any);
      await addHttpEntry({
        timestamp: now - 1000,
        tabId: 1,
        hostname: 'new.com',
        request: {},
        response: {}
      } as any);

      const deleted = await deleteEntriesOlderThan(STORES.HTTP_ENTRIES, now - 5000);
      expect(deleted).toBe(1);

      const remaining = await getHttpEntries(0, now + 1000);
      expect(remaining.length).toBe(1);
      expect(remaining[0].hostname).toBe('new.com');
    });

    it('should delete oldest entries by count', async () => {
      const now = Date.now();

      await addHttpEntry({ timestamp: now - 3000, tabId: 1, hostname: 'first.com' } as any);
      await addHttpEntry({ timestamp: now - 2000, tabId: 1, hostname: 'second.com' } as any);
      await addHttpEntry({ timestamp: now - 1000, tabId: 1, hostname: 'third.com' } as any);

      const deleted = await deleteOldestEntries(STORES.HTTP_ENTRIES, 2);
      expect(deleted).toBe(2);

      const remaining = await getHttpEntries(0, now + 1000);
      expect(remaining.length).toBe(1);
      expect(remaining[0].hostname).toBe('third.com');
    });
  });

  describe('Store Statistics', () => {
    it('should get store count', async () => {
      const now = Date.now();

      await addHttpEntry({ timestamp: now, tabId: 1, hostname: 'a.com' } as any);
      await addHttpEntry({ timestamp: now, tabId: 1, hostname: 'b.com' } as any);
      await addHttpEntry({ timestamp: now, tabId: 1, hostname: 'c.com' } as any);

      const count = await getStoreCount(STORES.HTTP_ENTRIES);
      expect(count).toBe(3);
    });

    it('should get total counts across all stores', async () => {
      const now = Date.now();

      await addHttpEntry({ timestamp: now, tabId: 1, hostname: 'a.com' } as any);
      await addHttpEntry({ timestamp: now, tabId: 1, hostname: 'b.com' } as any);
      await addWsFrame({ timestamp: now, tabId: 1, hostname: 'a.com' } as any);
      await addSseEvent({ timestamp: now, tabId: 1, hostname: 'a.com' } as any);

      const counts = await getTotalCounts();
      expect(counts.httpEntries).toBe(2);
      expect(counts.wsFrames).toBe(1);
      expect(counts.sseEvents).toBe(1);
      expect(counts.total).toBe(4);
    });

    it('should get buffer time range', async () => {
      const now = Date.now();
      const oldest = now - 10000;
      const newest = now - 1000;

      await addHttpEntry({ timestamp: oldest, tabId: 1, hostname: 'a.com' } as any);
      await addHttpEntry({ timestamp: newest, tabId: 1, hostname: 'b.com' } as any);

      const range = await getBufferTimeRange();
      expect(range.oldest).toBe(oldest);
      expect(range.newest).toBe(newest);
    });

    it('should return null for empty buffer time range', async () => {
      const range = await getBufferTimeRange();
      expect(range.oldest).toBeNull();
      expect(range.newest).toBeNull();
    });
  });

  describe('Metadata', () => {
    it('should set and get metadata', async () => {
      await setMetadata('testKey', { value: 'testValue', count: 42 });

      const retrieved = await getMetadata('testKey');
      expect(retrieved).toEqual({ value: 'testValue', count: 42 });
    });

    it('should return undefined for non-existent metadata', async () => {
      const retrieved = await getMetadata('nonExistentKey');
      expect(retrieved).toBeUndefined();
    });

    it('should overwrite existing metadata', async () => {
      await setMetadata('key', 'first');
      await setMetadata('key', 'second');

      const retrieved = await getMetadata('key');
      expect(retrieved).toBe('second');
    });
  });

  describe('Unique Hostnames', () => {
    it('should get unique hostnames from entries', async () => {
      const now = Date.now();

      await addHttpEntry({ timestamp: now, tabId: 1, hostname: 'example.com' } as any);
      await addHttpEntry({ timestamp: now, tabId: 1, hostname: 'test.com' } as any);
      await addHttpEntry({ timestamp: now, tabId: 1, hostname: 'example.com' } as any);
      await addWsFrame({ timestamp: now, tabId: 1, hostname: 'ws.example.com' } as any);

      const hostnames = await getUniqueHostnames(now - 1000, now + 1000);
      expect(hostnames).toHaveLength(3);
      expect(hostnames).toContain('example.com');
      expect(hostnames).toContain('test.com');
      expect(hostnames).toContain('ws.example.com');
    });
  });

  describe('Clear All Data', () => {
    it('should clear all data from all stores', async () => {
      const now = Date.now();

      await addHttpEntry({ timestamp: now, tabId: 1, hostname: 'a.com' } as any);
      await addWsFrame({ timestamp: now, tabId: 1, hostname: 'b.com' } as any);
      await addSseEvent({ timestamp: now, tabId: 1, hostname: 'c.com' } as any);

      await clearAllData();

      const counts = await getTotalCounts();
      expect(counts.total).toBe(0);
    });
  });
});
