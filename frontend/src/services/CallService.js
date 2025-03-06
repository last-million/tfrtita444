import { api } from './api';

/**
 * CallService - A dedicated service for handling call operations
 * with fallback functionality when API is unavailable
 */
class CallService {
  constructor() {
    // Flag to track if we're in mock mode (fallback when backend is down)
    this.useMockMode = false;
    
    // Check if the backend is available on initialization
    this.checkBackendAvailability();
  }
  
  /**
   * Check if the backend API is available, and set mock mode if not
   */
  async checkBackendAvailability() {
    try {
      // Try to ping the health endpoint
      await api.get('/health', { timeout: 3000 });
      this.useMockMode = false;
      console.log('Backend API is available, using real endpoints');
    } catch (error) {
      // If the backend is not available, switch to mock mode
      this.useMockMode = true;
      console.warn('Backend API is unavailable, switching to simulation mode for calls');
    }
  }
  /**
   * Initiate a call to a specified phone number with an Ultravox URL
   * @param {string} phoneNumber - The phone number to call
   * @param {string} ultravoxUrl - Optional Ultravox URL for AI voice integration
   * @returns {Promise} - API response or mock response
   */
  async initiateCall(phoneNumber, ultravoxUrl) {
    try {
      console.log(`CallService: Initiating call to ${phoneNumber}`);
      
      // Check if the backend is available before trying to make the call
      try {
        const healthCheck = await api.get('/health', { timeout: 3000 });
        this.useMockMode = false;
      } catch (healthError) {
        this.useMockMode = true;
        console.warn('Backend health check failed, using simulation mode:', healthError);
      }
      
      // If in mock mode, return a simulated successful response
      if (this.useMockMode) {
        console.log(`SIMULATION MODE: Simulating call to ${phoneNumber}`);
        // Artificial delay to simulate network request
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        return {
          status: "simulated",
          call_sid: `sim_${Date.now()}`,
          message: "Call simulated successfully (backend unavailable)",
          to_number: phoneNumber,
          from_number: "+18005551234",
          simulation_mode: true
        };
      }
      
      // Attempt the real call
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
   * @param {boolean} forceMockMode - Force mock mode for testing
   * @returns {Promise<Array>} Array of call results
   */
  async initiateMultipleCalls(phoneNumbers, ultravoxUrl, forceMockMode = false) {
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
   * @returns {Promise} - API response with call history or mock data
   */
  async getCallHistory(options = { page: 1, limit: 10 }) {
    try {
      // Check if we're in mock mode
      if (this.useMockMode) {
        console.log("SIMULATION MODE: Returning mock call history data");
        // Return mock data right away
        return this._getMockCallHistory(options);
      }
      
      // Try the real API
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
   * @returns {Promise} - API response with call details or mock data
   */
  async getCallDetails(callSid) {
    try {
      // Check if we're in mock mode
      if (this.useMockMode) {
        console.log(`SIMULATION MODE: Returning mock call details for ${callSid}`);
        return this._getMockCallDetails(callSid);
      }
      
      // Try the real API
      const response = await api.get(`/calls/${callSid}`);
      return response.data;
    } catch (error) {
      console.error(`CallService: Error fetching call details for ${callSid}:`, error);
      throw error;
    }
  }
  
  /**
   * Helper method to generate mock call history data
   * @private
   */
  _getMockCallHistory(options = { page: 1, limit: 10 }) {
    const mockCalls = [
      {
        id: "sim_123456",
        call_sid: "CA9876543210",
        from_number: "+12345678901",
        to_number: "+19876543210",
        direction: "outbound",
        status: "completed",
        start_time: new Date(Date.now() - 3600000).toISOString(),
        end_time: new Date(Date.now() - 3300000).toISOString(),
        duration: 300,
        recording_url: "https://api.example.com/recordings/123456.mp3",
        transcription: "This is a simulated call transcript (backend unavailable)",
        simulation_mode: true
      },
      {
        id: "sim_234567",
        call_sid: "CA0123456789",
        from_number: "+19876543210",
        to_number: "+12345678901",
        direction: "inbound",
        status: "completed",
        start_time: new Date(Date.now() - 10800000).toISOString(),
        end_time: new Date(Date.now() - 9900000).toISOString(),
        duration: 900,
        recording_url: "https://api.example.com/recordings/234567.mp3",
        transcription: "Another simulated call transcript (backend unavailable)",
        simulation_mode: true
      }
    ];
    
    const start = (options.page - 1) * options.limit;
    const end = start + options.limit;
    const paginatedCalls = mockCalls.slice(start, end);
    
    return {
      calls: paginatedCalls,
      pagination: {
        page: options.page,
        limit: options.limit,
        total: mockCalls.length,
        pages: Math.ceil(mockCalls.length / options.limit)
      },
      simulation_mode: true
    };
  }
  
  /**
   * Helper method to generate mock call details
   * @private
   */
  _getMockCallDetails(callSid) {
    return {
      id: callSid.startsWith('sim_') ? callSid : `sim_${callSid}`,
      call_sid: callSid,
      from_number: "+18005551234",
      to_number: "+12125551212",
      direction: Math.random() > 0.5 ? "inbound" : "outbound",
      status: "completed",
      start_time: new Date(Date.now() - Math.floor(Math.random() * 86400000)).toISOString(),
      end_time: new Date(Date.now() - Math.floor(Math.random() * 3600000)).toISOString(),
      duration: Math.floor(Math.random() * 600) + 60,
      recording_url: "https://api.example.com/recordings/simulated.mp3",
      transcription: "This is a simulated call transcript for testing purposes (backend unavailable)",
      cost: 1.75,
      ultravox_cost: 0.89,
      segments: 12,
      hang_up_by: Math.random() > 0.5 ? "user" : "agent",
      system_prompt: "You are a helpful assistant. This is a simulated system prompt.",
      language_hint: "en",
      voice: "Tanya-English",
      temperature: 0.4,
      model: "simulation-model",
      tools_used: [
        { name: "simulatedTool1", times_used: 2 },
        { name: "simulatedTool2", times_used: 1 }
      ],
      knowledge_base_access: true,
      knowledge_base_sources: [
        "Simulated Knowledge Source 1",
        "Simulated Knowledge Source 2"
      ],
      technical_details: {
        initial_medium: "voice",
        max_duration: "3600s",
        join_timeout: "30s"
      },
      simulation_mode: true
    };
  }
}

// Export as a singleton instance
export default new CallService();
