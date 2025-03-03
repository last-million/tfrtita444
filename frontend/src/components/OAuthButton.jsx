import React from 'react'
import { useGoogleLogin } from '@react-oauth/google'
import axios from 'axios'

const OAuthButton = ({ 
  service, 
  onSuccess, 
  onFailure, 
  scope 
}) => {
  const login = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        // Fetch user info using the access token
        const userInfo = await axios.get(
          'https://www.googleapis.com/oauth2/v3/userinfo', 
          { headers: { Authorization: `Bearer ${tokenResponse.access_token}` } }
        )

        // Combine token and user info
        const fullResponse = {
          ...tokenResponse,
          profileObj: userInfo.data
        }

        // Call the success handler
        onSuccess(fullResponse, service)
      } catch (error) {
        onFailure(error, service)
      }
    },
    onError: (error) => {
      console.error('Google OAuth Error:', error)
      onFailure(error, service)
    },
    scope: scope
  })

  return (
    <button 
      onClick={() => login()}
      className="oauth-connect-btn"
    >
      Connect {service} via OAuth
    </button>
  )
}

export default OAuthButton
