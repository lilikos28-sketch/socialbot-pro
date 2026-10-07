// SocialBot Pro — analiza el sitio web de una marca y devuelve su "kit":
// nombre, descripción, logo (como data URL, para poder usarlo en el lienzo),
// colores, contacto, redes y fotos del sitio. Sin dependencias y gratis.
//
// Uso: GET /api/brand?url=https://www.mimarca.com

const UA = 'Mozilla/5.0 (compatible; SocialBotPro/1.0; +https://socialbot-pro.vercel.app)';
const MAX_HTML = 1_500_000;      // 1,5 MB de HTML como máximo
const MAX_LOGO = 1_200_000;      // 1,2 MB por logo
const TIEMPO = 9000;             // ms por pedido

// ---------- seguridad: no dejar que se use para entrar a redes privadas ----------
function hostPrivado(host) {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.)/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h)) return true;
  if (h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) return h.includes(':');
  return false;
}

function normalizarUrl(entrada) {
  let s = String(entrada || '').trim();
  if (!s) throw new Error('Pegá la dirección de tu página web.');
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  const u = new URL(s);
  if (!/^https?:$/.test(u.protocol)) throw new Error('La dirección tiene que empezar con http o https.');
  if (hostPrivado(u.hostname)) throw new Error('Esa dirección no es una página pública.');
  return u;
}

async function traer(url, opciones = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opciones.tiempo || TIEMPO);
  try {
    const r = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, 'Accept': opciones.accept || 'text/html,application/xhtml+xml,*/*;q=0.8', 'Accept-Language': 'es-AR,es;q=0.9,en;q=0.5' },
    });
    if (r.url && hostPrivado(new URL(r.url).hostname)) throw new Error('Redirección no permitida.');
    return r;
  } finally { clearTimeout(t); }
}

async function leerLimitado(r, max) {
  const lector = r.body && r.body.getReader ? r.body.getReader() : null;
  if (!lector) { const b = Buffer.from(await r.arrayBuffer()); return b.subarray(0, max); }
  const partes = []; let total = 0;
  while (true) {
    const { done, value } = await lector.read();
    if (done) break;
    partes.push(value); total += value.length;
    if (total >= max) { try { await lector.cancel(); } catch (_) {} break; }
  }
  return Buffer.concat(partes.map(p => Buffer.from(p))).subarray(0, max);
}

// ---------- utilidades de HTML (sin librerías) ----------
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ntilde: 'ñ', Ntilde: 'Ñ', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', uuml: 'ü', iexcl: '¡', iquest: '¿' };
function decodificar(s) {
  return String(s || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n] ?? m)
    .replace(/\s+/g, ' ').trim();
}

function atributos(etiqueta) {
  const a = {};
  etiqueta.replace(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g, (_, k, __, v1, v2, v3) => {
    a[k.toLowerCase()] = v1 ?? v2 ?? v3 ?? '';
  });
  return a;
}
const etiquetas = (html, nombre) => (html.match(new RegExp('<' + nombre + '\\b[^>]*>', 'gi')) || []).map(atributos);

function absoluta(href, base) {
  if (!href) return null;
  const s = decodificar(href);
  if (s.startsWith('data:')) return s.length < MAX_LOGO * 1.4 ? s : null;
  try { const u = new URL(s, base); return /^https?:$/.test(u.protocol) ? u.toString() : null; } catch (_) { return null; }
}

function meta(metas, ...claves) {
  for (const k of claves) {
    const m = metas.find(x => (x.property || x.name || x.itemprop || '').toLowerCase() === k);
    if (m && m.content) return decodificar(m.content);
  }
  return '';
}

// JSON-LD: Organization / LocalBusiness / WebSite
function jsonLd(html) {
  const salida = [];
  const bloques = html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const b of bloques) {
    const txt = b.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '');
    try {
      const j = JSON.parse(txt);
      const recorrer = o => {
        if (!o || typeof o !== 'object') return;
        if (Array.isArray(o)) return o.forEach(recorrer);
        salida.push(o);
        if (o['@graph']) recorrer(o['@graph']);
      };
      recorrer(j);
    } catch (_) {}
  }
  return salida;
}

// ---------- colores ----------
function hexValido(c) {
  if (!c) return null;
  let s = c.trim().toLowerCase();
  const rgb = s.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (rgb) s = '#' + [rgb[1], rgb[2], rgb[3]].map(n => Math.min(255, +n).toString(16).padStart(2, '0')).join('');
  if (/^#[0-9a-f]{3}$/.test(s)) s = '#' + s.slice(1).split('').map(x => x + x).join('');
  return /^#[0-9a-f]{6}$/.test(s) ? s : null;
}
function saturacion(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  const s = mx === mn ? 0 : (l > .5 ? (mx - mn) / (2 - mx - mn) : (mx - mn) / (mx + mn));
  return { s, l };
}
function coloresDelSitio(html, metas) {
  const conteo = new Map();
  const sumar = (c, peso) => { const h = hexValido(c); if (!h) return; const { s, l } = saturacion(h); if (s < .25 || l < .12 || l > .9) return; conteo.set(h, (conteo.get(h) || 0) + peso); };
  sumar(meta(metas, 'theme-color'), 50);
  sumar(meta(metas, 'msapplication-tilecolor'), 30);
  const css = (html.match(/<style[^>]*>[\s\S]*?<\/style>/gi) || []).join(' ') + ' ' + (html.match(/style="[^"]*"/gi) || []).join(' ');
  (css.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]+\)/g) || []).forEach(c => sumar(c, 1));
  // variables CSS con nombres de marca pesan más
  (css.match(/--[a-z-]*(primary|brand|accent|main|principal|marca)[a-z-]*\s*:\s*([^;}{]+)/gi) || []).forEach(d => sumar(d.split(':')[1], 15));
  return [...conteo.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c).slice(0, 5);
}

// ---------- contacto y redes ----------
function contacto(html, texto) {
  const datos = {};
  const wa = html.match(/(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=|whatsapp\.com\/send\/?\?phone=)(\+?\d{8,15})/i);
  if (wa) datos.whatsapp = wa[1].replace(/\D/g, '');
  const tel = html.match(/href=["']tel:([+\d\s().-]{7,20})["']/i);
  if (tel) datos.telefono = tel[1].trim();
  const mail = html.match(/href=["']mailto:([^"'?]+)["']/i) || texto.match(/[\w.+-]+@[\w-]+\.[\w.]{2,}/);
  if (mail) datos.email = mail[1] || mail[0];
  const redes = {};
  const patrones = {
    instagram: /https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9_.]{2,30})/i,
    facebook: /https?:\/\/(?:www\.|m\.)?facebook\.com\/([A-Za-z0-9_.-]{2,80})/i,
    tiktok: /https?:\/\/(?:www\.)?tiktok\.com\/@([A-Za-z0-9_.]{2,30})/i,
    youtube: /https?:\/\/(?:www\.)?youtube\.com\/(@?[A-Za-z0-9_.-]{2,60})/i,
    x: /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/([A-Za-z0-9_]{2,30})/i,
  };
  const ignorar = /^(sharer|share|intent|p|reel|explore|tr|plugins|dialog|watch|embed|home)$/i;
  for (const [red, re] of Object.entries(patrones)) {
    const m = html.match(new RegExp(re.source, 'gi')) || [];
    for (const enlace of m) { const x = enlace.match(re); if (x && !ignorar.test(x[1])) { redes[red] = enlace.replace(/["'].*$/, ''); break; } }
  }
  datos.redes = redes;
  return datos;
}

// ---------- logo ----------
function candidatosLogo(html, metas, links, base, ld) {
  const c = []; // [url, puntaje]
  const agregar = (u, p) => { const a = absoluta(u, base); if (a) c.push([a, p]); };
  for (const o of ld) {
    const logo = o.logo && (typeof o.logo === 'string' ? o.logo : o.logo.url || o.logo.contentUrl);
    if (logo) agregar(logo, 100);
  }
  // <img> que dicen "logo" (en clase, id, alt o nombre de archivo)
  for (const img of etiquetas(html, 'img')) {
    const src = img.src || img['data-src'] || img['data-lazy-src'] || (img.srcset || '').split(/[ ,]/)[0];
    const pista = [img.class, img.id, img.alt, src].join(' ').toLowerCase();
    if (/logo|brand|marca/.test(pista)) agregar(src, /header|navbar|nav-|site-logo|custom-logo/.test(pista) ? 92 : 85);
  }
  // íconos declarados
  for (const l of links) {
    const rel = (l.rel || '').toLowerCase();
    const tam = parseInt((l.sizes || '').split('x')[0], 10) || 0;
    if (rel.includes('apple-touch-icon')) agregar(l.href, 60 + Math.min(tam, 512) / 40);
    else if (rel.includes('icon') && /\.svg|\.png/i.test(l.href || '')) agregar(l.href, 40 + Math.min(tam, 512) / 40);
    else if (rel.includes('icon')) agregar(l.href, 25);
  }
  const og = meta(metas, 'og:logo');
  if (og) agregar(og, 90);
  const ord = new Map();
  c.forEach(([u, p]) => ord.set(u, Math.max(ord.get(u) || 0, p)));
  return [...ord.entries()].sort((a, b) => b[1] - a[1]).map(([u]) => u);
}

async function imagenComoDataUrl(url) {
  if (url.startsWith('data:')) return url;
  const r = await traer(url, { accept: 'image/*', tiempo: 7000 });
  if (!r.ok) throw new Error('logo ' + r.status);
  let tipo = (r.headers.get('content-type') || '').split(';')[0].trim();
  const buf = await leerLimitado(r, MAX_LOGO + 1);
  if (buf.length > MAX_LOGO) throw new Error('logo muy pesado');
  if (!tipo.startsWith('image/')) {
    if (/\.svg(\?|$)/i.test(url)) tipo = 'image/svg+xml';
    else if (/\.png(\?|$)/i.test(url)) tipo = 'image/png';
    else if (/\.jpe?g(\?|$)/i.test(url)) tipo = 'image/jpeg';
    else if (/\.webp(\?|$)/i.test(url)) tipo = 'image/webp';
    else if (/\.ico(\?|$)/i.test(url)) tipo = 'image/x-icon';
    else throw new Error('no es una imagen');
  }
  if (buf.length < 120) throw new Error('imagen vacía');
  return `data:${tipo};base64,${buf.toString('base64')}`;
}

// ---------- fotos del sitio (para usar como foto de producto) ----------
function fotosDelSitio(html, metas, base, logos) {
  const vistas = new Set(logos);
  const fotos = [];
  const agregar = u => { const a = absoluta(u, base); if (a && !a.startsWith('data:') && !vistas.has(a) && !/\.svg(\?|$)|sprite|icon|pixel|tracking|1x1|spacer/i.test(a)) { vistas.add(a); fotos.push(a); } };
  agregar(meta(metas, 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src'));
  for (const img of etiquetas(html, 'img')) {
    const src = img.src || img['data-src'] || img['data-lazy-src'] || (img.srcset || '').split(/[ ,]/)[0];
    const pista = [img.class, img.id, img.alt, src].join(' ').toLowerCase();
    if (/logo|icon|avatar|flag|payment|visa|master|mercadopago|whatsapp/.test(pista)) continue;
    const w = parseInt(img.width, 10) || 0;
    if (w && w < 150) continue;
    agregar(src);
    if (fotos.length >= 12) break;
  }
  return fotos.slice(0, 12);
}

// ---------- principal ----------
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  if (req.method === 'OPTIONS') return res.status(204).end();
  let destino;
  try { destino = normalizarUrl((req.query && req.query.url) || (req.body && req.body.url)); }
  catch (e) { return res.status(400).json({ error: e.message || 'Dirección inválida.' }); }

  let html = '', final = destino.toString(), avisos = [];
  try {
    const r = await traer(destino.toString());
    final = r.url || final;
    if (!r.ok) avisos.push(`La página respondió con código ${r.status}.`);
    const buf = await leerLimitado(r, MAX_HTML);
    html = buf.toString('utf8');
  } catch (e) {
    avisos.push('No pude abrir la página (' + (e.name === 'AbortError' ? 'tardó demasiado' : e.message) + '). Completá los datos a mano.');
  }

  const base = final;
  const host = new URL(base).hostname.replace(/^www\./, '');
  const metas = etiquetas(html, 'meta');
  const links = etiquetas(html, 'link');
  const ld = jsonLd(html);
  const esWeb = o => /WebSite|WebPage|BreadcrumbList|Product|Offer|ImageObject|SearchAction/i.test([].concat(o['@type'] || '').join(' '));
  const org = ld.find(o => /Organization|LocalBusiness|Store|Corporation|Restaurant|Brand/i.test([].concat(o['@type'] || '').join(' ')))
    || ld.find(o => !esWeb(o) && o.name && (o.logo || o.address || o.telephone)) || {};
  const sitio = ld.find(o => /WebSite/i.test([].concat(o['@type'] || '').join(' '))) || {};
  const titulo = decodificar((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
  const textoVisible = decodificar(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')).slice(0, 20000);

  // nombre: datos estructurados > og:site_name > título recortado > dominio
  let nombre = decodificar(org.name || sitio.name || meta(metas, 'og:site_name', 'application-name', 'apple-mobile-web-app-title'));
  if (!nombre && titulo) nombre = titulo.split(/\s[|\-–—·:]\s/)[0].trim();
  if (!nombre) nombre = host.split('.')[0].replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  const descripcion = decodificar(org.description || meta(metas, 'description', 'og:description', 'twitter:description')).slice(0, 400);
  const addr = org.address && typeof org.address === 'object' ? org.address : {};
  const ciudad = decodificar(addr.addressLocality || meta(metas, 'geo.placename', 'business:contact_data:locality') || '');
  const datosContacto = contacto(html, textoVisible);
  if (!datosContacto.telefono && org.telephone) datosContacto.telefono = String(org.telephone);
  if (Array.isArray(org.sameAs)) for (const s of org.sameAs) {
    const red = /instagram/.test(s) ? 'instagram' : /facebook/.test(s) ? 'facebook' : /tiktok/.test(s) ? 'tiktok' : /youtube/.test(s) ? 'youtube' : null;
    if (red && !datosContacto.redes[red]) datosContacto.redes[red] = s;
  }

  // logo: probamos los candidatos en orden hasta que uno descargue bien
  const candidatos = candidatosLogo(html, metas, links, base, ld);
  candidatos.push(new URL('/apple-touch-icon.png', base).toString(), new URL('/favicon.ico', base).toString());
  let logo = null, logoUrl = null;
  for (const u of candidatos.slice(0, 7)) {
    try { logo = await imagenComoDataUrl(u); logoUrl = u; break; } catch (_) {}
  }
  if (!logo) avisos.push('No encontré el logo en la página. Subilo a mano.');
  else if (/favicon|apple-touch-icon|\.ico(\?|$)/i.test(logoUrl || '')) avisos.push('Encontré solo el ícono chico del sitio. Si tenés el logo en mejor calidad, subilo.');

  const fotos = fotosDelSitio(html, metas, base, candidatos);
  if (html && html.length < 4000 && /<div id=["'](root|app|__next)["']/i.test(html)) {
    avisos.push('Esta página se arma con JavaScript y muestra poca información al leerla. Revisá y completá los datos.');
  }

  return res.status(200).json({
    url: base,
    dominio: host,
    nombre,
    descripcion,
    ciudad,
    colores: coloresDelSitio(html, metas),
    logo,
    logoUrl,
    fotos,
    contacto: datosContacto,
    avisos,
  });
}
