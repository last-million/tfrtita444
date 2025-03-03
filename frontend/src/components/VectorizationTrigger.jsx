import React, { useState } from 'react'
import { api } from '../services/api'

export default function VectorizationTrigger({ files, supabaseTable, onVectorize }) {
  const [isVectorizing, setIsVectorizing] = useState(false)

  const handleVectorization = async () => {
    try {
      setIsVectorizing(true)
      const response = await api.vectorizeDocuments(
        files.map(f => f.id || f.path),
        supabaseTable
      )
      onVectorize(response.data)
    } catch (error) {
      console.error("Error during vectorization:", error)
    } finally {
      setIsVectorizing(false)
    }
  }

  return (
    <div className="vectorization-trigger">
      <h3>Vectorize Selected Documents</h3>
      <p>Files to vectorize: {files.length}</p>
      <p>Target Supabase table: {supabaseTable}</p>
      <button 
        onClick={handleVectorization} 
        disabled={files.length === 0 || !supabaseTable || isVectorizing}
      >
        {isVectorizing ? 'Vectorizing...' : 'Start Vectorization'}
      </button>
    </div>
  )
}
