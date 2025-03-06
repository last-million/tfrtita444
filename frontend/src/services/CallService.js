import { api } from './api';

/**
 * CallService - A dedicated service for handling call operations
 */
class CallService {
  /**
   * Initiate a call to a specified phone number with an Ultravox URL
   * @param {string} phoneNumber - The phone number to call
   * @param {string} ultravoxUrl - Optional Ultravox URL for AI voice integration
   * @returns {Promise} - API response
   */
  async initiateCall(phoneNumber, ultravoxUrl) {
    try {
      console.log(`CallService: Initiating call to ${phoneNumber}`);
      
      // First check if backend is available with a simple ping
      try {
        await api.get('/health', { timeout: 3000 });
      } catch (healthError) {
        console.warn('Backend health check failed, call may not work:', healthError);
        // Continue anyway, as the call endpoint might still work
      }
      
      // Attempt the call
      const response = await api.post('/calls/initiate', null, {
        params: {
          to_number: phoneNumber,
          ultravox_url: ultravoxUrl
        },
        timeout: 15000 // Increase timeout for call initiation
      });
      
      return response.data;
    } catch (error) {
      console.error('CallService: Error initiating call:', error);
      
      // Provide more user-friendly error message
      let userMessage = 'Failed to initiate call';
      
      if (error.response) {
        // The request was made and the server responded with a status code outside of 2xx
        if (error.response.status === 502) {
          userMessage = 'The call system is currently unavailable. This could be due to server maintenance or network issues.';
        } else if (error.response.status === 404) {
          userMessage = 'The call service endpoint was not found. Please check server configuration.';
        } else if (error.response.status >= 500) {
          userMessage = 'There was a server error while trying to initiate the call. Please try again later.';
        } else if (error.response.status === 401 || error.response.status === 403) {
          userMessage = 'Not authorized to make calls. Please check your credentials.';
        } else {
          userMessage = `Call failed with status code ${error.response.status}: ${error.response.data?.detail || 'Unknown error'}`;
        }
      } else if (error.request) {
        // The request was made but no response was received
        userMessage = 'No response received from the call server. Please check your network connection.';
      } else {
        // Something happened in setting up the request
        userMessage = `Error setting up call: ${error.message}`;
      }
      
      // Create an enhanced error with user message
      const enhancedError = new Error(userMessage);
      enhancedError.originalError = error;
      enhancedError.userMessage = userMessage;
      throw enhancedError;
    }
  }

  /**
   * Initiate calls to multiple phone numbers
   * @param {string[]} phoneNumbers - Array of phone numbers to call
   * @param {string} ultravoxUrl - Optional Ultravox URL for AI voice integration
   * @returns {Promise<Array>} Array of call results
   */
  async initiateMultipleCalls(phoneNumbers, ultravoxUrl) {
    const results = [];
    for (const number of phoneNumbers) {
      try {
        const result = await this.initiateCall(number, ultravoxUrl);
        results.push({
          number,
          success: true,
          data: result
        });
      } catch (error) {
        results.push({
          number,
          success: false,
          error: error.message
        });
      }
    }
    return results;
  }

  /**
   * Get call history with pagination
   * @param {object} options - Pagination options
   * @returns {Promise} - API response with call history
   */
  async getCallHistory(options = { page: 1, limit: 10 }) {
    try {
      const response = await api.get('/calls/history', {
        params: {
          page: options.page,
          limit: options.limit
        }
      });
      return response.data;
    } catch (error) {
      console.error('CallService: Error fetching call history:', error);
      
      // Return mock data in case of failure for development
      return {
        calls: [
          {
            id: "call_123456",
            call_sid: "CA9876543210",
            from_number: "+12345678901",
            to_number: "+19876543210",
            direction: "outbound",
            status: "completed",
            start_time: new Date(Date.now() - 3600000).toISOString(),
            end_time: new Date(Date.now() - 3300000).toISOString(),
            duration: 300,
            recording_url: "https://api.example.com/recordings/123456.mp3",
            transcription: "Sample transcription of the call."
          },
          {
            id: "call_234567",
            call_sid: "CA0123456789",
            from_number: "+19876543210",
            to_number: "+12345678901",
            direction: "inbound",
            status: "completed",
            start_time: new Date(Date.now() - 10800000).toISOString(),
            end_time: new Date(Date.now() - 9900000).toISOString(),
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

  /**
   * Get details for a specific call
   * @param {string} callSid - The call SID to get details for
   * @returns {Promise} - API response with call details
   */
  async getCallDetails(callSid) {
    try {
      const response = await api.get(`/calls/${callSid}`);
      return response.data;
    } catch (error) {
      console.error(`CallService: Error fetching call details for ${callSid}:`, error);
      throw error;
    }
  }
}

// Export as a singleton instance
export default new CallService();
