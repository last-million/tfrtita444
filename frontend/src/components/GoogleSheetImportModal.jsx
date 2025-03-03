import React from 'react'
import './GoogleSheetImportModal.css'

function GoogleSheetImportModal({ onClose, setGoogleSheetData, onSyncWithDatabase }) {
  const handleDataChange = (e) => {
    setGoogleSheetData(e.target.value);
  };

  return (
    <div className="google-sheet-modal">
      <div className="google-sheet-modal-content">
        <h2>Import Clients from Google Sheet</h2>
        <form className="google-sheet-form">
          <label>Enter Google Sheet data in CSV format (one row per line):</label>
          <textarea
            placeholder="Name,Phone Number,Email"
            onChange={handleDataChange}
          />
          <button type="button" onClick={onSyncWithDatabase}>
            Sync with Database
          </button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </form>
      </div>
    </div>
  );
}

export default GoogleSheetImportModal;
