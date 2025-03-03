import React, { useState } from 'react';

const NotificationsPanel = ({ notifications = [] }) => {
  const [expanded, setExpanded] = useState(false);
  
  // Default notifications if none provided
  const defaultNotifications = [
    { 
      id: 1, 
      type: 'info', 
      title: 'System Update', 
      message: 'A new system update is available. Consider upgrading soon.',
      time: '2 hours ago'
    },
    { 
      id: 2, 
      type: 'warning', 
      title: 'API Usage', 
      message: 'You are approaching your Twilio API limit for this month.',
      time: '1 day ago'
    },
    { 
      id: 3, 
      type: 'success', 
      title: 'Knowledge Base', 
      message: '15 new documents were successfully vectorized.',
      time: '3 days ago'
    }
  ];
  
  const allNotifications = notifications.length > 0 ? notifications : defaultNotifications;
  const unreadCount = allNotifications.filter(n => !n.read).length;
  
  // Get appropriate notification icon and color
  const getNotificationStyle = (type) => {
    switch (type) {
      case 'info':
        return { icon: 'ℹ️', color: 'var(--info-color)' };
      case 'warning':
        return { icon: '⚠️', color: 'var(--warning-color)' };
      case 'error':
        return { icon: '❌', color: 'var(--danger-color)' };
      case 'success':
        return { icon: '✅', color: 'var(--success-color)' };
      default:
        return { icon: '📢', color: 'var(--secondary-color)' };
    }
  };
  
  return (
    <div className="notifications-container">
      <div className="notifications-header" onClick={() => setExpanded(!expanded)}>
        <h4>Notifications</h4>
        {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
        <span className="notifications-toggle">{expanded ? '▲' : '▼'}</span>
      </div>
      
      {expanded && (
        <div className="notifications-list">
          {allNotifications.length > 0 ? (
            allNotifications.map(notification => {
              const { icon, color } = getNotificationStyle(notification.type);
              return (
                <div key={notification.id} className={`notification-item ${notification.read ? 'read' : 'unread'}`}>
                  <div className="notification-icon" style={{ color }}>
                    {icon}
                  </div>
                  <div className="notification-content">
                    <div className="notification-title">{notification.title}</div>
                    <div className="notification-message">{notification.message}</div>
                    <div className="notification-time">{notification.time}</div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="notifications-empty">
              No notifications at this time
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationsPanel;
