/**
 * SkyAlarm — OGN-Proxy
 *
 * Ruft Bbox-gefilterte Live-Daten des Open Glider Network (FLARM, OGN-Tracker,
 * teilweise ADS-B) von live.glidernet.org/lxml.php ab, normalisiert sie auf das
 * vom airplanes.live-Feed bekannte JSON-Schema und liefert sie an den Browser.
 *
 * Antwortformat (kompatibel mit airplanes.live /v2/point/...):
 *   { ac: [ { lat, lon, hex, flight, track, gs, alt_baro, category, source } ], ts, source: 'ogn' }
 *
 * Die OGN-Typ-Codes (Feld 10 der lxml.php-Antwort) werden auf ADS-B-Emitter-
 * Kategorien (DO-260B 2.2.3.2.5.2) abgebildet, damit der Client (`_kindFromCat`)
 * dieselben Symbolklassen wie für ADS-B-Targets ableitet.
 *
 * Netlify Free-Tier-konform: synchrone Function, Timeout < 8 s, keine Persistenz.
 */

// OGN-Typ-Code (numerisch, 0–14) → ADS-B-Emitter-Kategorie
// Quelle: https://github.com/glidernet/ogn-aprs-protocol
const OGN_TO_CAT = {
  '0': '',     // unbekannt
  '1': 'B1',   // glider/motor glider           → Segelflieger
  '2': 'A1',   // tow plane                     → Schleppmaschine (light)
  '3': 'A7',   // helicopter / rotorcraft       → Helikopter
  '4': 'B3',   // skydiver / parachute          → Fallschirmspringer
  '5': 'A1',   // drop plane                    → Absetz-Maschine (light)
  '6': 'B4',   // hang glider                   → Drachenflieger
  '7': 'B4',   // paraglider                    → Gleitschirm
  '8': 'A1',   // powered aircraft              → Motorflugzeug (light)
  '9': 'A2',   // jet aircraft                  → Jet (small)
  '10': 'B2',  // balloon                       → Lighter-than-air
  '11': 'B2',  // airship                       → Luftschiff
  '12': 'B6',  // UAV / drone                   → Drohne
  '13': '',    // static object
  '14': '',    // static object
};

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function parseOgnXml(xml) {
  const out = [];
  // Marker-Format: <m a="lat,lon,csShort,csFull,altM,timestamp,sec,track,speedKmh,vSpeed,ognType,receiver,icaoHex,ognId"/>
  const re = /<m\s+a="([^"]+)"\s*\/>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const f = m[1].split(',');
    if (f.length < 14) continue;
    const lat = parseFloat(f[0]);
    const lon = parseFloat(f[1]);
    if (!isFinite(lat) || !isFinite(lon)) continue;

    const altM = parseFloat(f[4]) || 0;
    const altFt = Math.round(altM * 3.28084);
    const trackDeg = parseFloat(f[7]) || 0;
    const speedKmh = parseFloat(f[8]) || 0;
    const speedKt = speedKmh / 1.852;            // → kt (Client rechnet × 0.5144 → m/s)
    const ognType = String(f[10] || '').trim();
    const icaoHex = String(f[12] || '').trim();
    const ognId = String(f[13] || '').trim();
    const fullId = String(f[3] || '').trim();    // bevorzugt; z. B. "D-AIRH" statt "RH"

    // OGN-only-Targets (FLARM, OGN-Tracker) erhalten Pseudo-Hex mit Präfix,
    // damit Deduplizierung mit echten ICAO-Hex-Targets nicht fälschlich greift.
    const hex = (icaoHex && icaoHex !== '0') ? icaoHex.toLowerCase() : ('ogn-' + ognId);

    out.push({
      lat,
      lon,
      hex,
      flight: fullId,
      track: trackDeg,
      gs: speedKt,
      alt_baro: altFt,
      category: OGN_TO_CAT[ognType] || '',
      source: 'ogn',
    });
  }
  return out;
}

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }

  const q = event.queryStringParameters || {};
  const lat = parseFloat(q.lat);
  const lon = parseFloat(q.lon);
  const km = clamp(parseFloat(q.km) || 20, 1, 100);

  if (!isFinite(lat) || !isFinite(lon) ||
      lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return {
      statusCode: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'invalid_lat_lon' }),
    };
  }

  // Bbox um den Zielpunkt (sphärische Näherung: 1° Lat ≈ 111 km, Lon skaliert mit cos(Lat))
  const dLat = km / 111;
  const dLon = km / (111 * Math.cos(lat * Math.PI / 180));
  const url = 'https://live.glidernet.org/lxml.php'
    + '?a=0'
    + '&b=' + (lat + dLat).toFixed(6)
    + '&c=' + (lat - dLat).toFixed(6)
    + '&d=' + (lon + dLon).toFixed(6)
    + '&e=' + (lon - dLon).toFixed(6)
    + '&z=12';

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 7000);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'SkyAlarm/0.25 (+https://skyalarm.netlify.app)' },
    });
    clearTimeout(timer);
    if (!r.ok) {
      return {
        statusCode: 502,
        headers: { ...cors, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'ogn_http_' + r.status, ac: [] }),
      };
    }
    const xml = await r.text();
    const ac = parseOgnXml(xml);
    return {
      statusCode: 200,
      headers: {
        ...cors,
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=4',
      },
      body: JSON.stringify({ ac, ts: Date.now(), source: 'ogn' }),
    };
  } catch (e) {
    clearTimeout(timer);
    return {
      statusCode: 502,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'ogn_unavailable', message: String(e && e.message || e), ac: [] }),
    };
  }
};
