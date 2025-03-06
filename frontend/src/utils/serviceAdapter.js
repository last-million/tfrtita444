// serviceAdapter.js
// This adapter connects existing components to the proper service implementations

import CallHistoryService from '../services/CallHistoryService';
import SupabaseTablesService from '../services/SupabaseTablesService';

console.log("🛠️ Service Adapter: Loading service implementations...");

// Create global service objects that the app expects - with error checking
try {
  // Fix for CallService.getHistory
  window.CallService = CallHistoryService;
  console.log("✅ CallService registered successfully");
  
  // Fix for Je.listSupabaseTables - assign to BOTH Je and Et variable names
  // because the minified code might use either name
  window.Je = SupabaseTablesService;
  window.Et = SupabaseTablesService;
  console.log("✅ Supabase services registered as both Je and Et");
  
  // Also register with other potential variable names
  window.Supabase = SupabaseTablesService;
  window.SupabaseService = SupabaseTablesService;
} catch (error) {
  console.error("❌ Error registering services:", error);
}

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

// Add global error handler to catch any service failures
window.addEventListener('error', function(event) {
  // Check for specific error messages related to our services
  const errorStr = event.error?.toString() || '';
  
  if (errorStr.includes('getHistory') || errorStr.includes('CallService')) {
    console.warn('🔍 Detected CallService error, reinstalling getHistory');
    window.CallService = window.CallService || {};
    window.CallService.getHistory = window.CallService.getHistory || CallHistoryService.getHistory;
  }
  
  if (errorStr.includes('listSupabaseTables') || errorStr.includes('Je.')) {
    console.warn('🔍 Detected Supabase tables error, reinstalling listSupabaseTables');
    window.Je = window.Je || {};
    window.Je.listSupabaseTables = window.Je.listSupabaseTables || SupabaseTablesService.listSupabaseTables;
  }
});

// Export the services for direct imports
export const services = {
  CallHistory: CallHistoryService,
  SupabaseTables: SupabaseTablesService
};

console.log("✅ Service Adapter: Services ready!");
