// Zieht die Quellen-Zustandslogik per Namenssuche aus skyalarm.html und prüft sie mit Stubs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const html = readFileSync(fileURLToPath(new URL('../skyalarm.html', import.meta.url)), 'utf8');

function grab(name) {
  const m = html.match(new RegExp(`(async\\s+)?function ${name}\\(`));
  assert.ok(m, `Funktion ${name} nicht in skyalarm.html gefunden`);
  let depth = 0;
  for (let k = html.indexOf('{', html.indexOf(')', m.index)); k < html.length; k++) {
    if (html[k] === '{') depth++;
    else if (html[k] === '}' && --depth === 0) return html.slice(m.index, k + 1);
  }
  throw new Error(`Ende von ${name} nicht gefunden`);
}

const nextHealth = new Function(`${grab('avNextHealth')}; return avNextHealth;`)();
const run = (steps, h = null) => steps.map(([a, o]) => (h = nextHealth(h, a, o)).mode);

test('Start: ein Fehlpoll beider Quellen = connecting, nie "ok" vor dem ersten Erfolg', () => {
  assert.deepEqual(run([[false, false]]), ['connecting']);
});

test('Beide ausgefallen: erst nach 2 Fehlpolls in Folge "none"', () => {
  assert.deepEqual(run([[false, false], [false, false], [false, false]]), ['connecting', 'none', 'none']);
  assert.deepEqual(run([[true, true], [false, false], [false, false]]), ['ok', 'ok', 'none']);
});

test('ADS-B fehlt: 2 Fehlpolls in Folge, Erholung beim ersten Erfolg', () => {
  assert.deepEqual(run([[true, true], [false, true], [false, true], [true, true]]), ['ok', 'ok', 'adsb_missing', 'ok']);
});

test('Einzelner Fehlpoll zwischen Erfolgen löst keine Warnung aus', () => {
  assert.deepEqual(run([[true, true], [false, true], [true, true], [false, true], [true, true]]), ['ok', 'ok', 'ok', 'ok', 'ok']);
});

test('Start mit totem ADS-B-Feed: erst nach 2 Fehlpolls Warnung (kein Flattern beim Start)', () => {
  assert.deepEqual(run([[false, true], [false, true]]), ['ok', 'adsb_missing']);
});

test('Start mit totem OGN-Feed: ebenfalls erst nach 2 Fehlpolls', () => {
  assert.deepEqual(run([[true, false], [true, false]]), ['ok', 'ogn_missing']);
});

test('connecting bleibt, bis eine Quelle antwortet oder beide zweimal ausgefallen sind', () => {
  assert.deepEqual(run([[false, false], [false, false]]), ['connecting', 'none']);
  assert.deepEqual(run([[false, false], [true, false]]), ['connecting', 'ogn_missing']);
  assert.deepEqual(run([[false, false], [true, true]]), ['connecting', 'ok']);
});

test('changedTo: genau einmal beim Übergang in einen Warnzustand, nichts bei Erholung oder Wiederholung', () => {
  let h = null; const out = [];
  for (const [a, o] of [[true, true], [false, true], [false, true], [false, true], [true, true],
    [true, false], [true, false], [true, true], [false, false], [false, false], [false, false], [true, true]]) {
    h = nextHealth(h, a, o); out.push(h.changedTo);
  }
  assert.deepEqual(out, [null, null, 'adsb_missing', null, null, null, 'ogn_missing', null, null, 'none', null, null]);
});

test('changedTo: Teilerholung aus "none" in einen Einzelausfall bleibt still, "none" direkt aus connecting meldet', () => {
  let h = null; const out = [];
  for (const [a, o] of [[false, false], [false, false], [true, false], [true, false]]) { h = nextHealth(h, a, o); out.push(h.changedTo); }
  assert.deepEqual(out, [null, 'none', null, null]);
});

test('OGN fehlt, ADS-B läuft: ogn_missing nach 2 Fehlpolls, Erholung sofort', () => {
  assert.deepEqual(run([[true, true], [true, false], [true, false], [true, true]]), ['ok', 'ok', 'ogn_missing', 'ok']);
});

test('Teilerholung: aus "none" kommt zuerst nur eine Quelle zurück', () => {
  assert.deepEqual(run([[true, true], [false, false], [false, false], [true, false], [true, false], [true, true]]),
    ['ok', 'ok', 'none', 'ogn_missing', 'ogn_missing', 'ok']);
});

test('Zähler wachsen nicht unbegrenzt und der Vorzustand wird nicht verändert', () => {
  let h = null; for (let i = 0; i < 300; i++) h = nextHealth(h, false, false);
  assert.ok(h.adsbFails <= 99);
  const prev = nextHealth(null, true, true), snap = JSON.stringify(prev);
  nextHealth(prev, false, false);
  assert.equal(JSON.stringify(prev), snap);
});

// ── avRenderStatus: Alarm hat Vorrang, Warnung kehrt nach Alarmende zurück ────────────────────
function renderEnv() {
  const el = () => ({ className: '', textContent: '' });
  const els = { 'av-stat': el(), 'av-feedwarn': el() };
  const AV = { alarmOn: false, alarmCount: 0, health: null };
  const T = { statConnecting: 'conn', statOnlyOgn: 'nurOGN', statOnlyAdsb: 'nurADSB', statNoData: 'keine', statWatch: 'watch',
    statAlarm: n => 'alarm' + n, warnNoAdsb: 'W-ADSB', warnNoOgn: 'W-OGN', warnNoData: 'W-NONE' };
  let layouts = 0;
  const fn = new Function('AV', '$', '_t', 'avLayoutBars', `${grab('avRenderStatus')}; return avRenderStatus;`)(
    AV, id => els[id], k => T[k], () => layouts++);
  return { AV, els, fn };
}

test('avRenderStatus: Zustände, Klassen und Texte', () => {
  const { AV, els, fn } = renderEnv();
  fn();
  assert.equal(els['av-stat'].className, 'av-stat connecting');
  assert.equal(els['av-feedwarn'].className, 'av-feedwarn');
  AV.health = { mode: 'ok' }; fn();
  assert.equal(els['av-stat'].className, 'av-stat watch');
  AV.health = { mode: 'adsb_missing' }; fn();
  assert.deepEqual([els['av-stat'].className, els['av-stat'].textContent, els['av-feedwarn'].className, els['av-feedwarn'].textContent],
    ['av-stat degraded', 'nurOGN', 'av-feedwarn show', 'W-ADSB']);
  AV.health = { mode: 'ogn_missing' }; fn();
  assert.deepEqual([els['av-feedwarn'].className, els['av-feedwarn'].textContent], ['av-feedwarn show minor', 'W-OGN']);
  AV.health = { mode: 'none' }; fn();
  assert.deepEqual([els['av-feedwarn'].className, els['av-feedwarn'].textContent], ['av-feedwarn show none', 'W-NONE']);
  AV.health = { mode: 'ok' }; fn();
  assert.equal(els['av-feedwarn'].textContent, '');
});

test('avRenderStatus: aktiver Alarm überdeckt den Chip, Warnleiste bleibt, nach Alarmende kommt die Warnung zurück', () => {
  const { AV, els, fn } = renderEnv();
  AV.health = { mode: 'adsb_missing' };
  AV.alarmOn = true; AV.alarmCount = 2; fn();
  assert.deepEqual([els['av-stat'].className, els['av-stat'].textContent], ['av-stat alarm', 'alarm2']);
  assert.equal(els['av-feedwarn'].textContent, 'W-ADSB');
  AV.alarmOn = false; fn();
  assert.deepEqual([els['av-stat'].className, els['av-stat'].textContent], ['av-stat degraded', 'nurOGN']);
});

// ── Zeitplanung ───────────────────────────────────────────────────────────────
const pollDelay = new Function(`${grab('avPollDelay')}; return avPollDelay;`)();

test('avPollDelay: Takt relativ zum Pollstart, mindestens 500 ms', () => {
  assert.deepEqual(pollDelay(true, 3, 5000, 1200), { streak: 0, delay: 3800 });
  assert.equal(pollDelay(true, 0, 5000, 4900).delay, 500);
  assert.equal(pollDelay(true, 0, 5000, 20000).delay, 500);
});

test('avPollDelay: ohne erreichbare Quelle exponentielles Backoff bis 30 s, Streak max 5', () => {
  let st = 0; const d = [];
  for (let i = 0; i < 7; i++) { const r = pollDelay(false, st, 5000, 100); st = r.streak; d.push(r.delay); }
  assert.deepEqual(d, [10000, 20000, 30000, 30000, 30000, 30000, 30000]);
  assert.equal(st, 5);
});

// ── avCheckProx: Alarm-Haltezeit ──────────────────────────────────────────────
function proxEnv(planes) {
  const els = {}; const cls = new Set();
  const $ = id => els[id] ||= { className: '', textContent: '', classList: { add: c => cls.add(c), remove: c => cls.delete(c), contains: c => cls.has(c) } };
  $('app-view');
  const AV = { lat: 50, lon: 8, alarmOn: false, alarmMissCount: 0, alarmCount: 0, ALARM_HOLD: 2, RADIUS_KM: 2, ALT_LIMIT_FT: 984, groundElevM: 0, beepInterval: null };
  let renders = 0, beeps = 0;
  const g = { setInterval: () => 42, clearInterval: () => {}, navigator: {} };
  const code = `${grab('altMslFt')}\n${grab('altAglFt')}\n${grab('altAglM')}\n${grab('avDist')}\n${grab('avCheckProx')}\nreturn avCheckProx;`;
  const fn = new Function('AV', '$', '_t', 'avUpdateLowAlt', 'avBeep', 'avRenderStatus', 'setInterval', 'clearInterval', 'navigator', code)(
    AV, $, () => n => 'alarm' + n, () => {}, () => { beeps++; }, () => { renders++; }, g.setInterval, g.clearInterval, g.navigator);
  return { AV, fn, cls, $, beeps: () => beeps };
}
const NEAR = { hex: 'a', lat: 50.001, lon: 8.001, alt_baro: 300 };

test('avCheckProx: Alarm hält den 1. leeren Zyklus und endet am 2. aufeinanderfolgenden (ALARM_HOLD = 2)', () => {
  const e = proxEnv();
  e.fn([NEAR]);
  assert.equal(e.AV.alarmOn, true);
  e.fn([]);                                  // 1. leerer Zyklus: gehalten
  assert.equal(e.AV.alarmOn, true);
  e.fn([]);                                  // 2. leerer Zyklus: beendet
  assert.equal(e.AV.alarmOn, false);
  assert.equal(e.cls.has('av-alarming'), false);
  assert.equal(e.beeps(), 1);
});

test('avCheckProx: ein Treffer zwischendurch setzt den Zähler zurück', () => {
  const e = proxEnv();
  e.fn([NEAR]); e.fn([]); e.fn([NEAR]); e.fn([]);
  assert.equal(e.AV.alarmOn, true);
  e.fn([]);
  assert.equal(e.AV.alarmOn, false);
});

// ── avPoll / avClearTraffic ───────────────────────────────────────────────────
function pollEnv({ adsb, ogn, mutate } = {}) {
  const log = { scheduled: [], marks: [], prox: [], signals: [], cleared: 0, rendered: 0 };
  const AV = { lat: 50, lon: 8, SCAN_KM: 18.52, POLL_MS: 5000, health: null, _polling: false, lastPlanes: null };
  const resp = (spec) => async (url) => {
    if (spec === 'throw') throw new Error('net');
    if (spec === 'abort') throw new Error('aborted');
    return { ok: spec.ok !== false, status: spec.status || 200, json: async () => { if (spec.badJson) throw new SyntaxError('x'); return spec.body; } };
  };
  const fetchStub = async (url, o) => {
    if (mutate) { mutate(AV); }
    return (url.startsWith('/.netlify/functions/adsb') ? resp(adsb) : resp(ogn))(url);
  };
  const deps = {
    AV, fetch: fetchStub, ADSB_URL: '/.netlify/functions/adsb', OGN_URL: '/.netlify/functions/ogn',
    AbortController, setTimeout: (f, ms) => setTimeout(f, 0), clearTimeout,
    avNextHealth: nextHealth, console: { error() {} },
    avClearTraffic: () => { log.cleared++; }, avWarnSignal: k => log.signals.push(k),
    avUpdateMarkers: p => { if (deps.markersThrow) throw new Error('marker'); log.marks.push(p); },
    avCheckProx: p => log.prox.push(p),
    avScheduleNextPoll: (ok, t0) => log.scheduled.push(ok),
    avRenderStatus: () => { log.rendered++; if (deps.renderThrow) throw new Error('render'); },
  };
  const names = Object.keys(deps);
  const fn = new Function(...names, `${grab('avPoll')}; return avPoll;`)(...names.map(n => deps[n]));
  return { fn, AV, log, deps };
}
const okBody = ac => ({ ok: true, body: { ac } });

test('avPoll: nur gültige {ac:[…]}-Antworten zählen als Erfolg (non-2xx, fehlendes ac, JSON-Fehler, Netzfehler = Ausfall)', async () => {
  const cases = [
    [{ ok: false, status: 403, body: {} }, false], [{ body: { error: 'x' } }, false], [{ body: { ac: 'no' } }, false],
    [{ badJson: true }, false], ['throw', false], [{ body: null }, false], [{ body: { ac: [] } }, true],
  ];
  for (const [spec, expectOk] of cases) {
    const e = pollEnv({ adsb: spec, ogn: okBody([]) });
    await e.fn();
    assert.equal(e.AV.health.adsbFails, expectOk ? 0 : 1, JSON.stringify(spec));
    assert.equal(e.AV.health.ognFails, 0);
    const e2 = pollEnv({ adsb: okBody([]), ogn: spec });
    await e2.fn();
    assert.equal(e2.AV.health.ognFails, expectOk ? 0 : 1, 'ogn ' + JSON.stringify(spec));
  }
});

test('avPoll: ADS-B bekommt source "ads-b"; Ergebnis beider Quellen wird zusammengeführt', async () => {
  const e = pollEnv({ adsb: okBody([{ hex: 'AB12', lat: 1, lon: 2 }]), ogn: okBody([{ hex: 'ogn-1', lat: 1, lon: 2, source: 'ogn' }]) });
  await e.fn();
  assert.equal(e.log.marks[0].length, 2);
  assert.equal(e.log.marks[0].find(a => a.hex === 'AB12').source, 'ads-b');
  assert.equal(e.log.prox.length, 1);
});

test('avPoll: Backoff-Argument = mindestens eine Quelle erreichbar', async () => {
  let e = pollEnv({ adsb: 'throw', ogn: okBody([]) }); await e.fn(); assert.deepEqual(e.log.scheduled, [true]);
  e = pollEnv({ adsb: 'throw', ogn: 'throw' }); await e.fn(); assert.deepEqual(e.log.scheduled, [false]);
});

test('avPoll: plant den nächsten Poll auch, wenn Rendern oder Marker-Update werfen; Annäherungsprüfung läuft trotzdem', async () => {
  const e1 = pollEnv({ adsb: okBody([{ hex: 'x', lat: 1, lon: 2 }]), ogn: okBody([]) });
  e1.deps.markersThrow = true;
  await e1.fn();
  assert.equal(e1.log.prox.length, 1);
  assert.equal(e1.log.scheduled.length, 1);
  assert.equal(e1.AV._polling, false);
  const e2 = pollEnv({ adsb: okBody([]), ogn: okBody([]) });
  e2.deps.renderThrow = true;
  await e2.fn();
  assert.equal(e2.log.scheduled.length, 1);
});

test('avPoll: Ergebnis wird verworfen, wenn sich die Position während des Abrufs ändert; Nachpoll wird vorgemerkt', async () => {
  const e = pollEnv({ adsb: okBody([{ hex: 'x', lat: 1, lon: 2 }]), ogn: okBody([]), mutate: AV => { AV.lat = 51; } });
  await e.fn();
  assert.equal(e.log.marks.length, 0);
  assert.equal(e.log.prox.length, 0);
  assert.equal(e.AV.health, null);
  assert.equal(e.AV._repoll, true);
  assert.equal(e.log.scheduled.length, 1);
});

test('avPoll: Übergang in "none" räumt auf und löst genau ein Signal aus', async () => {
  const e = pollEnv({ adsb: 'throw', ogn: 'throw' });
  await e.fn(); assert.equal(e.log.cleared, 0); assert.deepEqual(e.log.signals, [null]);
  await e.fn(); assert.equal(e.log.cleared, 1); assert.deepEqual(e.log.signals, [null, 'none']);
  await e.fn(); assert.equal(e.log.cleared, 2); assert.deepEqual(e.log.signals, [null, 'none', null]);
  assert.equal(e.log.marks.length, 1);   // nur der erste (connecting) Poll aktualisiert Marker
});

test('avClearTraffic: Beep-Intervall gestoppt, Alarmzustand zurückgesetzt, Banner/Rahmen weg', () => {
  const cls = new Set(['av-alarming']); const els = {};
  const $ = id => els[id] ||= { className: 'av-banner show', classList: { remove: c => cls.delete(c) } };
  const AV = { beepInterval: 7, alarmOn: true, alarmMissCount: 1, alarmCount: 3, trails: { a: [1] }, lastPlanes: [1] };
  const cleared = []; let marks = null, low = null;
  new Function('AV', '$', 'clearInterval', 'avUpdateMarkers', 'avUpdateLowAlt', `${grab('avClearTraffic')}; avClearTraffic();`)(
    AV, $, id => cleared.push(id), p => { marks = p; }, p => { low = p; });
  assert.deepEqual(cleared, [7]);
  assert.equal(AV.beepInterval, null); assert.equal(AV.alarmOn, false); assert.equal(AV.alarmCount, 0);
  assert.equal(els['av-banner'].className, 'av-banner'); assert.equal(cls.has('av-alarming'), false);
  assert.deepEqual(AV.trails, {}); assert.deepEqual(marks, []); assert.deepEqual(low, []);
});

test('avWarnSignal: "none" vibriert und spielt vier Töne, Hinweiston ohne Vibration, null = still', () => {
  const run1 = kind => {
    const osc = []; let vib = null;
    const ctx = { currentTime: 0, destination: {}, createOscillator: () => { const o = { frequency: {}, connect() {}, start() {}, stop() {} }; osc.push(o); return o; },
      createGain: () => ({ gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }) };
    new Function('_avCtx', 'navigator', `${grab('avWarnSignal')}; avWarnSignal(${JSON.stringify(kind)});`)(() => ctx, { vibrate: p => { vib = p; } });
    return { n: osc.length, vib };
  };
  assert.equal(run1('none').n, 4); assert.ok(run1('none').vib.length >= 3);
  assert.deepEqual(run1('adsb_missing'), { n: 1, vib: null });
  assert.deepEqual(run1(null), { n: 0, vib: null });
});
