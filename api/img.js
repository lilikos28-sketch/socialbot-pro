// SocialBot Pro — trae una imagen pública desde el mismo dominio de la app,
// así el lienzo la puede usar y descargar sin bloqueos del navegador.
// Uso: GET /api/img?u=https://sitio.com/foto.jpg

const MAX = 6_000_000; // 6 MB

function hostPrivado(host) {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.)/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h)) return true;
  if (h.includes(':')) return true; // sin IPv6 literal
  return false;
}

export default async function handler(req, res) {
  let u;
  try { u = new URL(String((req.query && req.query.u) || '')); } catch (_) { u = null; }
  if (!u || !/^https?:$/.test(u.protocol) || hostPrivado(u.hostname)) {
    return res.status(400).json({ error: 'Dirección de imagen inválida.' });
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 9000);
  try {
    const r = await fetch(u.toString(), { signal: ctrl.signal, redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SocialBotPro/1.0)', 'Accept': 'image/*' } });
    if (r.url && hostPrivado(new URL(r.url).hostname)) return res.status(400).json({ error: 'Redirección no permitida.' });
    const tipo = (r.headers.get('content-type') || '').split(';')[0].trim();
    if (!r.ok || !tipo.startsWith('image/')) return res.status(502).json({ error: 'No es una imagen válida.' });
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX) return res.status(413).json({ error: 'La imagen es muy pesada.' });
    res.setHeader('Content-Type', tipo);
    res.setHeader('Cache-Control', 'public, s-maxage=86400, max-age=86400');
    return res.status(200).send(buf);
  } catch (e) {
    return res.status(502).json({ error: 'No se pudo traer la imagen.' });
  } finally { clearTimeout(t); }
}
