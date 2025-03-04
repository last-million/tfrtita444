import React, { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import UserManagement from '../components/UserManagement'
import './SystemConfig.css'

export default function SystemConfig() {
  const { user } = useAuth();
  const isHamza = user?.username === 'hamza';
  const [tools, setTools] = useState([
    {
      id: 'calendar',
      name: 'Google Calendar',
      description: 'Schedule and manage meetings',
      enabled: false,
      icon: '📅'
    },
    {
      id: 'gmail',
      name: 'Gmail',
      description: 'Send and read emails',
      enabled: false,
      icon: '✉️'
    },
    {
      id: 'drive',
      name: 'Knowledge Base',
      description: 'Access and manage documents',
      enabled: false,
      icon: '📚'
    },
    {
      id: 'vectorize',
      name: 'Vector Search',
      description: 'Search through vectorized documents',
      enabled: false,
      icon: '🔍'
    }
  ])

  const [systemPrompt, setSystemPrompt] = useState(
    'You are an AI assistant with access to various tools. Use them appropriately to help users.'
  )

  const [customInstructions, setCustomInstructions] = useState('')
  const [showPreview, setShowPreview] = useState(false)

  useEffect(() => {
    // Load saved configuration
    const savedConfig = JSON.parse(localStorage.getItem('systemConfig') || '{}')
    if (savedConfig.tools) {
      setTools(prevTools => 
        prevTools.map(tool => ({
          ...tool,
          enabled: savedConfig.tools.includes(tool.id)
        }))
      )
    }
    if (savedConfig.systemPrompt) {
      setSystemPrompt(savedConfig.systemPrompt)
    }
    if (savedConfig.customInstructions) {
      setCustomInstructions(savedConfig.customInstructions)
    }
  }, [])

  const handleToolToggle = (toolId) => {
    setTools(prevTools =>
      prevTools.map(tool =>
        tool.id === toolId ? { ...tool, enabled: !tool.enabled } : tool
      )
    )
  }

  const generateSystemPrompt = () => {
    const enabledTools = tools.filter(tool => tool.enabled)
    let prompt = systemPrompt + '\n\n'

    if (enabledTools.length > 0) {
      prompt += 'Available tools:\n'
      enabledTools.forEach(tool => {
        prompt += `- ${tool.name}: ${tool.description}\n`
      })
      prompt += '\n'
    }

    // Add tool variables
    const variables = enabledTools
      .map(tool => `${tool.id.toUpperCase()}_ENABLED=true`)
      .join(', ')
    
    if (variables) {
      prompt += `System Variables: ${variables}\n\n`
    }

    if (customInstructions) {
      prompt += `Additional Instructions:\n${customInstructions}`
    }

    return prompt
  }

  const saveConfiguration = () => {
    const config = {
      tools: tools.filter(t => t.enabled).map(t => t.id),
      systemPrompt,
      customInstructions
    }
    localStorage.setItem('systemConfig', JSON.stringify(config))
    alert('Configuration saved successfully!')
  }

  return (
    <div className="system-config-page">
      <div className="config-header">
        <h1>System Configuration</h1>
        <p>Configure AI tools and system behavior</p>
      </div>

      <div className="config-grid">
        <div className="config-section tools-section">
          <h2>Available Tools</h2>
          <div className="tools-grid">
            {tools.map(tool => (
              <div key={tool.id} className={`tool-card ${tool.enabled ? 'enabled' : ''}`}>
                <div className="tool-header">
                  <span className="tool-icon">{tool.icon}</span>
                  <h3>{tool.name}</h3>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={tool.enabled}
                      onChange={() => handleToolToggle(tool.id)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
                <p>{tool.description}</p>
                {tool.enabled && (
                  <div className="tool-variable">
                    <code>{tool.id.toUpperCase()}_ENABLED=true</code>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="config-section prompt-section">
          <h2>System Prompt</h2>
          <div className="prompt-editor">
            <h3>Base Prompt</h3>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Enter base system prompt..."
              rows={4}
            />
            
            <h3>Custom Instructions</h3>
            <textarea
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              placeholder="Add custom instructions for the AI..."
              rows={4}
            />
            
            <button 
              className="preview-btn"
              onClick={() => setShowPreview(!showPreview)}
            >
              {showPreview ? 'Hide Preview' : 'Show Preview'}
            </button>

            {showPreview && (
              <div className="prompt-preview">
                <h3>Generated System Prompt:</h3>
                <pre>{generateSystemPrompt()}</pre>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="config-actions">
        <button 
          className="save-config-btn"
          onClick={saveConfiguration}
        >
          Save Configuration
        </button>
      </div>

      {/* User Management Section - only visible to hamza */}
      {isHamza && (
        <div className="config-section user-management-section mt-8">
          <h2 className="text-2xl font-bold mb-4">User Management</h2>
          <p className="mb-4">Manage user accounts and permissions</p>
          <UserManagement />
        </div>
      )}
    </div>
  )
}
