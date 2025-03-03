import React from 'react';
import { useNavigate } from 'react-router-dom';

const QuickActionCards = () => {
  const navigate = useNavigate();
  
  // Define common quick actions
  const actions = [
    {
      id: 'schedule-campaign',
      title: 'Schedule Call Campaign',
      description: 'Set up a bulk call campaign for multiple recipients',
      icon: '📅',
      color: 'var(--info-color)',
      onClick: () => navigate('/calls?action=schedule')
    },
    {
      id: 'update-kb',
      title: 'Update Knowledge Base',
      description: 'Add new documents to the knowledge base',
      icon: '📚',
      color: 'var(--success-color)',
      onClick: () => navigate('/knowledge-base?action=upload')
    },
    {
      id: 'analyze-calls',
      title: 'Call Analytics',
      description: 'View detailed analytics for recent calls',
      icon: '📊',
      color: 'var(--warning-color)',
      onClick: () => navigate('/call-history?action=analyze')
    }
  ];
  
  return (
    <div className="quick-action-cards-container">
      <h4>Quick Actions</h4>
      <div className="quick-action-cards-grid">
        {actions.map(action => (
          <div
            key={action.id}
            className="quick-action-card"
            onClick={action.onClick}
            style={{ borderLeft: `4px solid ${action.color}` }}
          >
            <div className="quick-action-icon" style={{ backgroundColor: action.color }}>
              {action.icon}
            </div>
            <div className="quick-action-content">
              <h5>{action.title}</h5>
              <p>{action.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default QuickActionCards;
