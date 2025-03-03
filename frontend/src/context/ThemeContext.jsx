import React, { createContext, useState, useEffect, useContext } from 'react'

// Create Theme Context with default values
const ThemeContext = createContext({
  isDarkMode: true,
  toggleTheme: () => {}
})

// Theme Provider Component
export function ThemeProvider({ children }) {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    // Check local storage for saved theme preference
    const savedTheme = localStorage.getItem('theme')
    return savedTheme !== null ? JSON.parse(savedTheme) : true // Default to dark mode
  })

  // Update local storage and body class when theme changes
  useEffect(() => {
    localStorage.setItem('theme', JSON.stringify(isDarkMode))
    
    // Apply theme to body
    if (isDarkMode) {
      document.body.classList.add('dark-mode')
      document.body.classList.remove('light-mode')
    } else {
      document.body.classList.add('light-mode')
      document.body.classList.remove('dark-mode')
    }
  }, [isDarkMode])

  // Toggle theme function
  const toggleTheme = () => {
    setIsDarkMode(prev => !prev)
  }

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

// Custom hook for using theme
export function useTheme() {
  const context = useContext(ThemeContext)
  
  // Throw error if used outside of ThemeProvider
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  
  return context
}
