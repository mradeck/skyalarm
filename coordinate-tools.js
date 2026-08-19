(function (global) {
  'use strict';

  const DEG = Math.PI / 180;
  const ARCSEC = DEG / 3600;
  const SCRIPT_BASE = typeof document !== 'undefined' && document.currentScript?.src
    ? new URL('.', document.currentScript.src)
    : null;
  const ETRS89 = { a: 6378137, invF: 298.257222101 };
  const BESSEL = { a: 6377397.155, invF: 299.1528128 };
  const GCG = {
    width: 950,
    height: 1052,
    west: 3.25625,
    north: 55.9791666673327,
    stepLon: 0.0125,
    stepLat: -0.00833333333460076,
    noData: 32767,
    scale: 0.01,
    url: SCRIPT_BASE
      ? new URL('data/gcg2016v2023-cm.i16?v=2023-web-2', SCRIPT_BASE).href
      : 'data/gcg2016v2023-cm.i16?v=2023-web-2',
  };
  let geoidPromise = null;

  function ellipsoidParams(ellipsoid) {
    const f = 1 / ellipsoid.invF;
    const e2 = f * (2 - f);
    return { ...ellipsoid, f, e2, ep2: e2 / (1 - e2) };
  }

  function tmForward(latDeg, lonDeg, lon0Deg, ellipsoid, k0, falseEasting, falseNorthing) {
    const { a, e2, ep2 } = ellipsoidParams(ellipsoid);
    const lat = latDeg * DEG;
    const lonDelta = (lonDeg - lon0Deg) * DEG;
    const sin = Math.sin(lat);
    const cos = Math.cos(lat);
    const tan = Math.tan(lat);
    const n = a / Math.sqrt(1 - e2 * sin * sin);
    const t = tan * tan;
    const c = ep2 * cos * cos;
    const A = lonDelta * cos;
    const e4 = e2 * e2;
    const e6 = e4 * e2;
    const m = a * (
      (1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * lat
      - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * lat)
      + (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * lat)
      - (35 * e6 / 3072) * Math.sin(6 * lat)
    );
    const easting = falseEasting + k0 * n * (
      A + (1 - t + c) * A ** 3 / 6
      + (5 - 18 * t + t * t + 72 * c - 58 * ep2) * A ** 5 / 120
    );
    const northing = falseNorthing + k0 * (
      m + n * tan * (
        A * A / 2
        + (5 - t + 9 * c + 4 * c * c) * A ** 4 / 24
        + (61 - 58 * t + t * t + 600 * c - 330 * ep2) * A ** 6 / 720
      )
    );
    return { easting, northing };
  }

  function geodeticToEcef(latDeg, lonDeg, height, ellipsoid) {
    const { a, e2 } = ellipsoidParams(ellipsoid);
    const lat = latDeg * DEG;
    const lon = lonDeg * DEG;
    const sinLat = Math.sin(lat);
    const cosLat = Math.cos(lat);
    const n = a / Math.sqrt(1 - e2 * sinLat * sinLat);
    return {
      x: (n + height) * cosLat * Math.cos(lon),
      y: (n + height) * cosLat * Math.sin(lon),
      z: (n * (1 - e2) + height) * sinLat,
    };
  }

  function ecefToGeodetic(x, y, z, ellipsoid) {
    const { a, e2 } = ellipsoidParams(ellipsoid);
    const lon = Math.atan2(y, x);
    const p = Math.hypot(x, y);
    let lat = Math.atan2(z, p * (1 - e2));
    let h = 0;
    for (let i = 0; i < 10; i += 1) {
      const sin = Math.sin(lat);
      const n = a / Math.sqrt(1 - e2 * sin * sin);
      h = p / Math.cos(lat) - n;
      const next = Math.atan2(z, p * (1 - e2 * n / (n + h)));
      if (Math.abs(next - lat) < 1e-13) { lat = next; break; }
      lat = next;
    }
    return { lat: lat / DEG, lon: lon / DEG, height: h };
  }

  // Inverse of the DHDN/Bessel -> ETRS89 seven-parameter transformation used
  // by EPSG:31466–31469. This is the nationwide Helmert approximation; the
  // official BeTA2007 NTv2 grid gives decimetre rather than metre accuracy.
  function etrs89ToDhdn(lat, lon, height = 0) {
    const p = geodeticToEcef(lat, lon, height, ETRS89);
    const dx = 598.1, dy = 73.7, dz = 418.2;
    const rx = 0.202 * ARCSEC, ry = 0.045 * ARCSEC, rz = -2.455 * ARCSEC;
    const m = 1 + 6.7e-6;
    // Forward DHDN -> ETRS89: T + m * R * source. Solve R exactly enough for
    // these small rotations by applying the inverse 3x3 matrix analytically.
    const bx = (p.x - dx) / m;
    const by = (p.y - dy) / m;
    const bz = (p.z - dz) / m;
    const a11 = 1, a12 = -rz, a13 = ry;
    const a21 = rz, a22 = 1, a23 = -rx;
    const a31 = -ry, a32 = rx, a33 = 1;
    const det = a11 * (a22 * a33 - a23 * a32)
      - a12 * (a21 * a33 - a23 * a31)
      + a13 * (a21 * a32 - a22 * a31);
    const x = ((a22 * a33 - a23 * a32) * bx + (a13 * a32 - a12 * a33) * by + (a12 * a23 - a13 * a22) * bz) / det;
    const y = ((a23 * a31 - a21 * a33) * bx + (a11 * a33 - a13 * a31) * by + (a13 * a21 - a11 * a23) * bz) / det;
    const z = ((a21 * a32 - a22 * a31) * bx + (a12 * a31 - a11 * a32) * by + (a11 * a22 - a12 * a21) * bz) / det;
    return ecefToGeodetic(x, y, z, BESSEL);
  }

  function latitudeBand(lat) {
    if (lat < -80 || lat > 84) return '';
    return 'CDEFGHJKLMNPQRSTUVWXX'[Math.floor((lat + 80) / 8)];
  }

  function utm(lat, lon) {
    let zone = Math.floor((lon + 180) / 6) + 1;
    zone = Math.max(1, Math.min(60, zone));
    const centralMeridian = zone * 6 - 183;
    const result = tmForward(lat, lon, centralMeridian, ETRS89, 0.9996, 500000, lat < 0 ? 10000000 : 0);
    return {
      zone,
      band: latitudeBand(lat),
      zoneBand: `${zone}${latitudeBand(lat)}`,
      epsg: lat >= 0 ? 25800 + zone : null,
      easting: result.easting,
      northing: result.northing,
      prefixedEasting: zone * 1000000 + result.easting,
    };
  }

  function gaussKrueger(lat, lon, zone) {
    const chosen = zone || Math.max(2, Math.min(5, Math.round(lon / 3)));
    const dhdn = etrs89ToDhdn(lat, lon, 0);
    const result = tmForward(dhdn.lat, dhdn.lon, chosen * 3, BESSEL, 1, chosen * 1000000 + 500000, 0);
    return {
      zone: chosen,
      epsg: 31464 + chosen,
      easting: result.easting,
      northing: result.northing,
      accuracy: 'approximate',
    };
  }

  function dms(value, axis) {
    const positive = axis === 'lat' ? 'N' : 'E';
    const negative = axis === 'lat' ? 'S' : 'W';
    const hemi = value < 0 ? negative : positive;
    const absolute = Math.abs(value);
    const degrees = Math.floor(absolute);
    const minutesFloat = (absolute - degrees) * 60;
    const minutes = Math.floor(minutesFloat);
    const seconds = (minutesFloat - minutes) * 60;
    return `${degrees}° ${String(minutes).padStart(2, '0')}′ ${seconds.toFixed(3).padStart(6, '0')}″ ${hemi}`;
  }

  function convert(lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      throw new RangeError('Invalid WGS84 coordinate');
    }
    return {
      wgs84: { lat, lon, latDms: dms(lat, 'lat'), lonDms: dms(lon, 'lon') },
      utm: utm(lat, lon),
      gk: gaussKrueger(lat, lon),
    };
  }

  async function loadGeoid(url = GCG.url) {
    if (!geoidPromise) {
      geoidPromise = fetch(url).then(async response => {
        if (!response.ok) throw new Error(`GCG2016 grid HTTP ${response.status}`);
        const buffer = await response.arrayBuffer();
        if (buffer.byteLength !== GCG.width * GCG.height * 2) throw new Error('Unexpected GCG2016 grid size');
        return new Int16Array(buffer);
      }).catch(error => { geoidPromise = null; throw error; });
    }
    return geoidPromise;
  }

  async function geoidAt(lat, lon, url) {
    const x = (lon - GCG.west) / GCG.stepLon;
    const y = (lat - GCG.north) / GCG.stepLat;
    if (x < 0 || y < 0 || x > GCG.width - 1 || y > GCG.height - 1) return null;
    const x0 = Math.min(Math.floor(x), GCG.width - 2);
    const y0 = Math.min(Math.floor(y), GCG.height - 2);
    const fx = x - x0;
    const fy = y - y0;
    let grid;
    try {
      grid = await loadGeoid(url);
    } catch (firstError) {
      if (url) throw firstError;
      const separator = GCG.url.includes('?') ? '&' : '?';
      grid = await loadGeoid(`${GCG.url}${separator}retry=${Date.now()}`);
    }
    const sample = (sx, sy) => grid[sy * GCG.width + sx];
    const q00 = sample(x0, y0), q10 = sample(x0 + 1, y0);
    const q01 = sample(x0, y0 + 1), q11 = sample(x0 + 1, y0 + 1);
    if ([q00, q10, q01, q11].some(value => value === GCG.noData)) return null;
    return ((q00 * (1 - fx) + q10 * fx) * (1 - fy)
      + (q01 * (1 - fx) + q11 * fx) * fy) * GCG.scale;
  }

  global.GeoCoordinates = Object.freeze({
    convert,
    utm,
    gaussKrueger,
    dms,
    geoidAt,
    loadGeoid,
    normalHeight: (ellipsoidalHeight, geoidHeight) => ellipsoidalHeight - geoidHeight,
    GCG,
  });
})(window);
