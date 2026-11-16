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

test('Start mit totem ADS-B-Feed (nie geantwortet): Warnung schon nach dem ersten Poll', () => {
  assert.deepEqual(run([[false, true], [false, true]]), ['adsb_missing', 'adsb_missing']);
});

test('OGN fehlt, ADS-B läuft: ogn_missing nach 2 Fehlpolls, Erholung sofort', () => {
  assert.deepEqual(run([[true, true], [true, false], [true, false], [true, true]]), ['ok', 'ok', 'ogn_missing', 'ok']);
});

test('Teilerholung: aus "none" kommt zuerst nur eine Quelle zurück', () => {
  assert.deepEqual(run([[true, true], [false, false], [false, false], [true, false], [true, true]]),
    ['ok', 'ok', 'none', 'ogn_missing', 'ok']);
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
