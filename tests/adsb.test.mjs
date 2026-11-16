import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const fn = require('../netlify/functions/adsb.js');
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; fn._reset(); });

const LOL = (lat, lon, d) => `https://api.adsb.lol/v2/point/${lat}/${lon}/${d}`;
const FI = (lat, lon, d) => `https://opendata.adsb.fi/api/v3/lat/${lat}/lon/${lon}/dist/${d}`;
const json = (obj, status = 200) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => obj, text: async () => JSON.stringify(obj) });
const badJson = async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('x'); }, text: async () => '<html>' });
const fail403 = json({ error: 'nope' }, 403);
const call = async (qs) => { const r = await fn.handler({ queryStringParameters: qs }); return { status: r.statusCode, headers: r.headers, body: JSON.parse(r.body) }; };
const AC = { hex: 'abc123', flight: 'DLH1', lat: 52.5, lon: 13.4, alt_baro: 1200, alt_geom: 1300, gs: 140, track: 90, category: 'A3' };

test('Primärquelle adsb.lol: exakte URL, User-Agent, Antwortform und Cache-Header', async () => {
  const calls = [];
  globalThis.fetch = async (u, o) => { calls.push({ u, o }); return json({ now: 1234, ac: [AC] })(); };
  const r = await call({ lat: '52.51634', lon: '13.37771', dist: '10' });
  assert.equal(r.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].u, LOL(52.5163, 13.3777, 10));
  assert.equal(calls[0].o.headers['User-Agent'], 'SkyAlarm (+https://skyalarm.netlify.app)');
  assert.equal(r.body.source, 'adsb.lol');
  assert.equal(r.body.now, 1234);
  assert.deepEqual(r.body.ac, [AC]);
  assert.equal(r.headers['Content-Type'], 'application/json');
  assert.equal(r.headers['Access-Control-Allow-Origin'], undefined);
  assert.ok(!Object.keys(r.headers).some(k => /^access-control/i.test(k)));
  assert.equal(r.headers['Cache-Control'], 'public, max-age=3');
});

test('Primär 403 → Fallback adsb.fi mit exakter URL und User-Agent', async () => {
  const calls = [];
  globalThis.fetch = async (u, o) => { calls.push({ u, o }); return u.startsWith('https://api.adsb.lol') ? fail403() : json({ ac: [AC] })(); };
  const r = await call({ lat: '52.5', lon: '13.4', dist: '10' });
  assert.equal(r.status, 200);
  assert.equal(r.body.source, 'adsb.fi');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].u, FI(52.5, 13.4, 10));
  assert.equal(calls[1].o.headers['User-Agent'], 'SkyAlarm (+https://skyalarm.netlify.app)');
  assert.equal(typeof r.body.now, 'number');
});

test('Primär 200 mit Nicht-JSON oder ohne ac-Liste → Fallback', async () => {
  for (const primary of [badJson, json({ error: 'x' }), json({ ac: 'nope' }), json(null)]) {
    globalThis.fetch = async (u) => u.startsWith('https://api.adsb.lol') ? primary() : json({ ac: [AC] })();
    const r = await call({ lat: '1', lon: '2' });
    assert.equal(r.status, 200);
    assert.equal(r.body.source, 'adsb.fi');
  }
});

test('Netzwerkfehler der Primärquelle → Fallback', async () => {
  globalThis.fetch = async (u) => { if (u.startsWith('https://api.adsb.lol')) throw new Error('boom'); return json({ ac: [] })(); };
  const r = await call({ lat: '1', lon: '2' });
  assert.equal(r.status, 200);
  assert.equal(r.body.source, 'adsb.fi');
  assert.deepEqual(r.body.ac, []);
});

test('beide Quellen ausgefallen → 502 mit tried (2 Einträge) und no-store', async () => {
  globalThis.fetch = async (u) => { if (u.startsWith('https://api.adsb.lol')) return fail403(); throw new Error('timeout'); };
  const r = await call({ lat: '1', lon: '2' });
  assert.equal(r.status, 502);
  assert.equal(r.body.error, 'upstream_unavailable');
  assert.equal(r.body.tried.length, 2);
  assert.equal(r.body.tried[0].source, 'adsb.lol');
  assert.equal(r.body.tried[1].source, 'adsb.fi');
  assert.ok(r.body.tried.every(t => typeof t.reason === 'string' && t.reason));
  assert.equal(r.headers['Cache-Control'], 'no-store');
});

test('ungültige oder fehlende lat/lon → 400, fetch wird nie aufgerufen', async () => {
  let n = 0;
  globalThis.fetch = async () => { n++; return json({ ac: [] })(); };
  const bad = [{}, { lat: '1' }, { lon: '1' }, { lat: 'abc', lon: '1' }, { lat: '91', lon: '1' }, { lat: '-91', lon: '1' },
    { lat: '1', lon: '181' }, { lat: '1', lon: '-181' }, { lat: '', lon: '1' }, { lat: 'Infinity', lon: '1' }, { lat: '1e999', lon: '1' }];
  for (const qs of bad) {
    const r = await call(qs);
    assert.equal(r.status, 400, JSON.stringify(qs));
    assert.ok(r.body.error);
  }
  const r = await fn.handler({});
  assert.equal(r.statusCode, 400);
  assert.equal(n, 0);
});

test('dist: Default 10, Klemmung auf 1..30, Rundung auf ganze Zahl', async () => {
  const urls = [];
  globalThis.fetch = async (u) => { urls.push(u); return json({ ac: [] })(); };
  await call({ lat: '10', lon: '20' });
  await call({ lat: '10', lon: '20', dist: '0' });
  await call({ lat: '10', lon: '20', dist: '-5' });
  await call({ lat: '10', lon: '20', dist: '9999' });
  await call({ lat: '10', lon: '20', dist: '10.6' });
  await call({ lat: '10', lon: '20', dist: 'abc' });
  assert.deepEqual(urls, [LOL(10, 20, 10), LOL(10, 20, 1), LOL(10, 20, 1), LOL(10, 20, 30), LOL(10, 20, 11), LOL(10, 20, 10)]);
});

test('Feld-Whitelist: Zusatzfelder entfallen, Einträge ohne numerische lat/lon entfallen', async () => {
  globalThis.fetch = json({ now: 5, ac: [
    { ...AC, r: 'D-ABCD', t: 'A320', squawk: '1234', baro_rate: 64, mlat: [] },
    { hex: 'nolat', lon: 1 },
    { hex: 'strlat', lat: '52', lon: 13 },
    { hex: 'nullon', lat: 1, lon: null },
    { hex: 'minimal', lat: 0, lon: 0, alt_baro: 'ground' },
    null,
  ] });
  const r = await call({ lat: '1', lon: '2' });
  assert.equal(r.body.ac.length, 2);
  assert.deepEqual(r.body.ac[0], AC);
  assert.deepEqual(r.body.ac[1], { hex: 'minimal', lat: 0, lon: 0, alt_baro: 'ground' });
});

// ── Review-Fixes ──────────────────────────────────────────────────────────────
const hang = (signal, onAbort) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(onAbort())));
const withLimits = async (l, f) => { const old = { ...fn.LIMITS }; Object.assign(fn.LIMITS, l); try { await f(); } finally { Object.assign(fn.LIMITS, old); } };
const abortErr = () => Object.assign(new Error('aborted'), { name: 'AbortError' });

test('Standard-Budget liegt unter dem Netlify-Limit von 10 s', () => {
  assert.ok(fn.LIMITS.totalMs <= 6500 && fn.LIMITS.primaryMs <= 3000);
});

test('Primärquelle hängt → Timeout, Fallback liefert innerhalb des Budgets', async () => {
  await withLimits({ primaryMs: 40, totalMs: 300, minFallbackMs: 10 }, async () => {
    globalThis.fetch = async (u, o) => u.startsWith('https://api.adsb.lol') ? hang(o.signal, abortErr) : json({ ac: [AC] })();
    const t = Date.now();
    const r = await call({ lat: '1', lon: '2' });
    assert.equal(r.status, 200);
    assert.equal(r.body.source, 'adsb.fi');
    assert.ok(Date.now() - t < 300);
  });
});

test('beide hängen → 502 mit timeout, Gesamtdauer ≤ Gesamtbudget', async () => {
  await withLimits({ primaryMs: 40, totalMs: 200, minFallbackMs: 10 }, async () => {
    globalThis.fetch = async (u, o) => hang(o.signal, abortErr);
    const t = Date.now();
    const r = await call({ lat: '1', lon: '2' });
    const dt = Date.now() - t;
    assert.equal(r.status, 502);
    assert.deepEqual(r.body.tried.map(x => x.reason), ['timeout', 'timeout']);
    assert.ok(dt < 200 + 100, 'Dauer ' + dt);
  });
});

test('Abbruch beim Lesen des Bodys wird als timeout gemeldet, nicht als invalid_json', async () => {
  await withLimits({ primaryMs: 30, totalMs: 200, minFallbackMs: 10 }, async () => {
    globalThis.fetch = async (u, o) => ({ ok: true, status: 200, json: () => hang(o.signal, () => new SyntaxError('Unexpected end')) });
    const r = await call({ lat: '1', lon: '2' });
    assert.equal(r.status, 502);
    assert.equal(r.body.tried[0].reason, 'timeout');
  });
});

test('msg ≠ "No error" → Quelle gilt als ausgefallen (upstream_msg), Fallback greift', async () => {
  globalThis.fetch = async (u) => u.startsWith('https://api.adsb.lol') ? json({ msg: 'Rate limited', ac: [AC] })() : json({ msg: 'No error', ac: [AC] })();
  const r = await call({ lat: '1', lon: '2' });
  assert.equal(r.body.source, 'adsb.fi');
  globalThis.fetch = json({ msg: 'boom', ac: [AC] });
  const r2 = await call({ lat: '1', lon: '2' });
  assert.equal(r2.status, 502);
  assert.deepEqual(r2.body.tried.map(x => x.reason), ['upstream_msg', 'upstream_msg']);
});

test('leeres ac mit msg "No error" ist gültig (keine Flugzeuge)', async () => {
  let n = 0;
  globalThis.fetch = async () => { n++; return json({ msg: 'No error', now: 7, ac: [] })(); };
  const r = await call({ lat: '1', lon: '2' });
  assert.equal(r.status, 200);
  assert.equal(r.body.source, 'adsb.lol');
  assert.deepEqual(r.body.ac, []);
  assert.equal(n, 1);
});

test('Typ-Bereinigung der Felder', async () => {
  globalThis.fetch = json({ ac: [
    { hex: 'abc123', flight: '  DLH123456789 ', lat: 1, lon: 2, category: 'A3', alt_baro: 'ground', alt_geom: 5, gs: 6, track: 7 },
    { hex: 'toolongHEX', flight: 123, lat: 1, lon: 2, category: 'TOOLONG', alt_baro: {}, alt_geom: '5', gs: NaN, track: null },
    { hex: 42, flight: null, lat: 1, lon: 2, alt_baro: 'abc', gs: Infinity },
    { lat: 1, lon: 2, alt_baro: 0 },
  ] });
  const r = await call({ lat: '1', lon: '2' });
  assert.deepEqual(r.body.ac, [
    { lat: 1, lon: 2, hex: 'abc123', flight: 'DLH12345', category: 'A3', alt_baro: 'ground', alt_geom: 5, gs: 6, track: 7 },
    { lat: 1, lon: 2 },
    { lat: 1, lon: 2 },
    { lat: 1, lon: 2, alt_baro: 0 },
  ]);
});

// ── SkyAlarm-spezifisch ───────────────────────────────────────────────────────
test('SkyAlarm-Felder (hex, flight, lat, lon, alt_baro, alt_geom, gs, track, category) bleiben vollständig erhalten; "source" des Upstreams entfällt', async () => {
  globalThis.fetch = json({ ac: [{ ...AC, source: 'mlat', seen: 1, seen_pos: 2, dst: 3, t: 'B738' }] });
  const r = await call({ lat: '50.03', lon: '8.56', dist: '10' });
  assert.deepEqual(r.body.ac, [AC]);
  assert.equal(r.body.ac[0].source, undefined);
});

// ── Review-Fixes ──────────────────────────────────────────────────────────────
const withClock = async (f) => {
  let t = 1_000_000; const old = fn.LIMITS.now; fn.LIMITS.now = () => t;
  try { await f(ms => { t += ms; }); } finally { fn.LIMITS.now = old; }
};

test('Alarm-App-Budgets: Primär 3000 ms, gesamt 6500 ms, Merkzeit 60 s', () => {
  assert.equal(fn.LIMITS.primaryMs, 3000);
  assert.equal(fn.LIMITS.totalMs, 6500);
  assert.equal(fn.LIMITS.downMs, 60000);
});

test('Primärausfall wird 60 s gemerkt: danach zuerst adsb.fi, nach Ablauf wieder adsb.lol zuerst', async () => {
  await withClock(async (advance) => {
    const urls = [];
    let lolDown = true;
    globalThis.fetch = async (u) => { urls.push(u); return u.startsWith('https://api.adsb.lol') && lolDown ? fail403() : json({ ac: [AC] })(); };
    let r = await call({ lat: '1', lon: '2', dist: '10' });
    assert.equal(r.body.source, 'adsb.fi');
    assert.equal(urls.length, 2);                       // lol zuerst (fehlgeschlagen), dann fi
    urls.length = 0;
    r = await call({ lat: '1', lon: '2', dist: '10' });
    assert.equal(r.body.source, 'adsb.fi');
    assert.deepEqual(urls, [FI(1, 2, 10)]);             // fi zuerst, lol gar nicht versucht
    urls.length = 0;
    advance(61000); lolDown = false;
    r = await call({ lat: '1', lon: '2', dist: '10' });
    assert.equal(r.body.source, 'adsb.lol');
    assert.deepEqual(urls, [LOL(1, 2, 10)]);
  });
});

test('Während der Merkzeit fällt adsb.fi-Ausfall auf adsb.lol zurück; dessen Erfolg löscht die Markierung', async () => {
  await withClock(async () => {
    globalThis.fetch = async (u) => u.startsWith('https://api.adsb.lol') ? fail403() : json({ ac: [AC] })();
    await call({ lat: '1', lon: '2' });                 // lol fällt aus → gemerkt
    const urls = [];
    globalThis.fetch = async (u) => { urls.push(u); return u.startsWith('https://opendata.adsb.fi') ? fail403() : json({ ac: [AC] })(); };
    const r = await call({ lat: '1', lon: '2' });
    assert.equal(r.body.source, 'adsb.lol');
    assert.deepEqual(urls.map(u => u.includes('adsb.fi') ? 'fi' : 'lol'), ['fi', 'lol']);
    urls.length = 0;
    await call({ lat: '1', lon: '2' });                 // lol war erfolgreich → wieder lol zuerst
    assert.deepEqual(urls.map(u => u.includes('adsb.fi') ? 'fi' : 'lol'), ['lol']);
  });
});

test('dist wird auf 30 nm begrenzt', async () => {
  const urls = [];
  globalThis.fetch = async (u) => { urls.push(u); return json({ ac: [] })(); };
  await call({ lat: '1', lon: '2', dist: '250' });
  await call({ lat: '1', lon: '2', dist: '31' });
  assert.deepEqual(urls, [LOL(1, 2, 30), LOL(1, 2, 30)]);
});

test('Origin/Referer wie ogn.js: eigene Hosts, Previews, localhost und fehlende Header erlaubt, fremde 403 ohne fetch', async () => {
  let n = 0;
  globalThis.fetch = async () => { n++; return json({ ac: [] })(); };
  const withHdr = async (headers) => { const r = await fn.handler({ headers, queryStringParameters: { lat: '1', lon: '2' } }); return r.statusCode; };
  for (const h of [undefined, {}, { origin: 'https://skyalarm.netlify.app' }, { referer: 'https://skyalarm.netlify.app/skyalarm.html' },
    { origin: 'https://deploy-preview-3--skyalarm.netlify.app' }, { origin: 'http://localhost:8888' }, { referer: 'http://127.0.0.1:8888/' }, { origin: 'not a url' }]) {
    assert.equal(await withHdr(h), 200, JSON.stringify(h));
  }
  assert.equal(n, 8);
  n = 0;
  for (const h of [{ origin: 'https://evil.example' }, { referer: 'https://evil.example/x' }, { origin: 'https://skyalarm.netlify.app.evil.example' }, { origin: 'https://xskyalarm.netlify.app' }]) {
    const r = await fn.handler({ headers: h, queryStringParameters: { lat: '1', lon: '2' } });
    assert.equal(r.statusCode, 403, JSON.stringify(h));
    assert.equal(JSON.parse(r.body).error, 'forbidden_origin');
  }
  assert.equal(n, 0);
});
