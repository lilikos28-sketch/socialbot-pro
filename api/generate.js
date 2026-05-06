export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const prompt = req.body?.prompt || req.body?.contents?.[0]?.parts?.[0]?.text || '';
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': 'Bearer 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'
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1500,
        temperature: 0.8
      })
    });
    const data = await r.json();
    const text = data.choices?.[0]?.message?.content || '';
    res.status(200).json({ text, candidates: [{ content: { parts: [{ text }] } }] });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
