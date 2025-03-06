import React, { useState, useEffect } from 'react'
import './CallManager.css'
import ServiceConnectionManager from '../services/ServiceConnectionManager'
import { useLanguage } from '../context/LanguageContext';
import translations from '../translations';
import CallService from '../services/CallService';
import UltravoxToolsManager from '../services/UltravoxToolsManager';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPhone, faClock, faUser, faFileAudio, faFileText, faDollarSign, faList, faCalendar, faEnvelope } from '@fortawesome/free-solid-svg-icons';

function CallManager() {
  const [phoneNumbers, setPhoneNumbers] = useState('')
  const [callType, setCallType] = useState('outbound')
  const [clients, setClients] = useState([
    { id: 1, name: 'John Doe', phoneNumber: '+1234567890', email: 'john.doe@example.com', address: '123 Main St' },
    { id: 2, name: 'Jane Smith', phoneNumber: '+9876543210', email: 'jane.smith@example.com', address: '456 Oak Ave' }
  ])
  const [nextClientId, setNextClientId] = useState(3)
  const [showAddClientModal, setShowAddClientModal] = useState(false)
  const [newClient, setNewClient] = useState({ name: '', phoneNumber: '', email: '', address: '' })
  const [editingClientId, setEditingClientId] = useState(null)
  const [selectedClientIds, setSelectedClientIds] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState('');
  const [availableVoices, setAvailableVoices] = useState({
    'English': [
      'Tanya-English',
      'Mark-English',
      'Jessica-English',
      'John-English',
      'Alice-English'
    ],
    'French': [
      'Marie-French',
      'Pierre-French',
      'Sophie-French'
    ],
    'Spanish': [
      'Isabella-Spanish',
      'Javier-Spanish'
    ],
    'Arabic': [
      'Layla-Arabic',
      'Ahmed-Arabic',
      'Fatima-Arabic'
    ]
  });
  const [webhookUrl, setWebhookUrl] = useState('');
  const [inboundCallTools, setInboundCallTools] = useState([]);
  const { language } = useLanguage();

  useEffect(() => {
    // Load clients from local storage on component mount
    const storedClients = localStorage.getItem('clients');
    if (storedClients) {
      setClients(JSON.parse(storedClients));
      setNextClientId(JSON.parse(storedClients).length + 1)
    }
  }, []);

  useEffect(() => {
    // Save clients to local storage whenever the clients state changes
    localStorage.setItem('clients', JSON.stringify(clients));
  }, [clients]);

  useEffect(() => {
    // Simulate getting the server domain
    // Replace with actual logic to get the server domain in a production environment
    const serverDomain = "your-server-domain.com";
    setWebhookUrl(`https://${serverDomain}/api/incoming-call`);
  }, []);

  const handleBulkCall = async () => {
    try {
      const numbers = phoneNumbers.split('\n').filter(num => num.trim() !== '')
      if (numbers.length === 0) {
        alert("Please enter at least one phone number to call.");
        return;
      }
      
      console.log('Initiating calls:', numbers)

      const ultravoxApiKey = ServiceConnectionManager.getCredentials('Ultravox').apiKey;

      if (!ultravoxApiKey) {
          alert("Ultravox API Key is not configured. Please connect Ultravox service.");
          return;
      }

      // Create a properly formatted Ultravox API URL based on latest documentation
      const ultravoxUrl = `https://api.ultravox.ai/v1/media/${ultravoxApiKey}`;
      
      // Show notification that calls are being initiated
      const initiatingMessage = document.createElement('div');
      initiatingMessage.className = 'call-initiating-message';
      initiatingMessage.textContent = `Initiating calls to ${numbers.length} numbers...`;
      document.body.appendChild(initiatingMessage);
      
      try {
        // Use the CallService to initiate calls to multiple numbers
        const results = await CallService.initiateMultipleCalls(numbers, ultravoxUrl);
        
        // Remove notification
        document.body.removeChild(initiatingMessage);
        
        // Log results
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        
        console.log(`Call results: ${successful} successful, ${failed} failed`);
        
        // Show failures if any
        const failures = results.filter(r => !r.success);
        if (failures.length > 0) {
          // Get common error message if all have the same error
          const commonError = failures.every(f => f.error === failures[0].error) 
            ? failures[0].error 
            : null;
          
          const failureMessages = failures.map(f => `${f.number}: ${f.error}`).join('\n');
          console.error('Failed calls:', failureMessages);
          
          if (commonError && commonError.includes('502')) {
            alert(`Backend call service is currently unavailable (502 Bad Gateway). This is likely due to server maintenance or network issues.`);
          } else if (commonError) {
            alert(`All calls failed with the same error: ${commonError}`);
          } else if (failures.length < numbers.length) {
            alert(`${successful} calls initiated successfully, but ${failed} failed. See console for details.`);
          } else {
            alert(`All calls failed. See console for details.`);
          }
        } else {
          alert(`Successfully initiated ${callType} calls to ${numbers.length} numbers`);
        }
      } catch (error) {
        // Remove notification in case of error
        if (document.body.contains(initiatingMessage)) {
          document.body.removeChild(initiatingMessage);
        }
        throw error; // Re-throw to be handled by outer catch
      }
    } catch (error) {
      console.error('Error in bulk call:', error);
      
      // Provide more helpful error message
      if (error.message && error.message.includes('502')) {
        alert(`The call system is currently unavailable. This could be due to server maintenance or network issues.`);
      } else {
        alert(`Error initiating bulk calls: ${error.message}`);
      }
    }
  }

  const handleOpenAddClientModal = () => {
    setShowAddClientModal(true);
    setNewClient({ name: '', phoneNumber: '', email: '', address: '' });
  };

  const handleCloseAddClientModal = () => {
    setShowAddClientModal(false);
    setEditingClientId(null);
  };

  const handleNewClientChange = (e) => {
    setNewClient({ ...newClient, [e.target.name]: e.target.value });
  };

  const handleAddClient = () => {
    if (newClient.name && newClient.phoneNumber) {
      const newClientId = editingClientId || nextClientId;
      const updatedClient = { ...newClient, id: newClientId };

      if (editingClientId) {
        // Edit existing client
        setClients(clients.map(client =>
          client.id === editingClientId ? updatedClient : client
        ));
      } else {
        // Add new client
        setClients([...clients, updatedClient]);
        setNextClientId(nextClientId + 1)
      }

      handleCloseAddClientModal();
    } else {
      alert('Name and phone number are required.');
    }
  };

  const handleEditClient = (clientId) => {
    const clientToEdit = clients.find(client => client.id === clientId);
    if (clientToEdit) {
      setEditingClientId(clientId);
      setNewClient(clientToEdit);
      setShowAddClientModal(true);
    }
  };

  const handleDeleteClient = (clientId) => {
    setClients(clients.filter(client => client.id !== clientId));
  };

  const handleCellChange = (clientId, field, value) => {
    setClients(clients.map(client => {
      if (client.id === clientId) {
        return { ...client, [field]: value };
      }
      return client;
    }));
  };

  const handleCheckboxChange = (clientId) => {
    setSelectedClientIds(prev => {
      if (prev.includes(clientId)) {
        return prev.filter(id => id !== clientId);
      } else {
        return [...prev, clientId];
      }
    });
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedClientIds(clients.map(client => client.id));
    } else {
      setSelectedClientIds([]);
    }
  };

  const handleCallSelected = async () => {
    try {
      const selectedNumbers = clients
        .filter(client => selectedClientIds.includes(client.id))
        .map(client => client.phoneNumber);
      
      if (selectedNumbers.length === 0) {
        alert('No clients selected. Please select at least one client to call.');
        return;
      }
      
      const ultravoxApiKey = ServiceConnectionManager.getCredentials('Ultravox').apiKey;
      
      if (!ultravoxApiKey) {
        alert("Ultravox API Key is not configured. Please connect Ultravox service.");
        return;
      }
      
      // Create a properly formatted Ultravox API URL
      const ultravoxUrl = `https://api.ultravox.ai/v1/media/${ultravoxApiKey}`;
      
      // Show notification that calls are being initiated
      const initiatingMessage = document.createElement('div');
      initiatingMessage.className = 'call-initiating-message';
      initiatingMessage.textContent = `Calling ${selectedNumbers.length} selected clients...`;
      document.body.appendChild(initiatingMessage);
      
      try {
        // Use CallService to initiate multiple calls
        const results = await CallService.initiateMultipleCalls(selectedNumbers, ultravoxUrl);
        
        // Remove notification
        document.body.removeChild(initiatingMessage);
        
        // Log results
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        
        console.log(`Call results: ${successful} successful, ${failed} failed`);
        
        // Show failures if any
        const failures = results.filter(r => !r.success);
        if (failures.length > 0) {
          // Get common error message if all have the same error
          const commonError = failures.every(f => f.error === failures[0].error) 
            ? failures[0].error 
            : null;
          
          const failureMessages = failures.map(f => `${f.number}: ${f.error}`).join('\n');
          console.error('Failed calls:', failureMessages);
          
          if (commonError && commonError.includes('502')) {
            alert(`Backend call service is currently unavailable (502 Bad Gateway). This is likely due to server maintenance or network issues.`);
          } else if (commonError) {
            alert(`All calls failed with the same error: ${commonError}`);
          } else if (failures.length < selectedNumbers.length) {
            alert(`${successful} calls initiated successfully, but ${failed} failed. See console for details.`);
          } else {
            alert(`All calls failed. See console for details.`);
          }
        } else {
          alert(`Successfully called ${selectedNumbers.length} clients`);
        }
      } catch (error) {
        // Remove notification in case of error
        if (document.body.contains(initiatingMessage)) {
          document.body.removeChild(initiatingMessage);
        }
        throw error; // Re-throw to be handled by outer catch
      }
    } catch (error) {
      console.error('Error in handleCallSelected:', error);
      alert(`Error initiating calls: ${error.message}`);
    }
  };

   const handleVoiceChange = (e) => {
    setSelectedVoice(e.target.value);
  };

  return (
    <div className="call-manager-page">
      <div className="call-manager">
        <h1>{translations[language].callManagement}</h1>
        
        <div className="call-section">
          <h2>{translations[language].bulkCallInterface}</h2>
          <div className="call-type-selector">
            <label>
              <input 
                type="radio" 
                value="outbound" 
                checked={callType === 'outbound'}
                onChange={() => setCallType('outbound')}
              /> {translations[language].outboundCalls}
            </label>
            <label>
              <input 
                type="radio" 
                value="inbound" 
                checked={callType === 'inbound'}
                onChange={() => setCallType('inbound')}
              /> {translations[language].inboundCalls}
            </label>
          </div>
          
          {callType === 'outbound' ? (
            <>
              <textarea 
                placeholder={translations[language].enterPhoneNumbers}
                value={phoneNumbers}
                onChange={(e) => setPhoneNumbers(e.target.value)}
                rows={10}
              />
              
              <button className="primary" onClick={handleBulkCall}>
                {translations[language].initiateCalls}
              </button>
            </>
          ) : (
            <div className="inbound-call-config">
              <h2>{translations[language].inboundCalls}</h2>
              <p>
                {translations[language].configureYourTwilio}
              </p>
              <div className="webhook-url">
                <code>{webhookUrl}</code>
              </div>
              <p>
                **Note:** Replace <code>your-server-domain.com</code> with your actual server domain.
              </p>
            </div>
          )}
        </div>

         <div className="voice-selection">
            <label>{translations[language].selectVoice}:</label>
            <select value={selectedVoice} onChange={handleVoiceChange}>
              {Object.entries(availableVoices).map(([language, voices]) => (
                <optgroup label={language} key={language}>
                  {voices.map(voice => (
                    <option key={voice} value={voice}>{voice}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

        <div className="client-table-container">
          <h2>{translations[language].existingClients}</h2>
          <div className="client-table-buttons">
            <button className="primary" onClick={handleOpenAddClientModal}>{translations[language].addClient}</button>
            <button className="primary" onClick={handleCallSelected}>{translations[language].callSelected}</button>
          </div>
          <table className="client-table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    onChange={handleSelectAll}
                    checked={selectedClientIds.length === clients.length}
                  />
                </th>
                <th>{translations[language].name}</th>
                <th>{translations[language].phoneNumber}</th>
                <th>{translations[language].email}</th>
                <th>{translations[language].address}</th>
                  <th>{translations[language].actions}</th>
              </tr>
            </thead>
            <tbody>
              {clients.map(client => (
                <tr key={client.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedClientIds.includes(client.id)}
                      onChange={() => handleCheckboxChange(client.id)}
                    />
                  </td>
                  <td contentEditable="true" onBlur={(e) => handleCellChange(client.id, 'name', e.target.textContent)}>
                    {client.name}
                  </td>
                  <td contentEditable="true" onBlur={(e) => handleCellChange(client.id, 'phoneNumber', e.target.textContent)}>
                    {client.phoneNumber}
                  </td>
                  <td contentEditable="true" onBlur={(e) => handleCellChange(client.id, 'email', e.target.textContent)}>
                    {client.email}
                  </td>
                  <td contentEditable="true" onBlur={(e) => handleCellChange(client.id, 'address', e.target.textContent)}>
                    {client.address}
                  </td>
                  <td className="client-actions">
                    <button onClick={() => handleEditClient(client.id)}>{translations[language].edit}</button>
                    <button onClick={() => handleDeleteClient(client.id)}>{translations[language].delete}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {showAddClientModal && (
          <div className="add-client-modal">
            <div className="add-client-modal-content">
              <h2>{editingClientId ? translations[language].updateClient : translations[language].addClient}</h2>
              <form className="add-client-form">
                <label>{translations[language].name}:</label>
                <input
                  type="text"
                  name="name"
                  value={newClient.name}
                  onChange={handleNewClientChange}
                />
                <label>{translations[language].phoneNumber}:</label>
                <input
                  type="text"
                  name="phoneNumber"
                  value={newClient.phoneNumber}
                  onChange={handleNewClientChange}
                />
                <label>{translations[language].email}:</label>
                <input
                  type="email"
                  name="email"
                  value={newClient.email}
                  onChange={handleNewClientChange}
                />
                 <label>{translations[language].address}:</label>
                <input
                  type="text"
                  name="address"
                  value={newClient.address}
                  onChange={handleNewClientChange}
                />
                <button type="button" className="add-button" onClick={handleAddClient}>
                  {editingClientId ? translations[language].updateClient : translations[language].addClient}
                </button>
                <button type="button" className="cancel-button" onClick={handleCloseAddClientModal}>
                  {translations[language].cancel}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default CallManager
