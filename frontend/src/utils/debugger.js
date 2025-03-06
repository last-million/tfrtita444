// Debug utility functions to help troubleshoot app issues
class AppDebugger {
  constructor() {
    this.enabled = true;
    this.logLevel = 'verbose'; // 'error', 'warn', 'info', 'verbose'
    
    // Create a floating debug panel
    this._createDebugPanel();
    
    // Replace console methods to capture logs
    this._hookConsole();
    
    this.log('AppDebugger initialized');
  }
  
  _createDebugPanel() {
    // Create floating panel
    const panel = document.createElement('div');
    panel.id = 'app-debug-panel';
    panel.style.position = 'fixed';
    panel.style.bottom = '10px';
    panel.style.right = '10px';
    panel.style.width = '50px';
    panel.style.height = '50px';
    panel.style.backgroundColor = 'rgba(0,0,0,0.7)';
    panel.style.color = 'white';
    panel.style.borderRadius = '50%';
    panel.style.display = 'flex';
    panel.style.alignItems = 'center';
    panel.style.justifyContent = 'center';
    panel.style.cursor = 'pointer';
    panel.style.zIndex = '9999';
    panel.style.fontSize = '20px';
    panel.style.boxShadow = '0 0 10px rgba(0,0,0,0.5)';
    panel.innerHTML = '🐞';
    panel.title = 'Click to show debug information';
    
    // Create log container (hidden initially)
    const logContainer = document.createElement('div');
    logContainer.id = 'app-debug-logs';
    logContainer.style.position = 'fixed';
    logContainer.style.bottom = '70px';
    logContainer.style.right = '10px';
    logContainer.style.width = '80%';
    logContainer.style.maxWidth = '600px';
    logContainer.style.height = '400px';
    logContainer.style.backgroundColor = 'rgba(0,0,0,0.9)';
    logContainer.style.color = 'white';
    logContainer.style.borderRadius = '5px';
    logContainer.style.padding = '10px';
    logContainer.style.overflowY = 'auto';
    logContainer.style.display = 'none';
    logContainer.style.zIndex = '9998';
    logContainer.style.fontFamily = 'monospace';
    logContainer.style.fontSize = '12px';
    
    // Add event listener to toggle log display
    panel.addEventListener('click', () => {
      if (logContainer.style.display === 'none') {
        logContainer.style.display = 'block';
      } else {
        logContainer.style.display = 'none';
      }
    });
    
    // Append elements to body when DOM is loaded
    if (document.body) {
      document.body.appendChild(panel);
      document.body.appendChild(logContainer);
    } else {
      window.addEventListener('DOMContentLoaded', () => {
        document.body.appendChild(panel);
        document.body.appendChild(logContainer);
      });
    }
    
    this.logContainer = logContainer;
    this.panel = panel;
  }
  
  _hookConsole() {
    // Store original console methods
    const originalConsole = {
      log: console.log,
      warn: console.warn,
      error: console.error,
      info: console.info
    };
    
    // Replace console.log
    console.log = (...args) => {
      originalConsole.log(...args);
      if (this.enabled && this.logLevel === 'verbose') {
        this._addLogEntry('log', ...args);
      }
    };
    
    // Replace console.warn
    console.warn = (...args) => {
      originalConsole.warn(...args);
      if (this.enabled && ['verbose', 'info', 'warn'].includes(this.logLevel)) {
        this._addLogEntry('warn', ...args);
      }
    };
    
    // Replace console.error
    console.error = (...args) => {
      originalConsole.error(...args);
      if (this.enabled) {
        this._addLogEntry('error', ...args);
      }
    };
    
    // Replace console.info
    console.info = (...args) => {
      originalConsole.info(...args);
      if (this.enabled && ['verbose', 'info'].includes(this.logLevel)) {
        this._addLogEntry('info', ...args);
      }
    };
  }
  
  _addLogEntry(level, ...args) {
    if (!this.logContainer) return;
    
    // Create log entry
    const entry = document.createElement('div');
    entry.style.marginBottom = '5px';
    entry.style.borderBottom = '1px solid #333';
    entry.style.paddingBottom = '5px';
    
    // Format timestamp
    const time = new Date().toLocaleTimeString();
    
    // Set color based on level
    switch (level) {
      case 'error':
        entry.style.color = '#ff5555';
        break;
      case 'warn':
        entry.style.color = '#ffaa00';
        break;
      case 'info':
        entry.style.color = '#55aaff';
        break;
      default:
        entry.style.color = '#aaaaaa';
    }
    
    // Format arguments
    const formattedArgs = args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg, null, 2);
        } catch (e) {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ');
    
    // Add content
    entry.innerHTML = `<span style="color:#999">[${time}]</span> <strong>${level.toUpperCase()}</strong>: ${formattedArgs}`;
    
    // Add to container and scroll to bottom
    this.logContainer.appendChild(entry);
    this.logContainer.scrollTop = this.logContainer.scrollHeight;
    
    // Update bug count
    if (level === 'error') {
      this.panel.setAttribute('data-error-count', (parseInt(this.panel.getAttribute('data-error-count') || '0') + 1));
      this.panel.innerHTML = '🐞' + (this.panel.getAttribute('data-error-count') || '');
    }
  }
  
  log(message) {
    console.log(message);
  }
  
  checkApiEndpoint(url) {
    this.log(`Testing API endpoint: ${url}`);
    fetch(url)
      .then(response => {
        this.log(`API Response status: ${response.status} ${response.statusText}`);
        return response.text();
      })
      .then(text => {
        try {
          const json = JSON.parse(text);
          this.log('API Response data:', json);
        } catch (e) {
          this.log('API Response text:', text.substring(0, 500) + (text.length > 500 ? '...' : ''));
        }
      })
      .catch(error => {
        console.error('API Check Error:', error);
      });
  }
  
  checkEnvironment() {
    this.log('Environment Variables:');
    try {
      for (const key in import.meta.env) {
        if (key.startsWith('VITE_')) {
          this.log(`  ${key}: ${import.meta.env[key]}`);
        }
      }
    } catch (e) {
      this.log('Could not access environment variables');
    }
  }
}

// Initialize app debugger (using appDbg to avoid reserved keyword "debugger")
const appDbg = new AppDebugger();

// Auto-run checks when module is imported
setTimeout(() => {
  appDbg.checkEnvironment();
  
  // Check API health endpoint
  try {
    const apiUrl = import.meta.env.VITE_API_URL || 
                 (window.location.protocol === 'https:' ? 
                  'https://ajingolik.fun/api' : 
                  'http://ajingolik.fun/api');
    
    appDbg.checkApiEndpoint(`${apiUrl}/health`);
  } catch (e) {
    console.error('Failed to check API health', e);
  }
}, 1000);

export default appDbg;
