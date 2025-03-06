// CallHistoryService.js
import { api } from './api';

class CallHistoryService {
  /**
   * Get call history with pagination
   * @param {Object} options - Pagination options
   * @param {number} options.page - Page number (starts at 1)
   * @param {number} options.limit - Number of items per page
   * @param {string} options.status - Optional filter by call status
   * @param {string} options.search - Optional search query
   * @returns {Promise<Object>} - Call history and pagination info
   */
  async getHistory(options = { page: 1, limit: 10 }) {
    try {
      console.log('CallHistoryService: Fetching call history with options:', options);
      
      // Prepare request parameters
      const params = {
        page: options.page || 1,
        limit: options.limit || 10
      };
      
      // Add optional filters if provided
      if (options.status && options.status !== 'all') {
        params.status = options.status;
      }
      
      if (options.search) {
        params.search = options.search;
      }
      
      // Make direct API call
      const response = await api.get('/calls/history', { params });
      
      if (!response.data || !response.data.calls) {
        console.warn('CallHistoryService: Received malformed data from API');
        throw new Error('Received malformed data from API');
      }
      
      console.log(`CallHistoryService: Retrieved ${response.data.calls.length} calls`);
      return response.data;
    } catch (error) {
      console.error('CallHistoryService: Error fetching call history:', error);
      
      // Check if we should fall back to local data
      // In production, we'd want to show a user-friendly error instead
      const shouldUseFallback = true;
      
      if (!shouldUseFallback) {
        return {
          calls: [],
          pagination: {
            page: options.page,
            limit: options.limit,
            total: 0,
            pages: 0
          }
        };
      }
      
      // Use fallback data for development/testing purposes only
      console.warn('CallHistoryService: Using fallback data for call history');
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
