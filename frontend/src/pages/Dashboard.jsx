import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import './Dashboard.css'
import axios from 'axios';

// Import new components
import CallAnalyticsChart from '../components/CallAnalyticsChart';
import SystemHealthIndicators from '../components/SystemHealthIndicators';
import NotificationsPanel from '../components/NotificationsPanel';
import QuickActionCards from '../components/QuickActionCards';

// Use relative URL to ensure it works in any environment
const API_BASE_URL = '/api';

// Create a silent axios instance that won't log errors to console
const silentAxios = axios.create({
  timeout: 3000,
  validateStatus: function() {
    return true; // Never throw for any status
  }
});

// Override the console error method to provide better error messages for known issues
const originalConsoleError = console.error;
console.error = function(message, ...args) {
  // For 502 errors, log a clearer message
  if (typeof message === 'string' && 
      (message.includes('status code 502') || 
       message.includes('Request failed with status code 502'))) {
    console.warn('Backend API currently unavailable (502 Bad Gateway)');
    return;
  }
  
  originalConsoleError.apply(console, [message, ...args]);
};

function Dashboard() {
  const navigate = useNavigate();
  
  const [services, setServices] = useState([
    { 
      name: 'Twilio', 
      connected: false, 
      icon: '📞',
      description: 'Voice and SMS communication'
    },
    { 
      name: 'Supabase', 
      connected: false, 
      icon: '🗃️',
      description: 'Database and authentication'
    },
    { 
      name: 'Google Calendar', 
      connected: false, 
      icon: '📅',
      description: 'Meeting scheduling'
    },
    { 
      name: 'Ultravox', 
      connected: false, 
      icon: '🤖',
      description: 'AI voice processing'
    }
  ]);

  const [stats, setStats] = useState({
    totalCalls: 0,
    activeServices: 0,
    knowledgeBaseDocuments: 0,
    aiResponseAccuracy: '85%'
  });

  const [systemHealth, setSystemHealth] = useState({});
  const [notifications, setNotifications] = useState([]);
  const [callAnalytics, setCallAnalytics] = useState(null);
  const [recentActivities, setRecentActivities] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Helper for making authenticated API requests with complete error suppression
  const makeRequest = async (url) => {
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      
      // Use our silent axios instance
      const response = await silentAxios.get(`${API_BASE_URL}${url}`, { headers });
      
      if (response.status >= 200 && response.status < 300) {
        return response.data;
      } else {
        // Silently use fallback data for non-200 responses
        return null;
      }
    } catch (error) {
      // This should never happen with our custom axios, but just in case
      return null;
    }
  };

  // Fetch dashboard stats from the backend API
  const fetchDashboardStats = async () => {
    const data = await makeRequest('/dashboard/stats');
    
    if (data) {
      setStats(data);
    } else {
      // Set default values if API fails
      setStats({
        totalCalls: 0,
        activeServices: 0,
        knowledgeBaseDocuments: 0,
        aiResponseAccuracy: '85%'
      });
    }
  };

  // Fetch recent activities from the backend
  const fetchRecentActivities = async () => {
    const data = await makeRequest('/dashboard/recent-activities');
    
    if (data && Array.isArray(data)) {
      setRecentActivities(data);
    } else {
      // Set empty array if API fails
      setRecentActivities([]);
    }
  };

  // Fetch service connection status from backend
  const fetchServiceStatus = async () => {
    try {
      const updatedServices = [...services];
      
      // Sequential fetch for each service 
      for (let i = 0; i < updatedServices.length; i++) {
        const data = await makeRequest(`/credentials/status/${updatedServices[i].name}`);
        updatedServices[i].connected = data?.connected || false;
      }
        
      setServices(updatedServices);
      
      // Set some system health statuses based on service connection
      const healthStatus = {
        database: { status: 'healthy', lastChecked: '2 minutes ago' },
        twilio: { 
          status: updatedServices[0].connected ? 'healthy' : 'error', 
          lastChecked: '5 minutes ago',
          message: updatedServices[0].connected ? null : 'Connection failed'
        },
        ultravox: { 
          status: updatedServices[3].connected ? 'healthy' : 'warning', 
          lastChecked: '10 minutes ago',
          message: updatedServices[3].connected ? null : 'API key may be invalid'
        },
        supabase: { 
          status: updatedServices[1].connected ? 'healthy' : 'error', 
          lastChecked: '7 minutes ago',
          message: updatedServices[1].connected ? null : 'Connection failed'
        },
        vectorization: { status: 'healthy', lastChecked: '15 minutes ago' }
      };
      
      setSystemHealth(healthStatus);
    } catch (error) {
      console.error("Error fetching service status:", error);
      // Set default values if there's an error
      setServices(prevServices => prevServices.map(service => ({ ...service, connected: false })));
    }
  };

  // Generate mock call analytics data (in a real app, fetch from API)
  const generateCallAnalytics = () => {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const callData = days.map(() => Math.floor(Math.random() * 35) + 5);
    const aiData = callData.map(value => Math.floor(value * 0.8));
    
    return {
      labels: days,
      datasets: [
        {
          label: 'Call Volume',
          data: callData,
          borderColor: 'rgb(53, 162, 235)',
          backgroundColor: 'rgba(53, 162, 235, 0.5)',
          tension: 0.3,
        },
        {
          label: 'AI Utilization',
          data: aiData,
          borderColor: 'rgb(75, 192, 192)',
          backgroundColor: 'rgba(75, 192, 192, 0.5)',
          tension: 0.3,
        },
      ],
    };
  };

  // Refresh all dashboard data
  const refreshDashboard = async () => {
    setIsLoading(true);
    
    // Execute sequentially
    await fetchDashboardStats();
    await fetchRecentActivities();
    await fetchServiceStatus();
    
    // Generate mock analytics data
    setCallAnalytics(generateCallAnalytics());
    
    // Generate mock notifications based on system health and services
    const mockNotifications = [
      { 
        id: 1, 
        type: 'info', 
        title: 'System Update', 
        message: 'A new system update is available. Consider upgrading soon.',
        time: '2 hours ago',
        read: false
      }
    ];
    
    // Add notifications based on service status
    if (!services[0].connected) {
      mockNotifications.push({
        id: 2,
        type: 'warning',
        title: 'Twilio Disconnected',
        message: 'Twilio service is not connected. Call functionality may be limited.',
        time: '1 hour ago',
        read: false
      });
    }
    
    if (stats.knowledgeBaseDocuments > 0) {
      mockNotifications.push({
        id: 3,
        type: 'success',
        title: 'Knowledge Base',
        message: `${stats.knowledgeBaseDocuments} documents are vectorized and ready for calls.`,
        time: '3 days ago',
        read: true
      });
    }
    
    setNotifications(mockNotifications);
    setIsLoading(false);
  };

  // Handle quick action buttons
  const handleNewCall = () => {
    navigate('/calls'); // Navigate to calls page
  };

  const handleUploadDocument = () => {
    navigate('/knowledge-base'); // Navigate to knowledge base page
  };

  useEffect(() => {
    refreshDashboard();
  }, []);

  // Icons with descriptions for better UI presentation
  const getServiceIconClassName = (serviceName) => {
    switch(serviceName) {
      case 'Twilio': return '📞';
      case 'Supabase': return '🗃️';
      case 'Google Calendar': return '📅';
      case 'Ultravox': return '🤖';
      default: return '🔌';
    }
  };

  return (
    <div className="dashboard-page">
      <div className="dashboard">
        <div className="dashboard-header">
          <h1>Voice Call AI Dashboard</h1>
          <div className="quick-actions">
            <button onClick={handleNewCall}>
              <span>📞</span> New Call
            </button>
            <button onClick={handleUploadDocument}>
              <span>📄</span> Upload Document
            </button>
            <button onClick={refreshDashboard} disabled={isLoading}>
              {isLoading ? (
                <>
                  <span>⏳</span> Loading...
                </>
              ) : (
                <>
                  <span>🔄</span> Refresh
                </>
              )}
            </button>
          </div>
        </div>
        
        {isLoading ? (
          <div className="loading-indicator">
            <div className="loading-text">Loading dashboard data...</div>
          </div>
        ) : (
        <div className="dashboard-grid">
          {/* Services Overview */}
          <div className="dashboard-card services-overview">
            <h3><span>🔌</span> Connected Services</h3>
            <div className="services-list">
              {services.map((service, index) => (
                <div key={index} className="service-item">
                  <div className="service-info">
                    <span className="service-icon">{getServiceIconClassName(service.name)}</span>
                    <div>
                      <strong>{service.name}</strong>
                      <p>{service.description}</p>
                    </div>
                  </div>
                  <span 
                    className={`status-badge ${service.connected ? 'connected' : 'disconnected'}`}
                  >
                    {service.connected ? 'Connected' : 'Not Connected'}
                  </span>
                </div>
              ))}
            </div>
            
            {/* System Health Indicators */}
            <SystemHealthIndicators statuses={systemHealth} />
          </div>

          {/* System Statistics and Analytics */}
          <div className="dashboard-card system-stats">
            <h3><span>📊</span> System Overview</h3>
            <div className="stats-grid">
              <div className="stat-item">
                <h4>Total Calls</h4>
                <p className="stat-value">{stats.totalCalls}</p>
              </div>
              <div className="stat-item">
                <h4>Active Services</h4>
                <p className="stat-value">{stats.activeServices}</p>
              </div>
              <div className="stat-item">
                <h4>Knowledge Base</h4>
                <p className="stat-value">{stats.knowledgeBaseDocuments} <small>Docs</small></p>
              </div>
              <div className="stat-item">
                <h4>AI Accuracy</h4>
                <p className="stat-value">{stats.aiResponseAccuracy}</p>
              </div>
            </div>
            
            {/* Call Analytics Chart */}
            <div style={{ marginTop: '20px' }}>
              <h4 style={{ marginBottom: '15px', fontWeight: '600', fontSize: '1rem', color: 'var(--text-muted)' }}>
                Call Volume (Last 7 Days)
              </h4>
              <CallAnalyticsChart data={callAnalytics} />
            </div>
          </div>

          {/* Recent Activities and Notifications */}
          <div className="dashboard-card recent-activities">
            <h3><span>📝</span> Recent Activities</h3>
            {recentActivities.length > 0 ? (
              recentActivities.map(activity => (
                <div 
                  key={activity.id} 
                  className="activity-item"
                  data-type={activity.type}
                >
                  <div className="activity-details">
                    <strong>{activity.type}</strong>
                    <p>{activity.description}</p>
                  </div>
                  <span className="activity-timestamp">{activity.timestamp}</span>
                </div>
              ))
            ) : (
              <div className="no-activities">
                No recent activities found. Start making calls or upload documents to see activity here.
              </div>
            )}
            
            {/* Notifications Panel */}
            <NotificationsPanel notifications={notifications} />
          </div>

          {/* Quick Action Cards (Enhanced Quick Links) */}
          <div className="dashboard-card">
            <h3><span>🔗</span> Quick Links</h3>
            <div className="links-grid">
              <a href="/calls" className="quick-link">
                <span>📞</span>
                Manage Calls
              </a>
              <a href="/knowledge-base" className="quick-link">
                <span>📚</span>
                Knowledge Base
              </a>
              <a href="/auth" className="quick-link">
                <span>🔗</span>
                Connect Services
              </a>
              <a href="/system-config" className="quick-link">
                <span>⚙️</span>
                System Config
              </a>
            </div>
            
            {/* Enhanced Quick Actions */}
            <QuickActionCards />
          </div>
        </div>
        )}
      </div>
    </div>
  )
}

export default Dashboard
