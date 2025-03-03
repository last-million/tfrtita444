import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useLanguage } from '../context/LanguageContext';
import translations from '../translations';
import './CallDetails.css';

const CallDetails = () => {
  const { callSid } = useParams();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const [callDetails, setCallDetails] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('details');
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);
  const [playingAudio, setPlayingAudio] = useState(false);

  // Fetch call details on component mount
  useEffect(() => {
    fetchCallDetails();
  }, [callSid]);

  const fetchCallDetails = async () => {
    setIsLoading(true);
    try {
      const response = await api.get(`/api/calls/${callSid}`);
      setCallDetails(response.data);
    } catch (error) {
      console.error("Error fetching call details:", error);
      // For demo purposes, set mock data
      setCallDetails(generateMockCallDetails());
    } finally {
      setIsLoading(false);
    }
  };

  // Generate mock call details for demonstration
  const generateMockCallDetails = () => {
    return {
      id: 123,
      call_sid: callSid,
      from_number: '+1234567890',
      to_number: '+1555789012',
      direction: Math.random() > 0.5 ? 'inbound' : 'outbound',
      status: 'completed',
      start_time: new Date(Date.now() - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000)).toISOString(),
      end_time: new Date(Date.now() - Math.floor(Math.random() * 6 * 24 * 60 * 60 * 1000)).toISOString(),
      duration: 352,
      recording_url: 'https://example.com/recording.mp3',
      transcription: generateMockTranscription(),
      cost: 1.75,
      ultravox_cost: 0.89,
      segments: 12,
      hang_up_by: Math.random() > 0.5 ? 'user' : 'agent',
      created_at: new Date(Date.now() - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000)).toISOString(),
      system_prompt: "You are a helpful assistant. Your name is Steve and you are helping customers with their orders. Be professional but conversational.",
      language_hint: "en",
      voice: "Mark",
      temperature: 0.4,
      model: "fixie-ai/ultravox-70B",
      tools_used: [
        { name: "lookupOrder", times_used: 2 },
        { name: "checkInventory", times_used: 1 },
        { name: "updateCustomerInfo", times_used: 1 }
      ],
      knowledge_base_access: true,
      knowledge_base_sources: [
        "Product Catalog - January 2025",
        "Customer Service Guidelines"
      ],
      technical_details: {
        initial_medium: "voice",
        max_duration: "3600s",
        join_timeout: "30s"
      }
    };
  };

  // Generate mock transcript for demonstration
  const generateMockTranscription = () => {
    return [
      { role: 'agent', text: 'Hello, thank you for calling our service. My name is Steve. How can I help you today?', timestamp: '00:00:05' },
      { role: 'user', text: 'Hi, I\'m calling about my recent order. I think there might be a mistake.', timestamp: '00:00:11' },
      { role: 'agent', text: 'I\'d be happy to look into that for you. Could you please provide your order number or the email address associated with the order?', timestamp: '00:00:18' },
      { role: 'user', text: 'It\'s john.smith@example.com', timestamp: '00:00:25' },
      { role: 'agent', text: 'Thank you. Let me check that for you... I see your order #12345 placed on January 15th. It looks like you ordered the Premium Package with express shipping. Is that correct?', timestamp: '00:00:38' },
      { role: 'user', text: 'Yes, that\'s right, but I was charged for two packages and I only ordered one.', timestamp: '00:00:47' },
      { role: 'agent', text: 'I apologize for the confusion. Let me verify the charge details... You\'re absolutely right. I can see there was a duplicate charge. I\'ll process a refund for the extra charge immediately. The refund should appear on your account within 3-5 business days.', timestamp: '00:01:10' },
      { role: 'user', text: 'Great, thank you. That\'s very helpful.', timestamp: '00:01:18' },
      { role: 'agent', text: 'You\'re welcome. Is there anything else I can assist you with today?', timestamp: '00:01:23' },
      { role: 'user', text: 'No, that\'s all I needed. Thanks for your help.', timestamp: '00:01:28' },
      { role: 'agent', text: 'Thank you for calling. Have a great day!', timestamp: '00:01:32' }
    ];
  };

  const formatPhoneNumber = (phoneNumber) => {
    if (!phoneNumber) return '--';
    // Basic formatting for phone numbers
    if (phoneNumber.length === 10) {
      return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3, 6)}-${phoneNumber.slice(6)}`;
    }
    return phoneNumber;
  };

  const formatDateTime = (dateTimeStr) => {
    if (!dateTimeStr) return '--';
    const date = new Date(dateTimeStr);
    return new Intl.DateTimeFormat(language === 'en' ? 'en-US' : language === 'fr' ? 'fr-FR' : 'ar-SA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(date);
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatCurrency = (amount) => {
    if (amount === undefined || amount === null) return '--';
    return new Intl.NumberFormat(language === 'en' ? 'en-US' : language === 'fr' ? 'fr-FR' : 'ar-SA', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const handlePlayAudio = () => {
    if (!callDetails?.recording_url) return;
    setPlayingAudio(!playingAudio);
    // In a real application, you would control the audio element here
  };

  const handleGoBack = () => {
    navigate(-1);
  };

  if (isLoading) {
    return (
      <div className="call-details-page">
        <div className="loading-indicator">
          <div className="spinner"></div>
          <p>{translations[language].loading}</p>
        </div>
      </div>
    );
  }

  if (!callDetails) {
    return (
      <div className="call-details-page">
        <div className="error-container">
          <h2>{translations[language].callNotFound}</h2>
          <p>{translations[language].callDetailsError}</p>
          <button onClick={handleGoBack} className="back-button">
            {translations[language].goBack}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="call-details-page">
      {/* Top Bar with Back Button */}
      <div className="call-details-top-bar">
        <button onClick={handleGoBack} className="back-button">
          ← {translations[language].backToCallHistory}
        </button>
        <h1>{translations[language].callDetails}</h1>
      </div>

      {/* Call Info Summary Card */}
      <div className="call-summary-card">
        <div className="call-summary-header">
          <div className="call-direction-badge">
            {callDetails.direction === 'inbound' ? '📥' : '📤'} 
            {translations[language][callDetails.direction]}
          </div>
          <div className="call-id">ID: {callDetails.call_sid}</div>
        </div>
        
        <div className="call-summary-grid">
          <div className="summary-item">
            <span className="summary-label">{translations[language].fromNumber}</span>
            <span className="summary-value">{formatPhoneNumber(callDetails.from_number)}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">{translations[language].toNumber}</span>
            <span className="summary-value">{formatPhoneNumber(callDetails.to_number)}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">{translations[language].startTime}</span>
            <span className="summary-value">{formatDateTime(callDetails.start_time)}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">{translations[language].endTime}</span>
            <span className="summary-value">{formatDateTime(callDetails.end_time)}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">{translations[language].duration}</span>
            <span className="summary-value">{formatDuration(callDetails.duration)}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">{translations[language].status}</span>
            <span className={`summary-value status-${callDetails.status}`}>
              {translations[language][callDetails.status] || callDetails.status}
            </span>
          </div>
          <div className="summary-item">
            <span className="summary-label">{translations[language].hangUpBy}</span>
            <span className="summary-value">
              {callDetails.hang_up_by ? translations[language][callDetails.hang_up_by] : '--'}
            </span>
          </div>
          <div className="summary-item">
            <span className="summary-label">{translations[language].totalCost}</span>
            <span className="summary-value">{formatCurrency(callDetails.cost + callDetails.ultravox_cost)}</span>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="call-details-tabs">
        <button 
          className={`tab-button ${activeTab === 'details' ? 'active' : ''}`}
          onClick={() => setActiveTab('details')}
        >
          {translations[language].callDetails}
        </button>
        <button 
          className={`tab-button ${activeTab === 'transcript' ? 'active' : ''}`}
          onClick={() => setActiveTab('transcript')}
        >
          {translations[language].transcript}
        </button>
        <button 
          className={`tab-button ${activeTab === 'technical' ? 'active' : ''}`}
          onClick={() => setActiveTab('technical')}
        >
          {translations[language].technicalDetails}
        </button>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {/* Details Tab */}
        {activeTab === 'details' && (
          <div className="details-tab">
            <div className="details-card">
              <h3 className="card-title">
                <span className="card-icon">📊</span>
                {translations[language].callMetrics}
              </h3>
              <div className="details-grid">
                <div className="detail-item">
                  <span className="detail-label">{translations[language].date}</span>
                  <span className="detail-value">{formatDateTime(callDetails.start_time).split(',')[0]}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">{translations[language].timeStarted}</span>
                  <span className="detail-value">{formatDateTime(callDetails.start_time).split(',')[1]}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">{translations[language].timeEnded}</span>
                  <span className="detail-value">{formatDateTime(callDetails.end_time).split(',')[1]}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">{translations[language].duration}</span>
                  <span className="detail-value">{formatDuration(callDetails.duration)}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">{translations[language].segments}</span>
                  <span className="detail-value">{callDetails.segments || '--'}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">{translations[language].baseCost}</span>
                  <span className="detail-value">{formatCurrency(callDetails.cost)}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">{translations[language].ultravoxCost}</span>
                  <span className="detail-value">{formatCurrency(callDetails.ultravox_cost)}</span>
                </div>
                <div className="detail-item total-cost">
                  <span className="detail-label">{translations[language].totalCost}</span>
                  <span className="detail-value">{formatCurrency(callDetails.cost + callDetails.ultravox_cost)}</span>
                </div>
              </div>
            </div>

            {callDetails.recording_url && (
              <div className="details-card">
                <h3 className="card-title">
                  <span className="card-icon">🔊</span>
                  {translations[language].recording}
                </h3>
                <div className="audio-player-container">
                  <audio 
                    className="audio-player"
                    src={callDetails.recording_url}
                    controls
                  />
                  <div className="audio-controls">
                    <button 
                      className={`play-button ${playingAudio ? 'playing' : ''}`}
                      onClick={handlePlayAudio}
                    >
                      {playingAudio ? '⏸️' : '▶️'}
                      {playingAudio ? translations[language].pause : translations[language].play}
                    </button>
                    <a 
                      href={callDetails.recording_url}
                      download
                      className="download-button"
                    >
                      ⬇️ {translations[language].download}
                    </a>
                  </div>
                </div>
              </div>
            )}

            <div className="details-card">
              <h3 className="card-title">
                <span className="card-icon">🤖</span>
                {translations[language].aiConfiguration}
              </h3>
              <div className="details-grid">
                <div className="detail-item">
                  <span className="detail-label">{translations[language].model}</span>
                  <span className="detail-value">{callDetails.model || '--'}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">{translations[language].temperature}</span>
                  <span className="detail-value">{callDetails.temperature || '--'}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">{translations[language].voice}</span>
                  <span className="detail-value">{callDetails.voice || '--'}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">{translations[language].language}</span>
                  <span className="detail-value">{callDetails.language_hint || '--'}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">{translations[language].knowledgeBaseAccess}</span>
                  <span className="detail-value">
                    {callDetails.knowledge_base_access ? 
                      translations[language].enabled : translations[language].disabled}
                  </span>
                </div>
              </div>
            </div>

            {callDetails.tools_used && callDetails.tools_used.length > 0 && (
              <div className="details-card">
                <h3 className="card-title">
                  <span className="card-icon">🔧</span>
                  {translations[language].toolsUsed}
                </h3>
                <div className="tools-list">
                  {callDetails.tools_used.map((tool, index) => (
                    <div key={index} className="tool-item">
                      <span className="tool-name">{tool.name}</span>
                      <span className="tool-count">
                        {translations[language].usedTimes.replace('{count}', tool.times_used)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {callDetails.knowledge_base_sources && callDetails.knowledge_base_sources.length > 0 && (
              <div className="details-card">
                <h3 className="card-title">
                  <span className="card-icon">📚</span>
                  {translations[language].knowledgeBase}
                </h3>
                <div className="knowledge-base-list">
                  {callDetails.knowledge_base_sources.map((source, index) => (
                    <div key={index} className="knowledge-base-item">
                      <span className="knowledge-base-icon">📝</span>
                      <span className="knowledge-base-name">{source}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Transcript Tab */}
        {activeTab === 'transcript' && (
          <div className="transcript-tab">
            <div className="transcript-controls">
              <button 
                className="expand-button"
                onClick={() => setTranscriptExpanded(!transcriptExpanded)}
              >
                {transcriptExpanded ? translations[language].collapseAll : translations[language].expandAll}
              </button>
              <button className="download-transcript">
                ⬇️ {translations[language].downloadTranscript}
              </button>
            </div>

            {callDetails.transcription && (
              <div className="transcript-container">
                {callDetails.transcription.map((message, index) => (
                  <div 
                    key={index} 
                    className={`transcript-message ${message.role}-message ${
                      transcriptExpanded ? 'expanded' : ''
                    }`}
                  >
                    <div className="message-header">
                      <span className={`message-role ${message.role}`}>
                        {message.role === 'agent' ? '🤖 AI' : '👤 User'}
                      </span>
                      <span className="message-time">{message.timestamp}</span>
                    </div>
                    <div className="message-content">
                      {message.text}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!callDetails.transcription && (
              <div className="no-transcript">
                <p>{translations[language].noTranscript}</p>
              </div>
            )}
          </div>
        )}

        {/* Technical Details Tab */}
        {activeTab === 'technical' && (
          <div className="technical-tab">
            <div className="details-card">
              <h3 className="card-title">
                <span className="card-icon">⚙️</span>
                {translations[language].configurationSettings}
              </h3>
              <div className="details-grid">
                <div className="detail-item">
                  <span className="detail-label">{translations[language].callSid}</span>
                  <span className="detail-value">{callDetails.call_sid}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">{translations[language].initialMedium}</span>
                  <span className="detail-value">{callDetails.technical_details?.initial_medium || '--'}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">{translations[language].maxDuration}</span>
                  <span className="detail-value">{callDetails.technical_details?.max_duration || '--'}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">{translations[language].joinTimeout}</span>
                  <span className="detail-value">{callDetails.technical_details?.join_timeout || '--'}</span>
                </div>
              </div>
            </div>

            <div className="details-card">
              <h3 className="card-title">
                <span className="card-icon">💬</span>
                {translations[language].systemPrompt}
              </h3>
              <div className="system-prompt-container">
                <pre className="system-prompt">{callDetails.system_prompt || translations[language].notAvailable}</pre>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CallDetails;
