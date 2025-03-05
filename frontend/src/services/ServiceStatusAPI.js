import { api } from './api';

class ServiceStatusAPI {
  async getStatus(serviceName) {
    try {
      // Correcting the endpoint URL to avoid the double /api/ prefix
      const response = await api.get(`/credentials/status/${serviceName}`);
      return response;
    } catch (error) {
      console.error(`Error getting status for ${serviceName}:`, error);
      throw error;
    }
  }
}

export default new ServiceStatusAPI();
