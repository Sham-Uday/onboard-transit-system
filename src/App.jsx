import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Bus, Navigation, ShieldCheck, MapPin, AlertTriangle, Clock, RefreshCw, CheckCircle } from 'lucide-react';
import initialRoutes from './routesData.json';

import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

export default function App() {
  const [activeTab, setActiveTab] = useState('student');
  const [routesData, setRoutesData] = useState(initialRoutes);

  // --- STUDENT STATE ---
  const [selectedRouteId, setSelectedRouteId] = useState('R14');
  const [hasBuses, setHasBuses] = useState(true);

  const selectedRoute = routesData.find(r => r.route_id === selectedRouteId) || routesData[0];
  const busPosition = selectedRoute.stops.length > 0 
    ? [selectedRoute.stops[0].lat, selectedRoute.stops[0].lng] 
    : [13.0063, 80.2575];

  // --- DRIVER STATE ---
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [driverInputId, setDriverInputId] = useState('DRV-101');
  const [driverPassword, setDriverPassword] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [gpsData, setGpsData] = useState({ lat: 13.0063, lng: 80.2575, speed: 0 });

  useEffect(() => {
    let interval;
    if (isStreaming) {
      interval = setInterval(() => {
        if ('geolocation' in navigator) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              setGpsData({
                lat: pos.coords.latitude.toFixed(6),
                lng: pos.coords.longitude.toFixed(6),
                speed: pos.coords.speed ? (pos.coords.speed * 3.6).toFixed(1) : (Math.random() * 15 + 20).toFixed(1)
              });
            },
            (err) => console.log(err),
            { enableHighAccuracy: true }
          );
        }
      }, 5000);
    }
    return () => clearInterval(interval);
  }, [isStreaming]);

  // --- ADMIN STATE ---
  const [isAdmin, setIsAdmin] = useState(true);
  const [newStopName, setNewStopName] = useState('');
  const [newStopTime, setNewStopTime] = useState('');

  const handleAddStop = (routeId) => {
    if (!isAdmin) {
      alert('Access Denied: Administrative permissions required.');
      return;
    }
    if (!newStopName.trim() || !newStopTime.trim()) {
      alert('Please fill in both Stop Name and Morning Time.');
      return;
    }

    setRoutesData(routesData.map(r => {
      if (r.route_id === routeId) {
        const nextSeq = r.stops.length + 1;
        const lastStop = r.stops[r.stops.length - 1] || { lat: 13.0063, lng: 80.2575 };
        return {
          ...r,
          stops: [
            ...r.stops,
            { sequence: nextSeq, name: newStopName, time: newStopTime, lat: lastStop.lat + 0.002, lng: lastStop.lng + 0.002 }
          ]
        };
      }
      return r;
    }));

    setNewStopName('');
    setNewStopTime('');
    alert('Route schedule updated successfully!');
  };

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", backgroundColor: '#f8fafc', minHeight: '100vh', padding: '24px' }}>
      
      {/* Header Banner */}
      <header style={{ maxWidth: '1100px', margin: '0 auto 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0f172a', color: 'white', padding: '16px 24px', borderRadius: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Bus style={{ color: '#38bdf8' }} size={32} />
          <div>
            <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>OnBoard Transit System</h1>
            <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>College Commute Tracker & Fleet Portal</p>
          </div>
        </div>
        <span style={{ backgroundColor: '#1e293b', padding: '6px 12px', borderRadius: '20px', fontSize: '12px', color: '#38bdf8', border: '1px solid #334155' }}>
          System Operational
        </span>
      </header>

      {/* Main Container */}
      <main style={{ maxWidth: '1100px', margin: '0 auto', backgroundColor: 'white', borderRadius: '16px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        
        {/* Navigation Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f1f5f9' }}>
          <button onClick={() => setActiveTab('student')} style={{ flex: 1, padding: '16px', border: 'none', backgroundColor: activeTab === 'student' ? 'white' : 'transparent', fontWeight: activeTab === 'student' ? 600 : 500, color: activeTab === 'student' ? '#0f172a' : '#64748b', cursor: 'pointer', borderBottom: activeTab === 'student' ? '3px solid #0284c7' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <Bus size={18} /> Student Route Map
          </button>
          <button onClick={() => setActiveTab('driver')} style={{ flex: 1, padding: '16px', border: 'none', backgroundColor: activeTab === 'driver' ? 'white' : 'transparent', fontWeight: activeTab === 'driver' ? 600 : 500, color: activeTab === 'driver' ? '#0f172a' : '#64748b', cursor: 'pointer', borderBottom: activeTab === 'driver' ? '3px solid #0284c7' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <Navigation size={18} /> Driver Telemetry
          </button>
          <button onClick={() => setActiveTab('admin')} style={{ flex: 1, padding: '16px', border: 'none', backgroundColor: activeTab === 'admin' ? 'white' : 'transparent', fontWeight: activeTab === 'admin' ? 600 : 500, color: activeTab === 'admin' ? '#0f172a' : '#64748b', cursor: 'pointer', borderBottom: activeTab === 'admin' ? '3px solid #0284c7' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <ShieldCheck size={18} /> Admin Route Manager
          </button>
        </div>

        {/* Tab Content */}
        <div style={{ padding: '24px' }}>

          {/* TAB 1: STUDENT VIEW */}
          {activeTab === 'student' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <label style={{ fontWeight: 600, fontSize: '14px', color: '#0f172a' }}>Select Route:</label>
                  <select 
                    value={selectedRouteId} 
                    onChange={(e) => setSelectedRouteId(e.target.value)}
                    style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', fontWeight: 600, color: '#0284c7', backgroundColor: '#f0f9ff' }}
                  >
                    {routesData.map(r => (
                      <option key={r.route_id} value={r.route_id}>{r.route_name}</option>
                    ))}
                  </select>
                </div>

                <button onClick={() => setHasBuses(!hasBuses)} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: 'white', color: '#334155', cursor: 'pointer', fontWeight: 500, fontSize: '13px' }}>
                  Simulate Condition: {hasBuses ? 'No Buses Operating' : 'Bus Operating'}
                </button>
              </div>

              {hasBuses ? (
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
                  <div style={{ height: '420px', borderRadius: '12px', overflow: 'hidden', border: '1px solid #cbd5e1' }}>
                    <MapContainer key={selectedRouteId} center={busPosition} zoom={13} style={{ height: '100%', width: '100%' }}>
                      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                      {selectedRoute.stops.map((stop) => (
                        <Marker key={stop.sequence} position={[stop.lat, stop.lng]}>
                          <Popup>
                            <strong>Stop #{stop.sequence}: {stop.name}</strong><br />
                            Scheduled Time: {stop.time}
                          </Popup>
                        </Marker>
                      ))}
                    </MapContainer>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ padding: '16px', backgroundColor: '#f0f9ff', borderRadius: '12px', border: '1px solid #bae6fd' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#0284c7', textTransform: 'uppercase' }}>Active Bus Details</span>
                      <h3 style={{ margin: '4px 0', fontSize: '18px', color: '#0369a1' }}>{selectedRoute.route_name}</h3>
                      <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#0e7490' }}>Driver: {selectedRoute.assigned_driver}</p>
                    </div>

                    <div style={{ padding: '16px', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                      <h4 style={{ margin: '0 0 12px', fontSize: '14px', color: '#334155' }}>Boarding Schedule</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {selectedRoute.stops.map((stop) => (
                          <div key={stop.sequence} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', backgroundColor: 'white', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px' }}>
                            <span style={{ fontWeight: 500, color: '#0f172a' }}>{stop.sequence}. {stop.name}</span>
                            <span style={{ color: '#0284c7', fontWeight: 600, fontSize: '12px' }}>{stop.time}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '40px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', textAlign: 'center' }}>
                  <AlertTriangle size={48} style={{ color: '#ef4444', marginBottom: '12px' }} />
                  <h3 style={{ margin: '0 0 8px', color: '#991b1b' }}>No Active Buses Running</h3>
                  <p style={{ margin: 0, color: '#b91c1c', fontSize: '14px' }}>There are currently no active shuttles operating on this route. Check back closer to scheduled morning pickup times.</p>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: DRIVER VIEW */}
          {activeTab === 'driver' && (
            <div style={{ maxWidth: '600px', margin: '0 auto' }}>
              {!isLoggedIn ? (
                <div style={{ padding: '32px', border: '1px solid #e2e8f0', borderRadius: '12px', backgroundColor: '#ffffff' }}>
                  <h2 style={{ margin: '0 0 16px', fontSize: '18px', color: '#0f172a', textAlign: 'center' }}>Driver Portal Login</h2>
                  
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#475569', marginBottom: '6px' }}>Driver ID</label>
                    <input 
                      type="text" 
                      value={driverInputId} 
                      onChange={(e) => setDriverInputId(e.target.value)}
                      placeholder="e.g. DRV-101"
                      style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }} 
                    />
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#475569', marginBottom: '6px' }}>Password</label>
                    <input 
                      type="password" 
                      value={driverPassword} 
                      onChange={(e) => setDriverPassword(e.target.value)}
                      placeholder="Enter password"
                      style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }} 
                    />
                  </div>

                  <button 
                    onClick={() => {
                      const validCredentials = {
                        'DRV-101': 'driver123',
                        'DRV-102': 'driver123',
                        'DRV-103': 'driver123'
                      };
                      const id = driverInputId.trim().toUpperCase();
                      if (validCredentials[id] && validCredentials[id] === driverPassword) {
                        setIsLoggedIn(true);
                      } else {
                        alert('Invalid Driver ID or Password! (Demo creds: DRV-101 / driver123)');
                      }
                    }} 
                    style={{ width: '100%', padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: '#0284c7', color: 'white', fontWeight: 600, cursor: 'pointer', fontSize: '14px' }}
                  >
                    Authenticate Driver Session
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#166534', fontWeight: 600, fontSize: '14px' }}>
                      <CheckCircle size={18} /> Driver Session Active ({driverInputId.trim().toUpperCase()})
                    </div>
                    <button onClick={() => setIsLoggedIn(false)} style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>Logout</button>
                  </div>

                  <div style={{ padding: '24px', border: '1px solid #e2e8f0', borderRadius: '12px', backgroundColor: '#ffffff', textAlign: 'center' }}>
                    <h3 style={{ margin: '0 0 16px', color: '#0f172a' }}>Live Location Streaming</h3>
                    
                    <button 
                      onClick={() => setIsStreaming(!isStreaming)} 
                      style={{ padding: '14px 28px', borderRadius: '30px', border: 'none', backgroundColor: isStreaming ? '#dc2626' : '#16a34a', color: 'white', fontWeight: 700, fontSize: '15px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                    >
                      <RefreshCw size={18} />
                      {isStreaming ? 'Stop GPS Broadcast' : 'Start Live GPS Broadcast'}
                    </button>

                    {isStreaming && (
                      <div style={{ marginTop: '24px', padding: '16px', backgroundColor: '#f8fafc', borderRadius: '10px', border: '1px solid #cbd5e1', textAlign: 'left' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', textAlign: 'center' }}>
                          <div style={{ padding: '10px', backgroundColor: 'white', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                            <span style={{ fontSize: '11px', color: '#64748b' }}>LATITUDE</span>
                            <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>{gpsData.lat}</div>
                          </div>
                          <div style={{ padding: '10px', backgroundColor: 'white', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                            <span style={{ fontSize: '11px', color: '#64748b' }}>LONGITUDE</span>
                            <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>{gpsData.lng}</div>
                          </div>
                          <div style={{ padding: '10px', backgroundColor: 'white', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                            <span style={{ fontSize: '11px', color: '#64748b' }}>SPEED</span>
                            <div style={{ fontSize: '15px', fontWeight: 700, color: '#0284c7' }}>{gpsData.speed} km/h</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: ADMIN VIEW */}
          {activeTab === 'admin' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', padding: '16px', backgroundColor: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a' }}>Admin Access Guard</h3>
                  <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>Toggle authorization guard to demonstrate permission checks</p>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 600, color: isAdmin ? '#166534' : '#991b1b' }}>
                  <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
                  {isAdmin ? 'Authorized (Admin Active)' : 'Revoked (Unauthorized)'}
                </label>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {routesData.map((route) => (
                  <div key={route.route_id} style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', backgroundColor: 'white' }}>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                      <div>
                        <h4 style={{ margin: 0, fontSize: '16px', color: '#0f172a' }}>{route.route_name}</h4>
                        <span style={{ fontSize: '12px', color: '#64748b' }}>Assigned Driver: <strong>{route.assigned_driver}</strong></span>
                      </div>
                      <span style={{ padding: '4px 10px', borderRadius: '12px', fontSize: '11px', backgroundColor: '#dcfce7', color: '#166534', fontWeight: 700 }}>
                        STATUS: ACTIVE
                      </span>
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                      <strong style={{ fontSize: '13px', color: '#475569' }}>Configured Pickup Sequence:</strong>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                        {route.stops.map((stop) => (
                          <span key={stop.sequence} style={{ padding: '6px 10px', backgroundColor: '#f1f5f9', borderRadius: '6px', fontSize: '12px', color: '#334155', display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid #cbd5e1' }}>
                            <MapPin size={12} /> {stop.sequence}. {stop.name} ({stop.time})
                            
                            <button 
                              onClick={() => {
                                if (!isAdmin) return alert('Access Denied: Permission check failed.');
                                setRoutesData(routesData.map(r => {
                                  if (r.route_id === route.route_id) {
                                    return { ...r, stops: r.stops.filter(s => s.sequence !== stop.sequence) };
                                  }
                                  return r;
                                }));
                              }} 
                              style={{ border: 'none', background: 'none', color: '#ef4444', fontWeight: 700, cursor: 'pointer', padding: '0 2px', fontSize: '13px' }}
                              title="Remove Stop"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <input 
                        type="text" 
                        placeholder="New Stop Name..." 
                        value={newStopName} 
                        onChange={(e) => setNewStopName(e.target.value)} 
                        style={{ padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', flex: 2, backgroundColor: '#ffffff', color: '#0f172a' }}
                      />
                      <input 
                        type="text" 
                        placeholder="Pickup Time (e.g. 06:40 AM)..." 
                        value={newStopTime} 
                        onChange={(e) => setNewStopTime(e.target.value)} 
                        style={{ padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', flex: 1, backgroundColor: '#ffffff', color: '#0f172a' }}
                      />
                      <button 
                        onClick={() => handleAddStop(route.route_id)} 
                        style={{ padding: '10px 18px', borderRadius: '6px', border: 'none', backgroundColor: '#0f172a', color: 'white', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
                      >
                        Add Stop
                      </button>
                    </div>

                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}