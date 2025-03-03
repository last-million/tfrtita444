import React from 'react';

const SystemHealthIndicators = ({ statuses = {} }) => {
  // Default system components and their status if none provided
  const defaultStatuses = {
    database: { status: 'healthy', lastChecked: '2 minutes ago' },
    twilio: { status: 'healthy', lastChecked: '5 minutes ago' },
    ultravox: { status: 'warning', lastChecked: '10 minutes ago', message: 'High latency detected' },
    supabase: { status: 'healthy', lastChecked: '7 minutes ago' },
    vectorization: { status: 'healthy', lastChecked: '15 minutes ago' }
  };

  const systemStatuses = { ...defaultStatuses, ...statuses };

  // Get appropriate status indicator
  const getStatusIndicator = (status) => {
    switch (status) {
      case 'healthy':
        return { icon: '✅', color: 'var(--success-color)', text: 'Healthy' };
      case 'warning':
        return { icon: '⚠️', color: 'var(--warning-color)', text: 'Warning' };
      case 'error':
        return { icon: '❌', color: 'var(--danger-color)', text: 'Error' };
      case 'inactive':
        return { icon: '⭘', color: 'var(--secondary-color)', text: 'Inactive' };
      default:
        return { icon: '❓', color: 'var(--secondary-color)', text: 'Unknown' };
    }
  };

  return (
    <div className="system-health-container">
      <h4>System Health</h4>
      <div className="system-health-grid">
        {Object.entries(systemStatuses).map(([system, info]) => {
          const statusInfo = getStatusIndicator(info.status);
          return (
            <div key={system} className="health-indicator">
              <div className="health-icon" style={{ color: statusInfo.color }}>
                {statusInfo.icon}
              </div>
              <div className="health-details">
                <span className="health-name">{system.charAt(0).toUpperCase() + system.slice(1)}</span>
                <span className="health-status" style={{ color: statusInfo.color }}>
                  {statusInfo.text}
                </span>
                {info.message && <span className="health-message">{info.message}</span>}
                <span className="health-time">Last checked: {info.lastChecked}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SystemHealthIndicators;
