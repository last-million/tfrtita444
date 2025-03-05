#!/bin/bash
set -e

# Check if script is running with sudo privileges
if [ "$EUID" -ne 0 ]; then
  echo "This script must be run with sudo. Please run: sudo ./full_fix_deploy.sh"
  exit 1
fi

# -----------------------------------------------------------
# CONFIGURATION VARIABLES
# -----------------------------------------------------------
DOMAIN="ajingolik.fun"
EMAIL="hamzameliani1@gmail.com"

# MySQL Configuration
MYSQL_ROOT_PASSWORD="AFINasahbi@-11"
MYSQL_USER="hamza"
MYSQL_PASSWORD="AFINasahbi@-11"
MYSQL_DATABASE="voice_call_ai"
# URL-encode the @ character for database URLs
MYSQL_PASSWORD_ENCODED=${MYSQL_PASSWORD//@/%40}

# Absolute paths (assumes deploy.sh is in the repository root)
APP_DIR="$(pwd)"
BACKEND_DIR="${APP_DIR}/backend"
FRONTEND_DIR="${APP_DIR}/frontend"
WEB_ROOT="/var/www/${DOMAIN}/html"
SERVICE_FILE="/etc/systemd/system/tfrtita333.service"
NGINX_CONF="/etc/nginx/sites-available/${DOMAIN}"

# Set non-interactive mode globally for the entire script
export DEBIAN_FRONTEND=noninteractive

# -----------------------------------------------------------
# Logging helper
# -----------------------------------------------------------
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

check_error() {
    if [ $? -ne 0 ]; then
        log "ERROR: $1"
        log "Continuing despite error..."
    fi
}

# -----------------------------------------------------------
# X. BUILD FRONTEND
# -----------------------------------------------------------
log "Building frontend..."

# Navigate to frontend directory
cd "${FRONTEND_DIR}" || log "Warning: Could not change to frontend directory"

# Install frontend dependencies
log "Installing frontend dependencies..."
npm install || log "Warning: Frontend dependency installation failed"

# Build frontend
log "Building frontend for production..."
npm run build || log "Warning: Frontend build failed"

# Create web root directory
log "Creating web root directory..."
mkdir -p "${WEB_ROOT}"

# Copy frontend build to web root
log "Copying frontend build to web root..."
cp -r dist/* "${WEB_ROOT}/" || log "Warning: Failed to copy frontend build"

# -----------------------------------------------------------
# XI. SETUP BACKEND SERVICE
# -----------------------------------------------------------
log "Creating systemd service for backend..."

# Create systemd service file
cat > "${SERVICE_FILE}" << EOF
[Unit]
Description=FastAPI backend for ${DOMAIN}
After=network.target

[Service]
User=www-data
Group=www-data
WorkingDirectory=${BACKEND_DIR}
Environment="PATH=${APP_DIR}/venv/bin"
ExecStart=${APP_DIR}/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# Set permissions
chmod 644 "${SERVICE_FILE}"

# Reload systemd, enable and start service
log "Starting backend service..."
systemctl daemon-reload
systemctl enable tfrtita333.service
systemctl start tfrtita333.service || log "Warning: Failed to start backend service"

# -----------------------------------------------------------
# XII. CONFIGURE NGINX
# -----------------------------------------------------------
log "Configuring Nginx..."

# Create Nginx server block configuration
cat > "${NGINX_CONF}" << EOF
server {
    listen 80;
    server_name ${DOMAIN} www.${DOMAIN};
    
    # Root directory for static files
    root ${WEB_ROOT};
    index index.html;

    # Handle API requests - proxy to backend
    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_buffering off;
        proxy_read_timeout 300s;
    }

    # Handle all other requests - SPA frontend
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Additional security headers
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options SAMEORIGIN;
    add_header X-XSS-Protection "1; mode=block";
}
EOF

# Create symbolic link to enable the site
ln -sf "${NGINX_CONF}" /etc/nginx/sites-enabled/

# Test Nginx configuration
nginx -t || log "Warning: Nginx configuration test failed"

# Restart Nginx
log "Restarting Nginx..."
systemctl restart nginx || log "Warning: Failed to restart Nginx"

log "Deployment complete! Your application should now be running at http://${DOMAIN}"
log "Login with username: hamza and password: AFINasahbi@-11"

# -----------------------------------------------------------
# ENSURE PROPER FILE PERMISSIONS
# -----------------------------------------------------------
log "Setting file permissions..."
find "${APP_DIR}" -type d -exec chmod 755 {} \;
find "${APP_DIR}" -type f -exec chmod 644 {} \;
chmod +x "${APP_DIR}/deploy.sh"
chmod +x "${APP_DIR}/full_fix_deploy.sh"
chown -R www-data:www-data "${WEB_ROOT}"
chmod +x "${BACKEND_DIR}/app" || true
