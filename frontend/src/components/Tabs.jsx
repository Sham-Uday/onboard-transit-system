import React from 'react';
import { Bus, Navigation, ShieldCheck } from 'lucide-react';

export default function Tabs({ activeTab, onSelectTab }) {
  const tabs = [
    { id: 'student', label: 'Student Route Map', icon: Bus },
    { id: 'driver', label: 'Driver Telemetry', icon: Navigation },
    { id: 'admin', label: 'Admin Route Manager', icon: ShieldCheck }
  ];

  return (
    <nav className="ob-tabs" role="tablist" aria-label="Portal Navigation">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onSelectTab(tab.id)}
            className={`ob-tab ${isActive ? 'on' : ''}`}
          >
            <Icon size={18} />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
