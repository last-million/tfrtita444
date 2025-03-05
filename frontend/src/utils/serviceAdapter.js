// serviceAdapter.js
// This adapter connects existing components to the proper service implementations

import CallHistoryService from '../services/CallHistoryService';
import SupabaseTablesService from '../services/SupabaseTablesService';

// Create global service objects that the app expects
window.CallService = CallHistoryService;
window.Et = SupabaseTablesService;

// Create mock service objects for any other missing services
const createMockService = (methodNames) => {
  const mockService = {};
  methodNames.forEach(methodName => {
    mockService[methodName] = async (...args) => {
      console.warn(`Mock implementation of ${methodName} called with:`, args);
      return { success: true, mock: true };
    };
  });
  return mockService;
};

// If there are other services that need to be mocked, add them here
window.VectorService = createMockService(['vectorizeDocument', 'searchVectors']);
window.UltravoxService = createMockService(['processAudio', 'transcribe']);

// Export the services for direct imports
export const services = {
  CallHistory: CallHistoryService,
  SupabaseTables: SupabaseTablesService
};

