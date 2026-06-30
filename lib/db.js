import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'module';

// Node.js < 22 has no global WebSocket; polyfill for @supabase/realtime-js
if (!globalThis.WebSocket) {
  try {
    const _require = createRequire(import.meta.url);
    globalThis.WebSocket = _require('ws');
  } catch { /* ws not available — realtime won't work, DB queries still fine */ }
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

export default supabase;
