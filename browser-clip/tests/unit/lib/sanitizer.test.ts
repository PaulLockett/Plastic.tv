/**
 * Unit tests for lib/sanitizer.js - Sensitive data sanitization
 */

import {
  sanitizeHar,
  sanitizeEntry,
  sanitizeHeaders,
  sanitizeUrl,
  previewRedactions,
  isSensitiveHeader,
  isSensitiveParam,
  SENSITIVE_PATTERNS,
  REDACTED
} from '../../../lib/sanitizer.js';

describe('Sanitizer', () => {
  describe('isSensitiveHeader', () => {
    it('should detect authorization header', () => {
      expect(isSensitiveHeader('Authorization')).toBe(true);
      expect(isSensitiveHeader('authorization')).toBe(true);
      expect(isSensitiveHeader('AUTHORIZATION')).toBe(true);
    });

    it('should detect cookie headers', () => {
      expect(isSensitiveHeader('Cookie')).toBe(true);
      expect(isSensitiveHeader('Set-Cookie')).toBe(true);
    });

    it('should detect headers containing sensitive patterns', () => {
      expect(isSensitiveHeader('X-Auth-Token')).toBe(true);
      expect(isSensitiveHeader('X-API-Key')).toBe(true);
      expect(isSensitiveHeader('X-Access-Token')).toBe(true);
      expect(isSensitiveHeader('X-Session-Id')).toBe(true);
      expect(isSensitiveHeader('X-Secret-Value')).toBe(true);
      expect(isSensitiveHeader('X-Password-Hash')).toBe(true);
      expect(isSensitiveHeader('X-Credential')).toBe(true);
    });

    it('should not flag non-sensitive headers', () => {
      expect(isSensitiveHeader('Content-Type')).toBe(false);
      expect(isSensitiveHeader('Accept')).toBe(false);
      expect(isSensitiveHeader('User-Agent')).toBe(false);
      expect(isSensitiveHeader('Cache-Control')).toBe(false);
    });

    it('should detect custom patterns', () => {
      expect(isSensitiveHeader('X-Custom-Header', ['custom'])).toBe(true);
      expect(isSensitiveHeader('X-My-Special', ['special'])).toBe(true);
    });
  });

  describe('isSensitiveParam', () => {
    it('should detect sensitive URL parameters', () => {
      expect(isSensitiveParam('token')).toBe(true);
      expect(isSensitiveParam('access_token')).toBe(true);
      expect(isSensitiveParam('api_key')).toBe(true);
      expect(isSensitiveParam('apiKey')).toBe(true);
      expect(isSensitiveParam('password')).toBe(true);
      expect(isSensitiveParam('secret')).toBe(true);
    });

    it('should not flag non-sensitive parameters', () => {
      expect(isSensitiveParam('page')).toBe(false);
      expect(isSensitiveParam('limit')).toBe(false);
      expect(isSensitiveParam('id')).toBe(false);
      expect(isSensitiveParam('name')).toBe(false);
    });
  });

  describe('sanitizeHeaders', () => {
    it('should redact sensitive headers', () => {
      const headers = [
        { name: 'Authorization', value: 'Bearer secret-token' },
        { name: 'Content-Type', value: 'application/json' },
        { name: 'X-API-Key', value: 'my-api-key' }
      ];

      const sanitized = sanitizeHeaders(headers);

      expect(sanitized[0].value).toBe(REDACTED);
      expect(sanitized[1].value).toBe('application/json');
      expect(sanitized[2].value).toBe(REDACTED);
    });

    it('should handle empty headers array', () => {
      expect(sanitizeHeaders([])).toEqual([]);
    });

    it('should handle null/undefined headers', () => {
      expect(sanitizeHeaders(null as any)).toBeNull();
      expect(sanitizeHeaders(undefined as any)).toBeUndefined();
    });

    it('should apply custom patterns', () => {
      const headers = [
        { name: 'X-My-Custom', value: 'secret' },
        { name: 'Content-Type', value: 'text/html' }
      ];

      const sanitized = sanitizeHeaders(headers, ['custom']);

      expect(sanitized[0].value).toBe(REDACTED);
      expect(sanitized[1].value).toBe('text/html');
    });
  });

  describe('sanitizeUrl', () => {
    // URL encoding converts [REDACTED] to %5BREDACTED%5D
    const REDACTED_ENCODED = encodeURIComponent(REDACTED);

    it('should redact sensitive URL parameters', () => {
      const url = 'https://example.com/api?token=secret123&page=1';
      const sanitized = sanitizeUrl(url, true);

      expect(sanitized).toContain('token=' + REDACTED_ENCODED);
      expect(sanitized).toContain('page=1');
    });

    it('should handle multiple sensitive parameters', () => {
      const url = 'https://example.com/api?access_token=abc&api_key=xyz&id=123';
      const sanitized = sanitizeUrl(url, true);

      expect(sanitized).toContain('access_token=' + REDACTED_ENCODED);
      expect(sanitized).toContain('api_key=' + REDACTED_ENCODED);
      expect(sanitized).toContain('id=123');
    });

    it('should not modify URL when sanitization is disabled', () => {
      const url = 'https://example.com/api?token=secret';
      const sanitized = sanitizeUrl(url, false);

      expect(sanitized).toBe(url);
    });

    it('should handle URLs without parameters', () => {
      const url = 'https://example.com/api';
      const sanitized = sanitizeUrl(url, true);

      expect(sanitized).toBe(url);
    });

    it('should handle invalid URLs gracefully', () => {
      const url = 'not-a-valid-url';
      const sanitized = sanitizeUrl(url, true);

      expect(sanitized).toBe(url);
    });
  });

  describe('sanitizeEntry', () => {
    const sampleEntry = {
      startedDateTime: new Date().toISOString(),
      time: 100,
      request: {
        method: 'GET',
        url: 'https://example.com/api?token=secret&page=1',
        httpVersion: 'HTTP/1.1',
        headers: [
          { name: 'Authorization', value: 'Bearer token123' },
          { name: 'Content-Type', value: 'application/json' }
        ],
        queryString: [
          { name: 'token', value: 'secret' },
          { name: 'page', value: '1' }
        ],
        cookies: [{ name: 'session', value: 'abc123' }],
        headersSize: -1,
        bodySize: 0
      },
      response: {
        status: 200,
        statusText: 'OK',
        httpVersion: 'HTTP/1.1',
        headers: [
          { name: 'Set-Cookie', value: 'session=xyz' },
          { name: 'Content-Type', value: 'application/json' }
        ],
        cookies: [{ name: 'session', value: 'xyz' }],
        content: {
          size: 100,
          mimeType: 'application/json',
          text: '{"data": "test"}'
        },
        redirectURL: '',
        headersSize: -1,
        bodySize: 100
      },
      cache: {},
      timings: {}
    };

    it('should sanitize request headers', () => {
      const sanitized = sanitizeEntry(sampleEntry);

      const authHeader = sanitized.request.headers.find(h => h.name === 'Authorization');
      expect(authHeader?.value).toBe(REDACTED);
    });

    it('should sanitize response headers', () => {
      const sanitized = sanitizeEntry(sampleEntry);

      const cookieHeader = sanitized.response.headers.find(h => h.name === 'Set-Cookie');
      expect(cookieHeader?.value).toBe(REDACTED);
    });

    it('should clear cookies arrays', () => {
      const sanitized = sanitizeEntry(sampleEntry);

      expect(sanitized.request.cookies).toEqual([]);
      expect(sanitized.response.cookies).toEqual([]);
    });

    it('should sanitize URL parameters', () => {
      const sanitized = sanitizeEntry(sampleEntry);
      // URL encoding converts [REDACTED] to %5BREDACTED%5D
      const REDACTED_ENCODED = encodeURIComponent(REDACTED);

      expect(sanitized.request.url).toContain('token=' + REDACTED_ENCODED);
      expect(sanitized.request.url).toContain('page=1');
    });

    it('should sanitize query string array', () => {
      const sanitized = sanitizeEntry(sampleEntry);

      const tokenParam = sanitized.request.queryString.find(q => q.name === 'token');
      const pageParam = sanitized.request.queryString.find(q => q.name === 'page');

      expect(tokenParam?.value).toBe(REDACTED);
      expect(pageParam?.value).toBe('1');
    });

    it('should not sanitize URL params when disabled', () => {
      const sanitized = sanitizeEntry(sampleEntry, { sanitizeUrlParams: false });

      expect(sanitized.request.url).toContain('token=secret');
    });

    it('should sanitize JSON post data', () => {
      const entryWithPostData = {
        ...sampleEntry,
        request: {
          ...sampleEntry.request,
          postData: {
            mimeType: 'application/json',
            text: JSON.stringify({
              username: 'user',
              password: 'secret123',
              data: 'normal'
            })
          }
        }
      };

      const sanitized = sanitizeEntry(entryWithPostData);
      const postData = JSON.parse(sanitized.request.postData!.text);

      expect(postData.username).toBe('user');
      expect(postData.password).toBe(REDACTED);
      expect(postData.data).toBe('normal');
    });
  });

  describe('sanitizeHar', () => {
    const sampleHar = {
      log: {
        version: '1.2',
        creator: { name: 'Test', version: '1.0' },
        entries: [
          {
            startedDateTime: new Date().toISOString(),
            time: 100,
            request: {
              method: 'GET',
              url: 'https://example.com/api?token=secret',
              headers: [{ name: 'Authorization', value: 'Bearer token' }],
              queryString: [{ name: 'token', value: 'secret' }],
              cookies: []
            },
            response: {
              status: 200,
              headers: [{ name: 'Set-Cookie', value: 'session=abc' }],
              cookies: [],
              content: {}
            },
            cache: {},
            timings: {}
          }
        ],
        _webSocketMessages: [
          {
            timestamp: new Date().toISOString(),
            tabId: 1,
            url: 'wss://example.com/socket?token=secret',
            type: 'send',
            opcode: 1,
            data: JSON.stringify({ auth_token: 'secret123', message: 'hello' }),
            size: 50
          }
        ],
        _serverSentEvents: [
          {
            timestamp: new Date().toISOString(),
            tabId: 1,
            url: 'https://example.com/events?key=apikey',
            event: 'message',
            data: JSON.stringify({ api_key: 'secret', data: 'normal' }),
            id: '1'
          }
        ]
      }
    };

    it('should sanitize all HTTP entries', () => {
      const sanitized = sanitizeHar(sampleHar);

      expect(sanitized.log.entries[0].request.headers[0].value).toBe(REDACTED);
    });

    it('should sanitize WebSocket message URLs', () => {
      const sanitized = sanitizeHar(sampleHar);
      // URL encoding converts [REDACTED] to %5BREDACTED%5D
      const REDACTED_ENCODED = encodeURIComponent(REDACTED);

      expect(sanitized.log._webSocketMessages[0].url).toContain('token=' + REDACTED_ENCODED);
    });

    it('should sanitize WebSocket message data', () => {
      const sanitized = sanitizeHar(sampleHar);

      const data = JSON.parse(sanitized.log._webSocketMessages[0].data);
      expect(data.auth_token).toBe(REDACTED);
      expect(data.message).toBe('hello');
    });

    it('should sanitize SSE event URLs', () => {
      const sanitized = sanitizeHar(sampleHar);
      // URL encoding converts [REDACTED] to %5BREDACTED%5D
      const REDACTED_ENCODED = encodeURIComponent(REDACTED);

      expect(sanitized.log._serverSentEvents[0].url).toContain('key=' + REDACTED_ENCODED);
    });

    it('should sanitize SSE event data', () => {
      const sanitized = sanitizeHar(sampleHar);

      const data = JSON.parse(sanitized.log._serverSentEvents[0].data);
      expect(data.api_key).toBe(REDACTED);
      expect(data.data).toBe('normal');
    });

    it('should preserve non-sensitive data', () => {
      const sanitized = sanitizeHar(sampleHar);

      expect(sanitized.log.version).toBe('1.2');
      expect(sanitized.log.entries[0].request.method).toBe('GET');
      expect(sanitized.log.entries[0].response.status).toBe(200);
    });

    it('should apply custom patterns', () => {
      const harWithCustomHeader = {
        log: {
          ...sampleHar.log,
          entries: [{
            ...sampleHar.log.entries[0],
            request: {
              ...sampleHar.log.entries[0].request,
              headers: [{ name: 'X-Custom-Secret', value: 'hidden' }]
            }
          }]
        }
      };

      const sanitized = sanitizeHar(harWithCustomHeader, { customPatterns: ['custom'] });
      expect(sanitized.log.entries[0].request.headers[0].value).toBe(REDACTED);
    });
  });

  describe('previewRedactions', () => {
    it('should preview headers that will be redacted', () => {
      const har = {
        log: {
          entries: [{
            request: {
              headers: [
                { name: 'Authorization', value: 'Bearer token' },
                { name: 'X-API-Key', value: 'key' },
                { name: 'Content-Type', value: 'application/json' }
              ]
            },
            response: {
              headers: [
                { name: 'Set-Cookie', value: 'session=abc' }
              ]
            }
          }]
        }
      };

      const preview = previewRedactions(har as any);

      expect(preview.headers).toContain('Authorization');
      expect(preview.headers).toContain('X-API-Key');
      expect(preview.headers).toContain('Set-Cookie');
      expect(preview.headers).not.toContain('Content-Type');
    });

    it('should preview URL params that will be redacted', () => {
      const har = {
        log: {
          entries: [{
            request: {
              headers: [],
              queryString: [
                { name: 'token', value: 'secret' },
                { name: 'page', value: '1' }
              ]
            },
            response: { headers: [] }
          }]
        }
      };

      const preview = previewRedactions(har as any, { sanitizeUrlParams: true });

      expect(preview.urlParams).toContain('token');
      expect(preview.urlParams).not.toContain('page');
    });

    it('should not preview URL params when disabled', () => {
      const har = {
        log: {
          entries: [{
            request: {
              headers: [],
              queryString: [{ name: 'token', value: 'secret' }]
            },
            response: { headers: [] }
          }]
        }
      };

      const preview = previewRedactions(har as any, { sanitizeUrlParams: false });

      expect(preview.urlParams).toHaveLength(0);
    });
  });
});
