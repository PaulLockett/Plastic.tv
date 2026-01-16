# Browser Clip

**Medal.tv for your browser** - Always-on network capture with instant clip saving.

Browser Clip is a Chrome extension that continuously records all network activity in your browser, maintaining a rolling 24-hour buffer. When something interesting happens, simply "clip" the last few minutes or hours to save it permanently to Supabase.

The mental model: **"I wish I had been recording that" → "You were."**

## Features

- **Always-On Capture**: Records all HTTP/HTTPS requests, WebSocket messages, and Server-Sent Events across all tabs
- **Rolling Buffer**: Maintains up to 24 hours of history with configurable storage limits
- **Instant Clipping**: Save the last 1 minute to 24 hours with one click
- **Tab Filtering**: Export from current tab, selected tabs, or all tabs
- **Extended HAR Format**: Includes WebSocket frames and SSE events
- **Sensitive Data Sanitization**: Automatically strips auth headers, cookies, and configurable patterns
- **Cloud Storage**: Upload clips to your own Supabase project
- **Pause/Resume**: Full control over when recording happens

## Installation

### From Source

1. Clone this repository:
   ```bash
   git clone https://github.com/PaulLockett/Plastic.tv.git
   cd Plastic.tv/browser-clip
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" (toggle in top right)

4. Click "Load unpacked" and select the `browser-clip` folder

5. The extension icon will appear in your toolbar

### Supabase Setup

1. Create a [Supabase](https://supabase.com) project

2. Run the SQL schema in your Supabase SQL Editor:
   - Open `supabase-schema.sql` from this repository
   - Execute in Supabase Dashboard → SQL Editor

3. Configure the extension:
   - Click the extension icon → Settings
   - Enter your Supabase Project URL
   - Enter your Supabase anon key (or service role key)
   - Click "Test Connection" to verify

## Usage

### Recording

By default, Browser Clip starts recording automatically when installed. The extension icon shows a red recording indicator when active.

### Creating a Clip

1. Click the extension icon
2. Select a time range (1m, 5m, 15m, 30m, 1hr, 3hr, 8hr, or custom)
3. Choose scope (current tab, select tabs, or all tabs)
4. Optionally enter a name for the clip
5. Click "Save Clip"

The clip is uploaded to your Supabase project in HAR 1.2+ format.

### Pausing Capture

To pause recording:
1. Go to Settings (gear icon in popup)
2. Scroll to "Capture Control"
3. Click "Pause Capture" and confirm

Note: While paused, the buffer continues to expire but no new data is captured.

## Configuration

### Storage Cap

Configure maximum storage (100MB - 2GB) in Settings. The extension automatically deletes oldest entries when approaching the cap.

### Sensitive Data

By default, these are automatically redacted:
- Authorization headers
- Cookie / Set-Cookie headers
- Headers containing: token, key, secret, password, credential, auth

You can add custom patterns in Settings.

## HAR Format Extension

Standard HAR 1.2 is extended with:

```javascript
{
  log: {
    version: "1.2",
    creator: { name: "Browser Clip", version: "1.0.0" },
    entries: [...], // Standard HTTP entries
    _webSocketMessages: [
      {
        timestamp: "ISO string",
        tabId: 123,
        url: "wss://example.com/socket",
        type: "send" | "receive",
        opcode: 1,
        data: "message content",
        size: 1234
      }
    ],
    _serverSentEvents: [
      {
        timestamp: "ISO string",
        tabId: 123,
        url: "https://example.com/events",
        event: "message",
        data: "event data",
        id: "optional-event-id"
      }
    ]
  }
}
```

## Technical Details

### Permissions Required

- `debugger`: Required to capture response bodies and WebSocket frames
- `tabs`: To track and filter by tabs
- `storage`: For settings and buffer
- `alarms`: For periodic cleanup

### Storage

- Uses IndexedDB for the rolling buffer
- Small clips (<1MB) stored as JSONB in Supabase
- Large clips uploaded to Supabase Storage bucket

### Limitations

- Does not capture incognito/private browsing
- Cannot capture chrome:// or extension pages
- Response bodies larger than 5MB are truncated

## Project Structure

```
browser-clip/
├── manifest.json           # Extension manifest
├── background/
│   ├── service-worker.js   # Main orchestrator
│   ├── capture.js          # Network capture via debugger
│   ├── cleanup.js          # Buffer cleanup logic
│   └── storage-monitor.js  # Storage tracking
├── popup/
│   ├── popup.html/js/css   # Extension popup UI
├── options/
│   ├── options.html/js/css # Settings page
├── lib/
│   ├── db.js               # IndexedDB wrapper
│   ├── har-builder.js      # HAR assembly
│   ├── sanitizer.js        # Data sanitization
│   └── supabase.js         # Cloud upload
├── utils/
│   ├── format.js           # Formatting utilities
│   └── tab-utils.js        # Tab helpers
└── icons/                  # Extension icons
```

## License

MIT
