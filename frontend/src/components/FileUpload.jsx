import React, { useState } from 'react'
import { api } from '../services/api'

export default function FileUpload({ onFileUpload }) {
  const [file, setFile] = useState(null)
  const [isUploading, setIsUploading] = useState(false)

  const handleFileChange = (event) => {
    setFile(event.target.files[0])
  }

  const handleUpload = async () => {
    if (!file) return

    try {
      setIsUploading(true)
      const response = await api.uploadFile(file)
      onFileUpload(response.data)
      setFile(null)
    } catch (error) {
      console.error("Error uploading file:", error)
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="file-upload">
      <input type="file" onChange={handleFileChange} disabled={isUploading} />
      <button onClick={handleUpload} disabled={!file || isUploading}>
        {isUploading ? 'Uploading...' : 'Upload'}
      </button>
    </div>
  )
}
