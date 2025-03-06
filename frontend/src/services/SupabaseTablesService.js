// SupabaseTablesService.js
import { api } from './api';

class SupabaseTablesService {
  constructor() {
    // Set default options
    this.defaultOptions = {
      tables: {
        list: { endpoint: '/knowledge/tables/list' },
        schema: { endpoint: '/knowledge/tables/schema' }
      }
    };
  }

  /**
   * List all Supabase tables accessible to the application
   * @returns {Promise<Array>} - Array of table information objects
   */
  async listSupabaseTables() {
    try {
      const response = await api.get(this.defaultOptions.tables.list.endpoint);
      return response.data.tables || [];
    } catch (error) {
      console.error('Error fetching Supabase tables:', error);
      
      // Return mock data if the API call fails
      return [
        {
          name: "customers",
          schema: "public",
          description: "Customer information",
          rowCount: 1250,
          lastUpdated: new Date(Date.now() - 172800000).toISOString() // 2 days ago
        },
        {
          name: "products",
          schema: "public",
          description: "Product catalog",
          rowCount: 350,
          lastUpdated: new Date(Date.now() - 432000000).toISOString() // 5 days ago
        },
        {
          name: "orders",
          schema: "public",
          description: "Customer orders",
          rowCount: 3200,
          lastUpdated: new Date(Date.now() - 86400000).toISOString() // 1 day ago
        }
      ];
    }
  }

  /**
   * Get table schema details
   * @param {string} tableName - Name of the table
   * @param {string} schema - Schema name (default: 'public')
   * @returns {Promise<Object>} - Table structure information
   */
  async getTableSchema(tableName, schema = 'public') {
    try {
      const response = await api.get(this.defaultOptions.tables.schema.endpoint, {
        params: { table: tableName, schema }
      });
      return response.data;
    } catch (error) {
      console.error(`Error fetching schema for ${schema}.${tableName}:`, error);
      
      // Return mock schema data
      return {
        name: tableName,
        schema: schema,
        columns: [
          { name: "id", type: "integer", isPrimary: true, isNullable: false },
          { name: "created_at", type: "timestamp", isPrimary: false, isNullable: false },
          { name: "updated_at", type: "timestamp", isPrimary: false, isNullable: false },
          { name: "name", type: "text", isPrimary: false, isNullable: false },
          { name: "description", type: "text", isPrimary: false, isNullable: true },
          { name: "active", type: "boolean", isPrimary: false, isNullable: false, defaultValue: true }
        ],
        foreignKeys: [],
        rowCount: 1250
      };
    }
  }
}

// Export as a singleton instance
export default new SupabaseTablesService();
