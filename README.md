# SkyAlarm

Echtzeit-Tiefflieger-Alarm und Geozonen-Karte für Drohnenpiloten — Single-File-PWA, ohne Build-Schritt.

**Live:** https://skyalarm.netlify.app/
**Repo:** https://github.com/mradeck/skyalarm

Abgespalten aus dem Schwesterprojekt [SkyCheck](https://enchanting-stardust-f713da.netlify.app/skycheck.html). SkyAlarm fokussiert sich ausschließlich auf den Luftraum-Alarm; Wetter, METAR, KP-Index und Vorhersagen bleiben SkyCheck vorbehalten.

## Funktionen

- **Tiefflieger-Erkennung** in Echtzeit (ADS-B via [airplanes.live](https://airplanes.live/), Schwelle 300 m AGL, 2 km Radius)
- **Akustischer und vibrierender Alarm** bei Annäherung
- **Geozonen-Karte** mit allen DiPUL-Ebenen (Kontrollzonen, Naturschutz, Industrie, Militär u. a.)
- **Karten-Stile**: Dark / OSM / Satellit / Hell
- **Hell-/Dunkel-Modus** für Tag- und Nachteinsatz
- **Doppelklick-Korrektur** des Alarmzentrums
- **Trail-Visualisierung** der letzten 60 Sekunden je Flugzeug
- **DE/EN-I18N**, persistiert in `localStorage`
- **PWA-installierbar**, Offline-Shell via Service Worker

## Architektur

Single-File-PWA. Die einzige zu ändernde Datei ist `skyalarm.html`. Alle Stile, Skripte und I18N-Tabellen liegen inline.

| Datei | Zweck |
|---|---|
| `skyalarm.html` | Komplette Anwendung (HTML, CSS, JS, I18N) |
| `manifest.json` | PWA-Manifest |
| `sw.js` | Service Worker (Offline-Shell, Cache-First für Assets) |
| `netlify.toml` | Netlify-Build-Konfiguration und Header-Regeln |
| `icon-192x192.png`, `icon-512x512.png`, `skyalarm-icon.svg` | Icons |

## Datenquellen

- [airplanes.live](https://airplanes.live/) — Live-ADS-B-Feed
- [DiPUL WMS](https://www.dipul.de/) — Luftraumzonen Deutschland
- [Leaflet](https://leafletjs.com/) — Karten-Engine
- [CARTO](https://carto.com/) / [OpenStreetMap](https://www.openstreetmap.org/) / [Esri](https://www.esri.com/) — Tile-Server

## Lokale Entwicklung

```bash
# Statischen Server starten (z. B. via Python)
cd skyalarm-project
python3 -m http.server 8000
# Öffnen: http://localhost:8000/skyalarm.html
```

Achtung: Die GPS-API erfordert HTTPS oder `localhost`. Service-Worker-Tests am besten auf einem echten Deployment.

## Deployment

Das Projekt ist auf Netlify unter https://skyalarm.netlify.app/ erreichbar und wird bei jedem Push auf den `main`-Branch von `mradeck/skyalarm` automatisch deployed.

**Verifikation der Live-Version:**

```bash
curl -s "https://skyalarm.netlify.app/skyalarm.html" | grep -o "APP_VER = '0\.[0-9]*'"
```

Erstmaliges Setup (Referenz, falls eine Spiegelinstanz aufgesetzt werden soll):

1. GitHub-Repo anlegen.
2. In Netlify: *Add new site → Import from Git → GitHub → Repository wählen*.
3. Build-Command leer lassen, Publish-Directory: `.` (wird per `netlify.toml` automatisch gesetzt).
4. Deploy abwarten (~ 20 s); Site-URL notieren.

## Versionierung

Die Versionsnummer steht ausschließlich in `const APP_VER` in `skyalarm.html` (Zeile ~415) und wird per DOM-Updater an Header (`<sup class="l-ver">`) und Info-Modal (`<span class="l-ver">`) propagiert.

## Lizenz / Haftung

Hilfswerkzeug ohne Gewähr. Verantwortung für sicheren Drohnenbetrieb verbleibt vollständig beim Piloten. Alle externen Daten (ADS-B, DiPUL, Tile-Server) ohne Garantie auf Verfügbarkeit oder Korrektheit.

## Verwandt

[SkyCheck](https://enchanting-stardust-f713da.netlify.app/skycheck.html) — vollständige Drohnen-Flugplanung mit Wetter, Vorhersagen und METAR/TAF.
