/**
 * Unit tests for lib/har-builder.js - HAR format builder
 */

import { buildHar, getHarStats, mergeHars } from '../../../lib/har-builder.js';

describe('HAR Builder', () => {
  const sampleHttpEntries = [
    {
      id: '1',
      timestamp: Date.now() - 2000,
      tabId: 1,
      hostname: 'example.com',
      startedDateTime: new Date(Date.now() - 2000).toISOString(),
      request: {
        method: 'GET',
        url: 'https://example.com/api/users',
        httpVersion: 'HTTP/1.1',
        headers: [{ name: 'Accept', value: 'application/json' }],
        queryString: [{ name: 'page', value: '1' }],
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
          size: 500,
          mimeType: 'application/json',
          text: '{"users": []}'
        },
        redirectURL: '',
        headersSize: -1,
        bodySize: 500
      },
      time: 150,
      resourceType: 'XHR'
    },
    {
      id: '2',
      timestamp: Date.now() - 1000,
      tabId: 1,
      hostname: 'example.com',
      startedDateTime: new Date(Date.now() - 1000).toISOString(),
      request: {
        method: 'POST',
        url: 'https://example.com/api/users',
        httpVersion: 'HTTP/1.1',
        headers: [{ name: 'Content-Type', value: 'application/json' }],
        queryString: [],
        cookies: [],
        headersSize: -1,
        bodySize: 50,
        postData: {
          mimeType: 'application/json',
          text: '{"name": "test"}'
        }
      },
      response: {
        status: 201,
        statusText: 'Created',
        httpVersion: 'HTTP/1.1',
        headers: [{ name: 'Content-Type', value: 'application/json' }],
        cookies: [],
        content: {
          size: 100,
          mimeType: 'application/json',
          text: '{"id": 1}'
        },
        redirectURL: '',
        headersSize: -1,
        bodySize: 100
      },
      time: 200,
      resourceType: 'XHR'
    }
  ];

  const sampleWsFrames = [
    {
      id: 'ws1',
      timestamp: Date.now() - 1500,
      tabId: 1,
      hostname: 'example.com',
      connectionId: 'conn-1',
      url: 'wss://example.com/socket',
      direction: 'send' as const,
      opcode: 1,
      data: '{"action": "subscribe"}',
      size: 23
    },
    {
      id: 'ws2',
      timestamp: Date.now() - 1400,
      tabId: 1,
      hostname: 'example.com',
      connectionId: 'conn-1',
      url: 'wss://example.com/socket',
      direction: 'receive' as const,
      opcode: 1,
      data: '{"status": "subscribed"}',
      size: 24
    }
  ];

  const sampleSseEvents = [
    {
      id: 'sse1',
      timestamp: Date.now() - 1300,
      tabId: 1,
      hostname: 'example.com',
      url: 'https://example.com/events',
      eventType: 'message',
      data: '{"update": "new"}',
      eventId: 'evt-1'
    }
  ];

  describe('buildHar', () => {
    it('should build valid HAR 1.2 structure', () => {
      const har = buildHar(sampleHttpEntries, [], []);

      expect(har).toHaveProperty('log');
      expect(har.log.version).toBe('1.2');
      expect(har.log.creator.name).toBe('Browser Clip');
      expect(har.log.creator.version).toBeDefined();
    });

    it('should include all HTTP entries sorted by timestamp', () => {
      const har = buildHar(sampleHttpEntries, [], []);

      expect(har.log.entries).toHaveLength(2);
      // Should be sorted by timestamp (oldest first)
      expect(har.log.entries[0].request.method).toBe('GET');
      expect(har.log.entries[1].request.method).toBe('POST');
    });

    it('should include request and response data', () => {
      const har = buildHar(sampleHttpEntries, [], []);

      const entry = har.log.entries[0];
      expect(entry.request.url).toBe('https://example.com/api/users');
      expect(entry.request.headers).toHaveLength(1);
      expect(entry.response.status).toBe(200);
      expect(entry.response.content.text).toBe('{"users": []}');
    });

    it('should include timings object', () => {
      const har = buildHar(sampleHttpEntries, [], []);

      const entry = har.log.entries[0];
      expect(entry.timings).toBeDefined();
      expect(entry.timings.wait).toBe(150);
    });

    it('should include custom fields for tab and resource type', () => {
      const har = buildHar(sampleHttpEntries, [], []);

      const entry = har.log.entries[0];
      expect(entry._tabId).toBe(1);
      expect(entry._hostname).toBe('example.com');
      expect(entry._resourceType).toBe('XHR');
    });

    it('should build pages from hostnames', () => {
      const har = buildHar(sampleHttpEntries, [], []);

      expect(har.log.pages).toHaveLength(1);
      expect(har.log.pages[0].id).toBe('example.com');
      expect(har.log.pages[0].title).toBe('example.com');
    });

    it('should include WebSocket messages in extended format', () => {
      const har = buildHar([], sampleWsFrames, []);

      expect(har.log._webSocketMessages).toHaveLength(2);
      expect(har.log._webSocketMessages[0].type).toBe('send');
      expect(har.log._webSocketMessages[1].type).toBe('receive');
      expect(har.log._webSocketMessages[0].url).toBe('wss://example.com/socket');
    });

    it('should include SSE events in extended format', () => {
      const har = buildHar([], [], sampleSseEvents);

      expect(har.log._serverSentEvents).toHaveLength(1);
      expect(har.log._serverSentEvents[0].event).toBe('message');
      expect(har.log._serverSentEvents[0].data).toBe('{"update": "new"}');
    });

    it('should sort WebSocket messages by timestamp', () => {
      const har = buildHar([], sampleWsFrames, []);

      const timestamps = har.log._webSocketMessages.map(m => new Date(m.timestamp).getTime());
      expect(timestamps[0]).toBeLessThan(timestamps[1]);
    });

    it('should build complete HAR with all data types', () => {
      const har = buildHar(sampleHttpEntries, sampleWsFrames, sampleSseEvents);

      expect(har.log.entries).toHaveLength(2);
      expect(har.log._webSocketMessages).toHaveLength(2);
      expect(har.log._serverSentEvents).toHaveLength(1);
    });

    it('should handle empty arrays', () => {
      const har = buildHar([], [], []);

      expect(har.log.entries).toHaveLength(0);
      expect(har.log._webSocketMessages).toHaveLength(0);
      expect(har.log._serverSentEvents).toHaveLength(0);
      expect(har.log.pages).toHaveLength(0);
    });
  });

  describe('getHarStats', () => {
    it('should calculate total entries', () => {
      const har = buildHar(sampleHttpEntries, sampleWsFrames, sampleSseEvents);
      const stats = getHarStats(har);

      expect(stats.totalEntries).toBe(2);
    });

    it('should calculate WebSocket and SSE counts', () => {
      const har = buildHar(sampleHttpEntries, sampleWsFrames, sampleSseEvents);
      const stats = getHarStats(har);

      expect(stats.wsMessages).toBe(2);
      expect(stats.sseEvents).toBe(1);
    });

    it('should calculate total size', () => {
      const har = buildHar(sampleHttpEntries, [], []);
      const stats = getHarStats(har);

      expect(stats.totalSize).toBe(600); // 500 + 100
    });

    it('should group entries by resource type', () => {
      const har = buildHar(sampleHttpEntries, [], []);
      const stats = getHarStats(har);

      expect(stats.byResourceType['XHR']).toBe(2);
    });

    it('should group entries by hostname', () => {
      const har = buildHar(sampleHttpEntries, [], []);
      const stats = getHarStats(har);

      expect(stats.byHostname['example.com']).toBe(2);
    });

    it('should group entries by status code', () => {
      const har = buildHar(sampleHttpEntries, [], []);
      const stats = getHarStats(har);

      expect(stats.byStatus['2xx']).toBe(2);
    });
  });

  describe('mergeHars', () => {
    it('should return null for empty array', () => {
      const merged = mergeHars([]);
      expect(merged).toBeNull();
    });

    it('should return single HAR unchanged', () => {
      const har = buildHar(sampleHttpEntries, [], []);
      const merged = mergeHars([har]);

      expect(merged).toBe(har);
    });

    it('should merge multiple HARs', () => {
      const har1 = buildHar([sampleHttpEntries[0]], [], []);
      const har2 = buildHar([sampleHttpEntries[1]], [], []);

      const merged = mergeHars([har1, har2]);

      expect(merged!.log.entries).toHaveLength(2);
    });

    it('should merge WebSocket messages', () => {
      const har1 = buildHar([], [sampleWsFrames[0]], []);
      const har2 = buildHar([], [sampleWsFrames[1]], []);

      const merged = mergeHars([har1, har2]);

      expect(merged!.log._webSocketMessages).toHaveLength(2);
    });

    it('should merge SSE events', () => {
      const har1 = buildHar([], [], [sampleSseEvents[0]]);
      const har2 = buildHar([], [], [{ ...sampleSseEvents[0], id: 'sse2' }]);

      const merged = mergeHars([har1, har2]);

      expect(merged!.log._serverSentEvents).toHaveLength(2);
    });

    it('should deduplicate pages', () => {
      const har1 = buildHar(sampleHttpEntries, [], []);
      const har2 = buildHar(sampleHttpEntries, [], []);

      const merged = mergeHars([har1, har2]);

      expect(merged!.log.pages).toHaveLength(1);
    });

    it('should sort merged entries by timestamp', () => {
      // Create entries with specific timestamps to test sorting
      const oldEntry = { ...sampleHttpEntries[0], startedDateTime: '2024-01-01T10:00:00Z' };
      const newEntry = { ...sampleHttpEntries[1], startedDateTime: '2024-01-01T11:00:00Z' };

      const har1 = buildHar([newEntry], [], []);
      const har2 = buildHar([oldEntry], [], []);

      const merged = mergeHars([har1, har2]);

      expect(new Date(merged!.log.entries[0].startedDateTime).getTime())
        .toBeLessThan(new Date(merged!.log.entries[1].startedDateTime).getTime());
    });
  });
});
