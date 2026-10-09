import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Bus, Navigation, ShieldCheck, AlertTriangle, LogOut } from 'lucide-react';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// UI ONLY: restyled bus marker (pulse ring + amber badge)
const busIcon = new L.DivIcon({
  html: `<div class="ob-bus-marker"><span class="ob-bus-pulse"></span><span class="ob-bus-core">🚌</span></div>`,
  className: '',
  iconSize: [40, 40],
  iconAnchor: [20, 20]
});

const API_BASE_URL = 'http://localhost:5000/api';

// Road routing (OSRM public demo server: fine for dev/light use; self-host or use a paid provider for production)
const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving';
const FALLBACK_SPEED_KMH = 30; // used when the bus has no recent moving speed
const MOVING_KMH = 5;          // below this we treat the bus as stopped (ignore for averaging)
const OFF_ROUTE_KM = 0.3;      // bus farther than this from the route -> straight-line ETA

// Session persistence (per browser tab; cleared when the tab closes)
const readStore = (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } };
const writeStore = (k, v) => { try { if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) {} };

// Login sessions hold a signed token from the server; expired tokens are dropped on load
function loadSession(key) {
  try {
    const s = JSON.parse(readStore(key));
    if (!s || !s.token) return null;
    const payload = JSON.parse(atob(s.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.exp * 1000 < Date.now()) { writeStore(key, null); return null; }
    return s;
  } catch (e) { return null; }
}

// fetch with the login token attached; calls onExpire when the server rejects it (401)
async function authedFetch(url, options, token, onExpire) {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  });
  if (res.status === 401 && onExpire) onExpire();
  return res;
}

// --- HAVERSINE ETA HELPERS ---
function calculateDistanceKM(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatETA(distanceKM, speedKMH) {
  const timeInMinutes = Math.round((distanceKM / speedKMH) * 60);
  if (timeInMinutes <= 1) return 'Arriving Now';
  return `~${timeInMinutes} mins (${distanceKM.toFixed(1)} km away)`;
}

function calculateETA(busLat, busLng, stopLat, stopLng, speedKMH = FALLBACK_SPEED_KMH) {
  if (!busLat || !busLng || !stopLat || !stopLng) return 'N/A';
  return formatETA(calculateDistanceKM(busLat, busLng, stopLat, stopLng), speedKMH);
}

// Adds intermediate points on long straight segments so "nearest point" tracking is accurate
function densifyPath(points, stepKM = 0.05) {
  const out = [];
  for (let i = 0; i < points.length; i++) {
    out.push(points[i]);
    if (i === points.length - 1) break;
    const [a, b] = [points[i], points[i + 1]];
    const n = Math.ceil(calculateDistanceKM(a[0], a[1], b[0], b[1]) / stepKM);
    for (let k = 1; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}

// UI ONLY: all styling lives here
const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700;800&family=DM+Sans:wght@400;500;600;700&display=swap');
.ob { --ink:#0c1a2b; --ink-2:#16293f; --paper:#f4f6f8; --card:#ffffff; --line:#dbe2ea; --text:#12202f; --muted:#5b6b7d;
  --amber:#f5a623; --amber-d:#b86e00; --teal:#0e7c86; --teal-l:#e3f4f5; --ok:#15803d; --ok-l:#dcfce7; --bad:#b91c1c; --bad-l:#fee2e2;
  font-family:'DM Sans',system-ui,sans-serif; background:var(--paper); color:var(--text); min-height:100vh; padding:24px; box-sizing:border-box; }
.ob *, .ob *::before, .ob *::after { box-sizing:border-box; }
.ob h1,.ob h2,.ob h3,.ob h4 { font-family:'Bricolage Grotesque','DM Sans',sans-serif; letter-spacing:-0.01em; }
.ob-wrap { max-width:1120px; margin:0 auto; }
.ob-header { display:flex; align-items:center; justify-content:space-between; gap:16px; background:var(--ink); color:#fff; padding:20px 28px; border-radius:16px 16px 0 0; border-bottom:4px solid var(--amber); }
.ob-brand { display:flex; align-items:center; gap:14px; }
.ob-logo { width:46px; height:46px; border-radius:12px; background:var(--amber); color:var(--ink); display:grid; place-items:center; }
.ob-header h1 { margin:0; font-size:22px; font-weight:800; }
.ob-header p { margin:2px 0 0; font-size:13px; color:#9db0c4; }
.ob-main { background:var(--card); border:1px solid var(--line); border-top:none; border-radius:0 0 16px 16px; overflow:hidden; box-shadow:0 12px 32px -16px rgba(12,26,43,.25); }
.ob-tabs { display:flex; background:var(--ink-2); }
.ob-tab { flex:1; display:flex; align-items:center; justify-content:center; gap:8px; padding:15px 12px; border:none; background:transparent; color:#b4c3d3; font:600 15px 'DM Sans',sans-serif; cursor:pointer; border-bottom:3px solid transparent; transition:color .15s, background .15s; }
.ob-tab:hover { color:#fff; background:rgba(255,255,255,.06); }
.ob-tab.on { background:var(--card); color:var(--ink); border-bottom-color:var(--amber); }
.ob-tab:focus-visible, .ob button:focus-visible, .ob input:focus-visible, .ob select:focus-visible { outline:3px solid var(--amber); outline-offset:2px; }
.ob-body { padding:28px; }
.ob-toolbar { display:flex; align-items:center; gap:12px; margin-bottom:20px; flex-wrap:wrap; }
.ob-toolbar label { font-weight:700; color:var(--text); }
.ob-select { padding:10px 14px; border-radius:10px; border:1.5px solid var(--line); background:#fff; color:var(--text); font:600 14px 'DM Sans',sans-serif; min-width:220px; }
.ob-grid { display:grid; grid-template-columns:2fr 1fr; gap:22px; }
.ob-map { height:460px; border-radius:14px; overflow:hidden; border:1px solid var(--line); }
.ob-status { padding:18px; border-radius:14px; background:var(--teal-l); border:1px solid #b6e0e3; margin-bottom:16px; }
.ob-live { display:inline-flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:var(--teal); }
.ob-live i { width:9px; height:9px; border-radius:50%; background:var(--ok); box-shadow:0 0 0 0 rgba(21,128,61,.6); animation:ob-ping 1.8s infinite; }
.ob-status h3 { margin:6px 0 4px; font-size:19px; color:var(--ink); }
.ob-status p { margin:0; font-size:14px; color:#25555a; }
.ob-stops { padding:18px; border-radius:14px; background:var(--paper); border:1px solid var(--line); max-height:290px; overflow-y:auto; }
.ob-stops h4 { margin:0 0 12px; font-size:16px; color:var(--ink); }
.ob-stop { position:relative; padding:10px 12px 10px 42px; background:#fff; border-radius:10px; border:1px solid var(--line); margin-bottom:8px; }
.ob-stop-n { position:absolute; left:10px; top:11px; width:22px; height:22px; border-radius:50%; background:var(--ink); color:#fff; font-size:12px; font-weight:700; display:grid; place-items:center; }
.ob-stop-row { display:flex; justify-content:space-between; align-items:center; gap:8px; }
.ob-stop-name { font-weight:600; color:var(--text); }
.ob-stop-sched { font-size:12px; color:var(--muted); white-space:nowrap; }
.ob-eta { margin-top:3px; font-size:13px; font-weight:700; color:var(--amber-d); }
.ob-eta.passed { color:var(--muted); font-weight:600; }
.ob-stop.passed { opacity:.55; }
.ob-stop.next { border-color:var(--amber); box-shadow:0 0 0 2px rgba(245,166,35,.25); }
.ob-note { margin:-6px 0 12px; font-size:12px; color:var(--muted); }
.ob-empty { padding:48px 24px; text-align:center; background:#fff7ed; border:1.5px dashed #f3c48a; border-radius:14px; }
.ob-empty h3 { margin:12px 0 6px; color:#7c3a00; font-size:20px; }
.ob-empty p { margin:0; color:#8a5a2b; }
.ob-card { max-width:440px; margin:16px auto; padding:30px; border:1px solid var(--line); border-radius:16px; background:#fff; box-shadow:0 8px 24px -14px rgba(12,26,43,.3); }
.ob-card h3 { margin:0 0 18px; font-size:22px; color:var(--ink); }
.ob-input { width:100%; padding:12px 14px; margin-bottom:12px; border-radius:10px; border:1.5px solid var(--line); background:#fff; color:var(--text); font:500 15px 'DM Sans',sans-serif; }
.ob-input:focus { border-color:var(--teal); }
.ob-btn { width:100%; padding:13px; border:none; border-radius:10px; background:var(--ink); color:#fff; font:700 15px 'DM Sans',sans-serif; cursor:pointer; margin-top:6px; transition:background .15s; }
.ob-btn:hover { background:var(--ink-2); }
.ob-btn.amber { background:var(--amber); color:var(--ink); }
.ob-btn.amber:hover { background:#e29412; }
.ob-session { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:22px; padding-bottom:14px; border-bottom:1px solid var(--line); font-size:14px; color:var(--muted); }
.ob-session strong { color:var(--ink); }
.ob-logout { display:flex; align-items:center; gap:6px; padding:7px 12px; border:1.5px solid var(--bad); background:#fff; color:var(--bad); border-radius:8px; font:700 12px 'DM Sans',sans-serif; cursor:pointer; transition:background .15s, color .15s; }
.ob-logout:hover { background:var(--bad); color:#fff; }
.ob-broadcast { text-align:center; }
.ob-go { padding:15px 30px; border:none; border-radius:999px; color:#fff; font:700 15px 'DM Sans',sans-serif; cursor:pointer; transition:transform .15s; }
.ob-go:hover { transform:translateY(-1px); }
.ob-go.start { background:var(--ok); }
.ob-go.stop { background:var(--bad); }
.ob-gps { margin-top:22px; display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; }
.ob-gps div { padding:12px 8px; background:var(--paper); border:1px solid var(--line); border-radius:10px; }
.ob-gps small { display:block; font-size:12px; color:var(--muted); margin-bottom:2px; }
.ob-gps strong { font-size:15px; color:var(--ink); }
.ob-admin { display:flex; flex-direction:column; gap:20px; }
.ob-session.box { padding:14px 18px; background:var(--paper); border:1px solid var(--line); border-radius:12px; margin:0; }
.ob-route { border:1px solid var(--line); border-radius:14px; padding:22px; background:#fff; }
.ob-route-head { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:14px; flex-wrap:wrap; }
.ob-route-head h4 { margin:0; font-size:18px; color:var(--ink); }
.ob-route-head small { display:block; margin-top:2px; font-size:13px; color:var(--muted); font-family:'DM Sans',sans-serif; font-weight:500; }
.ob-pill { display:inline-flex; align-items:center; gap:6px; padding:5px 12px; border-radius:999px; font-size:12px; font-weight:700; }
.ob-pill.on { background:var(--ok-l); color:#166534; }
.ob-pill.off { background:var(--bad-l); color:#991b1b; }
.ob-chips { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:18px; }
.ob-chip { display:inline-flex; align-items:center; gap:6px; padding:7px 8px 7px 12px; background:var(--paper); border:1px solid var(--line); border-radius:999px; font-size:13px; color:var(--text); }
.ob-chip button { width:20px; height:20px; border:none; border-radius:50%; background:#fff; color:var(--bad); font-weight:700; line-height:1; cursor:pointer; }
.ob-chip button:hover { background:var(--bad); color:#fff; }
.ob-add { display:flex; gap:8px; flex-wrap:wrap; }
.ob-add .ob-input { margin:0; flex:1 1 140px; }
.ob-add .ob-input.wide { flex:2 1 200px; }
.ob-add .ob-btn { width:auto; margin:0; padding:12px 22px; }
.ob-loading { display:grid; place-items:center; min-height:60vh; color:var(--ink); font:600 18px 'DM Sans',sans-serif; gap:12px; }
.ob-spin { width:34px; height:34px; border-radius:50%; border:4px solid var(--line); border-top-color:var(--amber); animation:ob-rot .8s linear infinite; }
.ob-bus-marker { position:relative; width:40px; height:40px; }
.ob-bus-pulse { position:absolute; inset:0; border-radius:50%; background:rgba(245,166,35,.45); animation:ob-pulse 2s ease-out infinite; }
.ob-bus-core { position:absolute; inset:5px; border-radius:50%; background:#f5a623; border:3px solid #fff; box-shadow:0 4px 10px rgba(0,0,0,.35); display:grid; place-items:center; font-size:15px; }
@keyframes ob-ping { 70% { box-shadow:0 0 0 8px rgba(21,128,61,0); } 100% { box-shadow:0 0 0 0 rgba(21,128,61,0); } }
@keyframes ob-pulse { 0% { transform:scale(.6); opacity:1; } 100% { transform:scale(1.4); opacity:0; } }
@keyframes ob-rot { to { transform:rotate(360deg); } }
@media (max-width:820px) {
  .ob { padding:12px; } .ob-body { padding:16px; } .ob-grid { grid-template-columns:1fr; }
  .ob-map { height:340px; } .ob-tab { flex-direction:column; gap:4px; font-size:12px; padding:12px 6px; }
  .ob-header { padding:16px; } .ob-stops { max-height:none; }
}
@media (prefers-reduced-motion:reduce) { .ob *, .ob-bus-pulse { animation:none !important; transition:none !important; } }
`;

export default function App() {
  const [activeTab, setActiveTab] = useState(() => readStore('onboard_tab') || 'student');
  const [routesData, setRoutesData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRouteId, setSelectedRouteId] = useState(() => readStore('onboard_route') || 'R21');

  const fetchRoutes = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/routes`);
      const data = await response.json();
      if (Array.isArray(data)) {
        setRoutesData(data);
        if (data.length > 0 && !selectedRouteId) setSelectedRouteId(data[0].route_id);
      }
      setLoading(false);
    } catch (err) {
      console.error('Failed to fetch routes:', err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoutes();
    const interval = setInterval(() => fetchRoutes(), 3000);
    return () => clearInterval(interval);
  }, []);

  const routeList = Array.isArray(routesData) ? routesData : [];
  const selectedRoute = routeList.find(r => r.route_id === selectedRouteId) || routeList[0] || { stops: [], current_location: {} };

  // Remember tab + route across refreshes
  useEffect(() => { writeStore('onboard_tab', activeTab); writeStore('onboard_route', selectedRouteId); }, [activeTab, selectedRouteId]);

  // --- ROAD-FOLLOWING PATH (OSRM) ---
  const stopsKey = (selectedRoute.stops || []).map(s => `${s.lng},${s.lat}`).join(';');
  const [roadPaths, setRoadPaths] = useState({});
  const requestedRoads = useRef(new Set());
  useEffect(() => {
    if ((selectedRoute.stops || []).length < 2 || requestedRoads.current.has(stopsKey)) return;
    requestedRoads.current.add(stopsKey);
    fetch(`${OSRM_URL}/${stopsKey}?overview=full&geometries=geojson`)
      .then(r => r.json())
      .then(d => {
        const coords = d && d.routes && d.routes[0] && d.routes[0].geometry.coordinates;
        setRoadPaths(prev => ({ ...prev, [stopsKey]: coords ? coords.map(([lng, lat]) => [lat, lng]) : null }));
      })
      .catch(() => { requestedRoads.current.delete(stopsKey); });
  }, [stopsKey]);
  const roadPath = roadPaths[stopsKey] || null;

  // Path geometry used for along-the-route distance + "stop already passed" detection
  const tracking = useMemo(() => {
    const stops = selectedRoute.stops || [];
    const base = roadPath || densifyPath(stops.map(s => [s.lat, s.lng]));
    if (base.length < 2) return null;
    const cum = [0];
    for (let i = 1; i < base.length; i++) {
      cum.push(cum[i - 1] + calculateDistanceKM(base[i - 1][0], base[i - 1][1], base[i][0], base[i][1]));
    }
    let from = 0;
    const stopIdx = stops.map(s => {
      let best = from, bd = Infinity;
      for (let i = from; i < base.length; i++) {
        const d = calculateDistanceKM(s.lat, s.lng, base[i][0], base[i][1]);
        if (d < bd) { bd = d; best = i; }
      }
      from = best;
      return best;
    });
    return { path: base, cum, stopIdx };
  }, [roadPath, stopsKey]);

  // Smoothed live speed (ignores stopped readings)
  const [avgSpeed, setAvgSpeed] = useState(null);
  const liveSpeed = (selectedRoute.current_location && selectedRoute.current_location.speed) || 0;
  useEffect(() => { setAvgSpeed(null); }, [selectedRouteId]);
  useEffect(() => {
    if (liveSpeed >= MOVING_KMH) setAvgSpeed(prev => (prev == null ? liveSpeed : prev * 0.7 + liveSpeed * 0.3));
  }, [liveSpeed]);
  const etaSpeed = Math.min(60, Math.max(10, avgSpeed ?? FALLBACK_SPEED_KMH));

  // DRIVER STATE
  const [isDriverLoggedIn, setIsDriverLoggedIn] = useState(() => !!loadSession('onboard_driver'));
  const [driverToken, setDriverToken] = useState(() => (loadSession('onboard_driver') || {}).token || null);
  const [driverInputId, setDriverInputId] = useState(() => (loadSession('onboard_driver') || {}).user_id || 'DRV-101');
  const [driverPassword, setDriverPassword] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [gpsData, setGpsData] = useState({ lat: 12.9881, lng: 80.2052, speed: 0 });

  const handleDriverLogin = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: driverInputId, password: driverPassword })
      });
      const data = await response.json();
      if (data.success && data.role.toLowerCase() === 'driver') {
        writeStore('onboard_driver', JSON.stringify({ token: data.token, user_id: data.user_id }));
        setDriverToken(data.token);
        setDriverInputId(data.user_id);
        setIsDriverLoggedIn(true);
      } else {
        alert(data.message || 'Invalid Driver Credentials');
      }
    } catch (err) {
      alert('Login server error.');
    }
  };

  const driverLogout = () => {
    writeStore('onboard_driver', null);
    setDriverToken(null);
    setIsDriverLoggedIn(false);
    setIsStreaming(false);
  };

  useEffect(() => {
    let watchId;
    if (isStreaming && 'geolocation' in navigator) {
      watchId = navigator.geolocation.watchPosition(
        async (pos) => {
          const lat = parseFloat(pos.coords.latitude.toFixed(6));
          const lng = parseFloat(pos.coords.longitude.toFixed(6));
          const speed = pos.coords.speed ? parseFloat((pos.coords.speed * 3.6).toFixed(1)) : 0;
          setGpsData({ lat, lng, speed });

          await authedFetch(`${API_BASE_URL}/telemetry`, {
            method: 'POST',
            body: JSON.stringify({ route_id: selectedRouteId, lat, lng, speed, is_active: true })
          }, driverToken, driverLogout);
        },
        (err) => console.warn('GPS Watch Error:', err.message),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
      );
    } else if (!isStreaming && isDriverLoggedIn) {
      authedFetch(`${API_BASE_URL}/telemetry`, {
        method: 'POST',
        body: JSON.stringify({ route_id: selectedRouteId, is_active: false })
      }, driverToken, driverLogout);
    }

    return () => { if (watchId) navigator.geolocation.clearWatch(watchId); };
  }, [isStreaming, selectedRouteId, driverToken, isDriverLoggedIn]);

  // ADMIN STATE
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(() => !!loadSession('onboard_admin'));
  const [adminToken, setAdminToken] = useState(() => (loadSession('onboard_admin') || {}).token || null);
  const [adminInputId, setAdminInputId] = useState(() => (loadSession('onboard_admin') || {}).user_id || 'ADM-001');
  const [adminPassword, setAdminPassword] = useState('');
  const [newStopName, setNewStopName] = useState('');
  const [newStopTime, setNewStopTime] = useState('');

  const adminLogout = () => {
    writeStore('onboard_admin', null);
    setAdminToken(null);
    setIsAdminLoggedIn(false);
  };

  const handleAdminLogin = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: adminInputId, password: adminPassword })
      });
      const data = await response.json();
      if (data.success && data.role.toLowerCase() === 'admin') {
        writeStore('onboard_admin', JSON.stringify({ token: data.token, user_id: data.user_id }));
        setAdminToken(data.token);
        setAdminInputId(data.user_id);
        setIsAdminLoggedIn(true);
      } else {
        alert(data.message || 'Invalid Admin Credentials');
      }
    } catch (err) {
      alert('Admin login error.');
    }
  };

  const handleAddStop = async (routeId) => {
    if (!newStopName.trim() || !newStopTime.trim()) return alert('Please enter both name and time.');
    await authedFetch(`${API_BASE_URL}/routes/${routeId}/stops`, {
      method: 'POST',
      body: JSON.stringify({ name: newStopName, time: newStopTime })
    }, adminToken, adminLogout);
    setNewStopName(''); setNewStopTime('');
    fetchRoutes();
  };

  const handleDeleteStop = async (routeId, sequence) => {
    await authedFetch(`${API_BASE_URL}/routes/${routeId}/stops/${sequence}`, { method: 'DELETE' }, adminToken, adminLogout);
    fetchRoutes();
  };

  if (loading) return (
    <div className="ob">
      <style>{STYLES}</style>
      <div className="ob-loading"><div className="ob-spin" />Loading OnBoard System...</div>
    </div>
  );

  const polylineCoords = selectedRoute.stops ? selectedRoute.stops.map(s => [s.lat, s.lng]) : [];
  const liveBusPos = selectedRoute.current_location && selectedRoute.current_location.lat 
    ? [selectedRoute.current_location.lat, selectedRoute.current_location.lng] 
    : (polylineCoords[0] || [12.9881, 80.2052]);

  // Where is the bus along the route, and what is each stop's ETA?
  const busLat = selectedRoute.current_location && selectedRoute.current_location.lat;
  const busLng = selectedRoute.current_location && selectedRoute.current_location.lng;
  let busIdx = -1, onRoute = false;
  if (tracking && busLat && busLng) {
    let bd = Infinity;
    tracking.path.forEach((pt, i) => {
      const d = calculateDistanceKM(busLat, busLng, pt[0], pt[1]);
      if (d < bd) { bd = d; busIdx = i; }
    });
    onRoute = bd <= OFF_ROUTE_KM;
  }
  const stopETAs = (selectedRoute.stops || []).map((stop, i) => {
    if (onRoute && tracking.stopIdx[i] !== undefined) {
      if (tracking.stopIdx[i] < busIdx) return { passed: true };
      return { text: formatETA(tracking.cum[tracking.stopIdx[i]] - tracking.cum[busIdx], etaSpeed) };
    }
    return { text: calculateETA(busLat, busLng, stop.lat, stop.lng, etaSpeed) };
  });
  const nextStopIdx = onRoute ? stopETAs.findIndex(e => !e.passed) : -1;

  const tabClass = (tabName) => `ob-tab${activeTab === tabName ? ' on' : ''}`;

  return (
    <div className="ob">
      <style>{STYLES}</style>
      <div className="ob-wrap">
        <header className="ob-header">
          <div className="ob-brand">
            <div className="ob-logo"><Bus size={26} /></div>
            <div>
              <h1>OnBoard Transit System</h1>
              <p>Live Campus Shuttle Portal</p>
            </div>
          </div>
        </header>

        <main className="ob-main">
          <div className="ob-tabs" role="tablist">
            <button role="tab" aria-selected={activeTab === 'student'} onClick={() => setActiveTab('student')} className={tabClass('student')}>
              <Bus size={18} /> Student Route Map
            </button>
            <button role="tab" aria-selected={activeTab === 'driver'} onClick={() => setActiveTab('driver')} className={tabClass('driver')}>
              <Navigation size={18} /> Driver Telemetry
            </button>
            <button role="tab" aria-selected={activeTab === 'admin'} onClick={() => setActiveTab('admin')} className={tabClass('admin')}>
              <ShieldCheck size={18} /> Admin Route Manager
            </button>
          </div>

          <div className="ob-body">
            {/* TAB 1: STUDENT */}
            {activeTab === 'student' && (
              <div>
                <div className="ob-toolbar">
                  <label htmlFor="route-select">Select Route:</label>
                  <select id="route-select" className="ob-select" value={selectedRouteId} onChange={(e) => setSelectedRouteId(e.target.value)}>
                    {routeList.map(r => <option key={r.route_id} value={r.route_id}>{r.route_name}</option>)}
                  </select>
                </div>

                {selectedRoute.is_active ? (
                  <div className="ob-grid">
                    <div className="ob-map">
                      <MapContainer center={liveBusPos} zoom={13} style={{ height: '100%', width: '100%' }}>
                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                        {(roadPath || polylineCoords).length > 0 && <Polyline positions={roadPath || polylineCoords} color="#0e7c86" weight={5} dashArray={roadPath ? undefined : '5, 10'} />}
                        {selectedRoute.stops.map((stop) => (
                          <Marker key={stop.sequence} position={[stop.lat, stop.lng]}>
                            <Popup><strong>{stop.sequence}. {stop.name}</strong><br />Time: {stop.time}</Popup>
                          </Marker>
                        ))}
                        <Marker position={liveBusPos} icon={busIcon}>
                          <Popup><strong>Live Shuttle Position</strong><br />Speed: {selectedRoute.current_location?.speed || 0} km/h</Popup>
                        </Marker>
                      </MapContainer>
                    </div>

                    <div>
                      <div className="ob-status">
                        <span className="ob-live"><i /> Bus is live on this route</span>
                        <h3>{selectedRoute.route_name}</h3>
                        <p>Driver: <strong>{selectedRoute.assigned_driver}</strong></p>
                      </div>

                      <div className="ob-stops">
                        <h4>Stops & Live Dynamic ETA</h4>
                        <p className="ob-note">ETA at ~{Math.round(etaSpeed)} km/h ({avgSpeed != null ? 'live average' : 'default'}), {onRoute ? 'along the road' : 'straight-line'}</p>
                        {selectedRoute.stops.map((stop, i) => {
                          const eta = stopETAs[i];
                          return (
                            <div key={stop.sequence} className={`ob-stop${eta.passed ? ' passed' : ''}${i === nextStopIdx ? ' next' : ''}`}>
                              <span className="ob-stop-n">{stop.sequence}</span>
                              <div className="ob-stop-row">
                                <span className="ob-stop-name">{stop.name}</span>
                                <span className="ob-stop-sched">Sched: {stop.time}</span>
                              </div>
                              <div className={`ob-eta${eta.passed ? ' passed' : ''}`}>{eta.passed ? 'Passed' : `${i === nextStopIdx ? 'Next stop · ' : ''}Live ETA: ${eta.text}`}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="ob-empty">
                    <AlertTriangle size={44} style={{ color: '#d97706' }} />
                    <h3>No Active Bus Currently Streaming</h3>
                    <p>The driver has not started live GPS broadcast for this route yet.</p>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: DRIVER */}
            {activeTab === 'driver' && (
              <div>
                {!isDriverLoggedIn ? (
                  <div className="ob-card">
                    <h3>Driver Login</h3>
                    <input className="ob-input" type="text" value={driverInputId} onChange={e => setDriverInputId(e.target.value)} placeholder="Driver ID (e.g. DRV-101)" />
                    <input className="ob-input" type="password" value={driverPassword} onChange={e => setDriverPassword(e.target.value)} placeholder="Password" />
                    <button className="ob-btn amber" onClick={handleDriverLogin}>Login as Driver</button>
                  </div>
                ) : (
                  <div className="ob-card">
                    <div className="ob-session">
                      <span>Driver: <strong>{driverInputId}</strong></span>
                      <button className="ob-logout" onClick={driverLogout}>
                        <LogOut size={14} /> Logout
                      </button>
                    </div>
                    <div className="ob-broadcast">
                      <h3>HTML5 GPS Broadcast</h3>
                      <button className={`ob-go ${isStreaming ? 'stop' : 'start'}`} onClick={() => setIsStreaming(!isStreaming)}>
                        {isStreaming ? 'Stop Broadcast' : 'Start Live HTML5 GPS Broadcast'}
                      </button>
                      {isStreaming && (
                        <div className="ob-gps">
                          <div><small>Latitude</small><strong>{gpsData.lat}</strong></div>
                          <div><small>Longitude</small><strong>{gpsData.lng}</strong></div>
                          <div><small>Speed</small><strong>{gpsData.speed} km/h</strong></div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: ADMIN */}
            {activeTab === 'admin' && (
              <div>
                {!isAdminLoggedIn ? (
                  <div className="ob-card">
                    <h3>Admin Portal Login</h3>
                    <input className="ob-input" type="text" value={adminInputId} onChange={e => setAdminInputId(e.target.value)} placeholder="Admin ID (e.g. ADM-001)" />
                    <input className="ob-input" type="password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} placeholder="Password" />
                    <button className="ob-btn" onClick={handleAdminLogin}>Login Admin</button>
                  </div>
                ) : (
                  <div className="ob-admin">
                    <div className="ob-session box">
                      <span>Admin Portal (Logged in: <strong>{adminInputId}</strong>)</span>
                      <button className="ob-logout" onClick={adminLogout}>
                        <LogOut size={14} /> Logout Admin
                      </button>
                    </div>
                    {routeList.map((route) => (
                      <div key={route.route_id} className="ob-route">
                        <div className="ob-route-head">
                          <h4>{route.route_name}<small>Driver: {route.assigned_driver}</small></h4>
                          <span className={`ob-pill ${route.is_active ? 'on' : 'off'}`}>
                            STATUS: {route.is_active ? 'ACTIVE' : 'INACTIVE'}
                          </span>
                        </div>
                        <div className="ob-chips">
                          {route.stops && route.stops.map(stop => (
                            <span key={stop.sequence} className="ob-chip">
                              {stop.sequence}. {stop.name} ({stop.time})
                              <button aria-label={`Delete ${stop.name}`} onClick={() => handleDeleteStop(route.route_id, stop.sequence)}>×</button>
                            </span>
                          ))}
                        </div>
                        <div className="ob-add">
                          <input className="ob-input wide" type="text" placeholder="Stop Name" value={newStopName} onChange={e => setNewStopName(e.target.value)} />
                          <input className="ob-input" type="text" placeholder="Time (e.g. 6.50 AM)" value={newStopTime} onChange={e => setNewStopTime(e.target.value)} />
                          <button className="ob-btn" onClick={() => handleAddStop(route.route_id)}>Add Stop</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}