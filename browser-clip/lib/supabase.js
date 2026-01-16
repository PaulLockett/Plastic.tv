// Supabase integration for Browser Clip

const CLIPS_TABLE = 'clips';
const STORAGE_BUCKET = 'har-clips';
const LARGE_CLIP_THRESHOLD = 1024 * 1024; // 1MB

// Get Supabase configuration
async function getSupabaseConfig() {
  const config = await chrome.storage.sync.get(['supabaseUrl', 'supabaseKey']);

  if (!config.supabaseUrl || !config.supabaseKey) {
    throw new Error('Supabase not configured. Please set your Supabase URL and key in settings.');
  }

  return {
    url: config.supabaseUrl.replace(/\/$/, ''), // Remove trailing slash
    key: config.supabaseKey
  };
}

// Make authenticated request to Supabase
async function supabaseFetch(endpoint, options = {}) {
  const config = await getSupabaseConfig();

  const url = endpoint.startsWith('http')
    ? endpoint
    : `${config.url}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'apikey': config.key,
      'Authorization': `Bearer ${config.key}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...options.headers
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Supabase error: ${response.status} - ${errorText}`);
  }

  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return response.json();
  }

  return response.text();
}

// Upload file to Supabase Storage
async function uploadToStorage(fileName, data) {
  const config = await getSupabaseConfig();

  const response = await fetch(
    `${config.url}/storage/v1/object/${STORAGE_BUCKET}/${fileName}`,
    {
      method: 'POST',
      headers: {
        'apikey': config.key,
        'Authorization': `Bearer ${config.key}`,
        'Content-Type': 'application/json',
        'x-upsert': 'true'
      },
      body: data
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Storage upload error: ${response.status} - ${errorText}`);
  }

  return `${STORAGE_BUCKET}/${fileName}`;
}

// Upload a clip to Supabase
async function uploadClip(clipData) {
  const {
    har,
    harJson,
    sizeBytes,
    clipName,
    startTime,
    endTime,
    tabFilter,
    entryCount
  } = clipData;

  const isLargeClip = sizeBytes >= LARGE_CLIP_THRESHOLD;
  let storagePath = null;
  let harData = null;

  // Generate a unique filename
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `clip-${timestamp}.json`;

  if (isLargeClip) {
    // Upload to Storage bucket
    storagePath = await uploadToStorage(fileName, harJson);
  } else {
    // Store directly in database as JSONB
    harData = har;
  }

  // Create clip record
  const clipRecord = {
    clip_name: clipName,
    time_range_start: new Date(startTime).toISOString(),
    time_range_end: new Date(endTime).toISOString(),
    duration_seconds: Math.round((endTime - startTime) / 1000),
    tab_filter: tabFilter,
    entry_count: entryCount,
    total_size_bytes: sizeBytes,
    har_data: harData,
    storage_path: storagePath
  };

  const result = await supabaseFetch(`/rest/v1/${CLIPS_TABLE}`, {
    method: 'POST',
    body: JSON.stringify(clipRecord)
  });

  return Array.isArray(result) ? result[0] : result;
}

// Get list of clips
async function getClips(limit = 50, offset = 0) {
  const result = await supabaseFetch(
    `/rest/v1/${CLIPS_TABLE}?select=id,clip_name,created_at,time_range_start,time_range_end,duration_seconds,entry_count,total_size_bytes,storage_path&order=created_at.desc&limit=${limit}&offset=${offset}`
  );

  return result;
}

// Get a specific clip
async function getClip(clipId) {
  const result = await supabaseFetch(
    `/rest/v1/${CLIPS_TABLE}?id=eq.${clipId}&select=*`
  );

  return Array.isArray(result) ? result[0] : result;
}

// Get HAR data for a clip (handles both inline and storage)
async function getClipHar(clip) {
  if (clip.har_data) {
    return clip.har_data;
  }

  if (clip.storage_path) {
    const config = await getSupabaseConfig();
    const response = await fetch(
      `${config.url}/storage/v1/object/${clip.storage_path}`,
      {
        headers: {
          'apikey': config.key,
          'Authorization': `Bearer ${config.key}`
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch HAR from storage: ${response.status}`);
    }

    return response.json();
  }

  throw new Error('Clip has no HAR data');
}

// Delete a clip
async function deleteClip(clipId) {
  // First get the clip to check if it has storage
  const clip = await getClip(clipId);

  if (clip.storage_path) {
    // Delete from storage
    const config = await getSupabaseConfig();
    await fetch(
      `${config.url}/storage/v1/object/${clip.storage_path}`,
      {
        method: 'DELETE',
        headers: {
          'apikey': config.key,
          'Authorization': `Bearer ${config.key}`
        }
      }
    );
  }

  // Delete from database
  await supabaseFetch(`/rest/v1/${CLIPS_TABLE}?id=eq.${clipId}`, {
    method: 'DELETE'
  });

  return { success: true };
}

// Test Supabase connection
async function testConnection() {
  try {
    await supabaseFetch('/rest/v1/');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export {
  uploadClip,
  getClips,
  getClip,
  getClipHar,
  deleteClip,
  testConnection,
  getSupabaseConfig
};
