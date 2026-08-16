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

**SkyAlarm** ist eine eigenständige Single-File-Webanwendung für Echtzeit-Tiefflieger-Alarme im Drohnenflug. Sie wurde aus der Alarm-View des Schwesterprojekts **SkyCheck** (https://skycheck-de.netlify.app/) abgespalten und konzentriert sich auf:

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

**Datei:** `skyalarm.html` (Single-File HTML/JS/CSS, ~1800 Zeilen) plus Netlify-Function `netlify/functions/ogn.js` (OGN-Proxy, ~170 Zeilen)
**Live:** https://skyalarm.netlify.app/
**Repo:** https://github.com/mradeck/skyalarm (Default-Branch: `main`)
**Aktuell:** v0.40 — Hellmodus und OSM sowie Dunkelmodus und CARTO Dark bilden gekoppelte Tages-/Nachtprofile. Der Kompaktstatus zeigt unter der Geländehöhe die standortbezogene Maximalhöhe: 120 m AGL außerhalb der CTR-D-Zonen, innerhalb der Zonen 1–4 die punktgenaue CTR-Höhenlogik beziehungsweise den Freigabehinweis.

---

## Architektur

### Datenquellen

| Quelle | Endpoint | CORS | Zweck |
|---|---|---|---|
| **airplanes.live** | `https://api.airplanes.live/v2/point/{lat}/{lon}/10` | ja | Live-ADS-B-Feed (10 NM Radius, JSON) |
| **OGN-Proxy** | `/.netlify/functions/ogn?lat={lat}&lon={lon}&km={km}` | n/a (gleiche Origin) | Open-Glider-Network-Daten (FLARM, OGN-Tracker, teilweise ADS-B) — Netlify-Function ruft `live.glidernet.org/lxml.php` und normalisiert auf airplanes.live-Schema |
| **DiPUL WMS** | `https://uas-betrieb.de/geoservices/dipul/wms` | ja (für GetFeatureInfo & Tiles) | Luftraumzonen Deutschland |
| **BrightSky** | `https://api.brightsky.dev/weather` | ja | DWD-Wetter (Wind, Böen, Temperatur, Taupunkt, Niederschlag, Sicht) |
| **CARTO Basemaps** | `basemaps.cartocdn.com` | – | Dark/Hell-Tile-Layer |
| **OpenStreetMap** | `tile.openstreetmap.org` | – | OSM-Tile-Layer |
| **ESRI World Imagery** | `server.arcgisonline.com` | – | Satellit-Tile-Layer |

Alle ADS-B-, Wetter- und DiPUL-Endpoints sind direkt vom Browser erreichbar. Für OGN ist seit v0.25 eine schlanke Netlify-Function (`netlify/functions/ogn.js`) zwischengeschaltet, weil `live.glidernet.org/lxml.php` keine CORS-Header setzt und ein XML-Format liefert, das serverseitig auf das airplanes.live-JSON-Schema normalisiert wird.

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
| `[J-ICON]` | `_kindFromCat` (Mapping ADS-B-Kategorie → Symbol-Klasse) und `_acSvg` — sieben SVG-Varianten (Flächenflugzeug, Helikopter, Segelflieger, Luftschiff, Fallschirm, Gleitschirm/Drachen, Drohne) |
| `[J-DIST]` | Haversine-Distanz |
| `[J-MAP-INIT]` | `avInitMap` — Karte, Tile-Layer, Kreise, Marker |
| `[J-START]` | `requestGps`, `startApp`, Splash-Screen-Flow; Auto-Start (`setAutoStart`, `applyAutoStartUi`, `maybeAutoStart` mit Permission-Gate) |
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
| `openPopupHex` | string\|null | Hex-Code des Fluggeräts mit aktuell geöffnetem Popup (für Persistenz über Poll-Zyklen) |
| `autoStart` | bool | Auto-Start aktiv: Splash beim App-Start überspringen und direkt GPS verwenden (persistiert in localStorage `skyalarm-autostart`) |

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
| v0.40 | **Theme/Kartenprofil und Standort-Maximalhöhe.** Der Hellmodus schaltet die Basiskarte automatisch auf OSM, der Dunkelmodus auf CARTO Dark; der separate Kartenstil-Schalter bleibt danach manuell nutzbar. Im Kompaktstatus steht direkt unter der Geländehöhe die maximale Flughöhe am Standort: außerhalb einer CTR-D 120 m AGL, in Zonen 2–4 der konservativ berechnete Wert und in Zone 1 der Hinweis auf die individuelle FVK-Freigabe. Generische oder nicht berechenbare CTR-Treffer werden ausdrücklich nicht als 120 m dargestellt. |
| v0.39 | **CTR-D-Höhenlogik aus SkyCheck übernommen.** Separate 5-m-GetFeatureInfo-Abfrage ersetzt breite CTR-Treffer an Zonengrenzen; `type_code_detail=U_CONTROL_ZONE_1…4` wird differenziert. Zonen 2–4 berechnen die konservativ abgerundete Maximalhöhe aus DiPUL-MSL-Grenze und Open-Meteo-Gelände, Zone 1 bleibt individuelle FVK-Freigabe. 25 Geländestützpunkte im 100-m-Kreis liefern geringste/größte Maximalflughöhe und Geländespanne. Das Status-Overlay zeigt CTR-Zone/Maximalhöhe, Gelände-MSL und einen positionsgenauen DiPUL-Link. |
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
| v0.22 | Aircraft-Tooltip (Klassen `av-tt-low` und `av-tt-norm`) typografisch differenziert, damit Zahlenwerte klarer hervortreten: (a) Tooltip-Inhalt von reinem Text auf HTML mit Hilfsspans `span.av-cs` (Kennung) und `span.av-u` (Einheiten „m" und „m/s") umgestellt. (b) Trennzeichen-Punkt „·" nach der Kennung ergänzt — Format ändert sich von `DLH123 850m · 230.5 m/s` auf `DLH123 · 850m · 230.5 m/s`, die drei Felder Kennung / Höhe / Speed sind nun symmetrisch durch Mittenpunkte separiert. (c) CSS-Regeln dimmen `.av-cs` und `.av-u` auf 55 % Deckkraft (`rgba(0,0,0,0.55)` auf gelbem Tiefflieger-Tooltip; `rgba(230,247,255,0.55)` auf dunklem Standard-Tooltip; Light-Mode-Variante `rgba(3,51,51,0.55)`), Schriftgewicht der Einheiten leicht reduziert |
| v0.23 | Fluggerät-Symbolik nach ADS-B-Emitter-Kategorie (DO-260B 2.2.3.2.5.2) ausdifferenziert: Neue Mapping-Funktion `_kindFromCat(cat)` ordnet die im ADS-B-Feld `category` gelieferten Codes auf sieben Symbolklassen ab — A7 → Helikopter, B1 → Segelflieger, B2 → Luftschiff (Zeppelin), B3 → Fallschirm, B4 → Gleitschirm/Drachen, B6 → Drohne, sonst → Flächenflugzeug. `_acSvg(hdg, col, kind, sz)` rendert für jede Klasse ein eigenes SVG (24 × 24 viewBox); Fallschirm wird ohne Track-Rotation dargestellt, da das Heading-Feld dort keine Aussagekraft hat. Tooltip und Popup ergänzen den Typ als Klartext (DE/EN-Lokalisierung über neue I18N-Keys `ac_helo`, `ac_glider`, `ac_airship`, `ac_parachute`, `ac_paraglider`, `ac_drone`); Popup-Klasse `.ac-kind` setzt das Typenlabel kursiv und mit reduzierter Deckkraft. Hintergrund: Auswertungsgrundlage ist ausschließlich der vom airplanes.live-Feed gelieferte ADS-B-Datensatz; nicht-ADS-B-Verkehr (FLARM, OGN, ADS-L, FANET) bleibt unsichtbar — siehe Recherche-Notiz zu SafeSky |
| v0.24 | Popup-Persistenz: Bisher wurde das durch Marker-Klick geöffnete Info-Popup beim nächsten ADS-B-Poll (alle 2 s) automatisch geschlossen, weil `AV.acLayer.clearLayers()` alle Marker zerstört und neu aufbaut. Lösung: neuer State-Eintrag `AV.openPopupHex` merkt den Hex-Code des aktuell offenen Fluggeräts; auf jedem neu erzeugten Marker werden `popupopen` und `popupclose` per Leaflet-Event-Handler gebunden, und falls der Hex bei Marker-Erstellung dem gespeicherten entspricht, wird `openPopup()` direkt aufgerufen. Damit bleibt das Popup geöffnet, bis der Nutzer es bewusst schließt (Klick außerhalb oder auf einen anderen Marker), das Tracking des Fluggeräts während offener Anzeige bleibt unverändert |
| v0.25 | OGN-Anbindung (Open Glider Network) als zweite Verkehrsquelle: (a) Neue Netlify-Function `netlify/functions/ogn.js` ruft Bbox-gefilterte Live-Daten von `live.glidernet.org/lxml.php` ab, parst das XML-Marker-Format (14 Felder: Lat, Lon, csShort, csFull, altM, ts, sec, track, speedKmh, vSpeed, ognType, receiver, icaoHex, ognId), bildet OGN-Typ-Codes 0–14 auf ADS-B-Emitter-Kategorien ab (`B1` Segelflieger, `A7` Helikopter, `B3` Fallschirm, `B4` Drachen/Gleitschirm, `B2` Ballon/Luftschiff, `B6` Drohne, `A1`/`A2` motorisiert) und liefert das Ergebnis als JSON im airplanes.live-Schema mit `source:'ogn'`. Function-Timeout 7 s, CORS-Header gesetzt, CDN-Cache 4 s. (b) `netlify.toml` ergänzt um `functions = "netlify/functions"` und `[functions] node_bundler = "esbuild"`. (c) `avPoll()` ruft ADS-B und OGN per `Promise.all` parallel ab, mergt über ICAO-Hex (ADS-B-Datensatz hat Vorrang, OGN-Hex ohne ICAO erhält Pseudo-Präfix `ogn-…`); reine OGN-Targets erhalten den Tag „OGN", duale Targets „ADS-B+OGN". (d) Neue CSS-Klasse `.ac-src` rendert den Quellen-Tag als kleines, abgesetztes Pill-Label im Popup. Hintergrund: ADS-B (1090 MHz) erfasst Segelflieger, Paragleiter, Drachenflieger, Drohnen mit FLARM/OGN-tracker und Heißluftballons systematisch nicht — siehe SafeSky-Recherche zu v0.23 |
| v0.26 | OGN-Klassifizierung verfeinert und visuelle Quellen-Differenzierung: (a) `OGN_TO_CAT[0]` (Typ „unknown") aus dem Mapping entfernt, stattdessen Speed-basierte Heuristik `classifyUnknownByGs(speedKt)` — Schwellen orientiert an typischen Flugbereichen: < 50 kt (≈ 92 km/h) → B4 Gleitschirm/Drachen, 50–86 kt (≈ 92–160 km/h) → B1 Segelflieger, darüber → A1 motorisiert. Hintergrund: nicht klassifizierte FLARM-Geräte sind ohne Speed-Kontext nicht eindeutig zuordenbar; die Default-Anzeige als Flächenflugzeug wirkte irreführend, eine pauschale B4-Zuordnung produziert dagegen Falschanzeigen bei motorisiertem Verkehr (Smoke-Test im Alpenraum: 128-kt-Target wurde fälschlich als Gleitschirm dargestellt). (b) `OGN_STATIC = {13, 14}` filtert Bodenstationen vor der Rückgabe. (c) Client-seitig in `avUpdateMarkers` neue Verzweigung `isOgn = a.source === 'ogn'`: nicht-Alarm-OGN-Marker erhalten den gedeckten Cyan-Ton `#0891b2` (Tailwind cyan-700), Alarm-Rot `#ff3838` bleibt quellunabhängig identisch — ein OGN-Tiefflieger im 2-km-Radius muss visuell genauso warnen wie ein ADS-B-Tiefflieger |
| v0.27 | Bugfix Popup-Persistenz (Folgefix zu v0.24): die in v0.24 angelegte Logik wurde durch ihren eigenen Cleanup-Pfad unterlaufen. `AV.acLayer.clearLayers()` triggert synchron `popupclose` auf dem zerstörten Marker; der Handler setzte daraufhin `AV.openPopupHex = null`, sodass der neu erzeugte Marker an seinem if-Check keinen gespeicherten Hex mehr fand. Lösung: neuer Cleanup-Flag `AV._cleaningUp` wird vor `clearLayers()` gesetzt und unmittelbar danach zurückgenommen; der `popupclose`-Handler verwirft währenddessen sein Reset. Nutzergetriebene Schließungen (Klick auf X, Klick außerhalb des Popups) bleiben davon unberührt, weil sie außerhalb des Cleanup-Fensters auftreten |
| v0.28 | Attribution-Vervollständigung: Quellen-Listen auf Splash-Screen (`#splash .splash-srcs`) und im Info-Modal (`.modal-srcs`) um drei seit längerem genutzte, aber nicht ausgewiesene Datenquellen erweitert — OGN (https://www.glidernet.org/, seit v0.25 Pflichtangabe gemäß OGN-Datennutzungsregeln), BrightSky/DWD (https://brightsky.dev/, seit v0.12 für Wetter, DWD-Datenkontext attribuierungspflichtig) und Esri (https://www.esri.com/, World-Imagery-Tile seit Beginn). Reihenfolge nun fachlich-thematisch: Verkehrsdaten (airplanes.live, OGN), Geodaten (DiPUL), Wetter (BrightSky), Karten-Engine und Tiles (Leaflet, OSM, CARTO, Esri), persönliche Links zuletzt. README.md (Datenquellen-Sektion) ist bereits in v0.27 mit denselben Einträgen synchronisiert worden |
| v0.29 | SkyCheck-Link aktualisiert: bisherige Netlify-Generic-Subdomain `https://enchanting-stardust-f713da.netlify.app/skycheck.html` durch die neue produktive deutsche Domain `https://skycheck-de.netlify.app/` ersetzt. Betroffen: `skyalarm.html` (Splash-Footer `.splash-foot` Zeile 777 und Info-Modal-Footer Zeile 799), `README.md` (Einleitung Zeile 8 und „Verwandte Projekte"-Sektion Zeile 100), `CLAUDE.md` (Projektübersicht Zeile 22). Hintergrund: SkyCheck wurde von der Netlify-Auto-Subdomain auf eine sprechende, lokalisierte Domain migriert (deutschsprachige Variante mit `-de`-Suffix), der Altlink leitete zwar weiter, sollte aber aus dem produktiven Quellbestand verschwinden, um Linkrot vorzubeugen |
| v0.30 | Robuster DiPUL-Layer-Recovery (Portierung des SkyCheck-v0.77-Fixes). Ursache des Totalausfalls: Der GeoServer-Layer `temporaere_betriebseinschraenkungen` ist serverseitig defekt (sein SQL-View referenziert die in `external_reference` umbenannte Spalte `internal_reference`). Da GeoServer eine WMS-Sammelanfrage alles-oder-nichts rendert, ließ dieser eine kaputte Layer sowohl GetFeatureInfo als auch GetMap mit einer ServiceException scheitern — sämtliche Zonen verschwanden. Lösung in `skyalarm.html` ([J-CONFIG]/[J-FETCHZONES]): (a) modulweites, rein in-memory gehaltenes `const dipulBadLayers = new Set()`; `getActiveDipulLayers()` filtert dessen Einträge aus `DIPUL_ALL_LAYERS` heraus. (b) `fetchZones` versucht zunächst die kombinierte Abfrage; erkennt `isServiceException(html)` (HTTP 200, Body enthält „ServiceException") einen Defekt, übernimmt `fetchZonesPerLayer` per `Promise.allSettled` die Einzelabfrage aller Layer, führt die Treffer der intakten Layer zusammen und sperrt NUR bei echter ServiceException (`reason.serviceException`) — nicht bei Netzwerk-/HTTP-Fehler (`reason.transient`) — den betroffenen Layer in `dipulBadLayers`. (c) `refreshDipulOverlay()` stellt nach erkannten Defekten das WMS-Kachel-Overlay per `AV.dipulL.setParams({layers: …})` auf die bereinigte Layerliste um, damit auch die Karten-Kacheln wieder laden. (d) Parser-Logik in `parseZoneHtml(html)` und URL-Bau in `buildGfiUrl(layers, bbox)` extrahiert, damit kombinierte und Einzelabfrage dieselbe Auswertung teilen. Die Blockliste ist bewusst nur sessionweit: ein von DiPUL reparierter Layer erscheint nach Reload automatisch wieder |
| v0.31 | Auto-Start-Funktion: persistente Einstellung, die beim App-Start den Splash-Button „Standort verwenden" überspringt und direkt in die Karte springt — Zweck: schnelleres Auffinden gehörter, aber nicht gesichteter Tiefflieger (z. B. Hubschrauber), ohne den manuellen Klick abzuwarten. Implementierung in `skyalarm.html`: (a) State-Feld `AV.autoStart`, persistiert in localStorage `skyalarm-autostart` ('1'/'0'). (b) Doppelte Bedienung gemäß Nutzervorgabe: Checkbox `#splash-auto` unter dem Standort-Button auf dem Splash (erstmaliges Aktivieren) plus Toggle-Button `#av-autostart` (Symbol ⚡) in der Kartensteuerleiste `av-ctrl` zum jederzeitigen Aus-/Einschalten; beide werden über `applyAutoStartUi()` synchron gespiegelt. (c) `maybeAutoStart()` startet automatisch NUR, wenn `navigator.permissions.query({name:'geolocation'})` den Status `granted` liefert — bei `prompt`/`denied` oder fehlender Permissions-API bleibt der Splash sichtbar, um Sackgassen (insb. iOS/Safari verlangt für `getCurrentPosition` eine User-Geste) zu vermeiden. (d) Neue i18n-Keys `ctrlAutostart` und `splashAuto` (DE/EN), neue CSS-Regel `#splash .splash-auto`. `requestGps` selbst blieb unverändert (chirurgischer Eingriff) |
| v0.32 | Bugfix Wetterdaten-Staleness (bestand latent seit der BrightSky-Anbindung in v0.12): `fetchWeather` baute die BrightSky-URL mit Datum-only-Werten (`dFmt = d => d.toISOString().slice(0,10)`), also `date=YYYY-MM-DD&last_date=YYYY-MM-DD`. Da BrightSky ein Datum ohne Uhrzeit als 00:00 Uhr interpretiert und `last_date` exklusiv wirkt, lieferte die Abfrage bei `date == last_date` genau EINEN Datensatz — die 00:00-UTC-Beobachtung. Das trat immer dann ein, wenn `now+6h` am selben UTC-Kalendertag lag (vor 18:00 UTC, d. h. fast den ganzen Tag); die Closest-to-now-Auswahl hatte dann nur diesen einen Eintrag. Folge: ALLE Wetteranzeigen (Wind, Böen, Vereisungsprognose, Eis- und Nebelalarm) zeigten ganztägig Mitternachtswerte. Entdeckt am 2026-07-16 mittags: Nebelalarm „Sicht 4,5 km" bei blauem Himmel — die Station Weihenstephan hatte um 00:00 UTC tatsächlich Nebel (T 16,1 °C, vis 4500 m, condition `fog`), aktuell waren es 25,3 °C und 33,9 km Sicht. Fix in `[J-FETCHWEATHER]`: volle ISO-8601-Timestamps (per `encodeURIComponent(d.toISOString())`) statt Datum-only, Abfragefenster `now−1h` bis `now+6h`, damit die Beobachtung der laufenden Stunde stets enthalten ist; Auswahl-Logik unverändert. Verifiziert per Live-Gegenprobe gegen api.brightsky.dev |
| v0.33 | Code-Review-Fix K1 — Alarm-Zustellbarkeit im Feldeinsatz. Drei Kanäle abgesichert: (a) **Screen Wake Lock** (`requestWakeLock`, Re-Acquire bei `visibilitychange`) verhindert, dass das OS bei abgedunkeltem Bildschirm die Poll-Timer suspendiert und der Alarm ausbleibt. (b) **Audio-Unlock** (`unlockAudio`, stummer Kick-Oszillator) wird bei der ersten Nutzergeste (pointerdown/touchend/click, einmalig) ausgelöst — ohne diese Geste bleibt der `AudioContext` auf iOS/Safari `suspended` und der Beep stumm (der bisherige Code hatte keinen Unlock-Handler; der CLAUDE.md-Fallstrick beschrieb Nicht-Vorhandenes). (c) **Visueller Alarm-Kanal**: pulsierender roter Vollbild-Rahmen (`#app-view.av-alarming::after`, `@keyframes av-alarm-flash`, `prefers-reduced-motion`-Variante) als Redundanz — besonders für iOS, wo `navigator.vibrate` fehlt |
| v0.34 | Code-Review-Fix K2/H1 — Höhenbezug korrigiert. `alt_baro`/`alt_geom`/OGN-Höhe sind MSL-bezogen, wurden aber gegen den als „300 m AGL" gemeinten Schwellwert (984 ft) ohne Geländeabzug geprüft → in erhöhtem Gelände (Alpenvorland) wurden echte Tiefflieger verfehlt. Neue Helfer `[J-ALT]` (`altMslFt`/`altAglFt`/`altAglM`): AGL = MSL − Geländehöhe; Geländehöhe am Pilotenstandort per Open-Meteo-Elevation-API (`fetchGroundElevation`, `AV.groundElevM`, abgerufen bei Start/GPS-Recenter/Doppelklick). H1 zugleich gelöst: `alt_baro === 'ground'` und fehlende Höhe ergeben `null` → vom Alarm ausgenommen (kein Bodenverkehr-Fehlalarm), `alt_geom` als Fallback. Anzeige in Marker/Tooltip/Liste/Banner auf „m AGL" umgestellt (Popup zusätzlich Roh-Baro „ft MSL"). Näherung dokumentiert: barometrische Druckhöhe vs. QNH; Geländeterm dominiert |
| v0.35 | Code-Review-Fix H3 — Stored-XSS-Vektor geschlossen. Zentraler `escapeHtml`-Helfer auf alle Fremddaten-HTML-Sinks: Callsigns (ADS-B/OGN, frei registrierbare OGN-Gerätenamen) in Marker-Popup/-Tooltip und Tiefflieger-Liste, DiPUL-Zonennamen/-felder in Detailliste und Kompakt-Overlay; Legal-Link zusätzlich `encodeURI` + `rel="noopener"`. Defense-in-Depth: CSP-Header in `netlify.toml` (`for = "/*"`) mit restriktivem `connect-src`/`img-src` (nur bekannte API-/Tile-Hosts → keine Exfiltration), plus `X-Content-Type-Options`/`Referrer-Policy`. `script-src 'unsafe-inline'` bleibt (Single-File-Inline-Script unvermeidbar), Schutzwirkung liegt in der Netzwerk-Beschränkung |
| v0.36 | Code-Review-Fix H2/H4 — Alarm-Robustheit. **Hysterese**: Entwarnung erst nach `ALARM_HOLD = 3` aufeinanderfolgenden leeren Zyklen (`AV.alarmMissCount`), überbrückt Feed-Lücken (airplanes.live-Rate-Limit) und Grenzflattern, die sonst Beep-Ketten im 2-s-Takt erzeugten. **In-Flight-Guard** (`AV._polling`) verhindert überlappende Polls und out-of-order-Überschreibungen; **AbortController** mit 6-s-Timeout bricht hängende Requests ab (schwacher Mobilfunk). Labels-/Radius-Umschaltung re-rendert instant aus `AV.lastPlanes`-Cache statt Re-Fetch (Guard-sicher) |
| v0.37 | Code-Review-Fix N1/N3. **N1**: `updateWeatherOverlay` behält bei fehlgeschlagenem BrightSky-Abruf den letzten guten Datensatz (`if (w) AV.lastWeather = w`), statt das Eis-/Nebel-/Wind-Overlay bis zum nächsten 10-min-Intervall zu leeren. **N3**: Alarm-Banner/Beep wählen das **nächstgelegene** Target statt `near[0]` (Array-Insert-Reihenfolge) |
| v0.38 | Code-Review-Abschluss (verbleibende M/N-Befunde). **M1 Netz-Backoff**: Poll von `setInterval(avPoll, 2000)` auf selbst-planendes `setTimeout` (`avScheduleNextPoll`) umgestellt; bei aufeinanderfolgenden Netzfehlern exponentielles Backoff (`POLL_MS·2^streak`, Deckel 30 s), Erfolgserkennung pro Quelle via `anyOk`-Flag — kein Dauerfeuer mehr im Funkloch. **M2 Trail-Rendering**: je Trail nur noch eine `L.polyline(pts.map(…))` statt einer pro Segment → bis zu ~29× weniger pro Poll erzeugte/verworfene Leaflet-Objekte (GC-Churn auf Mobilgeräten); fester Opazitätswert statt Verlauf. Marker-Divicon-Rebuild bewusst unangetastet (nicht dominant, Popup-Persistenz-Risiko). **M3 OGN-Proxy-Härtung** (`netlify/functions/ogn.js`): Origin/Referer-Prüfung gegen Missbrauch als offener Proxy (erlaubt nur `skyalarm.netlify.app`, `*--skyalarm.netlify.app`, localhost; fehlender Header fail-open), reflektiertes CORS statt `Access-Control-Allow-Origin: *`, roher Upstream-Fehlertext nur noch serverseitig geloggt (kein Info-Leak). Kein echtes Rate-Limiting (bräuchte externen State). **N2**: Pseudo-Hex-Eindeutigkeitskette `ognId || fullId || csShort || lat_lon` — ID-lose OGN-Targets kollabieren nicht mehr auf `'ogn-'`. **N4**: Vereisungs-Kritikband von `t50 ∈ [−10, 0]` auf `[−20, 0] °C` erweitert (unterkühlte Tröpfchen bis ~−20 °C vereisungsrelevant) |

---

## Verwandte Projekte

| Projekt | Pfad | Zweck |
|---|---|---|
| **SkyCheck** | `~/Downloads/code/cowork/skycheck_project` | Vollständige Drohnen-Flugplanung mit Wetter, METAR, Vorhersagen |
