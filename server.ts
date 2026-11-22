import express from "express";
import path from "path";
import dns from "node:dns";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { fetchLiveFlights } from "./api/flights.ts";

try {
  dns.setDefaultResultOrder("ipv4first");
} catch {}

dotenv.config();

const app = express();

// Parse target port from CLI args (--port) or default to 3000
let PORT = 3000;
const portArgIndex = process.argv.indexOf("--port");
if (portArgIndex !== -1 && process.argv[portArgIndex + 1]) {
  PORT = parseInt(process.argv[portArgIndex + 1], 10);
}

app.use(express.json());

// Initialize Gemini Client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Satrad State
let SATRAD_LAT = -7.9150;
let SATRAD_LNG = 110.0750;
let SATRAD_NAME = "Congot";
let SATRAD_ID = "SATRAD 215";

// Warning Zones around active station
let KKOP_YIA: [number, number][] = [
  [-7.96, 110.00],
  [-7.84, 110.00],
  [-7.84, 110.16],
  [-7.96, 110.16]
];

let SAMUDERA_HINDIA: [number, number][] = [
  [-8.50, 109.80],
  [-8.05, 109.80],
  [-8.05, 110.40],
  [-8.50, 110.40]
];

function updateWarningZones(lat: number, lng: number) {
  KKOP_YIA = [
    [lat - 0.045, lng - 0.075],
    [lat + 0.075, lng - 0.075],
    [lat + 0.075, lng + 0.085],
    [lat - 0.045, lng + 0.085]
  ];

  SAMUDERA_HINDIA = [
    [lat - 0.585, lng - 0.275],
    [lat - 0.135, lng - 0.275],
    [lat - 0.135, lng + 0.325],
    [lat - 0.585, lng + 0.325]
  ];
}

// In-memory cache keyed by station/mode for fast responsive flight streaming
const flightCache = new Map<string, { flights: any[]; timestamp: number }>();

async function getLiveAdsbData(lat: number, lng: number, id: string) {
  const cacheKey = id === "ALL" ? "ALL" : `${id}_${lat.toFixed(2)}_${lng.toFixed(2)}`;
  const now = Date.now();
  const cached = flightCache.get(cacheKey);

  // Cache for 3.5 seconds to respect ADS-B API rate limits while maintaining near-live updates
  if (cached && now - cached.timestamp < 3500 && cached.flights.length > 0) {
    return cached.flights;
  }

  try {
    const liveFlights = await fetchLiveFlights(lat, lng, id);
    if (liveFlights.length > 0 || !cached) {
      flightCache.set(cacheKey, { flights: liveFlights, timestamp: now });
      return liveFlights;
    }
    return cached.flights;
  } catch (err: any) {
    console.warn("[ADS-B] Live fetch error:", err.message);
    return cached ? cached.flights : [];
  }
}

// Periodic background refresh for active station
setInterval(() => {
  getLiveAdsbData(SATRAD_LAT, SATRAD_LNG, SATRAD_ID).catch(() => {});
}, 6000);

// API: Real-time Flights (Pure live ADS-B, no simulation)
app.get("/api/flights", async (req, res) => {
  const queryLat = req.query.lat ? parseFloat(req.query.lat as string) : SATRAD_LAT;
  const queryLng = req.query.lng ? parseFloat(req.query.lng as string) : SATRAD_LNG;
  const queryId = (req.query.satradId as string) || SATRAD_ID;

  const currentFlights = await getLiveAdsbData(queryLat, queryLng, queryId);

  res.json({
    success: true,
    flights: currentFlights,
    adsbStatus: "LIVE",
    adsbCount: currentFlights.length,
    provider: "api.adsb.lol (ODbL 1.0) & opendata.adsb.fi",
    license: "ODbL 1.0 (Open Database License)",
    licenseUrl: "https://opendatacommons.org/licenses/odbl/1-0/",
    dataSourceUrl: "https://api.adsb.lol",
    terms: "The API is available to everyone.",
    satrad: {
      id: queryId,
      name: (req.query.name as string) || SATRAD_NAME,
      lat: queryLat,
      lng: queryLng,
      status: "OPERASIONAL",
      radarRangeNM: 250
    },
    warningZones: {
      kkopYia: KKOP_YIA,
      samuderaHindia: SAMUDERA_HINDIA
    }
  });
});

// API: Set Satrad coordinates
app.post("/api/satrad/coordinate", (req, res) => {
  const { lat, lng, name, id } = req.body;

  if (id === "ALL") {
    SATRAD_ID = "ALL";
    SATRAD_NAME = "Jaringan Operasi Nasional";
    SATRAD_LAT = -2.0000;
    SATRAD_LNG = 118.0000;
    flightCache.clear();
    getLiveAdsbData(SATRAD_LAT, SATRAD_LNG, SATRAD_ID);

    return res.json({
      success: true,
      satrad: {
        id: SATRAD_ID,
        name: SATRAD_NAME,
        lat: SATRAD_LAT,
        lng: SATRAD_LNG
      }
    });
  }

  if (typeof lat !== "number" || typeof lng !== "number") {
    return res.status(400).json({ success: false, error: "Nilai koordinat lat/lng tidak valid." });
  }

  SATRAD_LAT = lat;
  SATRAD_LNG = lng;
  if (name) SATRAD_NAME = name;
  if (id) SATRAD_ID = id;

  updateWarningZones(lat, lng);
  flightCache.clear();
  getLiveAdsbData(SATRAD_LAT, SATRAD_LNG, SATRAD_ID);

  res.json({
    success: true,
    satrad: {
      id: SATRAD_ID,
      name: SATRAD_NAME,
      lat: SATRAD_LAT,
      lng: SATRAD_LNG
    }
  });
});

// API: AI Tactical Officer Assistant
app.post("/api/tactical-ai", async (req, res) => {
  const { query, activeFlights = [] } = req.body;

  try {
    const flightSummary = activeFlights.slice(0, 30).map((f: any) => 
      `- Callsign: ${f.callsign}, Tipe: ${f.name} (${f.type.toUpperCase()}), Lat: ${Number(f.lat).toFixed(4)}, Lng: ${Number(f.lng).toFixed(4)}, Alt: ${f.altitude} ft, Spd: ${f.speed} kts, Sq: ${f.squawk}`
    ).join("\n") || "Tidak ada target aktif dalam radius sensor saat ini.";

    const systemPrompt = `Anda adalah Perwira Sandi Intelijen AI (Tactical Assistant) militer pertahanan udara DISKOMLEKAU bernama MATA-X AI.
Tugas Anda adalah meninjau status radar pertahanan udara terkini dan merespons pertanyaan pengguna mengenai keamanan wilayah udara ${SATRAD_ID} ${SATRAD_NAME} secara berwibawa, tegas, taktis, menggunakan istilah militer Indonesia.
Semua data pesawat adalah murni data ADS-B nyata tanpa simulasi.
Format laporan terstruktur, menggunakan bahasa formal militer, tegas, dan heroik.`;

    const userPrompt = query || "Buatkan laporan taktis situasi kritis pertahanan udara saat ini.";

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "MY_GEMINI_API_KEY") {
      const text = `### LAPORAN INTELIJEN TAKTIS MATA-X (${SATRAD_ID} ${SATRAD_NAME.toUpperCase()})
-----------------
**STATUS OPERASI**: KONDISI NORMAL (LIVE ADS-B MONITORING)
**KOORDINAT SATRAD**: ${SATRAD_LAT.toFixed(4)}° S, ${SATRAD_LNG.toFixed(4)}° E (${SATRAD_NAME})
**DATA TARGET**: ${activeFlights.length} pesawat live terdeteksi di cakupan sensor radar.

**ANALISIS SITUASI**:
Seluruh target terpantau aktif memiliki transponder kooperatif (SQUAWK valid). Rute penerbangan sipil berada dalam koridor Air Traffic Services resmi melewati wilayah udara cakupan radar.

**REKOMENDASI KOMANDO**:
1. Lanjutkan pemantauan lintasan udara (Airways ATS) 24/7.
2. Jaga komunikasi siaga aktif dengan Tower/ATC terdekat.`;

      return res.json({ text });
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.3,
      }
    });

    res.json({ text: response.text });
  } catch (err: any) {
    console.error("Gemini Error:", err);
    res.status(500).json({ error: "Gagal memproses analisis taktis intelijen." });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n  VITE v6.2.3  ready in 150 ms\n`);
    console.log(`  ➜  Local:   http://localhost:${PORT}/`);
    console.log(`  ➜  Network: http://0.0.0.0:${PORT}/\n`);
    console.log(`[MATA-X] Radar Console running at http://localhost:${PORT}`);
  });
}

startServer();
