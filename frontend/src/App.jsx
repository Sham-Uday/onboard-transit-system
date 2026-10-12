import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import './App.css';
import Header from './components/Header';
import Tabs from './components/Tabs';
import StudentPortal from './components/StudentPortal';
import DriverPortal from './components/DriverPortal';
import AdminPortal from './components/AdminPortal';
import Toast from './components/Toast';

import {
  readStore,
  writeStore,
  loadSession,
  loginUser,
  fetchRoutes,
  sendTelemetry,
  deactivateRoute
} from './services/api';

import {
  calculateDistanceKM,
  formatETA,
  calculateETA,
  densifyPath,
  generateRoadWaypoints,
  OSRM_URL,
  FALLBACK_SPEED_KMH,
  MOVING_KMH,
  OFF_ROUTE_KM
} from './utils/geo';

export default function App() {
  const [activeTab, setActiveTab] = useState(() => readStore('onboard_tab') || 'student');
  const [routesData, setRoutesData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRouteId, setSelectedRouteId] = useState(() => readStore('onboard_route') || 'R21');
  const [toast, setToast] = useState(null);

  // Auth Sessions
  const [driverSession, setDriverSession] = useState(() => loadSession('onboard_driver'));
  const [adminSession, setAdminSession] = useState(() => loadSession('onboard_admin'));

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type, id: Date.now() });
  }, []);

  // Sync tab & selected route to sessionStorage
  useEffect(() => {
    writeStore('onboard_tab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    writeStore('onboard_route', selectedRouteId);
  }, [selectedRouteId]);

  // Simulation refs to prevent polling flicker
  const isSimulatingRef = useRef(false);
  const simulatedRouteIdRef = useRef(null);

  // Fetch Routes from Backend
  const loadRoutes = useCallback(async (isInitial = false) => {
    try {
      const data = await fetchRoutes();
      if (Array.isArray(data)) {
        // Prevent background polling from overwriting active simulation
        const finalData = (isSimulatingRef.current && simulatedRouteIdRef.current)
          ? data.map(r => {
              if (r.route_id === simulatedRouteIdRef.current) {
                return { ...r, is_active: true };
              }
              return r;
            })
          : data;

        setRoutesData(finalData);
        if (finalData.length > 0) {
          if (!selectedRouteId || !finalData.some(r => r.route_id === selectedRouteId)) {
            setSelectedRouteId(finalData[0].route_id);
          }
        }
      }
    } catch (err) {
      if (isInitial) {
        showToast('Could not connect to backend server. Make sure API is running.', 'error');
      }
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [selectedRouteId, showToast]);

  useEffect(() => {
    loadRoutes(true);
    const interval = setInterval(() => {
      loadRoutes(false);
    }, 3000);
    return () => clearInterval(interval);
  }, [loadRoutes]);

  const routeList = Array.isArray(routesData) ? routesData : [];
  const selectedRoute = routeList.find(r => r.route_id === selectedRouteId) || routeList[0] || { stops: [], current_location: {} };
  const activeRoutesCount = routeList.filter(r => r.is_active).length;

  // --- ROAD ROUTING (OSRM) ---
  const stopsKey = (selectedRoute.stops || []).map(s => `${s.lng},${s.lat}`).join(';');
  const [roadPaths, setRoadPaths] = useState({});
  const requestedRoads = useRef(new Set());

  useEffect(() => {
    const stops = selectedRoute.stops || [];
    if (stops.length < 2 || requestedRoads.current.has(stopsKey)) return;

    requestedRoads.current.add(stopsKey);
    fetch(`${OSRM_URL}/${stopsKey}?overview=full&geometries=geojson`)
      .then(res => res.json())
      .then(data => {
        const coords = data?.routes?.[0]?.geometry?.coordinates;
        setRoadPaths(prev => ({
          ...prev,
          [stopsKey]: coords ? coords.map(([lng, lat]) => [lat, lng]) : null
        }));
      })
      .catch(() => {
        requestedRoads.current.delete(stopsKey);
      });
  }, [stopsKey, selectedRoute.stops]);

  const roadPath = roadPaths[stopsKey] || null;

  // Tracking along path geometry
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
  }, [roadPath, selectedRoute.stops]);

  // Smoothed Speed
  const [avgSpeed, setAvgSpeed] = useState(null);
  const liveSpeed = selectedRoute.current_location?.speed || 0;

  useEffect(() => {
    setAvgSpeed(null);
  }, [selectedRouteId]);

  useEffect(() => {
    if (liveSpeed >= MOVING_KMH) {
      setAvgSpeed(prev => (prev == null ? liveSpeed : prev * 0.7 + liveSpeed * 0.3));
    }
  }, [liveSpeed]);

  const etaSpeed = Math.min(60, Math.max(10, avgSpeed ?? FALLBACK_SPEED_KMH));

  // Bus Location & Along-Route ETA calculations
  const busLat = selectedRoute.current_location?.lat;
  const busLng = selectedRoute.current_location?.lng;
  const polylineCoords = (selectedRoute.stops || []).map(s => [s.lat, s.lng]);
  const liveBusPos = (busLat && busLng) ? [busLat, busLng] : (polylineCoords[0] || [12.9881, 80.2052]);

  let busIdx = -1;
  let onRoute = false;

  if (tracking && busLat && busLng) {
    let bd = Infinity;
    tracking.path.forEach((pt, i) => {
      const d = calculateDistanceKM(busLat, busLng, pt[0], pt[1]);
      if (d < bd) { bd = d; busIdx = i; }
    });
    onRoute = bd <= OFF_ROUTE_KM;
  }

  const stopETAs = (selectedRoute.stops || []).map((stop, i) => {
    if (onRoute && tracking?.stopIdx?.[i] !== undefined) {
      if (tracking.stopIdx[i] < busIdx) return { passed: true };
      const dist = tracking.cum[tracking.stopIdx[i]] - tracking.cum[busIdx];
      return { text: formatETA(dist, etaSpeed), passed: false };
    }
    return { text: calculateETA(busLat, busLng, stop.lat, stop.lng, etaSpeed), passed: false };
  });

  const nextStopIdx = onRoute ? stopETAs.findIndex(e => !e.passed) : -1;

  // --- GLOBAL DEMO SIMULATION ENGINE ---
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulatedRouteId, setSimulatedRouteId] = useState(null);
  const simulationStepRef = useRef(0);
  const simulationTimerRef = useRef(null);

  const startSimulation = useCallback((routeId) => {
    const targetId = routeId || selectedRouteId;
    const targetRoute = routesData.find(r => r.route_id === targetId);
    if (!targetRoute || !targetRoute.stops || targetRoute.stops.length < 2) {
      showToast('Selected route needs at least 2 stops to simulate movement', 'error');
      return;
    }

    isSimulatingRef.current = true;
    simulatedRouteIdRef.current = targetId;
    setIsSimulating(true);
    setSimulatedRouteId(targetId);
    setSelectedRouteId(targetId);
    simulationStepRef.current = 0;
    showToast(`Simulation started for ${targetRoute.route_name}`, 'success');
  }, [routesData, selectedRouteId, showToast]);

  const stopSimulation = useCallback(async (routeId) => {
    const targetId = routeId || simulatedRouteId || selectedRouteId;
    isSimulatingRef.current = false;
    simulatedRouteIdRef.current = null;
    setIsSimulating(false);
    setSimulatedRouteId(null);
    if (simulationTimerRef.current) {
      clearInterval(simulationTimerRef.current);
      simulationTimerRef.current = null;
    }

    try {
      const activeToken = driverSession?.token || adminSession?.token;
      await deactivateRoute(targetId, activeToken);
      showToast(`Simulation stopped for route ${targetId}`, 'info');
      await loadRoutes(false);
    } catch (e) {
      console.warn('Deactivation failed:', e);
    }
  }, [simulatedRouteId, selectedRouteId, driverSession?.token, adminSession?.token, showToast, loadRoutes]);

  useEffect(() => {
    if (!isSimulating || !simulatedRouteId) {
      if (simulationTimerRef.current) {
        clearInterval(simulationTimerRef.current);
        simulationTimerRef.current = null;
      }
      return;
    }

    const targetRoute = routesData.find(r => r.route_id === simulatedRouteId);
    if (!targetRoute || !targetRoute.stops || targetRoute.stops.length < 2) return;

    const targetStopsKey = (targetRoute.stops || []).map(s => `${s.lng},${s.lat}`).join(';');
    const currentRoadPath = roadPaths[targetStopsKey];

    // If OSRM road coordinates are not yet loaded for this route, fetch them so the bus follows real roads
    if (!currentRoadPath) {
      fetch(`${OSRM_URL}/${targetStopsKey}?overview=full&geometries=geojson`)
        .then(res => res.json())
        .then(data => {
          const coords = data?.routes?.[0]?.geometry?.coordinates;
          if (coords && coords.length > 0) {
            const mapped = coords.map(([lng, lat]) => [lat, lng]);
            setRoadPaths(prev => ({ ...prev, [targetStopsKey]: mapped }));
          }
        })
        .catch(err => console.warn('OSRM road fetch error for simulation:', err));
    }

    // Generate waypoints strictly along the OSRM road polyline!
    const waypoints = generateRoadWaypoints(currentRoadPath, targetRoute.stops, 0.02);
    if (waypoints.length === 0) return;

    if (simulationTimerRef.current) clearInterval(simulationTimerRef.current);

    simulationTimerRef.current = setInterval(async () => {
      const step = simulationStepRef.current % waypoints.length;
      const pt = waypoints[step];
      const speed = 28 + Math.floor(Math.sin(step) * 10);

      // Immediately update local React state so marker moves smoothly on map with 0ms delay!
      setRoutesData(prevRoutes =>
        prevRoutes.map(r => {
          if (r.route_id === simulatedRouteId) {
            return {
              ...r,
              is_active: true,
              last_updated: new Date().toISOString(),
              current_location: {
                lat: pt.lat,
                lng: pt.lng,
                speed
              }
            };
          }
          return r;
        })
      );

      // Dispatch to MongoDB backend with is_demo: true so backend accepts and saves it
      try {
        await sendTelemetry({
          route_id: simulatedRouteId,
          lat: pt.lat,
          lng: pt.lng,
          speed,
          is_active: true,
          is_demo: true
        }, driverSession?.token);
      } catch (err) {
        console.warn('Simulation telemetry update error:', err);
      }

      simulationStepRef.current += 1;
    }, 2000);

    return () => {
      if (simulationTimerRef.current) {
        clearInterval(simulationTimerRef.current);
        simulationTimerRef.current = null;
      }
    };
  }, [isSimulating, simulatedRouteId, driverSession?.token, roadPaths]);

  // --- AUTH ACTIONS ---
  const handleDriverLogin = async (user_id, password) => {
    try {
      const res = await loginUser(user_id, password);
      if (res.success && res.role === 'driver') {
        const session = { token: res.token, user_id: res.user_id, name: res.name };
        writeStore('onboard_driver', JSON.stringify(session));
        setDriverSession(session);
        showToast(`Welcome back, Driver ${res.name || res.user_id}!`, 'success');
      } else {
        showToast(res.message || 'Invalid Driver Credentials', 'error');
      }
    } catch (err) {
      showToast('Network error while logging in', 'error');
    }
  };

  const handleDriverLogout = useCallback(() => {
    writeStore('onboard_driver', null);
    setDriverSession(null);
    showToast('Logged out of driver portal', 'info');
  }, [showToast]);

  const handleAdminLogin = async (user_id, password) => {
    try {
      const res = await loginUser(user_id, password);
      if (res.success && res.role === 'admin') {
        const session = { token: res.token, user_id: res.user_id, name: res.name };
        writeStore('onboard_admin', JSON.stringify(session));
        setAdminSession(session);
        showToast(`Welcome, Administrator ${res.name || res.user_id}!`, 'success');
      } else {
        showToast(res.message || 'Invalid Admin Credentials', 'error');
      }
    } catch (err) {
      showToast('Network error while logging in', 'error');
    }
  };

  const handleAdminLogout = useCallback(() => {
    writeStore('onboard_admin', null);
    setAdminSession(null);
    showToast('Logged out of admin portal', 'info');
  }, [showToast]);

  if (loading) {
    return (
      <div className="ob">
        <div className="ob-loading">
          <div className="ob-spin" />
          <span>Connecting to OnBoard Transit System...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="ob">
      <div className="ob-wrap">
        <Header routes={routeList} />

        <main className="ob-main">
          <Tabs activeTab={activeTab} onSelectTab={setActiveTab} />

          <div className="ob-body">
            {activeTab === 'student' && (
              <StudentPortal
                routes={routeList}
                selectedRouteId={selectedRouteId}
                onSelectRoute={setSelectedRouteId}
                roadPath={roadPath}
                liveBusPos={liveBusPos}
                stopETAs={stopETAs}
                nextStopIdx={nextStopIdx}
                etaSpeed={etaSpeed}
                avgSpeed={avgSpeed}
                onRoute={onRoute}
                isSimulating={isSimulating}
                simulatedRouteId={simulatedRouteId}
                onStartSimulation={startSimulation}
                onStopSimulation={stopSimulation}
              />
            )}

            {activeTab === 'driver' && (
              <DriverPortal
                routes={routeList}
                selectedRouteId={selectedRouteId}
                onSelectRoute={setSelectedRouteId}
                isDriverLoggedIn={!!driverSession}
                driverSession={driverSession}
                onLogin={handleDriverLogin}
                onLogout={handleDriverLogout}
                onNotify={showToast}
                onRefreshRoutes={() => loadRoutes(false)}
                isSimulating={isSimulating}
                simulatedRouteId={simulatedRouteId}
                onStartSimulation={startSimulation}
                onStopSimulation={stopSimulation}
              />
            )}

            {activeTab === 'admin' && (
              <AdminPortal
                routes={routeList}
                isAdminLoggedIn={!!adminSession}
                adminSession={adminSession}
                onLogin={handleAdminLogin}
                onLogout={handleAdminLogout}
                onRefreshRoutes={() => loadRoutes(false)}
                onNotify={showToast}
              />
            )}
          </div>
        </main>
      </div>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}