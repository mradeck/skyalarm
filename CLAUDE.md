# SkyAlarm — Projekt-Kontextdatei für Claude-Sessions

---

## ⚠️ SESSION-START-PROTOKOLL — vor dem ersten Werkzeugaufruf bestätigen

1. **Umgebung erkennen:**
   - **Claude Code** (Terminal): Direkter Dateizugriff — sofort arbeitsfähig.
   - **Cowork** (Desktop-App): Folder-Mount sicherstellen, Overlay-Einschränkungen beachten.
2. **Projektpfad auf dem Mac:** `/Users/michaelradeck/Downloads/code/cowork/skyalarm_project` — kein anderer Pfad ist korrekt.
3. **Version prüfen:** `grep APP_VER skyalarm.html` — bei Abweichung zur erwarteten Version:
   ```bash
   git fetch origin && git reset --hard origin/master
   ```
4. **Antwort-Titel:** Jede Antwort beginnt mit Datum, Uhrzeit und aktueller Versionsnummer (z. B. `## 2026-04-30 21:00 — SkyAlarm v0.10`).

---

## Projektübersicht

**SkyAlarm** ist eine eigenständige Single-File-Webanwendung für Echtzeit-Tiefflieger-Alarme im Drohnenflug. Sie wurde aus der Alarm-View des Schwesterprojekts **SkyCheck** (https://enchanting-stardust-f713da.netlify.app/skycheck.html) abgespalten und konzentriert sich ausschließlich auf:

- **Tiefflieger-Erkennung** via ADS-B (airplanes.live), Schwellwert 300 m AGL, 2 km Radius
- **Akustischer und vibrierender Alarm** bei Annäherung
- **Geozonen-Visualisierung** über DiPUL WMS (alle Layer)
- **Karten-Stilwechsel** (Dark/OSM/Satellit/Hell), Hell-/Dunkel-Modus
- **GPS-gestützte Positionsbestimmung** mit Doppelklick-Korrektur
- **PWA-Funktionalität** (Installierbar, Service Worker, Offline-Shell)

Bewusst **nicht enthalten** (im Gegensatz zu SkyCheck):
- Wettersektion (Wind, Niederschlag, Temperatur, Wolkenbasis)
- KP-Index, Geomagnetische Aktivität
- METAR/TAF-Daten (NOAA AWC)
- Adress-/Ortssuche (Photon)
- 48-Stunden-/5-Tage-Vorhersage
- Geozonen-Liste mit ausführlichen Detailinfos

**Datei:** `skyalarm.html` (Single-File HTML/JS/CSS, ca. 860 Zeilen)
**Live:** _Netlify-Deployment durch Nutzer einzurichten_
**Repo:** _GitHub-Repo durch Nutzer anzulegen (vorgeschlagen: `mradeck/skyalarm-project`)_
**Aktuell:** v0.10 — Initial-Release, extrahiert aus SkyCheck v0.67

---

## Architektur

### Datenquellen

| Quelle | Endpoint | CORS | Zweck |
|---|---|---|---|
| **airplanes.live** | `https://api.airplanes.live/v2/point/{lat}/{lon}/10` | ja | Live-ADS-B-Feed (10 NM Radius, JSON) |
| **DiPUL WMS** | `https://uas-betrieb.de/geoservices/dipul/wms` | ja (für GetFeatureInfo & Tiles) | Luftraumzonen Deutschland |
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

---

## Arbeitsregeln

1. **Versionsnummer:** Jede Änderung an `skyalarm.html` erhöht `const APP_VER` (Zeile ~415) um 0.01. Keine Ausnahme.
2. **Patches:** Read/Edit-Tools direkt auf `skyalarm.html` anwenden; Anker-Eindeutigkeit vorab per `grep` verifizieren.
3. **JS-Syntaxcheck:** vor jedem Commit
   ```bash
   sed -n '/<script>$/,/<\/script>/p' skyalarm.html | head -n -1 | tail -n +2 > /tmp/check.js && node --check /tmp/check.js
   ```
4. **Commit-Format:** `SkyAlarm vX.XX — Kurzbeschreibung`.
5. **Push und Verifikation:** wie SkyCheck (`git add … && git commit … && git push`); Netlify-URL nach Setup ergänzen.
6. **Antworten:** Deutsch, wissenschaftlicher Stil, dritte Person.

---

## Hybrid-Workflow

### Primär: Claude Code (CLI)

```bash
cd ~/Downloads/code/cowork/skyalarm_project && claude
```

### Sekundär: Cowork (Desktop)

Für Recherche, Visualisierung, Computer-Use; Code-Änderungen vorzugsweise via Claude Code, da Cowork-Overlay bei externen Code-Änderungen veraltet.

---

## Bekannte Fallstricke

| Problem | Ursache | Fix |
|---|---|---|
| ADS-B-Feed antwortet leer | Rate-Limit von airplanes.live | Poll-Intervall ggf. auf 3000 ms erhöhen |
| Geozonen-Layer schwarz | DiPUL WMS-Server kurzzeitig down | Service-Status prüfen; Retry abwarten |
| Beep-Funktion stumm | iOS/Safari-AudioContext erst nach User-Geste aktiv | Beim ersten Tap aktiviert sich `_avCtx` automatisch |
| GPS-Genauigkeit gering | iOS-Browser-Standortabfrage blockiert | `enableHighAccuracy: true` ist gesetzt; Standort manuell per Doppelklick korrigieren |
| Stale-Service-Worker | SW cached alte HTML | Hard-Reload (Cmd+Shift+R) oder DevTools → Application → Unregister |

---

## Versions-Historie

| Version | Änderungen |
|---|---|
| v0.10 | Initial-Release: Extraktion aus SkyCheck v0.67 (Alarm-View 1:1), DE/EN-I18N, GPS-Splash, PWA-Hooks, Info-Modal |

---

## Verwandte Projekte

| Projekt | Pfad | Zweck |
|---|---|---|
| **SkyCheck** | `~/Downloads/code/cowork/skycheck_project` | Vollständige Drohnen-Flugplanung mit Wetter, METAR, Vorhersagen |
