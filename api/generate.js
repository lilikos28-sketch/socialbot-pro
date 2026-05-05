export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=AIzaSyC6rGwXNaeWcpLKkIEPVxNSMhxgzFTRos0', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await r.json();
    if (data.error) return res.status(400).json(data);
    if (!data.candidates || !data.candidates[0]) return res.status(400).json({ error: 'No response', raw: data });
    res.status(200).json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
