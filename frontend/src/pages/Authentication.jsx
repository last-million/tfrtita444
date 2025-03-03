import React, { useState, useEffect } from 'react'
import ServiceConnectionManager from '../services/ServiceConnectionManager'
import './Authentication.css'
import { useLanguage } from '../context/LanguageContext';
import translations from '../translations';

function Authentication() {
  const [services, setServices] = useState([])
  const [selectedService, setSelectedService] = useState(null)
  const [newCredentials, setNewCredentials] = useState({})
  const [validationError, setValidationError] = useState({})
  const [visibleFields, setVisibleFields] = useState({})
  const [redirectUris, setRedirectUris] = useState({});
  const [serverDomain, setServerDomain] = useState('');
  const { language } = useLanguage();

  useEffect(() => {
    loadServices()
    generateDomain()
  }, [])

  const loadServices = () => {
    const savedConnectionStatus = JSON.parse(localStorage.getItem('serviceConnectionStatus') || '{}')
    const savedCredentials = JSON.parse(localStorage.getItem('serviceCredentials') || '{}')
    
    const initialServices = ServiceConnectionManager.getAllServices().map(serviceName => ({
      name: serviceName,
      icon: getServiceIcon(serviceName),
      connected: !!savedConnectionStatus[serviceName],
      credentials: savedCredentials[serviceName] || {},
      connectionTypes: ServiceConnectionManager.getServiceConfig(serviceName).connectionTypes
    })).filter(service => service.name !== 'Knowledge Base')
    setServices(initialServices)
  }

  const getServiceIcon = (serviceName) => {
    const icons = {
      'Ultravox': '🤖',
      'Supabase': '🗃️',
      'Google Calendar': '📅',
      'Twilio': '📞',
      'SERP API': '🔍',
      'Airtable': '\ud83d\udcca',
      'Gmail': '\u2709',
      'Google Drive': '💾'
    }
    return icons[serviceName] || '🔗'
  }

  const openCredentialsModal = (service) => {
    const serviceConfig = ServiceConnectionManager.getServiceConfig(service.name);
    const initialCredentials = {};

    if (serviceConfig && serviceConfig.manualFields) {
      serviceConfig.manualFields.forEach(field => {
        initialCredentials[field.key] = service.credentials[field.key] || field.defaultValue || '';
      });
    }

    setSelectedService({...service});
    setNewCredentials(initialCredentials);
    setValidationError({});
    setVisibleFields({});
  }

  const handleCredentialChange = (key, value) => {
    setNewCredentials(prev => ({
      ...prev,
      [key]: value
    }))
  }

  const saveCredentials = () => {
    if (!selectedService) return

    const connectionStatus = JSON.parse(localStorage.getItem('serviceConnectionStatus') || '{}')
    connectionStatus[selectedService.name] = true

    const savedCredentials = JSON.parse(localStorage.getItem('serviceCredentials') || '{}')
    savedCredentials[selectedService.name] = newCredentials

    localStorage.setItem('serviceConnectionStatus', JSON.stringify(connectionStatus))
    localStorage.setItem('serviceCredentials', JSON.stringify(savedCredentials))
    
    setServices(prev => prev.map(service => 
      service.name === selectedService.name 
        ? {...service, connected: true, credentials: newCredentials}
        : service
    ))

    setSelectedService(null)
    setVisibleFields({})
    alert(`${selectedService.name} credentials saved successfully! (Credentials are only stored in local storage and will not persist across sessions.)`)
  }

  const connectService = (serviceName) => {
    const updatedConnectionStatus = JSON.parse(localStorage.getItem('serviceConnectionStatus') || '{}')
    updatedConnectionStatus[serviceName] = true;
    localStorage.setItem('serviceConnectionStatus', JSON.stringify(updatedConnectionStatus));

    setServices(prev => prev.map(service => {
      if (service.name === serviceName) {
        return { ...service, connected: true };
      }
      return service;
    }));
    alert(`${serviceName} connected successfully!`);
  }

  const disconnectService = (serviceName) => {
    const updatedConnectionStatus = JSON.parse(localStorage.getItem('serviceConnectionStatus') || '{}')
    const updatedCredentials = JSON.parse(localStorage.getItem('serviceCredentials') || '{}')
    
    delete updatedConnectionStatus[serviceName]
    delete updatedCredentials[serviceName]
    
    localStorage.setItem('serviceConnectionStatus', JSON.stringify(updatedConnectionStatus))
    localStorage.setItem('serviceCredentials', JSON.stringify(updatedCredentials))
    
    setServices(prev => prev.map(service => 
      service.name === serviceName 
        ? {...service, connected: false, credentials: {}} 
        : service
    ))

    alert(`${serviceName} disconnected successfully!`)
  }

  const toggleServiceConnection = (serviceName, isConnected) => {
    if (isConnected) {
      disconnectService(serviceName);
    } else {
       openCredentialsModal(services.find(service => service.name === serviceName));
    }
  };

  const toggleFieldVisibility = (fieldKey) => {
    setVisibleFields(prev => ({
      ...prev,
      [fieldKey]: !prev[fieldKey]
    }))
  }

  const clearCredentialField = (fieldKey) => {
    setNewCredentials(prev => {
      const newCreds = {...prev}
      delete newCreds[fieldKey]
      return newCreds
    })
  }

  const generateDomain = () => {
    let detectedDomain = window.location.hostname;
    if (window.location.port) {
      detectedDomain = `${detectedDomain}:${window.location.port}`;
    }
    setServerDomain(detectedDomain);

    const uris = {
      'Google Calendar': `https://${detectedDomain}/oauth/callback`,
      'Gmail': `https://${detectedDomain}/oauth/callback`,
      'Google Drive': `https://${detectedDomain}/oauth/callback`
    };
    setRedirectUris(uris);
  };

  const renderCredentialsModal = () => {
    if (!selectedService) return null

    const serviceConfig = ServiceConnectionManager.getServiceConfig(selectedService.name)
    if (!serviceConfig) return null

    const showRedirectUris = ['Google Calendar', 'Gmail', 'Google Drive'].includes(selectedService.name);

    return (
      <div className="credentials-modal">
        <div className="credentials-modal-content">
          <div className="credentials-modal-header">
            <h2>{selectedService.connected ? translations[language].editCredentials : translations[language].connect} {selectedService.name}</h2>
            <button 
              className="close-modal-btn"
              onClick={() => setSelectedService(null)}
            >
              ✕
            </button>
          </div>

          <div className="credentials-form">
            {serviceConfig.manualFields.map(field => (
              <div key={field.key} className="credential-input">
                <label htmlFor={field.key}>{field.label}</label>
                <div className="input-wrapper">
                  <input
                    id={field.key}
                    type={field.sensitive && !visibleFields[field.key] ? 'password' : field.type}
                    placeholder={field.placeholder}
                    value={newCredentials[field.key] || ''}
                    onChange={(e) => handleCredentialChange(field.key, e.target.value)}
                  />
                  <div className="field-actions">
                    {field.sensitive && (
                      <button 
                        type="button"
                        className="toggle-visibility-btn"
                        onClick={() => toggleFieldVisibility(field.key)}
                      >
                        {visibleFields[field.key] ? '👁️' : '👁️‍🗨️'}
                      </button>
                    )}
                    <button 
                      type="button"
                      className="clear-field-btn"
                      onClick={() => clearCredentialField(field.key)}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {showRedirectUris && redirectUris[selectedService.name] && (
            <div className="redirect-uri">
              <p>
                **{translations[language].redirectUriForGoogleCloudConsole}:**
                <code>{redirectUris[selectedService.name]}</code>
              </p>
              <p>**{translations[language].note}:** {translations[language].ifDomainNameNotDetected}</p>
            </div>
          )}
          <div className="credentials-modal-actions">
            <button 
              className="save-credentials-btn"
              onClick={saveCredentials}
            >
              {selectedService.connected ? translations[language].update : translations[language].connect} {selectedService.name}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="authentication-page">
      <div className="config-header">
        <h1>{translations[language].serviceConnections}</h1>
        <p>{translations[language].configureAndManage}</p>
      </div>
      
      <div className="config-section services-section">
        <h2>{translations[language].availableServices}</h2>
        <div className="services-grid">
          {services.map((service, index) => (
            <div 
              key={index} 
              className={`service-card ${service.connected ? 'enabled' : ''}`}
            >
              <div className="service-header">
                <span className="service-icon">{service.icon}</span>
                <h3>{service.name}</h3>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={service.connected}
                    onChange={() => toggleServiceConnection(service.name, service.connected)}
                  />
                  <span className="slider"></span>
                </label>
              </div>
              <p>{ServiceConnectionManager.getServiceConfig(service.name)?.description || translations[language].connectToManage}</p>
              <button 
                className="edit-credentials-btn"
                onClick={() => openCredentialsModal(service)}
              >
                {service.connected ? translations[language].editCredentials : translations[language].connect}
              </button>
            </div>
          ))}
        </div>
      </div>

      {selectedService && renderCredentialsModal()}
    </div>
  )
}

export default Authentication
