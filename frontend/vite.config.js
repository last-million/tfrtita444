import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Increase warning threshold to 800kb
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Configure manual chunks to better organize dependencies
        manualChunks: (id) => {
          // Split node_modules into separate chunks
          if (id.includes('node_modules')) {
            // Group React-related modules together
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              return 'vendor-react';
            }
            
            // Group chart.js related dependencies
            if (id.includes('chart.js') || id.includes('react-chartjs')) {
              return 'vendor-charts';
            }
            
            // Group FontAwesome dependencies
            if (id.includes('fontawesome')) {
              return 'vendor-fontawesome';
            }
            
            // Other dependencies
            return 'vendor-other';
          }
        }
      }
    }
  }
});
