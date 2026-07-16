# SkyAlarm — Code-Review (Stand v0.32, 2026-07-16)

Vollständiger Review durch vier parallele Opus-4.8-Agenten mit disjunkten
Prüf-Dimensionen (Logik/Korrektheit, Sicherheit, Fachlogik Meteo/Geo,
PWA/Robustheit). Tragende Befunde am Code gegenverifiziert. Ein Agenten-Befund
(vermeintliche Versions-Drift) erwies sich als Fehlbefund und wurde verworfen;
die Kelvin→°C-Konvertierung ist mit `units=si` **korrekt** (zwei Agenten
bestätigen — der Fallstrick-Text in `CLAUDE.md` ist sachlich schief, der Code
richtig).

Gesamtbild: Die Datenverarbeitung ist überwiegend sauber. Zwei Schwachstellen-
Cluster betreffen den Kernzweck „zuverlässig alarmieren": **Zustellbarkeit des
Alarms** und **Höhenbezug des Alarmkriteriums**.

Status-Legende: 🔴 offen · 🟡 in Arbeit · 🟢 behoben

---

## Kritisch

### K1 · Alarm hat im Feldszenario ggf. keinen Ausgabekanal 🟢 (v0.33)
`skyalarm.html:1496, 1710, 1648`
Drei zusammenwirkende Lücken: (a) kein Screen Wake Lock — bei abgedunkeltem
Bildschirm/Telefon in der Tasche suspendiert das OS die JS-Timer, `avPoll`
feuert nicht mehr. (b) Der `AudioContext` wird nur lazy aus `avBeep()` erzeugt,
nie in einer User-Geste — auf iOS/Safari bleibt der Beep dauerhaft stumm (kein
Unlock-Handler im Code, per grep bestätigt). (c) `navigator.vibrate` existiert
auf iOS nicht.
**Fix:** Wake Lock (mit Re-Acquire bei `visibilitychange`), Audio-Unlock beim
ersten Tap (stummer Kick-Oszillator), zusätzlicher visueller Alarm-Kanal.

### K2 · Höhenbezug: MSL statt AGL 🟢 (v0.34)
`skyalarm.html:1632`
`alt_baro` ist barometrische MSL-Höhe, wird aber direkt gegen den als
„300 m AGL" deklarierten Schwellwert (984 ft) verglichen — ohne Geländehöhe.
Beispiel: Pilot auf 500 m Geländehöhe; ein Hubschrauber in echten 300 m AGL
liegt bei ≈ 2625 ft MSL → **kein Alarm**. Fehler wächst linear mit Geländehöhe.
**Fix:** Geländehöhe am Pilotenstandort per Open-Meteo-Elevation-API abrufen und
von der Target-Höhe abziehen (näherungsweise AGL).

---

## Hoch

### H1 · Bodenverkehr / höhenlose Targets lösen Fehlalarm aus 🟢 (v0.34)
`skyalarm.html:1539, 1632`
`alt_baro === 'ground'` und `null` werden beide auf 0 ft abgebildet → rollende
Flugzeuge und Targets ohne Baro-Höhe (vorhandenes `alt_geom` ignoriert) erzeugen
Dauer-Beep im Radius. **Fix:** Boden/unbekannte Höhe vom Alarm ausnehmen,
`alt_geom` als Fallback. Gemeinsam mit K2 gelöst.

### H2 · Keine Alarm-Hysterese 🟢 (v0.36)
`skyalarm.html:1636–1660`
Alarmzustand wird pro 2-s-Poll rein aus dem Momentanbild rekonstruiert. Bei
lückenhaftem Feed oder Target an der Grenze togglet der Alarm im 2-s-Takt mit
Sofort-Beeps. **Fix:** Entwarnung erst nach N leeren Zyklen (Hold-Down).

### H3 · Stored XSS über OGN-Callsigns / DiPUL-Zonennamen 🟢 (v0.35)
`skyalarm.html:1573–1594, 1673, 1130–1144, 1262`
Kein `escapeHtml`-Helper vorhanden; Feed-Callsigns (OGN-Gerätenamen sind frei
registrierbar) und DiPUL-Zonennamen gehen roh in `bindPopup`/`bindTooltip`/
`innerHTML`. Der `@@@@@@@@`-Callsign im Nutzer-Screenshot belegt ungefilterte
Nicht-Alphanumerik. **Fix:** zentraler `escapeHtml` auf alle HTML-Sinks +
CSP-Header (defense-in-depth, restriktives `connect-src`/`img-src` gegen
Exfiltration).

### H4 · Kein Fetch-Timeout, überlappende Polls 🟢 (v0.36)
`skyalarm.html:1496–1526`
`setInterval` startet alle 2 s einen neuen Poll ohne In-Flight-Guard oder
`AbortController`. Auf schwachem Mobilfunk akkumulieren hängende Requests;
verspätete (out-of-order) Antworten überschreiben neuere Daten. **Fix:**
In-Flight-Guard + `AbortController` mit Timeout. Gemeinsam mit H2 gelöst.

---

## Mittel / Niedrig

| ID | Datei | Befund | Status |
|----|-------|--------|--------|
| M1 | `skyalarm.html:1496` | Kein Netz-Backoff — 2-s-Poll hämmert im Funkloch weiter | 🔴 offen |
| M2 | `skyalarm.html:1534` | Marker-/Trail-Vollrebuild alle 2 s → GC-Churn bei ~50 Zielen | 🔴 offen |
| M3 | `ogn.js` | Offener CORS-Proxy ohne Rate-Limit/Origin-Check (km auf 1–100 geclamped, keine SSRF) | 🔴 offen |
| N1 | `skyalarm.html:1197` | Einzelner BrightSky-Fehler leert Wetter-Overlay für bis zu 10 min | 🟢 (v0.37) |
| N2 | `ogn.js:86` | Pseudo-Hex-Kollision `'ogn-'` bei fehlender ICAO+ognId | 🔴 offen |
| N3 | `skyalarm.html:1637` | Alarm-Banner zeigt `near[0]` statt nächstgelegenes Target | 🟢 (v0.37) |
| N4 | `skyalarm.html:1303` | Vereisungs-Kritikband endet bei −10 °C (luftfahrtüblich bis ~−20 °C) | 🔴 offen |

---

## Ausdrücklich als korrekt verifiziert

Alle Einheiten-Konvertierungen (Kelvin→°C mit `units=si`, `gs × 0.5144` → m/s,
`alt × 0.3048` → m, OGN `speedKmh/1.852`, `altM × 3.28084`), Haversine,
Magnus-Tetens (Alduchov-Eskridge-Konstanten), Lapse-Raten, Reaktionszeit-Formel,
WMS-1.3.0-Achsenreihenfolge (EPSG:4326 lat/lon), DiPUL-Recovery (v0.30),
Popup-Persistenz-Fix (v0.27, `_cleaningUp`-Flag), Trail-Speicherverwaltung
(kein Leak), DE/EN-I18N-Tabelle (57/57 Keys symmetrisch). Service Worker ist
network-first mit `skipWaiting`/`clients.claim` → Stale-SW-Fallstrick online
entschärft (Restrisiko: 5xx-Fehlerseite würde bedingungslos gecacht).
