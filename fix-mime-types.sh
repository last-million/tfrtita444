#!/bin/bash

# Fix for JavaScript MIME type issues
# This script ensures JavaScript files are served with the correct Content-Type

set -e

# Check if script is running with sudo privileges
if [ "$EUID" -ne 0 ]; then
  echo "This script must be run with sudo. Please run: sudo ./fix-mime-types.sh"
  exit 1
fi

# Set your domain
DOMAIN="ajingolik.fun"
WEB_ROOT="/var/www/${DOMAIN}/html"
NGINX_CONF="/etc/nginx/sites-available/${DOMAIN}"

echo "Fixing MIME types in NGINX configuration..."

# Ensure JavaScript files have the correct MIME type
if ! grep -q "application/javascript" "/etc/nginx/mime.types"; then
  echo "Adding JavaScript MIME type to NGINX mime.types..."
  
  # Backup original file
  cp "/etc/nginx/mime.types" "/etc/nginx/mime.types.bak.$(date +%Y%m%d%H%M%S)"
  
  # Create a comprehensive mime.types file with JavaScript properly defined
  cat > /tmp/mime.types << 'EOF'
types {
    text/html                             html htm shtml;
    text/css                              css;
    text/xml                              xml;
    application/javascript                js;
    application/json                      json;
    image/gif                             gif;
    image/jpeg                            jpeg jpg;
    image/png                             png;
    image/svg+xml                         svg svgz;
    image/webp                            webp;
    image/x-icon                          ico;
    application/pdf                       pdf;
    application/zip                       zip;
    application/x-gzip                    gz;
    audio/mpeg                            mp3;
    video/mp4                             mp4;
    video/mpeg                            mpeg mpg;
    video/webm                            webm;
    font/woff                             woff;
    font/woff2                            woff2;
    application/vnd.ms-fontobject         eot;
    font/ttf                              ttf;
    font/collection                       ttc;
    font/otf                              otf;
}
EOF

  # Apply new mime.types
  mv /tmp/mime.types "/etc/nginx/mime.types"
  echo "✓ JavaScript MIME type added to NGINX mime.types"
else
  echo "✓ JavaScript MIME type is already defined in NGINX mime.types"
fi

# Back up existing NGINX configuration
if [ -f "${NGINX_CONF}" ]; then
  cp "${NGINX_CONF}" "${NGINX_CONF}.mime.bak.$(date +%Y%m%d%H%M%S)"
  echo "✓ Backed up existing NGINX configuration"
fi

# Add location block for JavaScript files to serve with correct MIME type
echo "Adding JavaScript-specific location block to NGINX configuration..."

# Check if the JavaScript handling section already exists
if grep -q "location ~\* \.js\$" "${NGINX_CONF}"; then
  echo "✓ JavaScript location block already exists in NGINX configuration"
else
  # Extract server block for editing
  SERVER_BLOCK=$(sed -n '/server {/,/}/p' "${NGINX_CONF}")
  
  # Add the JavaScript handling section (before the end of the server block)
  NEW_SERVER_BLOCK=$(echo "${SERVER_BLOCK}" | sed '/location \/ {/i\
    # Handle JavaScript files with proper MIME type\
    location ~* \\.js$ {\
        add_header Content-Type "application/javascript" always;\
        add_header Cache-Control "no-cache, must-revalidate" always;\
        etag off;\
        if_modified_since off;\
        add_header Last-Modified "" always;\
        try_files $uri =404;\
    }\
')

  # Replace the old server block with the new one
  sed -i "/server {/,/}/c\\${NEW_SERVER_BLOCK}" "${NGINX_CONF}"
  echo "✓ Added JavaScript location block to NGINX configuration"
fi

# Create an additional JavaScript fix to ensure proper loading
echo "Creating JavaScript loading fix script..."
mkdir -p "${WEB_ROOT}/js-fixes"
cat > "${WEB_ROOT}/js-fixes/mime-fix.js" << 'EOF'
// JavaScript MIME type fix helper
(function() {
  console.log('🔧 Initializing JavaScript MIME type fix...');
  
  // Check for script loading issues
  window.addEventListener('error', function(event) {
    if (event.target && event.target.tagName === 'SCRIPT') {
      console.error('Script loading error detected:', event.target.src);
      
      // Try to reload the script programmatically with correct MIME type
      const originalSrc = event.target.src;
      if (originalSrc && originalSrc.endsWith('.js')) {
        console.log('Attempting to reload script:', originalSrc);
        
        // Create a new script element
        const newScript = document.createElement('script');
        newScript.setAttribute('type', 'application/javascript');
        
        // Add a cache-busting parameter
        const cacheBuster = '?cb=' + Date.now();
        newScript.src = originalSrc.split('?')[0] + cacheBuster;
        
        // Add it to the document head
        document.head.appendChild(newScript);
        
        console.log('Script reloaded with correct MIME type:', newScript.src);
      }
    }
  }, true);
  
  console.log('✅ JavaScript MIME type fix initialized');
})();
EOF

# Set proper permissions
chmod 644 "${WEB_ROOT}/js-fixes/mime-fix.js"
chown www-data:www-data "${WEB_ROOT}/js-fixes/mime-fix.js"

# Find the index.html file and add our fix script
INDEX_FILE="${WEB_ROOT}/index.html"
if [ -f "${INDEX_FILE}" ]; then
  # Make a backup
  cp "${INDEX_FILE}" "${INDEX_FILE}.mime.bak.$(date +%Y%m%d%H%M%S)"
  
  # Check if our script is already included
  if ! grep -q "/js-fixes/mime-fix.js" "${INDEX_FILE}"; then
    # Add our script to the head section
    sed -i '/<head>/a \  <script src="/js-fixes/mime-fix.js"></script>' "${INDEX_FILE}"
    echo "✓ Added MIME fix script to index.html"
  else
    echo "✓ MIME fix script already included in index.html"
  fi
else
  echo "Warning: index.html not found at ${INDEX_FILE}"
fi

# Test NGINX configuration
echo "Testing NGINX configuration..."
nginx -t

if [ $? -eq 0 ]; then
  echo "NGINX configuration is valid. Restarting NGINX..."
  systemctl restart nginx
  echo "✅ MIME type fix has been successfully applied!"
else
  echo "❌ NGINX configuration test failed. Please check the configuration."
  exit 1
fi

echo "-------------------------------------------------------"
echo "✅ JavaScript MIME type fixes have been applied!"
echo "The following changes were made:"
echo "- Added application/javascript MIME type to NGINX configuration"
echo "- Added special handling for .js files in NGINX"
echo "- Created a JavaScript fix helper script"
echo "- Added the fix helper script to index.html"
echo "- Restarted NGINX to apply the changes"
echo "-------------------------------------------------------"
