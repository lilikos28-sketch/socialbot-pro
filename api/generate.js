export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body || {};
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const maxTokens = Math.min(body.max_tokens || 1000, 4000);
  if (!messages.length) {
    return res.status(400).json({ error: { message: 'Faltan los mensajes.' } });
  }

  const responder = text => res.status(200).json({ content: [{ type: 'text', text: text || '' }] });

  const apiKey = process.env.GROQ_API_KEY;
  if (apiKey) {
    try {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: JSON.stringify({ model: 'llama-3.3-70b-versatile', max_tokens: maxTokens, messages })
      });
      const data = await r.json();
      const text = data.choices?.[0]?.message?.content;
      if (r.ok && text) return responder(text);
    } catch (e) {}
  }

  let ultimoError = 'La IA no respondió.';
  for (let intento = 0; intento < 2; intento++) {
    try {
      const r = await fetch('https://text.pollinations.ai/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'openai', messages, private: true })
      });
      const data = await r.json().catch(() => ({}));
      const
