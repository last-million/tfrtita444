import React from 'react'
import ThemeToggle from './ThemeToggle'
import './Header.css'
import { useLanguage } from '../context/LanguageContext';
import { useLocation } from 'react-router-dom';
import translations from '../translations';

function Header() {
  const location = useLocation();
  const { language, setLanguage } = useLanguage();

  // Get current page title based on route
  const getPageTitle = () => {
    const path = location.pathname;
    switch(path) {
      case '/':
        return translations[language].dashboard;
      case '/calls':
        return translations[language].calls;
      case '/call-history':
        return translations[language].callHistory;
      case '/knowledge-base':
        return translations[language].knowledge;
      case '/auth':
        return translations[language].services;
      case '/system-config':
        return translations[language].settings;
      default:
        return translations[language].dashboard;
    }
  };

  const handleLanguageChange = (e) => {
    setLanguage(e.target.value);
    if (e.target.value === 'ar') {
      document.body.classList.add('rtl');
    } else {
      document.body.classList.remove('rtl');
    }
  };

  return (
    <header className="app-header">
      <div className="header-title">
        <h1>{getPageTitle()}</h1>
      </div>
      <div className="header-actions">
        <div className="language-selector">
          <select 
            value={language} 
            onChange={handleLanguageChange}
            aria-label="Select language"
          >
            <option value="en">🇬🇧 English</option>
            <option value="fr">🇫🇷 Français</option>
            <option value="ar">🇸🇦 العربية</option>
          </select>
        </div>
        <ThemeToggle />
      </div>
    </header>
  )
}

export default Header
