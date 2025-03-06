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
  
  // Fix for various minified variable names that might reference Supabase services
  // The minifier might use any of these variable names
  window.Je = SupabaseTablesService;
  window.Et = SupabaseTablesService;
  window.et = SupabaseTablesService; // Adding lowercase version as error shows 'et'
  window.je = SupabaseTablesService; // Adding lowercase version for consistency
  
  // Also register specific functions directly to ensure they're available
  // This provides an extra safety net if the object assignment doesn't work properly
  window.Je = window.Je || {};
  window.Et = window.Et || {};
  window.et = window.et || {};
  window.je = window.je || {};
  
  // Assign functions directly to each possible object
  window.Je.listSupabaseTables = SupabaseTablesService.listSupabaseTables;
  window.Et.listSupabaseTables = SupabaseTablesService.listSupabaseTables;
  window.et.listSupabaseTables = SupabaseTablesService.listSupabaseTables;
  window.je.listSupabaseTables = SupabaseTablesService.listSupabaseTables;
  
  // Also register getTableSchema which might be used elsewhere
  window.Je.getTableSchema = SupabaseTablesService.getTableSchema;
  window.Et.getTableSchema = SupabaseTablesService.getTableSchema;
  window.et.getTableSchema = SupabaseTablesService.getTableSchema;
  window.je.getTableSchema = SupabaseTablesService.getTableSchema;
  
  console.log("✅ Supabase services registered with all possible variable names (Je, Et, et, je)");
  
  // Register with semantic names for direct imports
  window.Supabase = SupabaseTablesService;
  window.SupabaseService = SupabaseTablesService;
  window.SupabaseTablesService = SupabaseTablesService;
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
  
  if (errorStr.includes('listSupabaseTables') || 
      errorStr.includes('Je.') || 
      errorStr.includes('Et.') || 
      errorStr.includes('et.') || 
      errorStr.includes('je.')) {
    console.warn('🔍 Detected Supabase tables error, reinstalling listSupabaseTables');
    
    // Ensure all possible variable names have the method
    window.Je = window.Je || {};
    window.Et = window.Et || {};
    window.et = window.et || {};
    window.je = window.je || {};
    
    // Bind the method to the service to make sure 'this' context is preserved
    const boundListTables = SupabaseTablesService.listSupabaseTables.bind(SupabaseTablesService);
    const boundGetSchema = SupabaseTablesService.getTableSchema.bind(SupabaseTablesService);
    
    // Assign to all possible variables
    window.Je.listSupabaseTables = boundListTables;
    window.Et.listSupabaseTables = boundListTables;
    window.et.listSupabaseTables = boundListTables;
    window.je.listSupabaseTables = boundListTables;
    
    window.Je.getTableSchema = boundGetSchema;
    window.Et.getTableSchema = boundGetSchema;
    window.et.getTableSchema = boundGetSchema;
    window.je.getTableSchema = boundGetSchema;
    
    console.warn('✅ Supabase tables methods reinstalled on all possible variables');
  }
});

// Export the services for direct imports
export const services = {
  CallHistory: CallHistoryService,
  SupabaseTables: SupabaseTablesService
};

console.log("✅ Service Adapter: Services ready!");
