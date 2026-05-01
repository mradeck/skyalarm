# SkyAlarm

Echtzeit-Tiefflieger-Alarm und Geozonen-Karte für Drohnenpiloten — Single-File-PWA mit schlanker Netlify-Function als OGN-Proxy.

**Live:** https://skyalarm.netlify.app/
**Repo:** https://github.com/mradeck/skyalarm

Abgespalten aus dem Schwesterprojekt [SkyCheck](https://enchanting-stardust-f713da.netlify.app/skycheck.html). SkyAlarm fokussiert sich auf operativ entscheidungsrelevante Echtzeit-Alarme im Drohnenflug. METAR/TAF, KP-Index, mehrtägige Vorhersagen und Adress-/Ortssuche bleiben SkyCheck vorbehalten; flugkritische Wetterindikatoren (Wind, Böen, Vereisung, Nebel, Niederschlag) sind hingegen direkt integriert.

## Funktionen

### Luftraum

- **Tiefflieger-Erkennung** in Echtzeit über zwei parallele Verkehrsquellen: [airplanes.live](https://airplanes.live/) für ADS-B (1090 MHz) und [Open Glider Network](https://www.glidernet.org/) für FLARM, OGN-Tracker, FANET — Schwelle 300 m AGL, konfigurierbarer Alarmradius 2 / 4 / 6 km
- **Akustischer und vibrierender Alarm** bei Annäherung
- **Differenzierte Fluggerät-Symbolik** nach ADS-B-Emitter-Kategorie DO-260B 2.2.3.2.5.2: Flächenflugzeug, Helikopter, Segelflieger, Luftschiff/Zeppelin, Fallschirm, Gleitschirm/Drachen, Drohne — visuell unterscheidbare SVG-Icons je Klasse
- **OGN-Targets** sind in einem gedeckten Cyan-Ton dargestellt; im Popup wird die Quelle als „OGN" oder „ADS-B+OGN" markiert
- **Geozonen-Karte** mit allen DiPUL-Ebenen (Kontrollzonen, Naturschutz, Industrie, Militär u. a.)
- **Ausklappbare Zonen-Detailliste** (Typ, untere/obere Grenze, Rechtshinweis) oben rechts

### Kompakt-Status-Overlay (oben rechts)

- **Zonen-Kurzlabels** mit farbiger Klassifizierung (Flughafen, CTR, Naturschutz, Wasserstraße, Autobahn …)
- **Wind- und Böen-Anzeige** mit Richtungspfeil und Schwellwert-Farben (≥ 7 m/s Warnung, ≥ 10 m/s NoGo)
- **Vereisungs- und Nebelprognose 50 m AGL** auf Basis von Magnus-Tetens-Taupunkt und Standard-Lapse-Rate
- **Eisalarm** bei Niederschlag und Temperatur ≤ 0 °C
- **Nebelalarm** bei Sicht < 1 km (WMO/DWD), dichtem Dunst < 4 km mit Spread < 1 °C oder klassischen Strahlungsnebel-Bedingungen (Spread < 0,5 °C, Wind < 2 m/s, T < 15 °C)

### Karte und Bedienung

- **Karten-Stile**: Dark / OSM / Satellit / Hell
- **Hell-/Dunkel-Modus** für Tag- und Nachteinsatz
- **Doppelklick-Korrektur** des Alarmzentrums
- **Trail-Visualisierung** der letzten 60 Sekunden je Flugzeug
- **DE/EN-I18N**, persistiert in `localStorage`
- **PWA-installierbar**, Offline-Shell via Service Worker

## Architektur

Single-File-PWA mit einer einzigen Netlify-Function als CORS-Proxy. Die UI- und Logik-Datei ist `skyalarm.html` (HTML, CSS, JS, I18N inline); die Function `netlify/functions/ogn.js` ruft das undokumentierte XML-Format von `live.glidernet.org/lxml.php` ab und normalisiert es serverseitig auf das airplanes.live-JSON-Schema.

| Datei | Zweck |
|---|---|
| `skyalarm.html` | Komplette Anwendung (HTML, CSS, JS, I18N) |
| `netlify/functions/ogn.js` | OGN-Proxy: Bbox-gefilterte Abfrage von `live.glidernet.org/lxml.php`, XML-Parser, Mapping OGN-Typ → ADS-B-Emitter-Kategorie, Speed-Heuristik für unklassifizierte FLARM-Targets |
| `netlify.toml` | Netlify-Build-Konfiguration, Functions-Verzeichnis, Header-Regeln |
| `manifest.json` | PWA-Manifest |
| `sw.js` | Service Worker (Offline-Shell, Cache-First für Assets) |
| `icon-192x192.png`, `icon-512x512.png`, `skyalarm-icon.svg` | Icons |

## Datenquellen

- [airplanes.live](https://airplanes.live/) — Live-ADS-B-Feed (1090 MHz Mode-S Extended Squitter), 10 NM Scan-Radius
- [Open Glider Network](https://www.glidernet.org/) — FLARM, OGN-Tracker, FANET (über Netlify-Function-Proxy zu `live.glidernet.org/lxml.php`)
- [DiPUL WMS](https://www.dipul.de/) — Luftraumzonen Deutschland
- [BrightSky](https://brightsky.dev/) — Wetterdaten des Deutschen Wetterdienstes (Wind, Böen, Temperatur, Taupunkt, Niederschlag, Sicht)
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

Die Versionsnummer steht ausschließlich in `const APP_VER` in `skyalarm.html` (Anker `[J-VER]`, Zeile ~799) und wird per DOM-Updater an Header (`<sup class="l-ver">`) und Info-Modal (`<span class="l-ver">`) propagiert. Aktueller Stand: **v0.27**.

Die vollständige Versions-Historie ist in `CLAUDE.md` dokumentiert.

## Lizenz / Haftung

Hilfswerkzeug ohne Gewähr. Verantwortung für sicheren Drohnenbetrieb verbleibt vollständig beim Piloten. Alle externen Daten (ADS-B, DiPUL, Tile-Server) ohne Garantie auf Verfügbarkeit oder Korrektheit.

## Verwandt

[SkyCheck](https://enchanting-stardust-f713da.netlify.app/skycheck.html) — vollständige Drohnen-Flugplanung mit Wetter, Vorhersagen und METAR/TAF.
