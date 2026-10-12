import React, { useState, useEffect } from 'react';
import { Bus, Radio } from 'lucide-react';

export default function Header({ routes = [] }) {
  const [timeStr, setTimeStr] = useState(() => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeStr(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  const activeRoutes = Array.isArray(routes) ? routes.filter(r => r.is_active) : [];
  const activeCount = activeRoutes.length;
  const activeNames = activeRoutes.map(r => r.route_id).join(', ');

  return (
    <header className="ob-header">
      <div className="ob-brand">
        <div className="ob-logo" aria-hidden="true">
          <Bus size={26} />
        </div>
        <div>
          <h1>OnBoard Transit System</h1>
          <p>Live Campus Shuttle Portal</p>
        </div>
      </div>
      <div className="ob-header-meta">
        <div className={`ob-live-badge ${activeCount > 0 ? 'online' : 'idle'}`}>
          <Radio size={14} className={activeCount > 0 ? 'pulse-icon' : ''} />
          <span>
            {activeCount === 0 
              ? 'All Routes Idle' 
              : `${activeCount} ${activeCount === 1 ? 'Route Active' : 'Routes Active'} (${activeNames})`
            }
          </span>
        </div>
        <div className="ob-time-badge">{timeStr}</div>
      </div>
    </header>
  );
}
