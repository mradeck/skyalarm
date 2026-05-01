# SkyAlarm — Projekt-Kontextdatei für Claude-Sessions

---

## ⚠️ SESSION-START-PROTOKOLL — vor dem ersten Werkzeugaufruf bestätigen

1. **Umgebung erkennen:**
   - **Claude Code** (Terminal): Direkter Dateizugriff — sofort arbeitsfähig.
   - **Cowork** (Desktop-App): Folder-Mount sicherstellen, Overlay-Einschränkungen beachten.
2. **Projektpfad auf dem Mac:** `/Users/michaelradeck/Downloads/code/cowork/skyalarm-project` — kein anderer Pfad ist korrekt.
3. **Version prüfen:** `grep APP_VER skyalarm.html` — bei Abweichung zur erwarteten Version:
   ```bash
   git fetch origin && git reset --hard origin/main
   ```
4. **Antwort-Titel:** Jede Antwort beginnt mit Datum, Uhrzeit und aktueller Versionsnummer (z. B. `## 2026-05-01 00:30 — SkyAlarm v0.16`).
5. **Dokumentationspflicht:** Bei jeder Versionserhöhung sind im selben Schritt die Versions-Historie und ggf. die Architektur-Sektion dieser Datei zu aktualisieren — ohne gesonderte Aufforderung.

---

## Projektübersicht

**SkyAlarm** ist eine eigenständige Single-File-Webanwendung für Echtzeit-Tiefflieger-Alarme im Drohnenflug. Sie wurde aus der Alarm-View des Schwesterprojekts **SkyCheck** (https://enchanting-stardust-f713da.netlify.app/skycheck.html) abgespalten und konzentriert sich auf:

- **Tiefflieger-Erkennung** via ADS-B (airplanes.live), Schwellwert 300 m AGL, 2 km Radius
- **Akustischer und vibrierender Alarm** bei Annäherung
- **Geozonen-Visualisierung** über DiPUL WMS (alle Layer), inkl. ausklappbarer Detailliste
- **Kompakt-Status-Overlay** (oben rechts): Zonen-Kurzlabels, Wind/Böen, Vereisungs- und Nebelprognose 50 m AGL
- **Eisalarm** (Niederschlag bei T ≤ 0 °C) und **Nebelalarm** (Sicht < 1 km bzw. Spread-basiert)
- **Wetterdaten** über BrightSky (Wind, Böen, Temperatur, Taupunkt, Niederschlag, Sicht)
- **Karten-Stilwechsel** (Dark/OSM/Satellit/Hell), Hell-/Dunkel-Modus
- **GPS-gestützte Positionsbestimmung** mit Doppelklick-Korrektur
- **PWA-Funktionalität** (Installierbar, Service Worker, Offline-Shell)

Bewusst **nicht enthalten** (im Gegensatz zu SkyCheck):
- KP-Index, Geomagnetische Aktivität
- METAR/TAF-Daten (NOAA AWC)
- Adress-/Ortssuche (Photon)
- 48-Stunden-/5-Tage-Vorhersage
- Volle Wolkenbasis-Berechnung mit allen METAR-Layern

**Datei:** `skyalarm.html` (Single-File HTML/JS/CSS, ~1170 Zeilen)
**Live:** https://skyalarm.netlify.app/
**Repo:** https://github.com/mradeck/skyalarm (Default-Branch: `main`)
**Aktuell:** v0.21 — Reaktionszeit-Overlay: reine Sekunden-Anzeige, Umbruchschutz, 7 s sichtbar

---

## Architektur

### Datenquellen

| Quelle | Endpoint | CORS | Zweck |
|---|---|---|---|
| **airplanes.live** | `https://api.airplanes.live/v2/point/{lat}/{lon}/10` | ja | Live-ADS-B-Feed (10 NM Radius, JSON) |
| **DiPUL WMS** | `https://uas-betrieb.de/geoservices/dipul/wms` | ja (für GetFeatureInfo & Tiles) | Luftraumzonen Deutschland |
| **BrightSky** | `https://api.brightsky.dev/weather` | ja | DWD-Wetter (Wind, Böen, Temperatur, Taupunkt, Niederschlag, Sicht) |
| **CARTO Basemaps** | `basemaps.cartocdn.com` | – | Dark/Hell-Tile-Layer |
| **OpenStreetMap** | `tile.openstreetmap.org` | – | OSM-Tile-Layer |
| **ESRI World Imagery** | `server.arcgisonline.com` | – | Satellit-Tile-Layer |

Alle Endpoints sind **direkt vom Browser erreichbar**; im Gegensatz zu SkyCheck wird **keine Netlify-Function** als CORS-Proxy benötigt (NOAA AWC fehlt).

### Code-Struktur

| Anker (Kommentar) | Funktion |
|---|---|
| `[J-VER]` | Versionsvariable und DOM-Updater (`.l-ver`) |
| `[J-I18N]` | I18N-Tabelle DE/EN, `applyLang`, `_t` |
| `[J-CONFIG]` | DiPUL/ADSB-URLs, Layer-Listen |
| `[J-STATE]` | `AV`-Objekt mit gesamtem Anwendungszustand |
| `[J-FETCHZONES]` | DiPUL WMS GetFeatureInfo (δ-Formel `radiusM × 101 / (4 × 111320)`) |
| `[J-DEWPOINT]` | `calcDewPoint` — Magnus-Tetens-Formel (Taupunkt aus T und RH) |
| `[J-FETCHWEATHER]` | BrightSky-Abfrage; Temperatur/Taupunkt-Konvertierung Kelvin → °C |
| `[J-RENDER-STATUS]` | `renderStatusOverlay` — Zonen-Kurzlabels, Wind/Böen, Vereisungsprognose 50 m, Eisalarm, Nebelalarm |
| `[J-ICON]` | `_acSvg` — Aircraft-/Helikopter-SVG-Icon |
| `[J-DIST]` | Haversine-Distanz |
| `[J-MAP-INIT]` | `avInitMap` — Karte, Tile-Layer, Kreise, Marker |
| `[J-START]` | `requestGps`, `startApp`, Splash-Screen-Flow |
| `[J-EVENTS]` | Event-Listener für alle UI-Buttons |
| `[J-AUDIO]` | Web-Audio-API-Beep |
| `[J-PWA]` | Install-Banner und Service-Worker-Registrierung |

### State-Objekt `AV` — Schlüsselfelder

| Feld | Typ | Bedeutung |
|---|---|---|
| `lat`, `lon` | number | Aktuelles Alarm-Zentrum |
| `RADIUS_KM` | 2 | Roter Alarm-Kreis (Tiefflieger-Schwellwert) |
| `SCAN_KM` | 18.52 | Gelber Scan-Kreis (ADSB-Radius, 10 NM) |
| `ALT_LIMIT_FT` | 984 | Tiefflieger-Schwelle (≈ 300 m) |
| `POLL_MS` | 2000 | Poll-Intervall in ms |
| `TRAIL_SEC` | 60 | Trail-Lebensdauer in Sekunden |
| `STYLES` | Array | Tile-Layer-Definitionen |
| `styleIdx` | number | Aktiver Tile-Stil-Index |
| `zonesOn` | bool | DiPUL-Layer sichtbar |
| `lightMode` | bool | Hell-Modus aktiv |
| `alarmOn` | bool | Akut-Alarm aktiv (Beep läuft) |
| `trails` | Object | Per-Hex Trail-Punktarrays |
| `lastWeather` | Object | Letzter BrightSky-Datensatz (Wind, T, Td, Niederschlag, Sicht, Condition) |
| `lastZones` | Array | Letzte DiPUL-Zonenliste (Cache für Sprachwechsel-Re-Render) |

---

## Arbeitsregeln

1. **Versionsnummer:** Jede Änderung an `skyalarm.html` erhöht `const APP_VER` (Zeile ~677, Anker `[J-VER]`) um 0.01. Keine Ausnahme.
2. **Patches:** Read/Edit-Tools direkt auf `skyalarm.html` anwenden; Anker-Eindeutigkeit vorab per `grep` verifizieren.
3. **JS-Syntaxcheck:** vor jedem Commit
   ```bash
   sed -n '/<script>$/,/<\/script>/p' skyalarm.html | head -n -1 | tail -n +2 > /tmp/check.js && node --check /tmp/check.js
   ```
4. **Commit-Format:** `SkyAlarm vX.XX — Kurzbeschreibung`.
5. **Push und Verifikation:** `git add skyalarm.html && git commit -m 'SkyAlarm vX.XX' && git push`; anschließend Netlify-Deployment per
   ```bash
   curl -s "https://skyalarm.netlify.app/skyalarm.html" | grep -o "APP_VER = '0\.[0-9]*'"
   ```
   verifizieren (Build-Zeit ca. 20 s).
6. **Antworten:** Deutsch, wissenschaftlicher Stil, dritte Person.

---

## Hybrid-Workflow

### Primär: Claude Code (CLI)

```bash
cd ~/Downloads/code/cowork/skyalarm-project && claude
```

### Sekundär: Cowork (Desktop)

Für Recherche, Visualisierung, Computer-Use; Code-Änderungen vorzugsweise via Claude Code, da Cowork-Overlay bei externen Code-Änderungen veraltet.

---

## Bekannte Fallstricke

| Problem | Ursache | Fix |
|---|---|---|
| ADS-B-Feed antwortet leer | Rate-Limit von airplanes.live | Poll-Intervall ggf. auf 3000 ms erhöhen |
| Geozonen-Layer schwarz | DiPUL WMS-Server kurzzeitig down | Service-Status prüfen; Retry abwarten |
| BrightSky liefert Kelvin | API-Default für `units` ist Kelvin | In `fetchWeather` werden `temperature` und `dew_point` per `- 273.15` nach °C konvertiert |
| Beep-Funktion stumm | iOS/Safari-AudioContext erst nach User-Geste aktiv | Beim ersten Tap aktiviert sich `_avCtx` automatisch |
| GPS-Genauigkeit gering | iOS-Browser-Standortabfrage blockiert | `enableHighAccuracy: true` ist gesetzt; Standort manuell per Doppelklick korrigieren |
| Stale-Service-Worker | SW cached alte HTML | Hard-Reload (Cmd+Shift+R) oder DevTools → Application → Unregister |
| Cowork-Sandbox kann nicht committen | `virtiofs` blockiert das Löschen von `.git/index.lock` | Commit/Push aus dem Mac-Terminal oder via Claude Code CLI ausführen |

---

## Versions-Historie

| Version | Änderungen |
|---|---|
| v0.10 | Initial-Release: Extraktion aus SkyCheck v0.67 (Alarm-View 1:1), DE/EN-I18N, GPS-Splash, PWA-Hooks, Info-Modal |
| v0.11 | Geozonen-Liste als ausklappbares Overlay oben links (kollabierbar) |
| v0.12 | Kompakt-Overlay (Zonen-Kurzlabels, Wind/Böen, Eisalarm) oberhalb der Detailliste; Wetter-Anbindung an BrightSky |
| v0.13 | Overlay-Stapel von oben links auf oben rechts verlegt; Höhe hält die `av-ctrl`-Leiste frei |
| v0.14 | Vereisungs- und Nebelgefahr für 50 m AGL im Kompakt-Overlay (Magnus-Tetens-Taupunkt + Standard-Lapse-Rate für T/Td) |
| v0.15 | Fix: `dew_point` in `fetchWeather` von Kelvin auf °C konvertiert (zuvor falsche Magnitudendarstellung) |
| v0.16 | Eigenständiger Nebelalarm (`#ms-fog`): Trigger bei Sicht < 1 km, dichtem Dunst < 4 km mit Spread < 1 °C oder klassischen Nebelbildungs-Bedingungen (Spread < 0,5 °C, Wind < 2 m/s) |
| v0.17 | App-Icon-Anpassung: `<linearGradient id="check">` in `skyalarm-icon.svg` von Grün (`#4ade80` → `#22c55e`) auf Rot (`#f87171` → `#ef4444`) umgestellt; PNG-Assets `icon-192x192.png` und `icon-512x512.png` neu gerendert. Zweck: visuelle Abgrenzung des Home-Screen-Icons gegenüber SkyCheck |
| v0.18 | Splash-Titel: Wortteil „Alarm" in `<h1>` per `<span class="alarm-red">` rot (`#ef4444`) gegen den Default-Akzentton abgesetzt; CSS-Regel `#splash h1 .alarm-red` ergänzt. Zweck: visuelle Konsistenz zwischen App-Icon und Titelschriftzug |
| v0.19 | (a) Toggle-Button `#av-labels` (Symbol „✈") in der Steuerleiste ergänzt; aktivierter Zustand setzt `AV.allLabels = true` und blendet permanente Tooltips (Callsign, Höhe, Geschwindigkeit) für **alle** Marker ein, neue CSS-Klasse `.av-tt-norm` mit Light/Dark-Adaption. (b) Geschwindigkeitsangabe in Popup und Tiefflieger-Detailliste von `kts` bzw. `km/h` auf `m/s` umgestellt (`a.gs × 0.5144`, eine Nachkommastelle). (c) Marker- und Trail-Farbpalette aufgehellt: Alarm `#ff3838`, Tiefflieger weit `#ffb300`, Reisehöhe nah `#22d3ee` (Cyan), Reisehöhe fern `#a78bfa` (Lavendel); Trail-Mindestopazität 0.10 → 0.30, Linienstärke 1.5/2.5 → 2.2/3.0. Stale-Trails ehemaliger Marker nun ebenfalls in Lavendel statt Olivgrün |
| v0.20 | (a) Splash-Seite um Source-Link-Leiste (`.modal-srcs.splash-srcs`) und kompakten Footer mit Versionsstring + SkyCheck-Link erweitert; CSS-Hooks `#splash .splash-srcs` und `#splash .splash-foot` ergänzt. (b) Neuer Toggle-Button `#av-radius` (Symbol „◎") cycled durch `RADIUS_OPTS = [2, 4, 6]` km; aktive Stufen ≠ Default markieren den Button per `.on`. Funktion `setDetectionRadius(idx)` aktualisiert `AV.RADIUS_KM`, ruft `radiusCirc.setRadius()` auf und triggert sofort `avPoll()`, damit `avCheckProx` den neuen Radius sofort wirksam macht. (c) Reaktionszeit-Overlay `#av-radius-info`: zentral platziert, blendet beim Toggle für 5 s ein und zeigt aktuellen Radius zusammen mit Reaktionszeiten bei 30 m/s (≈108 km/h) und 60 m/s (≈216 km/h); Light-Mode-Variante via `#app-view.av-light .av-radius-info`. Neue i18n-Keys `ctrlRadius`, `riHdr`, `riReact`, `riAt` |
| v0.21 | Reaktionszeit-Overlay (`#av-radius-info`) lesbarer und umbruchsicher: (a) Zeitformat von gemischtem „X min YY s" auf reine Sekunden umgestellt, da das Mischformat auf schmalen Layouts in zwei Zeilen brach. (b) Zahl-Einheit-Paare („X km", „30 m/s", „108 km/h" usw.) mit Non-breaking Space (U+00A0) gebunden; zusätzlich CSS-Schutz: `white-space: nowrap` auf `.ri-hdr` und `.ri-row span:last-child`, erste Zeilen-Span erhält `flex:1 1 auto; min-width:0`. (c) Container nutzt nun `width: max-content; max-width: min(92vw, 24rem)` statt fester 18 rem — passt sich Inhalt und Viewport adaptiv an. (d) Anzeigedauer 5 s → 7 s |

---

## Verwandte Projekte

| Projekt | Pfad | Zweck |
|---|---|---|
| **SkyCheck** | `~/Downloads/code/cowork/skycheck_project` | Vollständige Drohnen-Flugplanung mit Wetter, METAR, Vorhersagen |
