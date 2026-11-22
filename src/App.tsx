import { useEffect, useRef, useState } from 'react';
import { 
  Radar, 
  ShieldAlert, 
  Plane, 
  Compass, 
  Map as MapIcon, 
  Ruler as RulerIcon, 
  RotateCcw, 
  Sparkles, 
  Terminal, 
  Clock, 
  Volume2, 
  VolumeX, 
  Activity,
  Send,
  HelpCircle,
  Database,
  Maximize2,
  Minimize2,
  Wifi,
  Key,
  Settings,
  Globe,
  Radio,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ListFilter,
  Navigation,
  X,
  ChevronUp,
  ChevronDown,
  Download
} from 'lucide-react';
import { SATRADS, SatradItem } from './satrads';

// Declare Leaflet globally (CDN-provided)
declare const L: any;

interface Flight {
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

interface ThreatLog {
  timestamp: string;
  message: string;
  type: "threat" | "system" | "warning";
}

// CARTO Basemaps Configuration & API Key
const CARTO_API_KEY = "cb1_4ovb_1_cda161407f013e7010dd86be";

export type CartoStyleId = 'voyager' | 'dark_all' | 'light_all' | 'dark_nolabels';

interface CartoStyleOption {
  id: CartoStyleId;
  label: string;
  sublabel: string;
  tag: string;
}

const CARTO_STYLE_OPTIONS: CartoStyleOption[] = [
  { id: 'voyager', label: 'VOYAGER', sublabel: 'Navigasi Udara & Kontur', tag: 'AIRWAYS' },
  { id: 'dark_all', label: 'DARK MATTER', sublabel: 'Mode Taktis Gelap Radar', tag: 'TACTICAL' },
  { id: 'dark_nolabels', label: 'NO LABELS', sublabel: 'Radar Bersih Tanpa Teks', tag: 'CLEAN' },
  { id: 'light_all', label: 'POSITRON', sublabel: 'Kontras Terang Operasional', tag: 'DAYLIGHT' }
];

const getCartoTileUrl = (style: CartoStyleId, key: string = CARTO_API_KEY) => {
  return `https://{s}.basemaps.cartocdn.com/rastertiles/${style}/{z}/{x}/{y}.png?key=${key}`;
};

const KKOP_YIA: [number, number][] = [
  [-7.96, 110.00],
  [-7.84, 110.00],
  [-7.84, 110.16],
  [-7.96, 110.16]
];

const SAMUDERA_HINDIA: [number, number][] = [
  [-8.50, 109.80],
  [-8.05, 109.80],
  [-8.05, 110.40],
  [-8.50, 110.40]
];

function isLatLngInPolygon(lat: number, lng: number, polygon: [number, number][]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const yi = polygon[i][0], xi = polygon[i][1];
    const yj = polygon[j][0], xj = polygon[j][1];
    const intersect = ((yi > lat) !== (yj > lat))
        && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export default function App() {
  const mapContainerRef = useRef<any>(null);
  const mapRef = useRef<any>(null);

  // Dynamic Satrad Position & Warning Polygons
  const [satradCoords, setSatradCoords] = useState({ lat: -7.9150, lng: 110.0750, name: "Congot", id: "SATRAD 215" });
  const satradCoordsRef = useRef({ lat: -7.9150, lng: 110.0750, name: "Congot", id: "SATRAD 215" });

  const [kkopZone, setKkopZone] = useState<[number, number][]>(KKOP_YIA);
  const [samuderaZone, setSamuderaZone] = useState<[number, number][]>(SAMUDERA_HINDIA);

  const kkopZoneRef = useRef<[number, number][]>(KKOP_YIA);
  const samuderaZoneRef = useRef<[number, number][]>(SAMUDERA_HINDIA);

  const satradCenterMarkerRef = useRef<any>(null);
  const sgZonePolygonRef = useRef<any>(null);
  const nbZonePolygonRef = useRef<any>(null);

  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  useEffect(() => {
    satradCoordsRef.current = satradCoords;
  }, [satradCoords]);

  // Operational state elements (100% REAL-TIME ADS-B)
  const [flights, setFlights] = useState<Flight[]>([]);
  const [selectedFlight, setSelectedFlight] = useState<Flight | null>(null);
  const [adsbStatus, setAdsbStatus] = useState<"LIVE" | "ERROR">("LIVE");
  const [adsbCount, setAdsbCount] = useState(0);

  // Mobile Drawers & Bottom Sheets Control States
  const [activeDrawer, setActiveDrawer] = useState<'none' | 'settings' | 'flights' | 'ai' | 'satrad'>('none');
  const [searchFilter, setSearchFilter] = useState('');
  const [flightTypeFilter, setFlightTypeFilter] = useState<'all' | 'military' | 'civilian'>('all');

  // Fullscreen State
  const [isFullscreen, setIsFullscreen] = useState(false);

  // PWA Install Prompt State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallPwa = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  // Toggle state variables for layers
  const [showRadarData, setShowRadarData] = useState(true);
  const [showBaseMap, setShowBaseMap] = useState(true);
  const [showGeoref, setShowGeoref] = useState(true);
  const [showAirways, setShowAirways] = useState(true);
  const [showRangeCircles, setShowRangeCircles] = useState(true);
  const [showLabels, setShowLabels] = useState(true);

  // CARTO Basemap Configuration & State
  const [cartoStyle, setCartoStyle] = useState<CartoStyleId>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('mata_carto_style') as CartoStyleId;
      if (saved && ['voyager', 'dark_all', 'light_all', 'dark_nolabels'].includes(saved)) {
        return saved;
      }
    }
    return 'dark_all';
  });
  const cartoStyleRef = useRef<CartoStyleId>('dark_all');

  useEffect(() => {
    cartoStyleRef.current = cartoStyle;
    if (tileLayerRef.current) {
      tileLayerRef.current.setUrl(getCartoTileUrl(cartoStyle));
      try {
        localStorage.setItem('mata_carto_style', cartoStyle);
      } catch {}
    }
  }, [cartoStyle]);

  // Audio configuration
  const [isMuted, setIsMuted] = useState(false);

  // Logging & Clock State
  const [timeZulu, setTimeZulu] = useState("");
  const [timeLocal, setTimeLocal] = useState("");

  // AI Tactical Chat Assistant
  const [chatInput, setChatInput] = useState("");
  const [chatLogs, setChatLogs] = useState<{ sender: "user" | "ai"; text: string; timestamp: string }[]>([
    { 
      sender: "ai", 
      text: "KOMANDO PERTAHANAN UDARA (MATA-X AI): Siap mendampingi analisis taktis wilayah udara dan pemantauan radar live, Letnan. Silakan tanyakan situasi target.", 
      timestamp: "WIB" 
    }
  ]);
  const [isAiLoading, setIsAiLoading] = useState(false);

  // References to Leaflet layers
  const tileLayerRef = useRef<any>(null);
  const georefGroupRef = useRef<any>(null);
  const airwaysGroupRef = useRef<any>(null);
  const radarGridGroupRef = useRef<any>(null);
  const otherSatradsGroupRef = useRef<any>(null);
  const flightMarkersMapRef = useRef<{ [key: string]: any }>({});
  const flightHistoryPathsRef = useRef<{ [key: string]: any }>({});
  const rangeCirclesGroupRef = useRef<any>(null);
  const flightsRef = useRef<Flight[]>([]);

  useEffect(() => {
    flightsRef.current = flights;
  }, [flights]);

  // Clock timer
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeZulu(now.toLocaleTimeString('en-GB', { timeZone: 'UTC' }) + " Z");
      setTimeLocal(now.toLocaleTimeString('id-ID') + " WIB");
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const playSiren = (freq = 900, duration = 0.25) => {
    if (isMuted) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {}
  };

  const getDistanceNM = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R_KM = 6371; 
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return (R_KM * c) * 0.539957;
  };

  const getBearingDeg = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const lat1Rad = lat1 * Math.PI / 180;
    const lat2Rad = lat2 * Math.PI / 180;
    const y = Math.sin(dLng) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);
    const brg = Math.atan2(y, x) * 180 / Math.PI;
    return (brg + 360) % 360;
  };

  // Initialize Leaflet Map
  useEffect(() => {
    if (mapRef.current) return;

    const initialCoords = satradCoordsRef.current;
    const map = L.map(mapContainerRef.current, {
      center: [initialCoords.lat, initialCoords.lng],
      zoom: 8,
      zoomControl: false,
      attributionControl: false
    });

    mapRef.current = map;

    // Add custom zoom control to top right or convenient spot
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Basemap tile layer
    const tileLayer = L.tileLayer(getCartoTileUrl(cartoStyleRef.current), {
      maxZoom: 19,
      minZoom: 4,
      subdomains: 'abcd',
      ext: 'png'
    }).addTo(map);
    tileLayerRef.current = tileLayer;

    // Layer groups
    georefGroupRef.current = L.layerGroup().addTo(map);
    airwaysGroupRef.current = L.layerGroup().addTo(map);
    radarGridGroupRef.current = L.layerGroup().addTo(map);
    rangeCirclesGroupRef.current = L.layerGroup().addTo(map);
    otherSatradsGroupRef.current = L.layerGroup().addTo(map);

    // Draw range rings around active station
    updateRangeCircles(initialCoords.lat, initialCoords.lng);
    drawOtherSatradMarkers();

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Render / Update active Satrad or GPS Center Marker with clear description label
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    if (satradCenterMarkerRef.current) {
      satradCenterMarkerRef.current.remove();
      satradCenterMarkerRef.current = null;
    }

    if (satradCoords.id === "ALL") return;

    const centerIcon = L.divIcon({
      html: `
        <div class="relative flex flex-col items-center">
          <div class="absolute w-16 h-16 rounded-full border border-amber-400/40 ping-indicator" style="animation-duration: 3s;"></div>
          <div class="w-6 h-6 rounded bg-[#050811] border-2 border-amber-400 flex items-center justify-center shadow-[0_0_15px_rgba(251,191,36,0.8)]">
            <div class="w-2 h-2 bg-amber-400 rounded-full"></div>
          </div>
          <div class="mt-1 px-2.5 py-1 bg-[#050811]/95 border border-amber-400 rounded text-[10px] font-mono-military text-amber-300 whitespace-nowrap shadow-xl">
            📍 ${satradCoords.id} ${satradCoords.name.toUpperCase()} (${satradCoords.lat.toFixed(4)}°, ${satradCoords.lng.toFixed(4)}°)
          </div>
        </div>
      `,
      className: 'satrad-center-marker-node',
      iconSize: [180, 60],
      iconAnchor: [90, 20]
    });

    const marker = L.marker([satradCoords.lat, satradCoords.lng], { icon: centerIcon }).addTo(map);
    satradCenterMarkerRef.current = marker;

    updateRangeCircles(satradCoords.lat, satradCoords.lng);
  }, [satradCoords]);

  // Range Bearing Line effect
  const [showRangeBearingLine, setShowRangeBearingLine] = useState(false);
  const rangeBearingPolylineRef = useRef<any>(null);
  const rangeBearingLabelMarkerRef = useRef<any>(null);

  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    if (rangeBearingPolylineRef.current) {
      rangeBearingPolylineRef.current.remove();
      rangeBearingPolylineRef.current = null;
    }
    if (rangeBearingLabelMarkerRef.current) {
      rangeBearingLabelMarkerRef.current.remove();
      rangeBearingLabelMarkerRef.current = null;
    }

    if (showRangeBearingLine && selectedFlight && satradCoords.id !== "ALL") {
      const centerLatLng: [number, number] = [satradCoords.lat, satradCoords.lng];
      const flightLatLng: [number, number] = [selectedFlight.lat, selectedFlight.lng];

      const rng = getDistanceNM(satradCoords.lat, satradCoords.lng, selectedFlight.lat, selectedFlight.lng);
      const brg = getBearingDeg(satradCoords.lat, satradCoords.lng, selectedFlight.lat, selectedFlight.lng);

      const polyline = L.polyline([centerLatLng, flightLatLng], {
        color: '#fbbf24',
        weight: 2.5,
        dashArray: '6, 6',
        opacity: 0.95
      }).addTo(map);
      rangeBearingPolylineRef.current = polyline;

      const midLat = (satradCoords.lat + selectedFlight.lat) / 2;
      const midLng = (satradCoords.lng + selectedFlight.lng) / 2;

      const labelIcon = L.divIcon({
        html: `
          <div class="px-2.5 py-1 bg-[#050811]/95 border border-amber-400 rounded text-[10px] font-mono-military text-amber-300 shadow-xl whitespace-nowrap">
            📐 RNG: ${rng.toFixed(1)} NM | BRG: ${brg.toFixed(0)}°
          </div>
        `,
        className: 'range-bearing-mid-label',
        iconSize: [130, 26],
        iconAnchor: [65, 13]
      });

      const labelMarker = L.marker([midLat, midLng], { icon: labelIcon }).addTo(map);
      rangeBearingLabelMarkerRef.current = labelMarker;
    }
  }, [showRangeBearingLine, selectedFlight, satradCoords]);

  const updateRangeCircles = (lat: number, lng: number) => {
    if (!rangeCirclesGroupRef.current) return;
    rangeCirclesGroupRef.current.clearLayers();
    if (!showRangeCircles) return;

    // 50 NM, 100 NM, 150 NM, 200 NM, 250 NM in kilometers (1 NM = 1.852 km)
    const rangesNM = [50, 100, 150, 200, 250];
    rangesNM.forEach((nm) => {
      const radiusKm = nm * 1.852 * 1000;
      const circle = L.circle([lat, lng], {
        radius: radiusKm,
        color: 'rgba(0, 243, 255, 0.2)',
        fill: false,
        weight: 1,
        dashArray: '4, 8'
      });
      rangeCirclesGroupRef.current.addLayer(circle);

      // Label at top of circle
      const labelMarker = L.marker([lat + (nm / 60), lng], {
        icon: L.divIcon({
          html: `<div class="text-[9px] font-mono-military text-[#00f3ff]/50 px-1 bg-[#050811]/60 rounded">${nm} NM</div>`,
          className: 'range-ring-label',
          iconSize: [40, 14]
        })
      });
      rangeCirclesGroupRef.current.addLayer(labelMarker);
    });
  };

  const drawOtherSatradMarkers = () => {
    if (!otherSatradsGroupRef.current) return;
    otherSatradsGroupRef.current.clearLayers();

    SATRADS.forEach((s) => {
      if (s.idLabel === satradCoords.id) return; // skip active if matched
      const icon = L.divIcon({
        html: `
          <div class="flex items-center justify-center w-3 h-3 bg-[#050811] border border-[#00f3ff]/60 rounded-full shadow-[0_0_8px_rgba(0,243,255,0.3)]">
            <div class="w-1 h-1 bg-[#00f3ff] rounded-full"></div>
          </div>
        `,
        className: 'other-satrad-icon',
        iconSize: [12, 12],
        iconAnchor: [6, 6]
      });

      const marker = L.marker([s.lat, s.lng], { icon }).addTo(otherSatradsGroupRef.current);
      marker.bindTooltip(`${s.idLabel} ${s.name.toUpperCase()}`, {
        direction: 'top',
        className: 'tactical-tooltip'
      });
      marker.on('click', () => {
        handleSelectSatrad(s);
      });
    });
  };

  const handleSelectSatrad = async (s: SatradItem | { id?: string; idLabel?: string; name: string; lat: number; lng: number }) => {
    const id = 'idLabel' in s && s.idLabel ? s.idLabel : (s.id || 'ALL');
    const name = s.name;
    const lat = s.lat;
    const lng = s.lng;

    try {
      const res = await fetch(`/api/satrad/coordinate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng, name, id })
      });
      const data = await res.json();
      if (data.success) {
        setSatradCoords({ lat, lng, name, id });
        satradCoordsRef.current = { lat, lng, name, id };
        if (mapRef.current) {
          if (id === "ALL") {
            mapRef.current.setView([-2.0, 118.0], 5);
          } else {
            mapRef.current.setView([lat, lng], 8);
          }
        }
        updateRangeCircles(lat, lng);
        drawOtherSatradMarkers();
        setActiveDrawer('none');
      }
    } catch (err) {
      console.error("Failed to update satrad:", err);
    }
  };

  // GPS Geolocation Handler
  const handleGpsLocation = () => {
    if (!navigator.geolocation) {
      setGpsError("Geolocation tidak didukung oleh browser Anda.");
      return;
    }
    setGpsLoading(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsLoading(false);
        const { latitude, longitude } = pos.coords;
        handleSelectSatrad({
          id: "GPS",
          idLabel: "GPS LOKAL",
          name: "Posisi Pengguna",
          lat: latitude,
          lng: longitude
        });
      },
      (err) => {
        setGpsLoading(false);
        setGpsError(`Gagal mendapatkan GPS: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // Fetch live ADS-B flights periodically
  useEffect(() => {
    const fetchFlights = async () => {
      try {
        const currentSatrad = satradCoordsRef.current;
        const res = await fetch(`/api/flights?lat=${currentSatrad.lat}&lng=${currentSatrad.lng}&satradId=${currentSatrad.id}&name=${encodeURIComponent(currentSatrad.name)}`);
        const data = await res.json();
        if (data.success && Array.isArray(data.flights)) {
          setFlights(data.flights);
          setAdsbStatus("LIVE");
          setAdsbCount(data.flights.length);
        }
      } catch (err) {
        setAdsbStatus("ERROR");
      }
    };

    fetchFlights();
    const interval = setInterval(fetchFlights, 4000);
    return () => clearInterval(interval);
  }, [satradCoords.id]);

  // Render aircraft markers on Leaflet map
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    const currentMarkers = flightMarkersMapRef.current;
    const currentPaths = flightHistoryPathsRef.current;
    const activeIds = new Set<string>();

    if (showRadarData) {
      flights.forEach((f) => {
        activeIds.add(f.id);
        const isSelected = selectedFlight?.id === f.id;
        const isMil = f.type === 'military';
        const color = isMil ? '#ff3333' : '#00f3ff';

        // Marker HTML
        const iconHtml = `
          <div class="relative flex items-center justify-center w-6 h-6">
            ${isSelected ? `<div class="absolute w-10 h-10 rounded-full border-2 border-amber-400 animate-ping opacity-75"></div>` : ''}
            <div class="w-5 h-5 rounded-full bg-[#050811]/90 border-[1.5px] flex items-center justify-center shadow-[0_0_8px_${color}]" style="border-color: ${color}; transform: rotate(${f.heading}deg);">
              <i class="fa-solid fa-plane text-[10px]" style="color: ${color};"></i>
            </div>
            ${showLabels ? `
              <div class="absolute left-7 top-0 bg-[#050811]/90 border border-[${color}]/40 px-1.5 py-0.5 rounded text-[9px] font-mono-military text-[${color}] whitespace-nowrap shadow">
                ${f.callsign} <span class="opacity-75">(${Math.round(f.altitude / 100)}FL)</span>
              </div>
            ` : ''}
          </div>
        `;

        const icon = L.divIcon({
          html: iconHtml,
          className: 'aircraft-marker-node',
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });

        if (currentMarkers[f.id]) {
          const m = currentMarkers[f.id];
          m.setLatLng([f.lat, f.lng]);
          m.setIcon(icon);
        } else {
          const marker = L.marker([f.lat, f.lng], { icon }).addTo(map);
          marker.on('click', () => {
            setSelectedFlight(f);
          });
          currentMarkers[f.id] = marker;
        }

        // History trail polyline
        if (f.history && f.history.length > 1) {
          if (currentPaths[f.id]) {
            currentPaths[f.id].setLatLngs(f.history);
          } else {
            const polyline = L.polyline(f.history, {
              color: color,
              weight: 1.5,
              opacity: 0.4,
              dashArray: '2, 4'
            }).addTo(map);
            currentPaths[f.id] = polyline;
          }
        }
      });
    }

    // Remove stale markers & paths
    Object.keys(currentMarkers).forEach((id) => {
      if (!activeIds.has(id)) {
        currentMarkers[id].remove();
        delete currentMarkers[id];
        if (currentPaths[id]) {
          currentPaths[id].remove();
          delete currentPaths[id];
        }
      }
    });

  }, [flights, selectedFlight, showRadarData, showLabels]);

  // Send AI Tactical query
  const handleSendAiQuery = async (customPrompt?: string) => {
    const promptText = customPrompt || chatInput;
    if (!promptText.trim()) return;

    const userMsg = { sender: "user" as const, text: promptText, timestamp: timeLocal || "WIB" };
    setChatLogs(prev => [...prev, userMsg]);
    if (!customPrompt) setChatInput("");
    setIsAiLoading(true);

    try {
      const res = await fetch('/api/tactical-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: promptText,
          activeFlights: flights
        })
      });
      const data = await res.json();
      const aiResponseText = data.text || "Tidak ada respons dari pusat intelijen AI.";
      setChatLogs(prev => [...prev, { sender: "ai", text: aiResponseText, timestamp: timeLocal || "WIB" }]);
    } catch (err) {
      setChatLogs(prev => [...prev, { sender: "ai", text: "Kesalahan komunikasi dengan modul AI taktikal.", timestamp: timeLocal || "WIB" }]);
    } finally {
      setIsAiLoading(false);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
      setIsFullscreen(false);
    }
  };

  const filteredFlights = flights.filter(f => {
    const matchesSearch = f.callsign.toLowerCase().includes(searchFilter.toLowerCase()) || f.name.toLowerCase().includes(searchFilter.toLowerCase());
    const matchesType = flightTypeFilter === 'all' || f.type === flightTypeFilter;
    return matchesSearch && matchesType;
  });

  return (
    <div className="relative w-screen h-[100dvh] bg-[#050811] text-[#00f3ff] overflow-hidden flex flex-col font-mono-military select-none">
      
      {/* ================= TOP BAR (Ultra-slim, Glassmorphism, 48px max) ================= */}
      <header className="h-12 bg-[#050811]/85 backdrop-blur-md border-b border-[#00f3ff]/25 px-3 flex items-center justify-between z-[1000] shrink-0">
        <div className="flex items-center space-x-2">
          <div className="w-7 h-7 bg-[#00f3ff]/10 border border-[#00f3ff]/40 flex items-center justify-center rounded">
            <Radar className="w-4 h-4 text-[#00f3ff] animate-spin" style={{ animationDuration: '8s' }} />
          </div>
          <div>
            <h1 className="text-xs font-bold font-heading-navy tracking-wider text-white flex items-center gap-1.5">
              <span>MATA-X</span>
              <span className="text-[10px] px-1.5 py-0.2 bg-[#00f3ff]/25 text-[#00f3ff] rounded font-mono">DISKOMLEKAU</span>
            </h1>
          </div>
        </div>

        {/* Center Station / Live Status Badge */}
        <div className="hidden sm:flex items-center space-x-3 text-[11px] bg-[#0b1325]/90 border border-[#00f3ff]/30 px-3 py-1 rounded">
          <div className="flex items-center space-x-1.5">
            <span className={`w-2 h-2 rounded-full ${adsbStatus === 'LIVE' ? 'bg-[#00ff66] animate-pulse' : 'bg-red-500'}`}></span>
            <span className="text-white font-semibold">{satradCoords.id} {satradCoords.name.toUpperCase()}</span>
          </div>
          <span className="text-[#00f3ff]/40">|</span>
          <span className="text-[#00ff66] font-bold">{adsbCount} Target Live</span>
          <span className="text-[#00f3ff]/40">|</span>
          <span className="text-[#00f3ff]/80">{timeZulu}</span>
        </div>

        {/* Top Right Controls */}
        <div className="flex items-center space-x-1.5">
          <button 
            onClick={() => setIsMuted(!isMuted)} 
            className="w-8 h-8 rounded bg-[#0b1325] border border-[#00f3ff]/30 flex items-center justify-center text-[#00f3ff] hover:bg-[#00f3ff]/20 transition"
            title={isMuted ? "Unmute Audio" : "Mute Audio"}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button 
            onClick={toggleFullscreen} 
            className="w-8 h-8 rounded bg-[#0b1325] border border-[#00f3ff]/30 flex items-center justify-center text-[#00f3ff] hover:bg-[#00f3ff]/20 transition"
            title="Fullscreen Mode"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* ================= MAIN MAP CONTAINER (100% Fullscreen Focus) ================= */}
      <div className="relative flex-1 w-full h-full overflow-hidden">
        <div ref={mapContainerRef} className="absolute inset-0 w-full h-full z-0 touch-none" style={{ touchAction: 'none' }} />

        {/* ================= FLOATING ACTION BUTTONS (FABs - Thumb Friendly) ================= */}
        <div className="absolute right-3 bottom-20 sm:bottom-6 z-[900] flex flex-col space-y-2.5">
          {/* Settings / Map & Satrad Drawer */}
          <button 
            onClick={() => setActiveDrawer('settings')}
            className="w-12 h-12 rounded-full bg-[#0b1325]/95 border-2 border-[#00f3ff]/50 text-[#00f3ff] flex items-center justify-center shadow-[0_0_15px_rgba(0,243,255,0.3)] hover:scale-105 active:scale-95 transition"
            title="Pengaturan Peta & SATRAD"
          >
            <Settings className="w-5 h-5" />
          </button>

          {/* Flight Data / Target List Bottom Sheet */}
          <button 
            onClick={() => setActiveDrawer('flights')}
            className="w-12 h-12 rounded-full bg-[#0b1325]/95 border-2 border-[#00f3ff]/50 text-[#00f3ff] flex items-center justify-center shadow-[0_0_15px_rgba(0,243,255,0.3)] hover:scale-105 active:scale-95 transition relative"
            title="Daftar Target Pesawat"
          >
            <Plane className="w-5 h-5" />
            {adsbCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-[#00ff66] text-[#050811] text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center border border-[#050811]">
                {adsbCount > 99 ? '99+' : adsbCount}
              </span>
            )}
          </button>

          {/* AI Tactical Assistant */}
          <button 
            onClick={() => setActiveDrawer('ai')}
            className="w-12 h-12 rounded-full bg-[#0b1325]/95 border-2 border-[#00ff66]/60 text-[#00ff66] flex items-center justify-center shadow-[0_0_15px_rgba(0,255,102,0.3)] hover:scale-105 active:scale-95 transition"
            title="Asisten Intelijen Taktis AI"
          >
            <Sparkles className="w-5 h-5" />
          </button>

          {/* Recenter Map to Satrad / GPS */}
          <button 
            onClick={() => {
              if (mapRef.current) {
                if (satradCoords.id === "ALL") {
                  mapRef.current.setView([-2.0, 118.0], 5);
                } else {
                  mapRef.current.setView([satradCoords.lat, satradCoords.lng], 9);
                }
              }
              playSiren(1200, 0.1);
            }}
            className="w-12 h-12 rounded-full bg-[#0b1325]/95 border-2 border-amber-400/60 text-amber-400 flex items-center justify-center shadow-[0_0_15px_rgba(251,191,36,0.3)] hover:scale-105 active:scale-95 transition"
            title="Pusatkan Radar"
          >
            <Compass className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Overlay Status Pill Top Left */}
        <div className="absolute top-3 left-3 z-[850] pointer-events-none flex items-center space-x-2">
          <div className="bg-[#050811]/90 border border-[#00f3ff]/30 px-3 py-1.5 rounded-md backdrop-blur-sm text-[11px] shadow-lg flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-[#00f3ff] animate-ping"></span>
            <span className="text-white font-bold">{satradCoords.id}</span>
            <span className="text-[#00f3ff]/60">|</span>
            <span className="text-[#00ff66] font-semibold">{adsbCount} Target Terdeteksi</span>
          </div>
        </div>

        {/* ================= SELECTED FLIGHT BOTTOM CARD ================= */}
        {selectedFlight && (
          <div className="absolute bottom-3 left-3 right-3 sm:left-4 sm:right-auto sm:w-[420px] bg-[#070c18]/96 border-2 border-[#00f3ff]/50 rounded-lg p-4 z-[950] backdrop-blur-md shadow-[0_0_25px_rgba(0,243,255,0.25)] animate-slide-up">
            <div className="flex items-center justify-between pb-2 mb-3 border-b border-[#00f3ff]/20">
              <div className="flex items-center space-x-2">
                <div className={`w-7 h-7 rounded flex items-center justify-center ${selectedFlight.type === 'military' ? 'bg-red-500/20 text-red-400 border border-red-500/50' : 'bg-[#00f3ff]/20 text-[#00f3ff] border border-[#00f3ff]/50'}`}>
                  <Plane className="w-4 h-4" style={{ transform: `rotate(${selectedFlight.heading}deg)` }} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white tracking-wide">{selectedFlight.callsign}</h3>
                  <p className="text-[10px] text-[#00f3ff]/70">{selectedFlight.name}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedFlight(null)}
                className="w-7 h-7 rounded bg-[#0b1325] border border-[#00f3ff]/30 flex items-center justify-center text-[#00f3ff] hover:bg-red-500/20 hover:text-red-400 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 text-[11px] mb-3">
              <div className="bg-[#0b1325]/80 p-2 rounded border border-[#00f3ff]/15">
                <span className="block text-[9px] text-[#00f3ff]/60">ALTITUDE</span>
                <span className="text-white font-bold">{selectedFlight.altitude.toLocaleString()} FT</span>
              </div>
              <div className="bg-[#0b1325]/80 p-2 rounded border border-[#00f3ff]/15">
                <span className="block text-[9px] text-[#00f3ff]/60">GROUND SPEED</span>
                <span className="text-white font-bold">{selectedFlight.speed} KTS</span>
              </div>
              <div className="bg-[#0b1325]/80 p-2 rounded border border-[#00f3ff]/15">
                <span className="block text-[9px] text-[#00f3ff]/60">HEADING</span>
                <span className="text-white font-bold">{selectedFlight.heading}°</span>
              </div>
              <div className="bg-[#0b1325]/80 p-2 rounded border border-[#00f3ff]/15">
                <span className="block text-[9px] text-[#00f3ff]/60">SQUAWK</span>
                <span className="text-amber-400 font-bold">{selectedFlight.squawk}</span>
              </div>
              <div className="bg-[#0b1325]/80 p-2 rounded border border-[#00f3ff]/15">
                <span className="block text-[9px] text-[#00f3ff]/60">JARAK SATRAD</span>
                <span className="text-white font-bold">{getDistanceNM(satradCoords.lat, satradCoords.lng, selectedFlight.lat, selectedFlight.lng).toFixed(1)} NM</span>
              </div>
              <div className="bg-[#0b1325]/80 p-2 rounded border border-[#00f3ff]/15">
                <span className="block text-[9px] text-[#00f3ff]/60">AZIMUT</span>
                <span className="text-white font-bold">{getBearingDeg(satradCoords.lat, satradCoords.lng, selectedFlight.lat, selectedFlight.lng).toFixed(0)}°</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex gap-2">
                <button 
                  onClick={() => {
                    if (mapRef.current) {
                      mapRef.current.setView([selectedFlight.lat, selectedFlight.lng], 11);
                    }
                  }}
                  className="flex-1 py-2 bg-[#00f3ff]/20 border border-[#00f3ff]/50 rounded text-xs font-bold text-white hover:bg-[#00f3ff]/30 transition flex items-center justify-center gap-1.5"
                >
                  <Compass className="w-3.5 h-3.5 text-[#00f3ff]" />
                  <span>Pusatkan Peta</span>
                </button>
                <button 
                  onClick={() => {
                    setActiveDrawer('ai');
                    handleSendAiQuery(`Analisis taktis target pesawat ${selectedFlight.callsign} (${selectedFlight.name}) di posisi Lat ${selectedFlight.lat}, Lng ${selectedFlight.lng}, Alt ${selectedFlight.altitude}ft, Spd ${selectedFlight.speed}kts.`);
                  }}
                  className="flex-1 py-2 bg-[#00ff66]/20 border border-[#00ff66]/50 rounded text-xs font-bold text-white hover:bg-[#00ff66]/30 transition flex items-center justify-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#00ff66]" />
                  <span>Analisis AI</span>
                </button>
              </div>
              {satradCoords.id !== "ALL" && (
                <button 
                  onClick={() => setShowRangeBearingLine(!showRangeBearingLine)}
                  className={`w-full py-2 rounded text-xs font-bold transition flex items-center justify-center gap-1.5 border ${showRangeBearingLine ? 'bg-amber-500/30 border-amber-400 text-amber-300' : 'bg-[#0b1325] border-[#00f3ff]/40 text-[#00f3ff] hover:bg-[#00f3ff]/20'}`}
                >
                  <RulerIcon className="w-3.5 h-3.5" />
                  <span>{showRangeBearingLine ? 'Sembunyikan Range Bearing' : 'Range Bearing (Center ➔ Target)'}</span>
                </button>
              )}
            </div>
          </div>
        )}

      </div>

      {/* ================= DRAWERS / MODAL BOTTOM SHEETS ================= */}

      {/* 1. SETTINGS & MAP CONFIG DRAWER */}
      {activeDrawer === 'settings' && (
        <div className="fixed inset-0 z-[1100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center sm:justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-lg bg-[#070c18] border-t sm:border border-[#00f3ff]/40 rounded-t-xl sm:rounded-xl max-h-[85dvh] flex flex-col shadow-2xl">
            <div className="p-4 border-b border-[#00f3ff]/25 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Settings className="w-5 h-5 text-[#00f3ff]" />
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">NAVIGASI UTAMA & PENGATURAN RADAR</h2>
              </div>
              <button onClick={() => setActiveDrawer('none')} className="w-8 h-8 rounded bg-[#0b1325] text-[#00f3ff] flex items-center justify-center hover:bg-red-500/20 hover:text-red-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4 text-xs">
              {/* SATRAD Selector */}
              <div>
                <label className="block text-[11px] text-[#00f3ff]/70 font-bold mb-1.5">PILIH STASIUN RADAR (SATRAD) / NASIONAL</label>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={() => handleSelectSatrad({ id: "ALL", idLabel: "ALL", name: "Jaringan Operasi Nasional", lat: -2.0, lng: 118.0 })}
                    className={`p-2.5 rounded border text-left transition ${satradCoords.id === 'ALL' ? 'bg-[#00f3ff]/25 border-[#00f3ff] text-white font-bold' : 'bg-[#0b1325] border-[#00f3ff]/20 text-[#00f3ff]/80 hover:bg-[#00f3ff]/10'}`}
                  >
                    <span className="block text-[10px] opacity-75">NASIONAL</span>
                    <span className="font-bold">SELURUH SATRAD</span>
                  </button>
                  {SATRADS.slice(0, 5).map(s => (
                    <button 
                      key={s.id}
                      onClick={() => handleSelectSatrad(s)}
                      className={`p-2.5 rounded border text-left transition ${satradCoords.id === s.idLabel ? 'bg-[#00f3ff]/25 border-[#00f3ff] text-white font-bold' : 'bg-[#0b1325] border-[#00f3ff]/20 text-[#00f3ff]/80 hover:bg-[#00f3ff]/10'}`}
                    >
                      <span className="block text-[10px] opacity-75">{s.idLabel}</span>
                      <span className="font-bold truncate">{s.name}</span>
                    </button>
                  ))}
                </div>
                <button 
                  onClick={() => setActiveDrawer('satrad')}
                  className="w-full mt-2 py-2 bg-[#0b1325] border border-[#00f3ff]/40 rounded text-center text-[#00f3ff] font-bold hover:bg-[#00f3ff]/15 transition"
                >
                  Lihat Seluruh 20+ Stasiun Satrad...
                </button>
              </div>

              {/* GPS Local */}
              <div className="p-3 bg-[#0b1325] rounded border border-[#00f3ff]/20 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-white">GPS Perangkat Lokal</h4>
                  <p className="text-[10px] text-[#00f3ff]/60">Gunakan posisi GPS HP/Tablet Anda sebagai pusat radar</p>
                  {gpsError && <p className="text-[10px] text-red-400 mt-1">{gpsError}</p>}
                </div>
                <button 
                  onClick={handleGpsLocation}
                  disabled={gpsLoading}
                  className="px-3 py-2 bg-[#00f3ff]/20 border border-[#00f3ff]/50 rounded text-white font-bold hover:bg-[#00f3ff]/30 transition disabled:opacity-50"
                >
                  {gpsLoading ? 'Mencari...' : 'Aktifkan GPS'}
                </button>
              </div>

              {/* CARTO Basemap Styles */}
              <div>
                <label className="block text-[11px] text-[#00f3ff]/70 font-bold mb-1.5">GAYA PETA DIGITAL (CARTO BASEMAP)</label>
                <div className="grid grid-cols-2 gap-2">
                  {CARTO_STYLE_OPTIONS.map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => setCartoStyle(opt.id)}
                      className={`p-2.5 rounded border text-left transition ${cartoStyle === opt.id ? 'bg-[#00f3ff]/25 border-[#00f3ff] text-white' : 'bg-[#0b1325] border-[#00f3ff]/20 text-[#00f3ff]/80'}`}
                    >
                      <span className="block font-bold text-white">{opt.label}</span>
                      <span className="text-[10px] opacity-70">{opt.sublabel}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Toggle Layer Switches */}
              <div>
                <label className="block text-[11px] text-[#00f3ff]/70 font-bold mb-1.5">VISIBILITAS LAPISAN (LAYERS)</label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center space-x-2 p-2 bg-[#0b1325] rounded border border-[#00f3ff]/20 cursor-pointer">
                    <input type="checkbox" checked={showRadarData} onChange={e => setShowRadarData(e.target.checked)} className="accent-[#00f3ff]" />
                    <span>Plot Target Radar</span>
                  </label>
                  <label className="flex items-center space-x-2 p-2 bg-[#0b1325] rounded border border-[#00f3ff]/20 cursor-pointer">
                    <input type="checkbox" checked={showLabels} onChange={e => setShowLabels(e.target.checked)} className="accent-[#00f3ff]" />
                    <span>Label Callsign</span>
                  </label>
                  <label className="flex items-center space-x-2 p-2 bg-[#0b1325] rounded border border-[#00f3ff]/20 cursor-pointer">
                    <input type="checkbox" checked={showRangeCircles} onChange={e => setShowRangeCircles(e.target.checked)} className="accent-[#00f3ff]" />
                    <span>Ring Jarak (NM)</span>
                  </label>
                  <label className="flex items-center space-x-2 p-2 bg-[#0b1325] rounded border border-[#00f3ff]/20 cursor-pointer">
                    <input type="checkbox" checked={showGeoref} onChange={e => setShowGeoref(e.target.checked)} className="accent-[#00f3ff]" />
                    <span>Grid GEOREF</span>
                  </label>
                </div>
              </div>

              {/* PWA Install Button */}
              {deferredPrompt && (
                <div className="p-3 bg-gradient-to-r from-[#00f3ff]/20 to-[#00ff66]/20 rounded border border-[#00f3ff]/50 flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-white">Instal Aplikasi MATA-X</h4>
                    <p className="text-[10px] text-[#00f3ff]/80">Tambahkan ke Layar Utama perangkat Anda untuk akses fullscreen mandiri.</p>
                  </div>
                  <button 
                    onClick={handleInstallPwa}
                    className="px-3 py-2 bg-[#00f3ff] text-[#050811] font-bold rounded shadow hover:bg-[#00f3ff]/80 transition flex items-center gap-1.5"
                  >
                    <Download className="w-4 h-4" />
                    <span>Instal</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. ALL SATRADS SELECTION MODAL */}
      {activeDrawer === 'satrad' && (
        <div className="fixed inset-0 z-[1150] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-[#070c18] border border-[#00f3ff]/50 rounded-xl max-h-[85dvh] flex flex-col shadow-2xl">
            <div className="p-4 border-b border-[#00f3ff]/25 flex items-center justify-between">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">DAFTAR SELURUH SATRAD DISKOMLEKAU (20+ STASIUN)</h2>
              <button onClick={() => setActiveDrawer('settings')} className="w-8 h-8 rounded bg-[#0b1325] text-[#00f3ff] flex items-center justify-center hover:bg-red-500/20 hover:text-red-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {SATRADS.map(s => (
                <button
                  key={s.id}
                  onClick={() => handleSelectSatrad(s)}
                  className={`p-3 rounded border text-left transition flex items-center justify-between ${satradCoords.id === s.idLabel ? 'bg-[#00f3ff]/25 border-[#00f3ff] text-white' : 'bg-[#0b1325] border-[#00f3ff]/20 text-[#00f3ff]/80 hover:bg-[#00f3ff]/10'}`}
                >
                  <div>
                    <span className="text-[10px] text-[#00f3ff]/60 font-bold">{s.idLabel} — {s.sector}</span>
                    <h4 className="font-bold text-white text-sm">{s.name}</h4>
                    <span className="text-[10px] text-[#00f3ff]/70">{s.dmsLat}, {s.dmsLng}</span>
                  </div>
                  <Radio className="w-4 h-4 text-[#00f3ff]" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 3. FLIGHT DATA / TARGET LIST BOTTOM SHEET */}
      {activeDrawer === 'flights' && (
        <div className="fixed inset-0 z-[1100] bg-black/60 backdrop-blur-sm flex items-end justify-center p-0">
          <div className="w-full sm:max-w-xl bg-[#070c18] border-t border-[#00f3ff]/40 rounded-t-2xl max-h-[80dvh] flex flex-col shadow-2xl animate-slide-up">
            <div className="p-4 border-b border-[#00f3ff]/25 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Plane className="w-5 h-5 text-[#00f3ff]" />
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">DAFTAR TARGET PESAWAT ({filteredFlights.length})</h2>
              </div>
              <button onClick={() => setActiveDrawer('none')} className="w-8 h-8 rounded bg-[#0b1325] text-[#00f3ff] flex items-center justify-center hover:bg-red-500/20 hover:text-red-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search and Filters */}
            <div className="p-3 border-b border-[#00f3ff]/15 flex gap-2">
              <input 
                type="text" 
                placeholder="Cari callsign atau maskapai..." 
                value={searchFilter}
                onChange={e => setSearchFilter(e.target.value)}
                className="flex-1 bg-[#0b1325] border border-[#00f3ff]/30 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#00f3ff]"
              />
              <select 
                value={flightTypeFilter} 
                onChange={(e: any) => setFlightTypeFilter(e.target.value)}
                className="bg-[#0b1325] border border-[#00f3ff]/30 rounded px-2 py-1.5 text-xs text-[#00f3ff] focus:outline-none"
              >
                <option value="all">Semua Tipe</option>
                <option value="military">Militer</option>
                <option value="civilian">Sipil</option>
              </select>
            </div>

            {/* Flight List */}
            <div className="p-3 overflow-y-auto space-y-2 text-xs flex-1">
              {filteredFlights.length === 0 ? (
                <div className="text-center py-10 text-[#00f3ff]/50">
                  <Radar className="w-10 h-10 mx-auto mb-2 opacity-40 animate-spin" style={{ animationDuration: '6s' }} />
                  <p>Menunggu Data / 0 Target aktif dalam cakupan sensor saat ini.</p>
                </div>
              ) : (
                filteredFlights.map(f => (
                  <div 
                    key={f.id}
                    onClick={() => {
                      setSelectedFlight(f);
                      setActiveDrawer('none');
                      if (mapRef.current) {
                        mapRef.current.setView([f.lat, f.lng], 11);
                      }
                    }}
                    className="p-3 bg-[#0b1325]/90 border border-[#00f3ff]/20 rounded hover:border-[#00f3ff] transition cursor-pointer flex items-center justify-between"
                  >
                    <div className="flex items-center space-x-3">
                      <div className={`w-8 h-8 rounded flex items-center justify-center ${f.type === 'military' ? 'bg-red-500/20 text-red-400 border border-red-500/40' : 'bg-[#00f3ff]/20 text-[#00f3ff] border border-[#00f3ff]/40'}`}>
                        <Plane className="w-4 h-4" style={{ transform: `rotate(${f.heading}deg)` }} />
                      </div>
                      <div>
                        <h4 className="font-bold text-white text-sm">{f.callsign}</h4>
                        <p className="text-[10px] text-[#00f3ff]/70 truncate max-w-[180px] sm:max-w-xs">{f.name}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="block text-xs font-bold text-white">{f.altitude.toLocaleString()} FT</span>
                      <span className="text-[10px] text-[#00f3ff]/70">{f.speed} KTS</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. AI TACTICAL ASSISTANT DRAWER */}
      {activeDrawer === 'ai' && (
        <div className="fixed inset-0 z-[1100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center sm:justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-xl bg-[#070c18] border-t sm:border border-[#00ff66]/40 rounded-t-2xl sm:rounded-xl max-h-[85dvh] flex flex-col shadow-2xl">
            <div className="p-4 border-b border-[#00ff66]/25 flex items-center justify-between bg-[#00ff66]/10">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-5 h-5 text-[#00ff66]" />
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">ASISTEN INTELIJEN TAKTIS MATA-X AI</h2>
              </div>
              <button onClick={() => setActiveDrawer('none')} className="w-8 h-8 rounded bg-[#0b1325] text-[#00ff66] flex items-center justify-center hover:bg-red-500/20 hover:text-red-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 overflow-y-auto space-y-3 flex-1 text-xs">
              {chatLogs.map((log, idx) => (
                <div key={idx} className={`p-3 rounded-lg border ${log.sender === 'user' ? 'bg-[#0b1325] border-[#00f3ff]/30 ml-6 text-white' : 'bg-[#050811] border-[#00ff66]/30 mr-6 text-[#00ff66]'}`}>
                  <div className="flex items-center justify-between text-[10px] opacity-60 mb-1">
                    <span className="font-bold">{log.sender === 'user' ? 'OPERATOR' : 'MATA-X AI'}</span>
                    <span>{log.timestamp}</span>
                  </div>
                  <p className="whitespace-pre-wrap leading-relaxed">{log.text}</p>
                </div>
              ))}
              {isAiLoading && (
                <div className="p-3 rounded-lg border bg-[#050811] border-[#00ff66]/30 mr-6 text-[#00ff66] animate-pulse">
                  Menganalisis data intelijen radar live...
                </div>
              )}
            </div>

            <div className="p-3 border-t border-[#00ff66]/20 bg-[#050811] flex gap-2">
              <input 
                type="text" 
                placeholder="Tanyakan analisis situasi udara..." 
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendAiQuery()}
                className="flex-1 bg-[#0b1325] border border-[#00ff66]/30 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00ff66]"
              />
              <button 
                onClick={() => handleSendAiQuery()}
                disabled={isAiLoading}
                className="px-4 py-2 bg-[#00ff66] text-[#050811] font-bold rounded hover:bg-[#00ff66]/80 transition flex items-center justify-center"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
