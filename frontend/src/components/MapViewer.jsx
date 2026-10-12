import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair, Maximize2 } from 'lucide-react';

// Fix default leaflet marker asset paths in bundlers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Bus Marker with animated pulse aura
const busIcon = new L.DivIcon({
  html: `<div class="ob-bus-marker"><span class="ob-bus-pulse"></span><span class="ob-bus-core">🚌</span></div>`,
  className: '',
  iconSize: [40, 40],
  iconAnchor: [20, 20]
});

// Function to generate numbered stop markers
function createStopIcon(sequence, isNext = false, isPassed = false) {
  const badgeClass = isPassed ? 'passed' : isNext ? 'next' : 'normal';
  return new L.DivIcon({
    html: `<div class="ob-map-stop-pin ${badgeClass}"><span>${sequence}</span></div>`,
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });
}

// Controller component to smoothly pan/center and fit bounds
function MapController({ liveBusPos, stops, routeId, autoFollow }) {
  const map = useMap();
  const prevRouteId = useRef(routeId);

  // Fit bounds when route changes
  useEffect(() => {
    if (!stops || stops.length === 0) return;

    if (prevRouteId.current !== routeId) {
      prevRouteId.current = routeId;
      const points = stops.map(s => [s.lat, s.lng]);
      if (liveBusPos) points.push(liveBusPos);
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15, animate: true });
    }
  }, [routeId, stops, liveBusPos, map]);

  // Smoothly follow the bus if autoFollow is enabled
  useEffect(() => {
    if (autoFollow && liveBusPos && liveBusPos[0] && liveBusPos[1]) {
      map.panTo(liveBusPos, { animate: true, duration: 0.8 });
    }
  }, [liveBusPos, autoFollow, map]);

  return null;
}

export default function MapViewer({
  route,
  roadPath,
  liveBusPos,
  stopETAs = [],
  nextStopIdx = -1
}) {
  const [autoFollow, setAutoFollow] = useState(true);
  const [mapInstance, setMapInstance] = useState(null);

  const stops = route?.stops || [];
  const polylineCoords = stops.map(s => [s.lat, s.lng]);
  const activeRoadCoords = roadPath && roadPath.length > 0 ? roadPath : polylineCoords;
  const initialCenter = liveBusPos || (stops[0] ? [stops[0].lat, stops[0].lng] : [13.0063, 80.2575]);

  const handleFitRoute = () => {
    if (!mapInstance || stops.length === 0) return;
    const points = stops.map(s => [s.lat, s.lng]);
    if (liveBusPos) points.push(liveBusPos);
    mapInstance.fitBounds(L.latLngBounds(points), { padding: [50, 50], maxZoom: 15 });
    setAutoFollow(false);
  };

  const handleCenterBus = () => {
    if (!mapInstance || !liveBusPos) return;
    mapInstance.setView(liveBusPos, 15, { animate: true });
    setAutoFollow(true);
  };

  return (
    <div className="ob-map-wrapper">
      <div className="ob-map-controls">
        <button
          type="button"
          className={`ob-map-ctrl-btn ${autoFollow ? 'active' : ''}`}
          onClick={handleCenterBus}
          title="Center on Live Bus"
        >
          <Crosshair size={15} />
          <span>Follow Bus</span>
        </button>
        <button
          type="button"
          className="ob-map-ctrl-btn"
          onClick={handleFitRoute}
          title="Fit entire route bounds"
        >
          <Maximize2 size={15} />
          <span>Fit Route</span>
        </button>
      </div>

      <div className="ob-map">
        <MapContainer
          center={initialCenter}
          zoom={13}
          style={{ height: '100%', width: '100%' }}
          ref={setMapInstance}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <MapController
            liveBusPos={liveBusPos}
            stops={stops}
            routeId={route?.route_id}
            autoFollow={autoFollow}
          />

          {/* Route path polyline */}
          {activeRoadCoords.length > 1 && (
            <Polyline
              positions={activeRoadCoords}
              color="#0e7c86"
              weight={5}
              opacity={0.85}
              dashArray={roadPath ? undefined : '6, 10'}
            />
          )}

          {/* Stop markers */}
          {stops.map((stop, i) => {
            const isNext = i === nextStopIdx;
            const isPassed = stopETAs[i]?.passed;
            return (
              <Marker
                key={`${route?.route_id}-stop-${stop.sequence}`}
                position={[stop.lat, stop.lng]}
                icon={createStopIcon(stop.sequence, isNext, isPassed)}
              >
                <Popup>
                  <div className="ob-map-popup">
                    <strong>Stop #{stop.sequence}: {stop.name}</strong>
                    <div>Scheduled: <em>{stop.time}</em></div>
                    {stopETAs[i] && (
                      <div className="ob-popup-eta">
                        ETA: <strong>{stopETAs[i].passed ? 'Passed' : stopETAs[i].text}</strong>
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {/* Live Bus Marker */}
          {liveBusPos && (
            <Marker position={liveBusPos} icon={busIcon} zIndexOffset={1000}>
              <Popup>
                <div className="ob-map-popup">
                  <strong>🚌 Live Shuttle Active</strong>
                  <div>Route: <em>{route?.route_name}</em></div>
                  <div>Speed: <strong>{route?.current_location?.speed || 0} km/h</strong></div>
                  <div>Driver: <span>{route?.assigned_driver || 'Active Driver'}</span></div>
                </div>
              </Popup>
            </Marker>
          )}
        </MapContainer>
      </div>
    </div>
  );
}
