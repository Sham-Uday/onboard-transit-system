import React, { useState } from 'react';
import { ShieldCheck, LogOut, Plus, Trash2, Bus, Clock, Power } from 'lucide-react';
import { addStop, deleteStop, deactivateRoute, deactivateAllRoutes } from '../services/api';

export default function AdminPortal({
  routes,
  isAdminLoggedIn,
  adminSession,
  onLogin,
  onLogout,
  onRefreshRoutes,
  onNotify
}) {
  const [adminInputId, setAdminInputId] = useState(() => adminSession?.user_id || 'ADM-001');
  const [adminPassword, setAdminPassword] = useState('');

  // Per-route new stop input state
  const [stopForms, setStopForms] = useState({});
  const [submittingRouteId, setSubmittingRouteId] = useState(null);

  const handleLoginSubmit = (e) => {
    e.preventDefault();
    if (!adminInputId.trim() || !adminPassword.trim()) {
      onNotify('Please enter both Admin ID and Password', 'error');
      return;
    }
    onLogin(adminInputId.trim(), adminPassword.trim());
  };

  const getFormState = (routeId) => {
    return stopForms[routeId] || { name: '', time: '', lat: '', lng: '' };
  };

  const updateFormField = (routeId, field, value) => {
    setStopForms(prev => ({
      ...prev,
      [routeId]: {
        ...getFormState(routeId),
        [field]: value
      }
    }));
  };

  const handleAddStopSubmit = async (routeId) => {
    const form = getFormState(routeId);
    if (!form.name.trim() || !form.time.trim()) {
      onNotify('Please enter both stop name and scheduled time', 'error');
      return;
    }

    setSubmittingRouteId(routeId);
    try {
      const payload = {
        name: form.name.trim(),
        time: form.time.trim()
      };
      if (form.lat && !isNaN(parseFloat(form.lat))) payload.lat = parseFloat(form.lat);
      if (form.lng && !isNaN(parseFloat(form.lng))) payload.lng = parseFloat(form.lng);

      const res = await addStop(routeId, payload, adminSession?.token, onLogout);
      if (res.success) {
        onNotify(res.message || `Stop '${form.name}' added successfully`, 'success');
        setStopForms(prev => ({ ...prev, [routeId]: { name: '', time: '', lat: '', lng: '' } }));
        await onRefreshRoutes();
      } else {
        onNotify(res.message || 'Failed to add stop', 'error');
      }
    } catch (err) {
      onNotify('Network error while adding stop', 'error');
    } finally {
      setSubmittingRouteId(null);
    }
  };

  const handleDeleteStop = async (routeId, stop) => {
    try {
      const res = await deleteStop(routeId, stop.sequence, adminSession?.token, onLogout);
      if (res.success) {
        onNotify(res.message || `Stop #${stop.sequence} (${stop.name}) deleted`, 'info');
        await onRefreshRoutes();
      } else {
        onNotify(res.message || 'Failed to delete stop', 'error');
      }
    } catch (err) {
      onNotify('Error deleting stop', 'error');
    }
  };

  const handleDeactivateRoute = async (routeId) => {
    try {
      const res = await deactivateRoute(routeId, adminSession?.token, onLogout);
      if (res.success) {
        onNotify(`Route ${routeId} deactivated`, 'info');
        await onRefreshRoutes();
      }
    } catch (err) {
      onNotify('Failed to deactivate route', 'error');
    }
  };

  const handleResetAllRoutes = async () => {
    try {
      const res = await deactivateAllRoutes(adminSession?.token, onLogout);
      if (res.success) {
        onNotify('All active routes have been reset to idle', 'success');
        await onRefreshRoutes();
      }
    } catch (err) {
      onNotify('Failed to reset routes', 'error');
    }
  };

  if (!isAdminLoggedIn) {
    return (
      <div className="ob-card">
        <div className="ob-card-header">
          <div className="ob-icon-circle blue"><ShieldCheck size={22} /></div>
          <h3>Admin Portal Login</h3>
          <p className="ob-card-subtitle">Manage campus routes, driver assignments, and stop timetables</p>
        </div>

        <form onSubmit={handleLoginSubmit}>
          <div className="ob-form-group">
            <label>Admin ID</label>
            <input
              className="ob-input"
              type="text"
              value={adminInputId}
              onChange={e => setAdminInputId(e.target.value)}
              placeholder="e.g. ADM-001"
              required
            />
          </div>

          <div className="ob-form-group">
            <label>Password</label>
            <input
              className="ob-input"
              type="password"
              value={adminPassword}
              onChange={e => setAdminPassword(e.target.value)}
              placeholder="Enter password"
              required
            />
          </div>

          <button type="submit" className="ob-btn">
            Login as Admin
          </button>
        </form>

        <div className="ob-hint-box">
          <small>Default Demo Admin: <code>ADM-001</code> / <code>admin123</code></small>
        </div>
      </div>
    );
  }

  const anyRouteActive = routes.some(r => r.is_active);

  return (
    <div className="ob-admin-container">
      {/* Admin Session Banner */}
      <div className="ob-session-banner">
        <div className="ob-driver-info">
          <span className="ob-badge-admin">Admin Portal</span>
          <strong>{adminSession?.name || adminSession?.user_id}</strong>
          <span className="ob-subtext">ID: {adminSession?.user_id}</span>
        </div>
        <div className="ob-session-actions">
          {anyRouteActive && (
            <button
              type="button"
              className="ob-btn-sm danger"
              onClick={handleResetAllRoutes}
              title="Deactivate all active routes at once"
            >
              <Power size={13} /> Reset All Active Routes
            </button>
          )}
          <button className="ob-logout" onClick={onLogout}>
            <LogOut size={14} /> Logout Admin
          </button>
        </div>
      </div>

      {/* Routes List */}
      <div className="ob-admin-routes">
        {routes.map((route) => {
          const form = getFormState(route.route_id);
          const isSubmitting = submittingRouteId === route.route_id;

          return (
            <div key={route.route_id} className="ob-route-card">
              <div className="ob-route-header">
                <div className="ob-route-title">
                  <div className="ob-route-icon-box">
                    <Bus size={18} />
                  </div>
                  <div>
                    <h4>{route.route_name}</h4>
                    <span className="ob-route-sub">
                      Route ID: <strong>{route.route_id}</strong> &bull; Assigned Driver: <strong>{route.assigned_driver}</strong>
                    </span>
                  </div>
                </div>

                <div className="ob-route-status-group">
                  <span className={`ob-status-pill ${route.is_active ? 'active' : 'inactive'}`}>
                    {route.is_active ? '🟢 ACTIVE' : '⚪ INACTIVE'}
                  </span>
                  {route.is_active && (
                    <button
                      type="button"
                      className="ob-pill-action danger"
                      onClick={() => handleDeactivateRoute(route.route_id)}
                      title="Deactivate this route"
                    >
                      Turn Off
                    </button>
                  )}
                </div>
              </div>

              {/* Stops Chips */}
              <div className="ob-stops-manager">
                <h5>Stops Chronological Sequence ({route.stops?.length || 0})</h5>
                <div className="ob-chips-container">
                  {route.stops && route.stops.length > 0 ? (
                    route.stops.map((stop) => (
                      <span key={`${route.route_id}-${stop.sequence}`} className="ob-chip">
                        <span className="ob-chip-seq">{stop.sequence}</span>
                        <span className="ob-chip-label">{stop.name}</span>
                        <span className="ob-chip-time">
                          <Clock size={11} /> {stop.time}
                        </span>
                        <button
                          type="button"
                          className="ob-chip-del"
                          aria-label={`Delete ${stop.name}`}
                          onClick={() => handleDeleteStop(route.route_id, stop)}
                          title="Remove stop"
                        >
                          <Trash2 size={13} />
                        </button>
                      </span>
                    ))
                  ) : (
                    <div className="ob-no-stops">No stops created yet for this route.</div>
                  )}
                </div>
              </div>

              {/* Add Stop Form */}
              <div className="ob-add-stop-panel">
                <h5><Plus size={15} /> Add New Stop (Auto-sequenced by arrival time)</h5>
                <div className="ob-add-fields">
                  <input
                    className="ob-input flex-2"
                    type="text"
                    placeholder="Stop Name (e.g. CAMPUS GATE 2)"
                    value={form.name}
                    onChange={(e) => updateFormField(route.route_id, 'name', e.target.value)}
                  />
                  <input
                    className="ob-input flex-1"
                    type="text"
                    placeholder="Time (e.g. 06:50 AM)"
                    value={form.time}
                    onChange={(e) => updateFormField(route.route_id, 'time', e.target.value)}
                  />
                  <button
                    type="button"
                    className="ob-btn flex-btn"
                    disabled={isSubmitting}
                    onClick={() => handleAddStopSubmit(route.route_id)}
                  >
                    {isSubmitting ? 'Adding...' : 'Add Stop'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
