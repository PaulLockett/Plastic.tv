/**
 * Unit tests for lib/supabase.js - Supabase integration
 */

import { setStorageValue } from '../../helpers/setup.js';

// Re-mock fetch for each test
const mockFetch = global.fetch as jest.Mock;

describe('Supabase Integration', () => {
  const mockConfig = {
    supabaseUrl: 'https://test-project.supabase.co',
    supabaseKey: 'test-anon-key-12345'
  };

  beforeEach(() => {
    // Set up Supabase config in mock storage
    setStorageValue('sync', 'supabaseUrl', mockConfig.supabaseUrl);
    setStorageValue('sync', 'supabaseKey', mockConfig.supabaseKey);

    // Reset fetch mock
    mockFetch.mockClear();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve([{ id: 'clip-123' }]),
      text: () => Promise.resolve(''),
      headers: new Headers({ 'content-type': 'application/json' })
    });
  });

  // Note: We'll test the module by importing it dynamically to ensure
  // fresh state for each test

  describe('Configuration', () => {
    it('should throw error when Supabase URL is not configured', async () => {
      setStorageValue('sync', 'supabaseUrl', '');

      const { getSupabaseConfig } = await import('../../../lib/supabase.js');

      await expect(getSupabaseConfig()).rejects.toThrow('Supabase not configured');
    });

    it('should throw error when Supabase key is not configured', async () => {
      setStorageValue('sync', 'supabaseUrl', mockConfig.supabaseUrl);
      setStorageValue('sync', 'supabaseKey', '');

      const { getSupabaseConfig } = await import('../../../lib/supabase.js');

      await expect(getSupabaseConfig()).rejects.toThrow('Supabase not configured');
    });

    it('should return configuration when properly set', async () => {
      const { getSupabaseConfig } = await import('../../../lib/supabase.js');

      const config = await getSupabaseConfig();

      expect(config.url).toBe(mockConfig.supabaseUrl);
      expect(config.key).toBe(mockConfig.supabaseKey);
    });

    it('should remove trailing slash from URL', async () => {
      setStorageValue('sync', 'supabaseUrl', 'https://test.supabase.co/');

      const { getSupabaseConfig } = await import('../../../lib/supabase.js');

      const config = await getSupabaseConfig();
      expect(config.url).toBe('https://test.supabase.co');
    });
  });

  describe('Upload Clip', () => {
    const sampleClipData = {
      har: { log: { version: '1.2', entries: [] } },
      harJson: '{"log":{"version":"1.2","entries":[]}}',
      sizeBytes: 100,
      clipName: 'Test Clip',
      startTime: Date.now() - 60000,
      endTime: Date.now(),
      tabFilter: { type: 'all' as const },
      entryCount: 10
    };

    it('should upload small clip as JSONB', async () => {
      const { uploadClip } = await import('../../../lib/supabase.js');

      await uploadClip(sampleClipData);

      // Check that fetch was called with correct endpoint
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/rest/v1/clips'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'apikey': mockConfig.supabaseKey,
            'Authorization': `Bearer ${mockConfig.supabaseKey}`
          })
        })
      );

      // Check that body contains har_data (not storage_path)
      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.har_data).toBeDefined();
      expect(body.storage_path).toBeNull();
    });

    it('should upload large clip to storage bucket', async () => {
      // Create a large clip (> 1MB)
      const largeHarJson = 'x'.repeat(1024 * 1024 + 1);
      const largeClipData = {
        ...sampleClipData,
        harJson: largeHarJson,
        sizeBytes: largeHarJson.length
      };

      // Mock storage upload
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ Key: 'har-clips/clip-123.json' }),
          headers: new Headers({ 'content-type': 'application/json' })
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve([{ id: 'clip-123' }]),
          headers: new Headers({ 'content-type': 'application/json' })
        });

      const { uploadClip } = await import('../../../lib/supabase.js');

      await uploadClip(largeClipData);

      // First call should be to storage
      expect(mockFetch.mock.calls[0][0]).toContain('/storage/v1/object/har-clips/');

      // Second call should be to clips table with storage_path
      const dbCall = mockFetch.mock.calls[1];
      const body = JSON.parse(dbCall[1].body);
      expect(body.har_data).toBeNull();
      expect(body.storage_path).toBeDefined();
    });

    it('should include all clip metadata', async () => {
      const { uploadClip } = await import('../../../lib/supabase.js');

      await uploadClip(sampleClipData);

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);

      expect(body.clip_name).toBe('Test Clip');
      expect(body.duration_seconds).toBe(60);
      expect(body.entry_count).toBe(10);
      expect(body.total_size_bytes).toBe(100);
      expect(body.tab_filter).toEqual({ type: 'all' });
    });

    it('should handle upload errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error')
      });

      const { uploadClip } = await import('../../../lib/supabase.js');

      await expect(uploadClip(sampleClipData)).rejects.toThrow('Supabase error: 500');
    });
  });

  describe('Get Clips', () => {
    it('should fetch clips with pagination', async () => {
      const mockClips = [
        { id: 'clip-1', clip_name: 'Clip 1' },
        { id: 'clip-2', clip_name: 'Clip 2' }
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockClips),
        headers: new Headers({ 'content-type': 'application/json' })
      });

      const { getClips } = await import('../../../lib/supabase.js');

      const clips = await getClips(10, 0);

      expect(clips).toEqual(mockClips);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=10'),
        expect.anything()
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('offset=0'),
        expect.anything()
      );
    });

    it('should order clips by created_at descending', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve([]),
        headers: new Headers({ 'content-type': 'application/json' })
      });

      const { getClips } = await import('../../../lib/supabase.js');

      await getClips();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('order=created_at.desc'),
        expect.anything()
      );
    });
  });

  describe('Get Clip', () => {
    it('should fetch a single clip by ID', async () => {
      const mockClip = { id: 'clip-123', clip_name: 'Test' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve([mockClip]),
        headers: new Headers({ 'content-type': 'application/json' })
      });

      const { getClip } = await import('../../../lib/supabase.js');

      const clip = await getClip('clip-123');

      expect(clip).toEqual(mockClip);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('id=eq.clip-123'),
        expect.anything()
      );
    });
  });

  describe('Get Clip HAR', () => {
    it('should return inline har_data', async () => {
      const mockClip = {
        id: 'clip-123',
        har_data: { log: { entries: [] } },
        storage_path: null
      };

      const { getClipHar } = await import('../../../lib/supabase.js');

      const har = await getClipHar(mockClip);

      expect(har).toEqual(mockClip.har_data);
    });

    it('should fetch HAR from storage when storage_path is set', async () => {
      const mockClip = {
        id: 'clip-123',
        har_data: null,
        storage_path: 'har-clips/clip-123.json'
      };

      const mockHar = { log: { entries: [{ test: true }] } };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockHar)
      });

      const { getClipHar } = await import('../../../lib/supabase.js');

      const har = await getClipHar(mockClip);

      expect(har).toEqual(mockHar);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/storage/v1/object/har-clips/clip-123.json'),
        expect.anything()
      );
    });

    it('should throw error when clip has no HAR data', async () => {
      const mockClip = {
        id: 'clip-123',
        har_data: null,
        storage_path: null
      };

      const { getClipHar } = await import('../../../lib/supabase.js');

      await expect(getClipHar(mockClip)).rejects.toThrow('Clip has no HAR data');
    });
  });

  describe('Delete Clip', () => {
    it('should delete clip without storage file', async () => {
      // Mock getClip response
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve([{ id: 'clip-123', storage_path: null }]),
          headers: new Headers({ 'content-type': 'application/json' })
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: () => Promise.resolve(''),
          headers: new Headers({})
        });

      const { deleteClip } = await import('../../../lib/supabase.js');

      const result = await deleteClip('clip-123');

      expect(result.success).toBe(true);
      // Should only call delete on clips table
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should delete clip with storage file', async () => {
      // Mock getClip response
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve([{ id: 'clip-123', storage_path: 'har-clips/clip-123.json' }]),
          headers: new Headers({ 'content-type': 'application/json' })
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: () => Promise.resolve(''),
          headers: new Headers({})
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: () => Promise.resolve(''),
          headers: new Headers({})
        });

      const { deleteClip } = await import('../../../lib/supabase.js');

      const result = await deleteClip('clip-123');

      expect(result.success).toBe(true);
      // Should call delete on storage and clips table
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(mockFetch.mock.calls[1][0]).toContain('/storage/v1/object/');
    });
  });

  describe('Test Connection', () => {
    it('should return success for valid connection', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
        headers: new Headers({ 'content-type': 'application/json' })
      });

      const { testConnection } = await import('../../../lib/supabase.js');

      const result = await testConnection();

      expect(result.success).toBe(true);
    });

    it('should return failure for invalid connection', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { testConnection } = await import('../../../lib/supabase.js');

      const result = await testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });
  });
});
