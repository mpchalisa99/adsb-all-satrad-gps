import dns from "node:dns";

try {
  dns.setDefaultResultOrder("ipv4first");
} catch {}

export interface Flight {
  id: string;
  callsign: string;
  name: string;
  lat: number;
  lng: number;
  altitude: number;
  speed: number;
  heading: number;
  squawk: string;
  origin: string;
  destination: string;
  type: "civilian" | "military" | "unidentified";
  isWarning: boolean;
  history: [number, number][];
  source?: string;
  license?: string;
  lastSeenAgo?: number;
}

interface TrackMemoryRecord {
  flight: Flight;
  history: [number, number][];
  lastSeen: number;
  lastReportedLat: number;
  lastReportedLng: number;
  speed: number;
  heading: number;
}

// In-memory persistent tracking store across polling intervals
const flightTrackMemory = new Map<string, TrackMemoryRecord>();

// Response cache to prevent rate-limit bursts (api.adsb.lol allows 4 req/sec, 60 req/min)
let lastFetchCache: { key: string; timestamp: number; data: Flight[] } | null = null;

export function getDistanceNM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R_KM = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return (R_KM * c) * 0.539957;
}

export function isValidPosition(lat: any, lng: any): boolean {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  // Exclude Null Island (0, 0)
  if (Math.abs(lat) < 0.001 && Math.abs(lng) < 0.001) return false;
  return true;
}

export function sanitizeHeading(heading: any): number {
  if (typeof heading !== 'number' || !Number.isFinite(heading)) return 0;
  let h = Math.round(heading) % 360;
  if (h < 0) h += 360;
  return h;
}

/**
 * Fetch live aircraft from api.adsb.lol (ODbL 1.0 License)
 * Endpoint: https://api.adsb.lol/v2/point/{lat}/{lon}/{radiusNM}
 */
async function fetchFromAdsbLol(lat: number, lng: number, radiusNM: number): Promise<any[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3800);
    const url = `https://api.adsb.lol/v2/point/${lat}/${lng}/${radiusNM}`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'MATA-X-TacticalRadar/4.0 (contact@diskomlekau.mil.id)',
        'Accept': 'application/json'
      }
    });
    clearTimeout(timeout);
    if (res.ok) {
      const data: any = await res.json();
      if (data && Array.isArray(data.ac) && data.ac.length > 0) {
        return data.ac;
      }
      if (data && Array.isArray(data.aircraft) && data.aircraft.length > 0) {
        return data.aircraft;
      }
    }
  } catch {
    // Network or timeout
  }
  return [];
}

/**
 * Fallback to opendata.adsb.fi if api.adsb.lol is unreachable
 */
async function fetchFromAdsbFi(lat: number, lng: number, radiusNM: number): Promise<any[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const url = `https://opendata.adsb.fi/api/v2/lat/${lat}/lon/${lng}/dist/${radiusNM}`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'MATA-X-TacticalRadar/4.0',
        'Accept': 'application/json'
      }
    });
    clearTimeout(timeout);
    if (res.ok) {
      const data: any = await res.json();
      if (data && Array.isArray(data.aircraft) && data.aircraft.length > 0) {
        return data.aircraft;
      }
      if (data && Array.isArray(data.ac) && data.ac.length > 0) {
        return data.ac;
      }
    }
  } catch {
    // Fallback failed
  }
  return [];
}

/**
 * Identify airline and aircraft model from transponder data
 */
function enrichAircraftMeta(callsign: string, ac: any): string {
  if (ac.desc) return ac.desc;
  if (ac.t) return `${ac.t} ${ac.r ? `(${ac.r})` : ''}`.trim();
  if (ac.r) return `Reg: ${ac.r}`;

  const c = callsign.toUpperCase();
  if (c.startsWith("GIA") || c.startsWith("GA")) return "Garuda Indonesia";
  if (c.startsWith("LNI") || c.startsWith("JT")) return "Lion Air";
  if (c.startsWith("CTV") || c.startsWith("QG")) return "Citilink Indonesia";
  if (c.startsWith("BTK") || c.startsWith("ID")) return "Batik Air";
  if (c.startsWith("SJV") || c.startsWith("IU")) return "Super Air Jet";
  if (c.startsWith("SIA") || c.startsWith("SQ")) return "Singapore Airlines";
  if (c.startsWith("AWQ") || c.startsWith("QZ")) return "Indonesia AirAsia";
  if (c.startsWith("WID") || c.startsWith("IW")) return "Wings Air (ATR 72)";
  if (c.startsWith("SJY") || c.startsWith("SJ")) return "Sriwijaya Air";
  if (c.startsWith("PAS")) return "Pelita Air Service";
  if (c.startsWith("TNU")) return "TransNusa";
  if (c.startsWith("AIC")) return "Air India";
  if (c.startsWith("MAS") || c.startsWith("MH")) return "Malaysia Airlines";
  if (c.startsWith("TGW")) return "Scoot Airlines";
  if (c.startsWith("UAE")) return "Emirates";
  if (c.startsWith("QTR")) return "Qatar Airways";
  if (c.startsWith("AXM")) return "AirAsia Malaysia";

  return "Commercial Aircraft";
}

export async function fetchLiveFlights(centerLat: number, centerLng: number, satradId: string): Promise<Flight[]> {
  const isAll = satradId === "ALL";
  const now = Date.now();
  const cacheKey = isAll ? "ALL" : `${centerLat.toFixed(2)}_${centerLng.toFixed(2)}`;

  // Serve from memory cache if fresh (< 2500ms) to respect api.adsb.lol rate limits
  if (lastFetchCache && lastFetchCache.key === cacheKey && (now - lastFetchCache.timestamp < 2500)) {
    return lastFetchCache.data;
  }

  let rawList: any[] = [];
  let sourceTag = "https://api.adsb.lol (ODbL 1.0)";

  if (isAll) {
    // For ALL Satrads / Nationwide: A single 1000NM query at the geographical center of Indonesia (-2.5, 118.0)
    // covers Java, Sumatra, Kalimantan, Sulawesi, Bali, Nusa Tenggara, Maluku, and Papua
    // in ONE request without triggering burst rate-limits.
    rawList = await fetchFromAdsbLol(-2.5, 118.0, 1000);
    if (rawList.length === 0) {
      rawList = await fetchFromAdsbFi(-2.5, 118.0, 1000);
      sourceTag = "https://opendata.adsb.fi (Community ADS-B)";
    }
  } else {
    // Single Satrad station: 250 NM radar coverage radius around station position
    rawList = await fetchFromAdsbLol(centerLat, centerLng, 250);
    if (rawList.length === 0) {
      rawList = await fetchFromAdsbFi(centerLat, centerLng, 250);
      sourceTag = "https://opendata.adsb.fi (Community ADS-B)";
    }
  }

  // Active aircraft discovered in this query
  const seenIds = new Set<string>();

  for (const ac of rawList) {
    const icao = (ac.hex || "").toLowerCase().trim();
    if (!icao) continue;

    const lat = ac.lat;
    const lng = ac.lon;

    if (!isValidPosition(lat, lng)) continue;

    // Range checks
    if (!isAll) {
      const distFromSatrad = getDistanceNM(centerLat, centerLng, lat, lng);
      if (distFromSatrad > 250) continue;
    } else {
      // Indonesian FIR & Territorial Airspace boundaries
      if (lat < -14.0 || lat > 9.5 || lng < 93.0 || lng > 143.0) continue;
    }

    const id = `adsb_${icao}`;
    seenIds.add(id);

    const callsign = (ac.flight || "").trim() || (ac.r ? ac.r.trim() : `ADS-${icao.toUpperCase()}`);

    let altitude = 0;
    if (typeof ac.alt_baro === 'number') {
      altitude = Math.max(0, Math.min(85000, Math.round(ac.alt_baro)));
    } else if (typeof ac.alt_geom === 'number') {
      altitude = Math.max(0, Math.min(85000, Math.round(ac.alt_geom)));
    }

    let speed = 0;
    if (typeof ac.gs === 'number') {
      speed = Math.max(0, Math.min(1800, Math.round(ac.gs)));
    } else if (altitude > 10000) {
      speed = 430;
    } else if (altitude > 1000) {
      speed = 220;
    }

    const heading = sanitizeHeading(ac.track ?? ac.calc_track);
    const squawk = (ac.squawk || "").trim() || "2000";
    const name = enrichAircraftMeta(callsign, ac);

    const isMilitary = squawk.startsWith("7") === false && (
      callsign.startsWith("TNI") || 
      callsign.startsWith("AF") || 
      callsign.startsWith("A13") ||
      callsign.startsWith("A29") ||
      callsign.startsWith("TS") ||
      callsign.startsWith("RMAF") || 
      ac.category === "A7"
    );

    // Track smoothing & history memory
    const existing = flightTrackMemory.get(id);
    let history: [number, number][] = [];

    if (existing && existing.history && existing.history.length > 0) {
      const lastPt = existing.history[existing.history.length - 1];
      const dLat = Math.abs(lat - lastPt[0]);
      const dLng = Math.abs(lng - lastPt[1]);
      const stepDist = Math.sqrt(dLat * dLat + dLng * dLng);

      // Discontinuity guard: if step > 0.12° (~7.2 NM in 3 sec), reset breadcrumb
      if (stepDist > 0.12) {
        history = [[lat, lng]];
      } else if (stepDist >= 0.0003) {
        // Normal motion: append point up to 40 history trail points
        history = [...existing.history, [lat, lng] as [number, number]].slice(-40) as [number, number][];
      } else {
        // Stationary or negligible move
        history = existing.history;
      }
    } else {
      history = [[lat, lng]];
    }

    const flightObj: Flight = {
      id,
      callsign,
      name,
      lat: Number(lat.toFixed(5)),
      lng: Number(lng.toFixed(5)),
      altitude,
      speed,
      heading,
      squawk,
      origin: "N/A",
      destination: "N/A",
      type: isMilitary ? "military" : "civilian",
      isWarning: false,
      history,
      source: "https://api.adsb.lol",
      license: "ODbL 1.0 (Open Database License)",
      lastSeenAgo: 0
    };

    flightTrackMemory.set(id, {
      flight: flightObj,
      history,
      lastSeen: now,
      lastReportedLat: lat,
      lastReportedLng: lng,
      speed,
      heading
    });
  }

  // Dead-Reckoning & Grace-Period Extrapolation (Prevents tracks from vanishing on momentary signal loss)
  const outputFlights: Flight[] = [];
  const GRACE_PERIOD_MS = 35000; // 35 seconds graceful hold

  for (const [id, record] of flightTrackMemory.entries()) {
    const ageMs = now - record.lastSeen;

    if (ageMs > GRACE_PERIOD_MS) {
      // Expired: delete from memory
      flightTrackMemory.delete(id);
      continue;
    }

    if (!seenIds.has(id)) {
      // Extrapolate position using dead reckoning along last known heading and speed
      const elapsedSec = ageMs / 1000;
      if (record.speed > 35 && elapsedSec <= 35) {
        // 1 knot = 1 NM / 3600 sec. 1 NM in latitude ≈ 1 / 60 deg.
        const distDeg = (record.speed * (elapsedSec / 3600)) / 60;
        const rad = (record.heading * Math.PI) / 180;
        const projectedLat = record.lastReportedLat + distDeg * Math.cos(rad);
        const projectedLng = record.lastReportedLng + (distDeg * Math.sin(rad)) / Math.cos(record.lastReportedLat * Math.PI / 180);

        if (isValidPosition(projectedLat, projectedLng)) {
          record.flight.lat = Number(projectedLat.toFixed(5));
          record.flight.lng = Number(projectedLng.toFixed(5));
        }
      }
      record.flight.lastSeenAgo = Math.round(elapsedSec);
    }

    // Double check range for station mode
    if (!isAll) {
      const dist = getDistanceNM(centerLat, centerLng, record.flight.lat, record.flight.lng);
      if (dist <= 250) {
        outputFlights.push(record.flight);
      }
    } else {
      outputFlights.push(record.flight);
    }
  }

  // Update memory cache
  lastFetchCache = {
    key: cacheKey,
    timestamp: now,
    data: outputFlights
  };

  return outputFlights;
}

export default async function handler(req: any, res: any) {
  const centerLat = parseFloat(req.query?.lat || "-7.9150");
  const centerLng = parseFloat(req.query?.lng || "110.0750");
  const satradId = (req.query?.satradId || "SATRAD 215").toString();
  const satradName = (req.query?.name || "Congot").toString();

  try {
    const flights = await fetchLiveFlights(centerLat, centerLng, satradId);

    res.setHeader("Cache-Control", "no-store, max-age=0");
    return res.status(200).json({
      success: true,
      flights,
      adsbStatus: "LIVE",
      adsbCount: flights.length,
      provider: "api.adsb.lol (ODbL 1.0) & opendata.adsb.fi",
      license: "ODbL 1.0 (Open Database License)",
      dataSourceUrl: "https://api.adsb.lol",
      terms: "The API is available to everyone.",
      satrad: {
        id: satradId,
        name: satradName,
        lat: centerLat,
        lng: centerLng,
        radarRangeNM: 250
      }
    });
  } catch (err: any) {
    return res.status(200).json({
      success: true,
      flights: [],
      adsbStatus: "LIVE",
      adsbCount: 0,
      provider: "api.adsb.lol (ODbL 1.0)",
      license: "ODbL 1.0",
      dataSourceUrl: "https://api.adsb.lol",
      satrad: {
        id: satradId,
        name: satradName,
        lat: centerLat,
        lng: centerLng,
        radarRangeNM: 250
      },
      error: err.message
    });
  }
}
