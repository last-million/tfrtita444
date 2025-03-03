const ServiceConnectionManager = {
  services: {
    'Ultravox': {
      connectionTypes: ['manual'],
      manualFields: [
        { 
          key: 'apiKey', 
          label: 'API Key', 
          type: 'password', 
          placeholder: 'Your Ultravox API Key',
          sensitive: true
        },
        { 
          key: 'endpoint', 
          label: 'Endpoint URL', 
          type: 'url', 
          placeholder: 'https://api.ultravox.ai/api/calls',
          defaultValue: 'https://api.ultravox.ai/api/calls'
        },
        { 
          key: 'voice', 
          label: 'Voice Name', 
          type: 'text', 
          placeholder: 'Tanya-English',
          defaultValue: 'Tanya-English'
        }
      ]
    },
    'Supabase': {
      connectionTypes: ['manual'],
      manualFields: [
        { 
          key: 'url', 
          label: 'Project URL', 
          type: 'url', 
          placeholder: 'https://your-project.supabase.co'
        },
        { 
          key: 'apiKey', 
          label: 'API Key', 
          type: 'password', 
          placeholder: 'Your Supabase API Key',
          sensitive: true
        }
      ]
    },
    'Google Calendar': {
      connectionTypes: ['manual'],
      manualFields: [
        { 
          key: 'apiKey', 
          label: 'API Key', 
          type: 'password', 
          placeholder: 'Your Google Calendar API Key',
          sensitive: true
        },
        { 
          key: 'clientId', 
          label: 'Client ID', 
          type: 'password', 
          placeholder: 'Your Google Client ID',
          sensitive: true
        }
      ]
    },
    'Twilio': {
      connectionTypes: ['manual'],
      manualFields: [
        { 
          key: 'accountSid', 
          label: 'Account SID', 
          type: 'text', 
          placeholder: 'Your Twilio Account SID',
          sensitive: true
        },
        { 
          key: 'authToken', 
          label: 'Auth Token', 
          type: 'password', 
          placeholder: 'Your Twilio Auth Token',
          sensitive: true
        },
        { 
          key: 'phoneNumber', 
          label: 'Phone Number', 
          type: 'tel', 
          placeholder: '+1234567890'
        }
      ]
    },
    'SERP API': {
      connectionTypes: ['manual'],
      manualFields: [
        { 
          key: 'apiKey', 
          label: 'API Key', 
          type: 'password', 
          placeholder: 'Your SERP API Key',
          sensitive: true
        }
      ]
    },
    'Airtable': {
      connectionTypes: ['manual'],
      manualFields: [
        { 
          key: 'apiKey', 
          label: 'API Key', 
          type: 'password', 
          placeholder: 'Your Airtable API Key',
          sensitive: true
        },
        { 
          key: 'baseId', 
          label: 'Base ID', 
          type: 'text', 
          placeholder: 'Your Airtable Base ID'
        }
      ]
    },
    'Gmail': {
      connectionTypes: ['manual'],
      manualFields: [
        { 
          key: 'apiKey', 
          label: 'API Key', 
          type: 'password', 
          placeholder: 'Your Gmail API Key',
          sensitive: true
        },
        { 
          key: 'clientId', 
          label: 'Client ID', 
          type: 'password', 
          placeholder: 'Your Google Client ID',
          sensitive: true
        }
      ]
    },
    'Google Drive': {
      connectionTypes: ['manual'],
      manualFields: [
        { 
          key: 'apiKey', 
          label: 'API Key', 
          type: 'password', 
          placeholder: 'Your Google Drive API Key',
          sensitive: true
        },
        { 
          key: 'clientId', 
          label: 'Client ID', 
          type: 'password', 
          placeholder: 'Your Google Client ID',
          sensitive: true
        }
      ]
    }
  },

  getServiceConfig(serviceName) {
    return this.services[serviceName] || null
  },

  getAllServices() {
    return Object.keys(this.services)
  },

  validateCredentials(serviceName, credentials) {
    const serviceConfig = this.getServiceConfig(serviceName)
    if (!serviceConfig) return false

    return serviceConfig.manualFields.every(field => 
      credentials[field.key] && credentials[field.key].trim() !== ''
    )
  },

  getRedirectUri() {
    const protocol = window.location.protocol
    const domain = window.location.host
    return `${protocol}//${domain}/oauth/callback`
  },

  isGoogleService(serviceName) {
    return ['Google Calendar', 'Gmail', 'Google Drive'].includes(serviceName)
  },
  getCredentials(serviceName) {
    const savedCredentials = JSON.parse(localStorage.getItem('serviceCredentials') || '{}');
    return savedCredentials[serviceName] || {};
  }
}

export default ServiceConnectionManager
