export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const messages = (req.body && req.body.messages) || [];
  try {
    const r = await fetch('https://text.pollinations.ai/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'openai', messages, private: true })
    });
    const data = await r.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error('La IA no respondió');
    res.status(200).json({ content: [{ type: 'text', text }] });
  } catch (e) {
    res.status(500).json({ error: { message: 'No se pudieron escribir los textos: ' + e.message } });
  }
}
