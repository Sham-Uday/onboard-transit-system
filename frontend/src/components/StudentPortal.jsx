import React from 'react';
import { AlertTriangle, Clock, MapPin, Gauge, Compass, Square } from 'lucide-react';
import MapViewer from './MapViewer';

export default function StudentPortal({
  routes,
  selectedRouteId,
  onSelectRoute,
  roadPath,
  liveBusPos,
  stopETAs,
  nextStopIdx,
  etaSpeed,
  avgSpeed,
  onRoute,
  isSimulating,
  simulatedRouteId,
  onStartSimulation,
  onStopSimulation
}) {
  const selectedRoute = routes.find(r => r.route_id === selectedRouteId) || routes[0] || { stops: [], current_location: {} };
  const stops = selectedRoute.stops || [];
  const isThisRouteSimulating = isSimulating && simulatedRouteId === selectedRoute.route_id;

  return (
    <div className="ob-student-view">
      {/* Simulation banner if demo simulation is running */}
      {isThisRouteSimulating && (
        <div className="ob-active-notice-banner">
          <div className="ob-active-notice-text">
            <Compass size={18} className="ob-pulse-icon text-ok" />
            <span>
              <strong>Demo Simulation Live:</strong> Bus ping is actively driving along route stops in real time.
            </span>
          </div>
          <button
            type="button"
            className="ob-btn-sm danger"
            onClick={() => onStopSimulation(selectedRoute.route_id)}
          >
            <Square size={13} /> Stop Simulation
          </button>
        </div>
      )}

      <div className="ob-toolbar">
        <label htmlFor="route-select">Select Route:</label>
        <select
          id="route-select"
          className="ob-select"
          value={selectedRouteId}
          onChange={(e) => onSelectRoute(e.target.value)}
        >
          {routes.map((r) => (
            <option key={r.route_id} value={r.route_id}>
              {r.is_active ? '🟢 (LIVE) ' : '⚪ '} {r.route_name}
            </option>
          ))}
        </select>

        {selectedRoute.is_active && (
          <div className="ob-toolbar-stats">
            <span className="ob-stat-pill">
              <Gauge size={14} />
              <span>Speed: <strong>{selectedRoute.current_location?.speed || 0} km/h</strong></span>
            </span>
            <span className="ob-stat-pill">
              <MapPin size={14} />
              <span>{stops.length} Stops</span>
            </span>
          </div>
        )}
      </div>

      {selectedRoute.is_active ? (
        <div className="ob-grid">
          {/* Map Section */}
          <MapViewer
            route={selectedRoute}
            roadPath={roadPath}
            liveBusPos={liveBusPos}
            stopETAs={stopETAs}
            nextStopIdx={nextStopIdx}
          />

          {/* Sidebar Section */}
          <div className="ob-student-sidebar">
            <div className="ob-status">
              <div className="ob-live-tag">
                <i /> Live Shuttle on Route
              </div>
              <h3>{selectedRoute.route_name}</h3>
              <p>Driver: <strong>{selectedRoute.assigned_driver}</strong></p>
            </div>

            <div className="ob-stops">
              <div className="ob-stops-header">
                <h4>Stops & Live Dynamic ETA</h4>
                <p className="ob-note">
                  Calculated at ~{Math.round(etaSpeed)} km/h ({avgSpeed != null ? 'live smoothed' : 'scheduled default'}), {onRoute ? 'following road' : 'direct line'}.
                </p>
              </div>

              <div className="ob-stops-list">
                {stops.map((stop, i) => {
                  const eta = stopETAs[i] || {};
                  const isNext = i === nextStopIdx;
                  const isPassed = eta.passed;

                  return (
                    <div
                      key={stop.sequence}
                      className={`ob-stop ${isPassed ? 'passed' : ''} ${isNext ? 'next' : ''}`}
                    >
                      <span className="ob-stop-n">{stop.sequence}</span>
                      <div className="ob-stop-row">
                        <span className="ob-stop-name">{stop.name}</span>
                        <span className="ob-stop-sched">
                          <Clock size={12} /> {stop.time}
                        </span>
                      </div>
                      <div className={`ob-eta ${isPassed ? 'passed' : isNext ? 'next' : ''}`}>
                        {isPassed
                          ? 'Passed'
                          : `${isNext ? 'Next Stop · ' : ''}Live ETA: ${eta.text || 'Calculating...'}`}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="ob-inactive-container">
          <div className="ob-empty">
            <AlertTriangle size={42} className="ob-warn-icon" />
            <h3>No Live Bus Currently Streaming for this Route</h3>
            <p>The assigned driver has not started live GPS broadcast yet.</p>
            {stops.length > 1 && (
              <button
                type="button"
                className="ob-btn amber"
                style={{ maxWidth: '300px', margin: '16px auto 0' }}
                onClick={() => onStartSimulation(selectedRoute.route_id)}
              >
                <Compass size={16} /> Run Demo Shuttle Simulation
              </button>
            )}
          </div>

          {stops.length > 0 && (
            <div className="ob-timetable-card">
              <h4>Scheduled Timetable Preview — {selectedRoute.route_name}</h4>
              <div className="ob-timetable-grid">
                {stops.map((stop) => (
                  <div key={stop.sequence} className="ob-timetable-item">
                    <span className="ob-tt-seq">{stop.sequence}</span>
                    <div className="ob-tt-info">
                      <strong>{stop.name}</strong>
                      <span><Clock size={12} /> {stop.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
