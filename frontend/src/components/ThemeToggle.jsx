import React from 'react'
import { useTheme } from '../context/ThemeContext'
import './ThemeToggle.css'

function ThemeToggle() {
  const { isDarkMode, toggleTheme } = useTheme()

  return (
    <div className="theme-toggle">
      <label className="switch">
        <input 
          type="checkbox" 
          checked={isDarkMode}
          onChange={toggleTheme}
        />
        <span className="slider">
          <span className="theme-icon dark-icon">🌙</span>
          <span className="theme-icon light-icon">☀️</span>
        </span>
      </label>
    </div>
  )
}

export default ThemeToggle
