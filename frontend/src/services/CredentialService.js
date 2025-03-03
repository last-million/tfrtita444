import axios from 'axios'

class CredentialService {
  async validateCredentials(service, credentials) {
    try {
      const response = await axios.post('/api/credentials/validate', {
        service,
        credentials
      })
      return response.data
    } catch (error) {
      console.error('Credential validation error:', error.response?.data || error.message)
      throw error
    }
  }

  // Decrypt credentials (if needed)
  async decryptCredentials(encryptedCredentials) {
    try {
      const response = await axios.post('/api/credentials/decrypt', encryptedCredentials)
      return response.data
    } catch (error) {
      console.error('Credential decryption error:', error.response?.data || error.message)
      throw error
    }
  }
}

export default new CredentialService()
