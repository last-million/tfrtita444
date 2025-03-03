import React, { useState, useEffect } from 'react'
import { api } from '../services/api'

export default function SupabaseTableSelector({ onSelect }) {
  const [tables, setTables] = useState([])
  const [selectedTable, setSelectedTable] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    fetchSupabaseTables()
  }, [])

  const fetchSupabaseTables = async () => {
    try {
      setIsLoading(true)
      const response = await api.listSupabaseTables()
      setTables(response.data.tables)
    } catch (error) {
      console.error("Error fetching Supabase tables:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleTableSelect = (event) => {
    const table = event.target.value
    setSelectedTable(table)
    onSelect(table)
  }

  return (
    <div className="supabase-table-selector">
      <h3>Select Supabase Table</h3>
      {isLoading ? (
        <p>Loading tables...</p>
      ) : (
        <select value={selectedTable} onChange={handleTableSelect}>
          <option value="">--Select a table--</option>
          {tables.map(table => (
            <option key={table} value={table}>{table}</option>
          ))}
        </select>
      )}
    </div>
  )
}
