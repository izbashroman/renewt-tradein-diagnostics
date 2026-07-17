// Relay endpoint that lets the phone-upload page hand its AI analysis
// result back to the desktop/tablet session that showed the QR code.
//
// Uses Vercel KV (Upstash Redis REST API) purely via fetch — no SDK/
// npm dependency needed, so no package.json or build step is required.
//
// Setup: Vercel dashboard -> Storage -> Create Database -> KV -> connect
// it to this project. That auto-adds these environment variables:
//   KV_REST_API_URL
//   KV_REST_API_TOKEN
//
// GET  /api/photo-session?session=<id>   -> { result } or 404 if not ready yet
// POST /api/photo-session { session, result } -> stores the result (10 min TTL)

const TTL_SECONDS = 600; // 10 minutes — plenty for a phone-to-desktop handoff

async function kv(command, ...args) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error('KV_REST_API_URL / KV_REST_API_TOKEN are not configured');
  const path = [command, ...args].map(encodeURIComponent).join('/');
  const res = await fetch(`${url}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return data.result;
}

export default async function handler(req, res) {
  const session = (req.method === 'GET' ? req.query.session : req.body?.session);
  if (!session || typeof session !== 'string' || session.length > 100) {
    return res.status(400).json({ error: 'Valid session is required' });
  }
  const key = `photo-session:${session}`;

  try {
    if (req.method === 'GET') {
      const raw = await kv('get', key);
      if (!raw) return res.status(404).json({ error: 'Not ready yet' });
      return res.status(200).json({ result: JSON.parse(raw) });
    }

    if (req.method === 'POST') {
      const { result } = req.body || {};
      if (!result) return res.status(400).json({ error: 'result is required' });
      await kv('set', key, JSON.stringify(result), 'EX', TTL_SECONDS);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('photo-session error:', err);
    return res.status(500).json({ error: 'Internal relay error' });
  }
}
