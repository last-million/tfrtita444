import React, { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import './Navbar.css'

function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  // Close navbar when route changes (mobile)
  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  // Handle window resize for responsive behavior
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setIsOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const toggleNavbar = () => {
    setIsOpen(!isOpen);
  };

  const isActiveRoute = (route) => {
    return location.pathname === route ? 'active' : '';
  };

  return (
    <>
      <button 
        className="mobile-toggle" 
        onClick={toggleNavbar}
        aria-label="Toggle navigation menu"
      >
        {isOpen ? '✖' : '☰'}
      </button>
      
      <nav className={`navbar ${isOpen ? 'open' : ''}`}>
        <div className="navbar-logo">
          <span className="navbar-logo-icon">🔊</span>
          <h2>Voice Call AI</h2>
        </div>
        <ul className="navbar-links">
          <li>
            <Link to="/" className={isActiveRoute('/')}>
              <span className="nav-icon">📊</span>
              Dashboard
            </Link>
          </li>
          <li>
            <Link to="/calls" className={isActiveRoute('/calls')}>
              <span className="nav-icon">📞</span>
              Call Manager
            </Link>
          </li>
          <li>
            <Link to="/call-history" className={isActiveRoute('/call-history')}>
              <span className="nav-icon">📜</span>
              Call History
            </Link>
          </li>
          <li>
            <Link to="/knowledge-base" className={isActiveRoute('/knowledge-base')}>
              <span className="nav-icon">📚</span>
              Knowledge Base
            </Link>
          </li>
          <li>
            <Link to="/system-config" className={isActiveRoute('/system-config')}>
              <span className="nav-icon">⚙️</span>
              System Config
            </Link>
          </li>
          <li>
            <Link to="/auth" className={isActiveRoute('/auth')}>
              <span className="nav-icon">🔗</span>
              Connect Services
            </Link>
          </li>
        </ul>
      </nav>
      
      {/* Add an overlay div for mobile that captures clicks outside the menu */}
      {isOpen && (
        <div 
          className="navbar-overlay" 
          onClick={() => setIsOpen(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            zIndex: 999
          }}
        />
      )}
    </>
  )
}

export default Navbar
