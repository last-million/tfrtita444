class OAuthService {
  constructor() {
    // Google OAuth Configuration
    this.googleConfig = {
      clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
      redirectUri: import.meta.env.VITE_GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth/callback',
      scope: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/gmail.readonly',
        'email',
        'profile'
      ].join(' ')
    }
  }

  // Generate Google OAuth URL
  getGoogleAuthUrl() {
    const baseUrl = 'https://accounts.google.com/o/oauth2/v2/auth'
    const params = new URLSearchParams({
      client_id: this.googleConfig.clientId,
      redirect_uri: this.googleConfig.redirectUri,
      response_type: 'code',
      scope: this.googleConfig.scope,
      access_type: 'offline',
      prompt: 'consent'
    })

    return `${baseUrl}?${params.toString()}`
  }

  // Exchange authorization code for tokens using fetch
  async exchangeCodeForTokens(code) {
    try {
      // In a real app, this would be a backend endpoint
      const response = await fetch('/api/oauth/google/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ code })
      })

      if (!response.ok) {
        throw new Error('Token exchange failed')
      }

      return await response.json()
    } catch (error) {
      console.error('Token exchange failed', error)
      throw error
    }
  }

  // Validate and refresh tokens
  async validateToken(token) {
    try {
      const response = await fetch('https://www.googleapis.com/oauth2/v1/tokeninfo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ access_token: token })
      })

      return response.ok
    } catch (error) {
      console.error('Token validation failed', error)
      return false
    }
  }
}

export default new OAuthService()
