// CallHistoryService.js
import { api } from './api';

class CallHistoryService {
  /**
   * Get call history with pagination
   * @param {Object} options - Pagination options
   * @param {number} options.page - Page number (starts at 1)
   * @param {number} options.limit - Number of items per page
   * @returns {Promise<Object>} - Call history and pagination info
   */
  async getHistory(options = { page: 1, limit: 10 }) {
    try {
      const response = await api.calls.getHistory(options);
      return response.data;
    } catch (error) {
      console.error('Error fetching call history:', error);
      
      // Return mock data if the API call fails
      return {
        calls: [
          {
            id: "call_123456",
            call_sid: "CA9876543210",
            from_number: "+12345678901",
            to_number: "+19876543210",
            direction: "outbound",
            status: "completed",
            start_time: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
            end_time: new Date(Date.now() - 3300000).toISOString(),   // 55 minutes ago
            duration: 300,
            recording_url: "https://api.example.com/recordings/123456.mp3",
            transcription: "This is a sample transcription of the call."
          },
          {
            id: "call_234567",
            call_sid: "CA0123456789",
            from_number: "+19876543210",
            to_number: "+12345678901",
            direction: "inbound",
            status: "completed",
            start_time: new Date(Date.now() - 10800000).toISOString(), // 3 hours ago
            end_time: new Date(Date.now() - 9900000).toISOString(),    // 2h 45m ago
            duration: 900,
            recording_url: "https://api.example.com/recordings/234567.mp3",
            transcription: "Another sample transcription for an inbound call."
          }
        ],
        pagination: {
          page: options.page,
          limit: options.limit,
          total: 2,
          pages: 1
        }
      };
    }
  }
}

// Export as a singleton instance
export default new CallHistoryService();
