import React, { useState, useEffect } from 'react';
import { LogOut, Navigation, Radio, Play, Square, AlertCircle, Compass, MapPin } from 'lucide-react';
import { sendTelemetry, deactivateRoute } from '../services/api';

export default function DriverPortal({
  routes,
  selectedRouteId,
  onSelectRoute,
  isDriverLoggedIn,
  driverSession,
  onLogin,
  onLogout,
  onNotify,
  onRefreshRoutes,
  isSimulating,
  simulatedRouteId,
  onStartSimulation,
  onStopSimulation
}) {
  const [driverInputId, setDriverInputId] = useState(() => driverSession?.user_id || 'DRV-101');
  const [driverPassword, setDriverPassword] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [gpsData, setGpsData] = useState({ lat: 12.9881, lng: 80.2052, speed: 0 });
  const [geoError, setGeoError] = useState(null);

  const selectedRoute = routes.find(r => r.route_id === selectedRouteId) || routes[0] || { stops: [] };
  const isServerActive = Boolean(selectedRoute?.is_active);
  const isThisRouteSimulating = Boolean(isSimulating && simulatedRouteId === selectedRoute.route_id);
  const activeRoutes = routes.filter(r => r.is_active);
  const anotherActiveRoute = activeRoutes.find(r => r.route_id !== selectedRouteId);

  // Sync GPS display with server location when idle or resumed
  useEffect(() => {
    if (selectedRoute?.current_location && !isStreaming) {
      setGpsData({
        lat: selectedRoute.current_location.lat || 12.9881,
        lng: selectedRoute.current_location.lng || 80.2052,
        speed: selectedRoute.current_location.speed || 0
      });
    }
  }, [selectedRoute, isStreaming]);

  const handleLoginSubmit = (e) => {
    e.preventDefault();
    if (!driverInputId.trim() || !driverPassword.trim()) {
      onNotify('Please enter both Driver ID and Password', 'error');
      return;
    }
    onLogin(driverInputId.trim(), driverPassword.trim());
  };

  // 1. REAL HTML5 GPS BROADCAST
  useEffect(() => {
    let watchId;
    if (isStreaming && 'geolocation' in navigator) {
      setGeoError(null);
      watchId = navigator.geolocation.watchPosition(
        async (pos) => {
          const lat = parseFloat(pos.coords.latitude.toFixed(6));
          const lng = parseFloat(pos.coords.longitude.toFixed(6));
          const speed = pos.coords.speed ? parseFloat((pos.coords.speed * 3.6).toFixed(1)) : 0;
          setGpsData({ lat, lng, speed });

          try {
            await sendTelemetry({
              route_id: selectedRouteId,
              lat,
              lng,
              speed,
              is_active: true
            }, driverSession?.token, onLogout);
            if (onRefreshRoutes) onRefreshRoutes();
          } catch (err) {
            console.warn('Telemetry transmission error:', err);
          }
        },
        (err) => {
          console.warn('GPS Watch Error:', err.message);
          setGeoError(`GPS Error: ${err.message}. Ensure location permissions are granted.`);
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 6000 }
      );
    }

    return () => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
    };
  }, [isStreaming, selectedRouteId, driverSession?.token, onLogout, onRefreshRoutes]);

  // Stop broadcast for the currently selected route
  const handleStopAllBroadcasts = async () => {
    setIsStreaming(false);
    if (isThisRouteSimulating && onStopSimulation) {
      onStopSimulation(selectedRouteId);
    }
    try {
      await deactivateRoute(selectedRouteId, driverSession?.token, onLogout);
      onNotify(`Broadcast stopped for route ${selectedRoute.route_name}`, 'info');
      if (onRefreshRoutes) onRefreshRoutes();
    } catch (e) {
      console.warn('Deactivation error:', e);
    }
  };

  // Stop broadcast for any other specific route
  const handleStopSpecificRoute = async (routeId) => {
    try {
      await deactivateRoute(routeId, driverSession?.token, onLogout);
      onNotify(`Broadcast stopped for route ${routeId}`, 'info');
      if (onRefreshRoutes) onRefreshRoutes();
    } catch (e) {
      console.warn('Deactivation error:', e);
    }
  };

  if (!isDriverLoggedIn) {
    return (
      <div className="ob-card">
        <div className="ob-card-header">
          <div className="ob-icon-circle amber"><Navigation size={22} /></div>
          <h3>Driver Portal Login</h3>
          <p className="ob-card-subtitle">Authenticate with your driver credentials to stream live GPS</p>
        </div>

        <form onSubmit={handleLoginSubmit}>
          <div className="ob-form-group">
            <label>Driver ID</label>
            <input
              className="ob-input"
              type="text"
              value={driverInputId}
              onChange={e => setDriverInputId(e.target.value)}
              placeholder="e.g. DRV-101"
              required
            />
          </div>

          <div className="ob-form-group">
            <label>Password</label>
            <input
              className="ob-input"
              type="password"
              value={driverPassword}
              onChange={e => setDriverPassword(e.target.value)}
              placeholder="Enter password"
              required
            />
          </div>

          <button type="submit" className="ob-btn amber">
            Login as Driver
          </button>
        </form>

        <div className="ob-hint-box">
          <small>Default Demo Driver: <code>DRV-101</code> / <code>driver123</code></small>
        </div>
      </div>
    );
  }

  const isBroadcasting = isStreaming || isThisRouteSimulating || isServerActive;

  return (
    <div className="ob-driver-container">
      {/* Session Header */}
      <div className="ob-session-banner">
        <div className="ob-driver-info">
          <span className="ob-badge-driver">Driver Account</span>
          <strong>{driverSession?.name || driverSession?.user_id}</strong>
          <span className="ob-subtext">ID: {driverSession?.user_id}</span>
        </div>
        <button
          className="ob-logout"
          onClick={() => {
            handleStopAllBroadcasts();
            onLogout();
          }}
        >
          <LogOut size={14} /> Logout
        </button>
      </div>

      {/* Alert if ANOTHER route is active */}
      {anotherActiveRoute && (
        <div className="ob-active-notice-banner">
          <div className="ob-active-notice-text">
            <Radio size={16} className="ob-pulse-icon text-ok" />
            <span>
              Route <strong>{anotherActiveRoute.route_name}</strong> is currently active and broadcasting on the server.
            </span>
          </div>
          <div className="ob-active-notice-btns">
            <button
              type="button"
              className="ob-btn-sm primary"
              onClick={() => onSelectRoute(anotherActiveRoute.route_id)}
            >
              Switch to {anotherActiveRoute.route_id}
            </button>
            <button
              type="button"
              className="ob-btn-sm danger"
              onClick={() => handleStopSpecificRoute(anotherActiveRoute.route_id)}
            >
              Stop Broadcast
            </button>
          </div>
        </div>
      )}

      <div className="ob-driver-dashboard">
        {/* Route Assignment Selector */}
        <div className="ob-driver-card">
          <div className="ob-card-title-row">
            <h4><MapPin size={18} /> Select Route to Drive</h4>
            {isBroadcasting && (
              <span className="ob-pill on">🔴 BROADCASTING LIVE</span>
            )}
          </div>
          <p className="ob-card-subtitle">Choose the route you are currently operating:</p>
          <select
            className="ob-select full"
            value={selectedRouteId}
            disabled={isStreaming || isThisRouteSimulating}
            onChange={(e) => onSelectRoute(e.target.value)}
          >
            {routes.map(r => (
              <option key={r.route_id} value={r.route_id}>
                {r.is_active ? '🟢 [LIVE NOW] ' : '⚪ '} {r.route_name} ({r.stops?.length || 0} stops)
              </option>
            ))}
          </select>
          {(isStreaming || isThisRouteSimulating) && (
            <small className="ob-locked-note">Route locked while broadcast is active. Stop broadcast to switch route.</small>
          )}
        </div>

        {/* Broadcast Controls */}
        <div className="ob-driver-card">
          <div className="ob-card-title-row">
            <h4><Radio size={18} /> Live GPS Telemetry Broadcast</h4>
            {isBroadcasting && (
              <button
                type="button"
                className="ob-btn-text-danger"
                onClick={handleStopAllBroadcasts}
                title="Stop broadcast immediately"
              >
                Stop Live Broadcast
              </button>
            )}
          </div>
          <p className="ob-card-subtitle">
            {isThisRouteSimulating
              ? `Demo simulation is actively moving along ${selectedRoute.route_name}. You can switch tabs to Student view to watch it!`
              : isServerActive 
              ? `Currently broadcasting live coordinates for ${selectedRoute.route_name}. Students can see live updates.`
              : `Broadcast real-time coordinates to students tracking ${selectedRoute.route_name}.`
            }
          </p>

          {geoError && (
            <div className="ob-error-banner">
              <AlertCircle size={16} />
              <span>{geoError}</span>
            </div>
          )}

          <div className="ob-broadcast-actions">
            {isBroadcasting ? (
              // When broadcast/simulation is active
              <div className="ob-active-action-group">
                <button
                  type="button"
                  className="ob-btn bad"
                  onClick={handleStopAllBroadcasts}
                >
                  <Square size={16} /> Stop Live Broadcast
                </button>
                {!isStreaming && !isThisRouteSimulating && (
                  <div className="ob-resume-group">
                    <button
                      type="button"
                      className="ob-btn ok"
                      onClick={() => {
                        setIsStreaming(true);
                        onNotify('HTML5 GPS Broadcast resumed from this device', 'success');
                      }}
                    >
                      <Play size={16} /> Stream GPS from This Device
                    </button>
                    <button
                      type="button"
                      className="ob-btn amber"
                      onClick={() => onStartSimulation(selectedRoute.route_id)}
                    >
                      <Compass size={16} /> Run Demo Simulator
                    </button>
                  </div>
                )}
              </div>
            ) : (
              // When route is idle
              <>
                <button
                  type="button"
                  className="ob-btn ok"
                  onClick={() => {
                    setIsStreaming(true);
                    onNotify('HTML5 GPS Broadcast started', 'success');
                  }}
                >
                  <Play size={16} /> Start HTML5 GPS Broadcast
                </button>
                <button
                  type="button"
                  className="ob-btn amber"
                  onClick={() => onStartSimulation(selectedRoute.route_id)}
                >
                  <Compass size={16} /> Simulate Route Movement (Demo Mode)
                </button>
              </>
            )}
          </div>

          {/* Telemetry Metrics */}
          <div className="ob-gps-metrics">
            <div className="ob-gps-tile">
              <small>Status</small>
              <strong className={isBroadcasting ? 'text-ok' : 'text-muted'}>
                {isThisRouteSimulating ? 'Simulating' : isStreaming ? 'Live GPS' : isServerActive ? 'Active (Server)' : 'Idle'}
              </strong>
            </div>
            <div className="ob-gps-tile">
              <small>Latitude</small>
              <strong>{gpsData.lat}</strong>
            </div>
            <div className="ob-gps-tile">
              <small>Longitude</small>
              <strong>{gpsData.lng}</strong>
            </div>
            <div className="ob-gps-tile">
              <small>Speed</small>
              <strong>{gpsData.speed} km/h</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
