import React, { useState } from 'react'
import { api } from '../services/api'
import './GoogleDriveIntegration.css'

export default function GoogleDriveIntegration({ 
  files = [], 
  selectedFiles = [], 
  onFileSelect, 
  onFileRemove 
}) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleConnect = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const response = await api.drive.connect()
      if (response.data.authUrl) {
        window.location.href = response.data.authUrl
      }
    } catch (err) {
      setError(err.message || 'Failed to connect to Google Drive')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="google-drive-integration">
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {files.length === 0 ? (
        <button 
          className="connect-button"
          onClick={handleConnect} 
          disabled={isLoading}
        >
          {isLoading ? 'Connecting...' : 'Connect to Google Drive'}
        </button>
      ) : (
        <div className="files-container">
          <h3>Google Drive Files</h3>
          {isLoading ? (
            <div className="loading">Loading files...</div>
          ) : (
            <ul className="files-list">
              {files.map(file => (
                <li key={file.id} className="file-item">
                  <span className="file-name">{file.name}</span>
                  {selectedFiles.some(f => f.id === file.id) ? (
                    <button 
                      className="remove-button"
                      onClick={() => onFileRemove(file.id)}
                    >
                      Remove
                    </button>
                  ) : (
                    <button 
                      className="select-button"
                      onClick={() => onFileSelect(file)}
                    >
                      Select
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
