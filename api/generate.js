// SocialBot Pro — escribe los textos con IA, gratis.
// Prueba en orden y usa el primero que responda:
//   1) Tu Worker de Cloudflare (Workers AI, Llama 3.3) — el más estable
//   2) Pollinations nuevo (gen.pollinations.ai)
//   3) Pollinations viejo (text.pollinations.ai/openai)
const WORKER = 'https://socialbot-imagenes.lili-kos28.workers.dev/texto';

async function conTiempo(url, opciones, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...opciones, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

async function desdeWorker(messages, max) {
  const r = await conTiempo(WORKER, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, max_tokens: max }),
  }, 25000);
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.text) throw new Error(d.error || 'worker ' + r.status);
  return d.text;
}

async function desdePollinations(url, messages) {
  const r = await conTiempo(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'openai', messages, private: true }),
  }, 25000);
  const d = await r.json().catch(() => ({}));
  const text = d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
  if (!r.ok || !text) throw new Error('pollinations ' + r.status);
  return text;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: { message: 'Usá POST' } });
  const messages = (req.body && req.body.messages) || [];
  const max = Math.min(Math.max(parseInt(req.body && req.body.max_tokens, 10) || 900, 100), 2000);
  if (!messages.length) return res.status(400).json({ error: { message: 'Falta el pedido.' } });

  const intentos = [
    () => desdeWorker(messages, max),
    () => desdePollinations('https://gen.pollinations.ai/v1/chat/completions', messages),
    () => desdePollinations('https://text.pollinations.ai/openai', messages),
  ];
  const fallas = [];
  for (const intento of intentos) {
    try {
      const text = await intento();
      return res.status(200).json({ content: [{ type: 'text', text }] });
    } catch (e) { fallas.push(e.message || String(e)); }
  }
  res.status(502).json({ error: { message: 'Ninguna IA gratis respondió ahora. Probá en un minuto. (' + fallas.join(' · ') + ')' } });
}
