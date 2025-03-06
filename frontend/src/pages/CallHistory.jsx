import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './CallHistory.css';
import CallService from '../services/CallService';
import { useLanguage } from '../context/LanguageContext';
import translations from '../translations';

const CallHistory = () => {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const [callLogs, setCallLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchCallHistory(currentPage, selectedFilter, searchQuery);
  }, [currentPage, selectedFilter, searchQuery]);

  const fetchCallHistory = async (page, filter, query) => {
    setIsLoading(true);
    try {
      let params = { page, limit: 10 };
      
      if (filter && filter !== 'all') {
        params.status = filter;
      }
      
      if (query) {
        params.search = query;
      }
      
      // Use the CallService
      const response = await CallService.getCallHistory(params);
      
      if (response && response.calls) {
        setCallLogs(response.calls);
        setTotalPages(Math.ceil((response.pagination?.total || response.calls.length || 0) / 10));
      } else {
        setCallLogs([]);
        setTotalPages(1);
      }
    } catch (error) {
      console.error("Error fetching call history:", error);
      // Don't show mock data in production, show an empty state instead
      setCallLogs([]);
      setTotalPages(1);
      
      // In production, you might want to show a more user-friendly error
      // toast.error("Unable to load call history. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewDetails = (callSid) => {
    navigate(`/call-details/${callSid}`);
  };

  const handleFilterChange = (event) => {
    setSelectedFilter(event.target.value);
    setCurrentPage(1);
  };

  const handleSearch = (event) => {
    event.preventDefault();
    // Reset to first page when searching
    setCurrentPage(1);
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'completed': return 'badge-success';
      case 'failed': return 'badge-danger';
      case 'missed': return 'badge-warning';
      case 'in-progress': return 'badge-info';
      default: return 'badge-secondary';
    }
  };

  const getDirectionIcon = (direction) => {
    return direction === 'inbound' ? '📥' : '📤';
  };

  return (
    <div className="call-history-page">
      <div className="call-history-header">
        <h1>{translations[language].callHistory}</h1>
        <div className="call-history-actions">
          <div className="filter-section">
            <select 
              value={selectedFilter}
              onChange={handleFilterChange}
              className="filter-select"
            >
              <option value="all">{translations[language].allCalls}</option>
              <option value="completed">{translations[language].completed}</option>
              <option value="failed">{translations[language].failed}</option>
              <option value="missed">{translations[language].missed}</option>
              <option value="in-progress">{translations[language].inProgress}</option>
            </select>
          </div>
          <form onSubmit={handleSearch} className="search-form">
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={translations[language].searchCalls}
              className="search-input"
            />
            <button type="submit" className="search-button">
              🔍
            </button>
          </form>
        </div>
      </div>

      {isLoading ? (
        <div className="loading-indicator">
          <div className="spinner"></div>
          <p>{translations[language].loading}</p>
        </div>
      ) : (
        <>
          <div className="call-logs-table">
            <div className="call-logs-header">
              <div className="call-cell">{translations[language].direction}</div>
              <div className="call-cell">{translations[language].fromNumber}</div>
              <div className="call-cell">{translations[language].toNumber}</div>
              <div className="call-cell">{translations[language].startTime}</div>
              <div className="call-cell">{translations[language].duration}</div>
              <div className="call-cell">{translations[language].status}</div>
              <div className="call-cell">{translations[language].hangUpBy}</div>
              <div className="call-cell">{translations[language].actions}</div>
            </div>
            
            {callLogs.length > 0 ? (
              <div className="call-logs-body">
                {callLogs.map((call) => (
                  <div key={call.id} className="call-logs-row">
                    <div className="call-cell direction-cell">
                      <span className="direction-icon">{getDirectionIcon(call.direction)}</span>
                      {translations[language][call.direction]}
                    </div>
                    <div className="call-cell">{formatPhoneNumber(call.from_number)}</div>
                    <div className="call-cell">{formatPhoneNumber(call.to_number)}</div>
                    <div className="call-cell">{formatDateTime(call.start_time)}</div>
                    <div className="call-cell">{formatDuration(call.duration)}</div>
                    <div className="call-cell">
                      <span className={`status-badge ${getStatusBadgeClass(call.status)}`}>
                        {translations[language][call.status] || call.status}
                      </span>
                    </div>
                    <div className="call-cell">
                      {call.hang_up_by ? translations[language][call.hang_up_by] : '--'}
                    </div>
                    <div className="call-cell">
                      <button 
                        className="details-button"
                        onClick={() => handleViewDetails(call.call_sid)}
                        aria-label={translations[language].viewDetails}
                      >
                        {translations[language].details}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="no-calls-message">
                <p>{translations[language].noCallsFound}</p>
              </div>
            )}
          </div>

          {callLogs.length > 0 && (
            <div className="pagination">
              <button 
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="pagination-button"
              >
                &laquo; {translations[language].previous}
              </button>
              <span className="pagination-info">
                {translations[language].page} {currentPage} {translations[language].of} {totalPages}
              </span>
              <button 
                onClick={() => setCurrentPage(prev => prev < totalPages ? prev + 1 : prev)}
                disabled={currentPage >= totalPages}
                className="pagination-button"
              >
                {translations[language].next} &raquo;
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default CallHistory;
