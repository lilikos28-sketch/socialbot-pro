export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=AIzaSyAJJ_0SdbnTptieIaKytpGOICoM6GGX_gI', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const data = await r.json();
    console.log('Gemini status:', r.status, 'Response:', JSON.stringify(data).slice(0, 200));
    res.status(r.status).json(data);
  } catch(e) {
    console.error('Error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
