// Type declarations for db.js

export const STORES: {
  HTTP_ENTRIES: 'httpEntries';
  WS_FRAMES: 'wsFrames';
  SSE_EVENTS: 'sseEvents';
  METADATA: 'metadata';
};

export interface HttpEntry {
  id?: string;
  timestamp: number;
  tabId: number;
  hostname: string;
  startedDateTime?: string;
  request?: {
    method: string;
    url: string;
    httpVersion?: string;
    headers?: Array<{ name: string; value: string }>;
    queryString?: Array<{ name: string; value: string }>;
    cookies?: any[];
    headersSize?: number;
    bodySize?: number;
    postData?: {
      mimeType: string;
      text: string;
    };
  };
  response?: {
    status: number;
    statusText: string;
    httpVersion?: string;
    headers?: Array<{ name: string; value: string }>;
    cookies?: any[];
    content?: {
      size: number;
      mimeType: string;
      text?: string;
      encoding?: string;
    };
    redirectURL?: string;
    headersSize?: number;
    bodySize?: number;
  };
  time?: number;
  resourceType?: string;
}

export interface WsFrame {
  id?: string;
  timestamp: number;
  tabId: number;
  hostname: string;
  connectionId: string;
  url: string;
  direction: 'send' | 'receive';
  opcode: number;
  data: string;
  size: number;
}

export interface SseEvent {
  id?: string;
  timestamp: number;
  tabId: number;
  hostname: string;
  url: string;
  eventType: string;
  data: string;
  eventId: string;
}

export interface BufferTimeRange {
  oldest: number | null;
  newest: number | null;
}

export interface TotalCounts {
  httpEntries: number;
  wsFrames: number;
  sseEvents: number;
  total: number;
}

export interface StorageEstimate {
  usage: number;
  quota: number;
}

export function openDB(): Promise<IDBDatabase>;

export function addHttpEntry(entry: Partial<HttpEntry>): Promise<string>;
export function addWsFrame(frame: Partial<WsFrame>): Promise<string>;
export function addSseEvent(event: Partial<SseEvent>): Promise<string>;

export function getHttpEntries(
  startTime: number,
  endTime: number,
  tabIds?: number[] | null
): Promise<HttpEntry[]>;

export function getWsFrames(
  startTime: number,
  endTime: number,
  tabIds?: number[] | null
): Promise<WsFrame[]>;

export function getSseEvents(
  startTime: number,
  endTime: number,
  tabIds?: number[] | null
): Promise<SseEvent[]>;

export function deleteEntriesOlderThan(storeName: string, timestamp: number): Promise<number>;
export function deleteOldestEntries(storeName: string, count: number): Promise<number>;
export function getStoreCount(storeName: string): Promise<number>;
export function estimateStorageSize(): Promise<StorageEstimate>;
export function getBufferTimeRange(): Promise<BufferTimeRange>;
export function setMetadata(key: string, value: any): Promise<void>;
export function getMetadata(key: string): Promise<any>;
export function clearAllData(): Promise<void>;
export function getUniqueHostnames(startTime: number, endTime: number): Promise<string[]>;
export function getTotalCounts(): Promise<TotalCounts>;
