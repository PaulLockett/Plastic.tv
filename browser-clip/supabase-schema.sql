-- Browser Clip - Supabase Schema
-- Run this SQL in your Supabase SQL Editor to set up the required tables and storage

-- Table for clip metadata
CREATE TABLE IF NOT EXISTS clips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  clip_name TEXT,
  time_range_start TIMESTAMPTZ,
  time_range_end TIMESTAMPTZ,
  duration_seconds INT,
  tab_filter JSONB,
  entry_count INT,
  total_size_bytes INT,
  har_data JSONB,
  storage_path TEXT
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_clips_created_at ON clips(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clips_user_id ON clips(user_id);

-- Enable Row Level Security (optional - configure based on your needs)
-- ALTER TABLE clips ENABLE ROW LEVEL SECURITY;

-- Example RLS policy (uncomment and modify as needed)
-- CREATE POLICY "Users can view their own clips" ON clips
--   FOR SELECT USING (auth.uid()::text = user_id);
--
-- CREATE POLICY "Users can insert their own clips" ON clips
--   FOR INSERT WITH CHECK (auth.uid()::text = user_id);
--
-- CREATE POLICY "Users can delete their own clips" ON clips
--   FOR DELETE USING (auth.uid()::text = user_id);

-- Create storage bucket for large HAR files
-- Run this in Supabase Dashboard > Storage > Create new bucket
-- Bucket name: har-clips
-- Make it private (not public)

-- Or use SQL:
INSERT INTO storage.buckets (id, name, public)
VALUES ('har-clips', 'har-clips', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policy for the bucket (allows authenticated uploads)
-- CREATE POLICY "Allow authenticated uploads" ON storage.objects
--   FOR INSERT WITH CHECK (bucket_id = 'har-clips' AND auth.role() = 'authenticated');
--
-- CREATE POLICY "Allow authenticated downloads" ON storage.objects
--   FOR SELECT USING (bucket_id = 'har-clips' AND auth.role() = 'authenticated');
--
-- CREATE POLICY "Allow authenticated deletes" ON storage.objects
--   FOR DELETE USING (bucket_id = 'har-clips' AND auth.role() = 'authenticated');

-- For anonymous access (using anon key), use these policies instead:
CREATE POLICY "Allow anon uploads" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'har-clips');

CREATE POLICY "Allow anon downloads" ON storage.objects
  FOR SELECT USING (bucket_id = 'har-clips');

CREATE POLICY "Allow anon deletes" ON storage.objects
  FOR DELETE USING (bucket_id = 'har-clips');
