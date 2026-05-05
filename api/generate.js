export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=AIzaSyCygZirqbVjecNsa0O_UdJ_0kckg2EHe84`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(req.body)
  });
  const data = await r.json();
  res.status(200).json(data);
}
