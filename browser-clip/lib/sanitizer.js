// Sensitive data sanitizer for HAR exports

// Default sensitive header patterns (case-insensitive)
const DEFAULT_SENSITIVE_HEADERS = [
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'x-access-token'
];

// Patterns to look for in header names
const SENSITIVE_PATTERNS = [
  'token',
  'key',
  'secret',
  'password',
  'credential',
  'auth',
  'session',
  'jwt',
  'bearer'
];

// Redaction placeholder
const REDACTED = '[REDACTED]';

// Check if a header name is sensitive
function isSensitiveHeader(name, customPatterns = []) {
  const lowerName = name.toLowerCase();

  // Check exact matches
  if (DEFAULT_SENSITIVE_HEADERS.includes(lowerName)) {
    return true;
  }

  // Check patterns
  const allPatterns = [...SENSITIVE_PATTERNS, ...customPatterns];
  return allPatterns.some(pattern =>
    lowerName.includes(pattern.toLowerCase())
  );
}

// Check if a URL parameter name is sensitive
function isSensitiveParam(name) {
  const lowerName = name.toLowerCase();
  return SENSITIVE_PATTERNS.some(pattern =>
    lowerName.includes(pattern.toLowerCase())
  );
}

// Sanitize headers array
function sanitizeHeaders(headers, customPatterns = []) {
  if (!headers || !Array.isArray(headers)) return headers;

  return headers.map(header => {
    if (isSensitiveHeader(header.name, customPatterns)) {
      return { name: header.name, value: REDACTED };
    }
    return header;
  });
}

// Sanitize URL query string
function sanitizeUrl(url, sanitizeParams = true) {
  if (!sanitizeParams || !url) return url;

  try {
    const urlObj = new URL(url);
    const params = new URLSearchParams(urlObj.search);
    let modified = false;

    for (const [name] of params) {
      if (isSensitiveParam(name)) {
        params.set(name, REDACTED);
        modified = true;
      }
    }

    if (modified) {
      urlObj.search = params.toString();
      return urlObj.toString();
    }
    return url;
  } catch {
    return url;
  }
}

// Sanitize query string array
function sanitizeQueryString(queryString, sanitizeParams = true) {
  if (!sanitizeParams || !queryString || !Array.isArray(queryString)) {
    return queryString;
  }

  return queryString.map(param => {
    if (isSensitiveParam(param.name)) {
      return { name: param.name, value: REDACTED };
    }
    return param;
  });
}

// Sanitize a single HAR entry
function sanitizeEntry(entry, options = {}) {
  const { sanitizeUrlParams = true, customPatterns = [] } = options;

  const sanitized = { ...entry };

  // Sanitize request
  if (sanitized.request) {
    sanitized.request = {
      ...sanitized.request,
      url: sanitizeUrl(sanitized.request.url, sanitizeUrlParams),
      headers: sanitizeHeaders(sanitized.request.headers, customPatterns),
      queryString: sanitizeQueryString(sanitized.request.queryString, sanitizeUrlParams),
      cookies: [] // Remove cookies entirely
    };

    // Sanitize post data if it contains sensitive info
    if (sanitized.request.postData?.text) {
      try {
        const postData = JSON.parse(sanitized.request.postData.text);
        const sanitizedPostData = sanitizeObject(postData);
        sanitized.request.postData = {
          ...sanitized.request.postData,
          text: JSON.stringify(sanitizedPostData)
        };
      } catch {
        // Not JSON, leave as is but check for patterns
        let text = sanitized.request.postData.text;
        for (const pattern of SENSITIVE_PATTERNS) {
          const regex = new RegExp(`(${pattern}[=:]\\s*)([^&\\s]+)`, 'gi');
          text = text.replace(regex, `$1${REDACTED}`);
        }
        sanitized.request.postData = {
          ...sanitized.request.postData,
          text
        };
      }
    }
  }

  // Sanitize response
  if (sanitized.response) {
    sanitized.response = {
      ...sanitized.response,
      headers: sanitizeHeaders(sanitized.response.headers, customPatterns),
      cookies: [] // Remove cookies entirely
    };
  }

  return sanitized;
}

// Recursively sanitize an object for sensitive keys
function sanitizeObject(obj) {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (isSensitiveParam(key)) {
      result[key] = REDACTED;
    } else if (typeof value === 'object') {
      result[key] = sanitizeObject(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// Sanitize entire HAR
function sanitizeHar(har, options = {}) {
  const sanitized = {
    log: {
      ...har.log,
      entries: har.log.entries.map(entry => sanitizeEntry(entry, options))
    }
  };

  // Sanitize WebSocket messages
  if (sanitized.log._webSocketMessages) {
    sanitized.log._webSocketMessages = sanitized.log._webSocketMessages.map(msg => {
      const sanitizedMsg = {
        ...msg,
        url: sanitizeUrl(msg.url, options.sanitizeUrlParams)
      };

      // Try to sanitize message data if it's JSON
      if (msg.data && msg.opcode === 1) { // Text frame
        try {
          const parsed = JSON.parse(msg.data);
          sanitizedMsg.data = JSON.stringify(sanitizeObject(parsed));
        } catch {
          // Not JSON, leave as is
        }
      }

      return sanitizedMsg;
    });
  }

  // Sanitize SSE events
  if (sanitized.log._serverSentEvents) {
    sanitized.log._serverSentEvents = sanitized.log._serverSentEvents.map(event => {
      const sanitizedEvent = {
        ...event,
        url: sanitizeUrl(event.url, options.sanitizeUrlParams)
      };

      // Try to sanitize event data if it's JSON
      if (event.data) {
        try {
          const parsed = JSON.parse(event.data);
          sanitizedEvent.data = JSON.stringify(sanitizeObject(parsed));
        } catch {
          // Not JSON, leave as is
        }
      }

      return sanitizedEvent;
    });
  }

  return sanitized;
}

// Preview what will be redacted (for settings UI)
function previewRedactions(har, options = {}) {
  const redactions = {
    headers: new Set(),
    urlParams: new Set(),
    postDataFields: new Set()
  };

  for (const entry of har.log.entries) {
    // Check request headers
    if (entry.request?.headers) {
      for (const header of entry.request.headers) {
        if (isSensitiveHeader(header.name, options.customPatterns || [])) {
          redactions.headers.add(header.name);
        }
      }
    }

    // Check response headers
    if (entry.response?.headers) {
      for (const header of entry.response.headers) {
        if (isSensitiveHeader(header.name, options.customPatterns || [])) {
          redactions.headers.add(header.name);
        }
      }
    }

    // Check URL parameters
    if (options.sanitizeUrlParams !== false && entry.request?.queryString) {
      for (const param of entry.request.queryString) {
        if (isSensitiveParam(param.name)) {
          redactions.urlParams.add(param.name);
        }
      }
    }
  }

  return {
    headers: Array.from(redactions.headers),
    urlParams: Array.from(redactions.urlParams),
    postDataFields: Array.from(redactions.postDataFields)
  };
}

export {
  sanitizeHar,
  sanitizeEntry,
  sanitizeHeaders,
  sanitizeUrl,
  previewRedactions,
  isSensitiveHeader,
  isSensitiveParam,
  SENSITIVE_PATTERNS,
  REDACTED
};
