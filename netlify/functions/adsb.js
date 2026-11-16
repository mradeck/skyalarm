// Live-Luftverkehr (ADS-B) als Same-Origin-Proxy.
// airplanes.live hat die öffentliche API geschlossen (HTTP 403). Ersatzquellen liefern dasselbe
// readsb-JSON ({ ac: [...] }), senden aber keine CORS-Header → Abruf nur serverseitig.
// Reihenfolge: adsb.lol (primär), adsb.fi (Fallback).
const UA = 'SkyAlarm (+https://skyalarm.netlify.app)';
// Netlify bricht Functions nach 10 s ab → ein gemeinsames Zeitbudget statt zweier voller Timeouts.
const LIMITS = { primaryMs: 4000, totalMs: 8500, minFallbackMs: 300 };
exports.LIMITS = LIMITS;   // für Tests überschreibbar
// Nur die Felder, die SkyAlarm tatsächlich liest (avUpdateMarkers, avCheckProx, altMslFt, _kindFromCat; "source" ergänzt der Client selbst).
const FIELDS = ['hex', 'flight', 'lat', 'lon', 'alt_baro', 'alt_geom', 'gs', 'track', 'category'];

const SOURCES = [
  { source: 'adsb.lol', url: (lat, lon, d) => `https://api.adsb.lol/v2/point/${lat}/${lon}/${d}` },
  { source: 'adsb.fi', url: (lat, lon, d) => `https://opendata.adsb.fi/api/v3/lat/${lat}/lon/${lon}/dist/${d}` },
];

const num = v => (typeof v === 'string' && v.trim() === '') ? NaN : Number(v);
const json = (statusCode, body, cache) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': cache },   // bewusst kein CORS-Header: nur same-origin
  body: JSON.stringify(body),
});

async function tryOne(src, lat, lon, dist, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(src.url(lat, lon, dist), { signal: ctrl.signal, headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
    if (!r.ok) return { fail: 'HTTP ' + r.status };
    let data;
    try { data = await r.json(); } catch { return { fail: ctrl.signal.aborted ? 'timeout' : 'invalid_json' }; }
    if (data && data.msg !== undefined && data.msg !== 'No error') return { fail: 'upstream_msg' };
    if (!data || !Array.isArray(data.ac)) return { fail: 'no_ac_array' };
    return { data };
  } catch (e) {
    return { fail: ctrl.signal.aborted ? 'timeout' : (e && e.message) || 'network_error' };
  } finally { clearTimeout(t); }
}

const fin = v => typeof v === 'number' && Number.isFinite(v);
function reduce(a) {
  if (!a || typeof a !== 'object' || !fin(a.lat) || !fin(a.lon)) return null;
  const o = { lat: a.lat, lon: a.lon };
  if (typeof a.hex === 'string' && a.hex.length <= 8) o.hex = a.hex;
  if (typeof a.flight === 'string') o.flight = a.flight.trim().slice(0, 8);
  if (typeof a.category === 'string' && a.category.length <= 4) o.category = a.category;
  if (fin(a.alt_baro) || a.alt_baro === 'ground') o.alt_baro = a.alt_baro;
  for (const k of ['alt_geom', 'gs', 'track']) if (fin(a[k])) o[k] = a[k];
  return o;
}

exports.handler = async (event) => {
  const t0 = Date.now();
  const qs = (event && event.queryStringParameters) || {};
  const lat = num(qs.lat), lon = num(qs.lon);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
    return json(400, { error: 'invalid_lat_lon' }, 'no-store');
  }
  let dist = qs.dist === undefined ? 108 : num(qs.dist);
  if (!Number.isFinite(dist)) dist = 108;
  dist = Math.min(250, Math.max(1, Math.round(dist)));
  const latS = +lat.toFixed(4), lonS = +lon.toFixed(4);

  const tried = [];
  for (let i = 0; i < SOURCES.length; i++) {
    const src = SOURCES[i];
    const remaining = LIMITS.totalMs - (Date.now() - t0);
    if (i > 0 && remaining < LIMITS.minFallbackMs) { tried.push({ source: src.source, reason: 'budget_exhausted' }); continue; }
    const res = await tryOne(src, latS, lonS, dist, i === 0 ? Math.min(LIMITS.primaryMs, remaining) : remaining);
    if (res.data) {
      const ac = res.data.ac.map(reduce).filter(Boolean);
      const now = Number.isFinite(res.data.now) ? res.data.now : Date.now();
      return json(200, { source: src.source, now, ac }, 'public, max-age=3');
    }
    tried.push({ source: src.source, reason: res.fail });
  }
  return json(502, { error: 'upstream_unavailable', tried }, 'no-store');
};
