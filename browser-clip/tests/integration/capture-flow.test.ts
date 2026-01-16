/**
 * Integration tests for the capture flow
 * Tests the interaction between capture, storage, and cleanup modules
 */

import { resetChromeMocks, setStorageValue, triggerAlarm } from '../helpers/setup.js';
import {
  addHttpEntry,
  addWsFrame,
  addSseEvent,
  getHttpEntries,
  getWsFrames,
  getSseEvents,
  clearAllData,
  getTotalCounts,
  getBufferTimeRange,
  deleteEntriesOlderThan,
  STORES
} from '../../lib/db.js';
import { buildHar, getHarStats } from '../../lib/har-builder.js';
import { sanitizeHar } from '../../lib/sanitizer.js';

describe('Capture Flow Integration', () => {
  beforeEach(async () => {
    resetChromeMocks();
    await clearAllData();
  });

  describe('Full Capture → Export Flow', () => {
    it('should capture HTTP requests and export to sanitized HAR', async () => {
      const now = Date.now();

      // Simulate captured HTTP entries
      await addHttpEntry({
        timestamp: now - 5000,
        tabId: 1,
        hostname: 'api.example.com',
        startedDateTime: new Date(now - 5000).toISOString(),
        request: {
          method: 'GET',
          url: 'https://api.example.com/data?token=secret123',
          headers: [
            { name: 'Authorization', value: 'Bearer my-secret-token' },
            { name: 'Accept', value: 'application/json' }
          ],
          queryString: [
            { name: 'token', value: 'secret123' }
          ],
          cookies: []
        },
        response: {
          status: 200,
          statusText: 'OK',
          headers: [
            { name: 'Content-Type', value: 'application/json' },
            { name: 'Set-Cookie', value: 'session=abc123' }
          ],
          cookies: [],
          content: {
            size: 500,
            mimeType: 'application/json',
            text: '{"data": "response"}'
          }
        },
        time: 150,
        resourceType: 'XHR'
      });

      await addHttpEntry({
        timestamp: now - 2000,
        tabId: 1,
        hostname: 'api.example.com',
        startedDateTime: new Date(now - 2000).toISOString(),
        request: {
          method: 'POST',
          url: 'https://api.example.com/submit',
          headers: [{ name: 'Content-Type', value: 'application/json' }],
          queryString: [],
          cookies: [],
          postData: {
            mimeType: 'application/json',
            text: '{"password": "mypassword"}'
          }
        },
        response: {
          status: 201,
          statusText: 'Created',
          headers: [],
          cookies: [],
          content: { size: 50, mimeType: 'application/json' }
        },
        time: 200,
        resourceType: 'XHR'
      });

      // Retrieve entries for clip
      const entries = await getHttpEntries(now - 10000, now);
      expect(entries.length).toBe(2);

      // Build HAR
      const har = buildHar(entries, [], []);
      expect(har.log.entries.length).toBe(2);

      // Verify HAR stats
      const stats = getHarStats(har);
      expect(stats.totalEntries).toBe(2);
      expect(stats.byResourceType['XHR']).toBe(2);

      // Sanitize HAR
      const sanitized = sanitizeHar(har);

      // Verify sensitive data is redacted
      const authHeader = sanitized.log.entries[0].request.headers
        .find(h => h.name === 'Authorization');
      expect(authHeader?.value).toBe('[REDACTED]');

      const cookieHeader = sanitized.log.entries[0].response.headers
        .find(h => h.name === 'Set-Cookie');
      expect(cookieHeader?.value).toBe('[REDACTED]');

      // Verify URL param is redacted
      expect(sanitized.log.entries[0].request.url).toContain('token=[REDACTED]');

      // Verify post data password is redacted
      const postData = JSON.parse(sanitized.log.entries[1].request.postData.text);
      expect(postData.password).toBe('[REDACTED]');
    });

    it('should capture mixed content types (HTTP, WS, SSE)', async () => {
      const now = Date.now();

      // HTTP request
      await addHttpEntry({
        timestamp: now - 5000,
        tabId: 1,
        hostname: 'example.com',
        request: { method: 'GET', url: 'https://example.com', headers: [] },
        response: { status: 200, headers: [], content: {} }
      } as any);

      // WebSocket frames
      await addWsFrame({
        timestamp: now - 4000,
        tabId: 1,
        hostname: 'example.com',
        connectionId: 'ws-1',
        url: 'wss://example.com/socket',
        direction: 'send',
        opcode: 1,
        data: '{"subscribe": "events"}',
        size: 24
      });

      await addWsFrame({
        timestamp: now - 3500,
        tabId: 1,
        hostname: 'example.com',
        connectionId: 'ws-1',
        url: 'wss://example.com/socket',
        direction: 'receive',
        opcode: 1,
        data: '{"status": "subscribed"}',
        size: 25
      });

      // SSE event
      await addSseEvent({
        timestamp: now - 3000,
        tabId: 1,
        hostname: 'example.com',
        url: 'https://example.com/events',
        eventType: 'update',
        data: '{"message": "new data"}',
        eventId: 'evt-1'
      });

      // Retrieve all content types
      const [httpEntries, wsFrames, sseEvents] = await Promise.all([
        getHttpEntries(now - 10000, now),
        getWsFrames(now - 10000, now),
        getSseEvents(now - 10000, now)
      ]);

      expect(httpEntries.length).toBe(1);
      expect(wsFrames.length).toBe(2);
      expect(sseEvents.length).toBe(1);

      // Build combined HAR
      const har = buildHar(httpEntries, wsFrames, sseEvents);

      expect(har.log.entries.length).toBe(1);
      expect(har.log._webSocketMessages.length).toBe(2);
      expect(har.log._serverSentEvents.length).toBe(1);

      // Verify WebSocket messages are ordered
      expect(har.log._webSocketMessages[0].type).toBe('send');
      expect(har.log._webSocketMessages[1].type).toBe('receive');
    });

    it('should filter entries by tab ID', async () => {
      const now = Date.now();

      // Entries from different tabs
      await addHttpEntry({
        timestamp: now,
        tabId: 1,
        hostname: 'tab1.com',
        request: { method: 'GET', url: 'https://tab1.com', headers: [] },
        response: { status: 200, headers: [], content: {} }
      } as any);

      await addHttpEntry({
        timestamp: now,
        tabId: 2,
        hostname: 'tab2.com',
        request: { method: 'GET', url: 'https://tab2.com', headers: [] },
        response: { status: 200, headers: [], content: {} }
      } as any);

      await addWsFrame({
        timestamp: now,
        tabId: 1,
        hostname: 'tab1.com',
        url: 'wss://tab1.com/ws'
      } as any);

      await addWsFrame({
        timestamp: now,
        tabId: 2,
        hostname: 'tab2.com',
        url: 'wss://tab2.com/ws'
      } as any);

      // Filter for tab 1 only
      const [http, ws] = await Promise.all([
        getHttpEntries(now - 1000, now + 1000, [1]),
        getWsFrames(now - 1000, now + 1000, [1])
      ]);

      expect(http.length).toBe(1);
      expect(http[0].hostname).toBe('tab1.com');
      expect(ws.length).toBe(1);
      expect(ws[0].hostname).toBe('tab1.com');
    });
  });

  describe('Buffer Management', () => {
    it('should track buffer time range correctly', async () => {
      const now = Date.now();
      const oldest = now - 60000;
      const middle = now - 30000;
      const newest = now - 1000;

      await addHttpEntry({ timestamp: oldest, tabId: 1, hostname: 'a.com' } as any);
      await addHttpEntry({ timestamp: middle, tabId: 1, hostname: 'b.com' } as any);
      await addHttpEntry({ timestamp: newest, tabId: 1, hostname: 'c.com' } as any);

      const range = await getBufferTimeRange();

      expect(range.oldest).toBe(oldest);
      expect(range.newest).toBe(newest);
    });

    it('should consider all store types for buffer range', async () => {
      const now = Date.now();

      await addHttpEntry({ timestamp: now - 5000, tabId: 1, hostname: 'a.com' } as any);
      await addWsFrame({ timestamp: now - 10000, tabId: 1, hostname: 'b.com' } as any); // Oldest
      await addSseEvent({ timestamp: now - 1000, tabId: 1, hostname: 'c.com' } as any); // Newest

      const range = await getBufferTimeRange();

      expect(range.oldest).toBe(now - 10000);
      expect(range.newest).toBe(now - 1000);
    });

    it('should track total counts across all stores', async () => {
      const now = Date.now();

      await addHttpEntry({ timestamp: now, tabId: 1 } as any);
      await addHttpEntry({ timestamp: now, tabId: 1 } as any);
      await addWsFrame({ timestamp: now, tabId: 1 } as any);
      await addSseEvent({ timestamp: now, tabId: 1 } as any);

      const counts = await getTotalCounts();

      expect(counts.httpEntries).toBe(2);
      expect(counts.wsFrames).toBe(1);
      expect(counts.sseEvents).toBe(1);
      expect(counts.total).toBe(4);
    });
  });

  describe('Cleanup Operations', () => {
    it('should clean up entries older than cutoff time', async () => {
      const now = Date.now();
      const oneDay = 24 * 60 * 60 * 1000;

      // Old entries (should be deleted)
      await addHttpEntry({ timestamp: now - oneDay - 1000, tabId: 1, hostname: 'old.com' } as any);
      await addWsFrame({ timestamp: now - oneDay - 2000, tabId: 1, hostname: 'old.com' } as any);

      // Recent entries (should be kept)
      await addHttpEntry({ timestamp: now - 1000, tabId: 1, hostname: 'recent.com' } as any);
      await addWsFrame({ timestamp: now - 500, tabId: 1, hostname: 'recent.com' } as any);

      // Perform cleanup
      const cutoff = now - oneDay;
      await deleteEntriesOlderThan(STORES.HTTP_ENTRIES, cutoff);
      await deleteEntriesOlderThan(STORES.WS_FRAMES, cutoff);

      // Verify
      const [http, ws] = await Promise.all([
        getHttpEntries(0, now + 1000),
        getWsFrames(0, now + 1000)
      ]);

      expect(http.length).toBe(1);
      expect(http[0].hostname).toBe('recent.com');
      expect(ws.length).toBe(1);
      expect(ws[0].hostname).toBe('recent.com');
    });

    it('should handle cleanup on empty stores gracefully', async () => {
      const cutoff = Date.now() - 1000;

      // Should not throw
      const deleted = await deleteEntriesOlderThan(STORES.HTTP_ENTRIES, cutoff);
      expect(deleted).toBe(0);
    });
  });

  describe('Multi-Tab Scenarios', () => {
    it('should capture and filter across multiple tabs', async () => {
      const now = Date.now();

      // Tab 1 - api.example.com
      await addHttpEntry({
        timestamp: now - 3000,
        tabId: 1,
        hostname: 'api.example.com',
        request: { method: 'GET', url: 'https://api.example.com/users', headers: [] },
        response: { status: 200, headers: [], content: {} }
      } as any);

      // Tab 2 - dashboard.example.com
      await addHttpEntry({
        timestamp: now - 2000,
        tabId: 2,
        hostname: 'dashboard.example.com',
        request: { method: 'GET', url: 'https://dashboard.example.com/', headers: [] },
        response: { status: 200, headers: [], content: {} }
      } as any);

      // Tab 3 - Other site
      await addHttpEntry({
        timestamp: now - 1000,
        tabId: 3,
        hostname: 'other.com',
        request: { method: 'GET', url: 'https://other.com/', headers: [] },
        response: { status: 200, headers: [], content: {} }
      } as any);

      // Get entries for tabs 1 and 2 only
      const entries = await getHttpEntries(now - 10000, now, [1, 2]);

      expect(entries.length).toBe(2);
      expect(entries.some(e => e.hostname === 'api.example.com')).toBe(true);
      expect(entries.some(e => e.hostname === 'dashboard.example.com')).toBe(true);
      expect(entries.some(e => e.hostname === 'other.com')).toBe(false);
    });
  });

  describe('HAR Export Quality', () => {
    it('should produce valid HAR 1.2 structure', async () => {
      const now = Date.now();

      await addHttpEntry({
        timestamp: now,
        tabId: 1,
        hostname: 'example.com',
        startedDateTime: new Date(now).toISOString(),
        request: {
          method: 'GET',
          url: 'https://example.com/',
          httpVersion: 'HTTP/1.1',
          headers: [],
          queryString: [],
          cookies: [],
          headersSize: -1,
          bodySize: 0
        },
        response: {
          status: 200,
          statusText: 'OK',
          httpVersion: 'HTTP/1.1',
          headers: [],
          cookies: [],
          content: { size: 100, mimeType: 'text/html' },
          redirectURL: '',
          headersSize: -1,
          bodySize: 100
        },
        time: 100,
        resourceType: 'Document'
      });

      const entries = await getHttpEntries(now - 1000, now + 1000);
      const har = buildHar(entries, [], []);

      // Validate HAR structure
      expect(har.log).toBeDefined();
      expect(har.log.version).toBe('1.2');
      expect(har.log.creator).toBeDefined();
      expect(har.log.creator.name).toBe('Browser Clip');
      expect(har.log.entries).toBeInstanceOf(Array);
      expect(har.log.pages).toBeInstanceOf(Array);

      // Validate entry structure
      const entry = har.log.entries[0];
      expect(entry.startedDateTime).toBeDefined();
      expect(entry.time).toBeDefined();
      expect(entry.request).toBeDefined();
      expect(entry.response).toBeDefined();
      expect(entry.cache).toBeDefined();
      expect(entry.timings).toBeDefined();
    });

    it('should preserve all request/response details', async () => {
      const now = Date.now();

      await addHttpEntry({
        timestamp: now,
        tabId: 1,
        hostname: 'api.test.com',
        startedDateTime: new Date(now).toISOString(),
        request: {
          method: 'POST',
          url: 'https://api.test.com/data',
          httpVersion: 'HTTP/2',
          headers: [
            { name: 'Content-Type', value: 'application/json' },
            { name: 'X-Request-ID', value: '12345' }
          ],
          queryString: [{ name: 'version', value: '2' }],
          cookies: [],
          headersSize: 150,
          bodySize: 50,
          postData: {
            mimeType: 'application/json',
            text: '{"key": "value"}'
          }
        },
        response: {
          status: 201,
          statusText: 'Created',
          httpVersion: 'HTTP/2',
          headers: [
            { name: 'Content-Type', value: 'application/json' },
            { name: 'X-Response-ID', value: '67890' }
          ],
          cookies: [],
          content: {
            size: 200,
            mimeType: 'application/json',
            text: '{"result": "success"}'
          },
          redirectURL: '',
          headersSize: 100,
          bodySize: 200
        },
        time: 250,
        resourceType: 'XHR'
      });

      const entries = await getHttpEntries(now - 1000, now + 1000);
      const har = buildHar(entries, [], []);
      const entry = har.log.entries[0];

      // Request details
      expect(entry.request.method).toBe('POST');
      expect(entry.request.url).toBe('https://api.test.com/data');
      expect(entry.request.headers.length).toBe(2);
      expect(entry.request.postData.text).toBe('{"key": "value"}');

      // Response details
      expect(entry.response.status).toBe(201);
      expect(entry.response.statusText).toBe('Created');
      expect(entry.response.content.text).toBe('{"result": "success"}');
    });
  });
});
