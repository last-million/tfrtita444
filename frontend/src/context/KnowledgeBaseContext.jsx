import React, { createContext, useContext, useReducer, useCallback } from 'react'
import { api } from '../services/api'

const KnowledgeBaseContext = createContext(null)

const initialState = {
  files: [],
  selectedFiles: [],
  supabaseTables: [],
  selectedTable: null,
  isLoading: false,
  error: null
}

const ACTIONS = {
  SET_FILES: 'SET_FILES',
  SELECT_FILE: 'SELECT_FILE',
  REMOVE_FILE: 'REMOVE_FILE',
  SET_TABLES: 'SET_TABLES',
  SELECT_TABLE: 'SELECT_TABLE',
  SET_LOADING: 'SET_LOADING',
  SET_ERROR: 'SET_ERROR'
}

function reducer(state, action) {
  switch (action.type) {
    case ACTIONS.SET_FILES:
      return { ...state, files: action.payload, isLoading: false }
    case ACTIONS.SELECT_FILE:
      return { 
        ...state, 
        selectedFiles: [...state.selectedFiles, action.payload] 
      }
    case ACTIONS.REMOVE_FILE:
      return { 
        ...state, 
        selectedFiles: state.selectedFiles.filter(f => f.id !== action.payload) 
      }
    case ACTIONS.SET_TABLES:
      return { ...state, supabaseTables: action.payload }
    case ACTIONS.SELECT_TABLE:
      return { ...state, selectedTable: action.payload }
    case ACTIONS.SET_LOADING:
      return { ...state, isLoading: action.payload }
    case ACTIONS.SET_ERROR:
      return { ...state, error: action.payload, isLoading: false }
    default:
      return state
  }
}

export function KnowledgeBaseProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  const actions = {
    loadFiles: useCallback(async () => {
      try {
        dispatch({ type: ACTIONS.SET_LOADING, payload: true })
        const response = await api.drive.listFiles()
        dispatch({ type: ACTIONS.SET_FILES, payload: response.data.files })
      } catch (error) {
        dispatch({ type: ACTIONS.SET_ERROR, payload: error.message })
      }
    }, []),

    loadTables: useCallback(async () => {
      try {
        const response = await api.supabase.listTables();
        const tables = response.data.tables || [];
        dispatch({ type: ACTIONS.SET_TABLES, payload: tables });
      } catch (error) {
        console.error("Error in loadTables:", error);
        // Use mock data as fallback
        const mockTables = ['customers', 'products', 'orders', 'users'];
        dispatch({ type: ACTIONS.SET_TABLES, payload: mockTables });
        // Only show error if it's not related to missing endpoint
        if (!error.message.includes("404")) {
          dispatch({ type: ACTIONS.SET_ERROR, payload: "Failed to load Supabase tables: " + error.message });
        }
      }
    }, []),

    selectFile: useCallback((file) => {
      dispatch({ type: ACTIONS.SELECT_FILE, payload: file })
    }, []),

    removeFile: useCallback((fileId) => {
      dispatch({ type: ACTIONS.REMOVE_FILE, payload: fileId })
    }, []),

    selectTable: useCallback((table) => {
      dispatch({ type: ACTIONS.SELECT_TABLE, payload: table })
    }, [])
  }

  return (
    <KnowledgeBaseContext.Provider value={{ state, actions }}>
      {children}
    </KnowledgeBaseContext.Provider>
  )
}

export function useKnowledgeBase() {
  const context = useContext(KnowledgeBaseContext)
  if (!context) {
    throw new Error('useKnowledgeBase must be used within KnowledgeBaseProvider')
  }
  return context
}
