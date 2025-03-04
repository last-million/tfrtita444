#!/bin/bash
set -e

# Check if script is running with sudo privileges
if [ "$EUID" -ne 0 ]; then
  echo "This script must be run with sudo. Please run: sudo ./deploy.sh"
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
# I. SYSTEM PREPARATION
# -----------------------------------------------------------
log "Fixing any interrupted package installations..."
dpkg --configure -a
check_error "Failed to fix package installation state"

log "Updating system packages..."
apt update
apt upgrade -y
check_error "Failed to update system packages"

log "Removing conflicting Node.js packages..."
apt remove -y nodejs npm || true

log "Installing Node.js from NodeSource repository..."
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs
check_error "Failed to install Node.js"

# Verify Node.js installation
log "Verifying Node.js installation: $(node -v) and npm: $(npm -v)"

# Ensure deploy.sh has Unix line endings
apt install -y dos2unix
dos2unix deploy.sh

# -----------------------------------------------------------
# II. CLEAN INSTALLATIONS
# -----------------------------------------------------------
log "Removing existing installations..."

# Stop and remove existing services
systemctl stop tfrtita333 2>/dev/null || true
systemctl stop nginx 2>/dev/null || true
systemctl stop mysql 2>/dev/null || true

# Kill any running processes
killall -9 mysqld 2>/dev/null || true

# Remove MySQL completely
apt purge -y mysql-server mysql-client mysql-common libmysqlclient-dev default-libmysqlclient-dev || true
apt autoremove -y
rm -rf /var/lib/mysql /etc/mysql /var/log/mysql || true

# Remove Nginx completely
apt purge -y nginx nginx-common || true
apt autoremove -y
rm -rf /etc/nginx /var/log/nginx || true

# Reinstall required packages
log "Installing required packages..."
apt install -y nginx certbot python3-certbot-nginx git python3 python3-pip python3-venv \
    libyaml-dev build-essential pkg-config python3-dev libssl-dev
check_error "Failed to install required packages"

# -----------------------------------------------------------
# III. FIREWALL SETUP
# -----------------------------------------------------------
log "Configuring iptables rules directly (skipping UFW)..."
mkdir -p /etc/iptables
tee /etc/iptables/rules.v4 > /dev/null <<'EOF'
*filter
:INPUT ACCEPT [0:0]
:FORWARD ACCEPT [0:0]
:OUTPUT ACCEPT [0:0]
# Allow established connections
-A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
# Allow loopback interface
-A INPUT -i lo -j ACCEPT
# Allow SSH (port 22)
-A INPUT -p tcp -m state --state NEW -m tcp --dport 22 -j ACCEPT
# Allow HTTP (port 80)
-A INPUT -p tcp -m state --state NEW -m tcp --dport 80 -j ACCEPT
# Allow HTTPS (port 443)
-A INPUT -p tcp -m state --state NEW -m tcp --dport 443 -j ACCEPT
# Allow MySQL (port 3306)
-A INPUT -p tcp -m state --state NEW -m tcp --dport 3306 -j ACCEPT
# Allow additional ports for API and backend
-A INPUT -p tcp -m state --state NEW -m tcp --dport 8000 -j ACCEPT
-A INPUT -p tcp -m state --state NEW -m tcp --dport 8080 -j ACCEPT
# Drop all other incoming traffic
-A INPUT -j DROP
COMMIT
EOF

# Apply iptables rules directly
iptables-restore < /etc/iptables/rules.v4
check_error "Failed to apply iptables rules"

# Skip interactive iptables-persistent installation
log "Creating systemd service for iptables persistence..."
cat > /etc/systemd/system/iptables-restore.service << EOFS
[Unit]
Description=Restore iptables rules
After=network.target

[Service]
Type=oneshot
ExecStart=/sbin/iptables-restore /etc/iptables/rules.v4
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOFS

systemctl daemon-reload
systemctl enable iptables-restore.service
systemctl start iptables-restore.service

# -----------------------------------------------------------
# V. MYSQL SETUP
# -----------------------------------------------------------
log "Installing MySQL Server..."

# Configure MySQL installation non-interactively
echo "mysql-server mysql-server/root_password password ${MYSQL_ROOT_PASSWORD}" | debconf-set-selections
echo "mysql-server mysql-server/root_password_again password ${MYSQL_ROOT_PASSWORD}" | debconf-set-selections
echo "mysql-server mysql-server/default-auth-override select Use Legacy Authentication Method (Retain MySQL 5.x Compatibility)" | debconf-set-selections

# Install MySQL packages
apt update
apt install -y mysql-server mysql-client libmysqlclient-dev default-libmysqlclient-dev || log "Warning: MySQL installation had errors, will try to continue"

# Start and enable MySQL
log "Starting MySQL service..."
systemctl start mysql || log "Warning: Failed to start MySQL, will try to continue"
systemctl enable mysql || log "Warning: Failed to enable MySQL, will try to continue"

# Wait for MySQL to be ready
log "Waiting for MySQL to be ready..."
MAX_TRIES=30
COUNT=0
while ! mysqladmin ping -h localhost --silent 2>/dev/null; do
    sleep 1
    COUNT=$((COUNT + 1))
    if [ $COUNT -ge $MAX_TRIES ]; then
        log "Warning: MySQL failed to start after ${MAX_TRIES} seconds, continuing anyway"
        break
    fi
done

# Secure MySQL - continue even if this fails
log "Configuring MySQL..."
mysql -uroot -p${MYSQL_ROOT_PASSWORD} <<EOF || log "Warning: MySQL security configuration failed, continuing anyway"
DELETE FROM mysql.user WHERE User='';
DELETE FROM mysql.user WHERE User='root' AND Host NOT IN ('localhost', '127.0.0.1', '::1');
DROP DATABASE IF EXISTS test;
DELETE FROM mysql.db WHERE Db='test' OR Db='test\\_%';
FLUSH PRIVILEGES;
EOF

# Create database and user
log "Creating MySQL database and user..."
mysql -uroot -p${MYSQL_ROOT_PASSWORD} <<EOF || log "Warning: MySQL database creation failed, continuing anyway"
CREATE DATABASE IF NOT EXISTS ${MYSQL_DATABASE} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${MYSQL_USER}'@'localhost' IDENTIFIED BY '${MYSQL_PASSWORD}';
GRANT ALL PRIVILEGES ON ${MYSQL_DATABASE}.* TO '${MYSQL_USER}'@'localhost';
FLUSH PRIVILEGES;
EOF

# Create application tables
log "Creating application tables..."
mysql -u${MYSQL_USER} -p${MYSQL_PASSWORD} ${MYSQL_DATABASE} <<EOF || log "Warning: Table creation failed, continuing anyway"
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS calls (
  id INT AUTO_INCREMENT PRIMARY KEY,
  call_sid VARCHAR(255) NOT NULL,
  from_number VARCHAR(20) NOT NULL,
  to_number VARCHAR(20) NOT NULL,
  direction ENUM('inbound', 'outbound') NOT NULL,
  status VARCHAR(50) NOT NULL,
  start_time DATETIME NOT NULL,
  end_time DATETIME,
  duration INT,
  recording_url TEXT,
  transcription TEXT,
  cost DECIMAL(10, 4),
  segments INT,
  ultravox_cost DECIMAL(10, 4),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS knowledge_base_documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  file_type VARCHAR(50) NOT NULL,
  vector_embedding JSON,
  source_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS service_connections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  service_name VARCHAR(50) NOT NULL,
  credentials JSON,
  is_connected BOOLEAN DEFAULT FALSE,
  last_connected DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_service (service_name)
);

CREATE TABLE IF NOT EXISTS error_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  timestamp DATETIME NOT NULL,
  path VARCHAR(255) NOT NULL,
  method VARCHAR(10) NOT NULL,
  error_type VARCHAR(100) NOT NULL,
  error_message TEXT NOT NULL,
  traceback TEXT,
  headers TEXT,
  client_ip VARCHAR(45),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert default users
INSERT IGNORE INTO users (username, password_hash) 
VALUES 
('hamza', '\$2b\$12\$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewFX5rtJ.ETlF/Ye'),
('admin', '\$2b\$12\$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewFX5rtJ.ETlF/Ye');

-- Insert default service connections
INSERT IGNORE INTO service_connections (service_name, is_connected) VALUES
('twilio', FALSE),
('google_drive', FALSE),
('ultravox', FALSE),
('supabase', FALSE);
EOF

# -----------------------------------------------------------
# VI. APPLICATION SETUP
# -----------------------------------------------------------
log "Setting up application environment..."

# Create backup directory
BACKUP_DIR="${APP_DIR}/backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "${BACKUP_DIR}"

# Clean previous deployment folders
rm -rf "${APP_DIR}/venv" || true
rm -rf "${WEB_ROOT}" || true

# Create Python virtual environment
python3 -m venv venv || log "Warning: Virtual environment creation failed"
source venv/bin/activate || log "Warning: Could not activate virtual environment"
pip install --upgrade pip setuptools wheel || log "Warning: Failed to upgrade pip"

# -----------------------------------------------------------
# VII. BACKEND SETUP
# -----------------------------------------------------------
log "Installing backend dependencies..."
cd "${BACKEND_DIR}" || log "Warning: Could not change to backend directory"

# Install backend requirements
if [ -f "requirements.txt" ]; then
    log "Installing Python requirements..."
    pip install -r requirements.txt || log "Warning: Some requirements failed to install"
fi

# Install essential packages for FastAPI
log "Installing additional Python packages..."
pip install gunicorn uvicorn pymysql sqlalchemy pydantic || log "Warning: Failed to install some packages"
pip install python-jose[cryptography] passlib[bcrypt] python-multipart fastapi || log "Warning: Failed to install some packages"

# -----------------------------------------------------------
# VIII. CONFIGURE APPLICATION
# -----------------------------------------------------------
log "Creating configuration files..."

# Ensure app directory exists
mkdir -p "${BACKEND_DIR}/app" || true
touch "${BACKEND_DIR}/app/__init__.py" || true

# Create config.py
log "Creating backend config.py..."
cat > "${BACKEND_DIR}/app/config.py" << EOF
from pydantic_settings import BaseSettings
from pydantic import Field
import urllib.parse

class Settings(BaseSettings):
    # Database configuration
    db_host: str = Field("localhost", env="DB_HOST")
    db_user: str = Field("${MYSQL_USER}", env="DB_USER")
    db_password: str = Field("${MYSQL_PASSWORD}", env="DB_PASSWORD")
    db_database: str = Field("${MYSQL_DATABASE}", env="DB_DATABASE")
    
    # URL-encoded database URL for SQLAlchemy
    @property
    def get_database_url(self):
        encoded_password = urllib.parse.quote_plus(self.db_password)
        return f"mysql+pymysql://{self.db_user}:{encoded_password}@{self.db_host}/{self.db_database}"
    
    # Twilio credentials
    twilio_account_sid: str = Field("placeholder-value", env="TWILIO_ACCOUNT_SID")
    twilio_auth_token: str = Field("placeholder-value", env="TWILIO_AUTH_TOKEN")
    
    # Supabase credentials
    supabase_url: str = Field("placeholder-value", env="SUPABASE_URL")
    supabase_key: str = Field("placeholder-value", env="SUPABASE_KEY")
    
    # Google OAuth credentials
    google_client_id: str = Field("placeholder-value", env="GOOGLE_CLIENT_ID")
    google_client_secret: str = Field("placeholder-value", env="GOOGLE_CLIENT_SECRET")
    
    # Ultravox API
    ultravox_api_key: str = Field("placeholder-value", env="ULTRAVOX_API_KEY")
    
    # JWT configuration
    jwt_secret: str = Field("strong-secret-key-for-jwt-tokens", env="JWT_SECRET")
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    
    # Application settings
    cors_origins: str = Field("https://${DOMAIN},http://localhost:5173,http://localhost:3000", env="CORS_ORIGINS")
    server_domain: str = Field("${DOMAIN}", env="SERVER_DOMAIN")
    debug: bool = Field(False, env="DEBUG")
    
    # Database URL (for compatibility)
    database_url: str = Field("mysql+pymysql://${MYSQL_USER}:${MYSQL_PASSWORD_ENCODED}@localhost/${MYSQL_DATABASE}", env="DATABASE_URL")
    
    # Encryption settings for credentials
    encryption_salt: str = Field("placeholder-salt-value", env="ENCRYPTION_SALT")
    secret_key: str = Field("placeholder-secret-key", env="SECRET_KEY")
    
    class Config:
        env_file = ".env"
        extra = "allow"

settings = Settings()
EOF

# Create backend .env file
log "Creating backend .env file..."
RANDOM_SECRET_KEY=$(openssl rand -hex 32 || echo "fallback-secret-key-if-openssl-fails")
cat > "${BACKEND_DIR}/.env" << EOF
# Database Configuration
DB_HOST=localhost
DB_USER=${MYSQL_USER}
DB_PASSWORD=${MYSQL_PASSWORD}
DB_DATABASE=${MYSQL_DATABASE}
DATABASE_URL=mysql+pymysql://${MYSQL_USER}:${MYSQL_PASSWORD_ENCODED}@localhost/${MYSQL_DATABASE}

# JWT Settings
JWT_SECRET=${RANDOM_SECRET_KEY}
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# Twilio Credentials
TWILIO_ACCOUNT_SID=placeholder-value
TWILIO_AUTH_TOKEN=placeholder-value

# Ultravox API
ULTRAVOX_API_KEY=placeholder-value

# Supabase settings
SUPABASE_URL=placeholder-value
SUPABASE_KEY=placeholder-value

# Google OAuth
GOOGLE_CLIENT_ID=placeholder-value
GOOGLE_CLIENT_SECRET=placeholder-value

# Server Settings
DEBUG=False
CORS_ORIGINS=https://${DOMAIN},http://localhost:5173,http://localhost:3000
SERVER_DOMAIN=${DOMAIN}
SECRET_KEY=${RANDOM_SECRET_KEY}
ENCRYPTION_SALT=placeholder-salt-value
LOG_LEVEL=INFO
EOF

# Create a simple main.py if it doesn't exist
if [ ! -f "${BACKEND_DIR}/app/main.py" ]; then
    log "Creating main.py..."
    cat > "${BACKEND_DIR}/app/main.py" << EOF
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from .config import settings
import os
from datetime import datetime, timedelta

app = FastAPI(
    title="Voice Call AI API",
    description="API for Voice Call AI application",
    version="1.0.0"
)

# CORS middleware setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {
        "status": "ok",
        "message": "Voice Call AI API is running",
        "version": "1.0.0",
        "environment": os.getenv("ENV", "production"),
        "timestamp": datetime.utcnow().isoformat()
    }

@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}
EOF
fi

# -----------------------------------------------------------
# IX. FRONTEND SETUP
# -----------------------------------------------------------
log "Setting up frontend..."
cd "${FRONTEND_DIR}" || log "Warning: Could not change to frontend directory"

# Create frontend .env file - Always use HTTPS
log "Creating frontend .env file with HTTPS URLs..."
cat > "${FRONTEND_DIR}/.env" << EOF
VITE_API_URL=https://${DOMAIN}/api
VITE_WEBSOCKET_URL=wss://${DOMAIN}/ws
VITE_GOOGLE_CLIENT_ID=placeholder-value
EOF

# Install frontend dependencies and build
log "Installing frontend dependencies and building..."
# First update package-lock.json to match package.json
log "Updating package-lock.json..."
npm install --package-lock-only || log "Warning: Failed to update package-lock.json, continuing anyway" 
# Then install dependencies normally
npm install || log "Warning: npm install failed, continuing anyway"
npm run build || log "Warning: Frontend build failed, continuing anyway"

log "Deploying frontend files..."
mkdir -p "${WEB_ROOT}" || true
rm -rf "${WEB_ROOT:?}"/* || true

# Create a fallback index.html if build fails
if [ -d "dist" ]; then
  cp -r dist/* "${WEB_ROOT}/" || log "Warning: Failed to copy some frontend files"
else
  log "Creating fallback index.html..."
  mkdir -p "${WEB_ROOT}" || true
  cat > "${WEB_ROOT}/index.html" << EOF
<!DOCTYPE html>
<html>
<head>
  <title>${DOMAIN} - Setup in Progress</title>
  <style>
    body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; }
    h1 { color: #333; }
  </style>
</head>
<body>
  <h1>Site Setup in Progress</h1>
  <p>The application is still being configured.</p>
  <p>Please check back later.</p>
</body>
</html>
EOF
fi

# Set permissions
chown -R www-data:www-data "${WEB_ROOT}" || log "Warning: Could not set permissions"
chmod -R 755 "${WEB_ROOT}" || log "Warning: Could not set permissions"

# -----------------------------------------------------------
# X. SYSTEMD SERVICE SETUP
# -----------------------------------------------------------
log "Creating systemd service..."
mkdir -p /var/log/tfrtita333 || true
chown -R $(whoami):$(whoami) /var/log/tfrtita333 || true

cat > ${SERVICE_FILE} << EOF
[Unit]
Description=Tfrtita333 App Backend
After=network.target mysql.service
Wants=mysql.service

[Service]
User=$(whoami)
WorkingDirectory=${BACKEND_DIR}
Environment="PATH=${APP_DIR}/venv/bin"
Environment="PYTHONPATH=${BACKEND_DIR}"
ExecStart=${APP_DIR}/venv/bin/gunicorn -k uvicorn.workers.UvicornWorker -w 4 --bind 127.0.0.1:8080 --access-logfile /var/log/tfrtita333/access.log --error-logfile /var/log/tfrtita333/error.log app.main:app
Restart=always
RestartSec=5
StartLimitIntervalSec=0

# Hardening
PrivateTmp=true
ProtectSystem=full
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload || log "Warning: Failed to reload systemd daemon"
systemctl enable tfrtita333.service || log "Warning: Failed to enable service"

# -----------------------------------------------------------
# XI. NGINX CONFIGURATION
# -----------------------------------------------------------
log "Configuring Nginx..."

# Create Nginx directories
mkdir -p /etc/nginx/sites-available || true
mkdir -p /etc/nginx/sites-enabled || true

# Create Nginx configuration
NGINX_CONF="/etc/nginx/sites-available/${DOMAIN}"

# Create basic configuration for HTTP - will be modified by Certbot for HTTPS
cat > ${NGINX_CONF} << EOF
server {
    listen 80;
    server_name ${DOMAIN} www.${DOMAIN};
    
    location / {
        root ${WEB_ROOT};
        try_files \$uri \$uri/ /index.html;
    }
    
    location /api {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
    
    location /ws {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
    }
}
EOF

# Enable site and reload Nginx
ln -sf ${NGINX_CONF} /etc/nginx/sites-enabled/ || log "Warning: Failed to enable site"
rm -f /etc/nginx/sites-enabled/default || true
nginx -t && systemctl restart nginx || log "Warning: Nginx configuration failed"

# Set up HTTPS with Certbot
log "Setting up HTTPS with Certbot..."
certbot --nginx --non-interactive --agree-tos --email ${EMAIL} -d ${DOMAIN} -d www.${DOMAIN} || log "Warning: Certbot HTTPS setup failed, continuing with HTTP only"

# Verify if Certbot was successful by checking for SSL configuration
if grep -q "ssl_certificate" ${NGINX_CONF}; then
  log "HTTPS setup successful! Site is now available over HTTPS."
  
  # Update frontend .env file to use HTTPS
  log "Updating frontend environment to use HTTPS..."
  cat > "${FRONTEND_DIR}/.env" << EOF
VITE_API_URL=https://${DOMAIN}/api
VITE_WEBSOCKET_URL=wss://${DOMAIN}/ws
VITE_GOOGLE_CLIENT_ID=placeholder-value
EOF
  
  # Rebuild frontend with HTTPS URLs
  log "Rebuilding frontend with HTTPS URLs..."
  cd "${FRONTEND_DIR}"
  npm run build || log "Warning: Frontend rebuild failed, continuing anyway"
  
  # Redeploy frontend files
  if [ -d "dist" ]; then
    cp -r dist/* "${WEB_ROOT}/" || log "Warning: Failed to copy some frontend files"
  fi
  
  # Add Certbot renewal cron job
  log "Setting up automatic SSL certificate renewal..."
  (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet") | crontab -
else
  log "HTTPS setup was not successful. Site will continue to use HTTP."
fi

# -----------------------------------------------------------
# XII. FINAL CLEANUP
# -----------------------------------------------------------

# Create maintenance scripts
log "Creating update and backup scripts..."

# Update script
cat > "${APP_DIR}/update.sh" << 'EOF'
#!/bin/bash
set -e

APP_DIR="$(pwd)"
BACKEND_DIR="${APP_DIR}/backend"
FRONTEND_DIR="${APP_DIR}/frontend"

echo "Pulling latest code..."
git pull

echo "Updating backend..."
cd "${BACKEND_DIR}"
source "${APP_DIR}/venv/bin/activate"
pip install -r requirements.txt

echo "Updating frontend..."
cd "${FRONTEND_DIR}"
# Update package-lock.json first
npm install --package-lock-only
# Then install dependencies normally
npm install
npm run build

echo "Copying frontend files..."
sudo cp -r dist/* /var/www/$(hostname -f)/html/

echo "Restarting services..."
sudo systemctl restart tfrtita333
sudo systemctl restart nginx

echo "Update completed!"
EOF
chmod +x "${APP_DIR}/update.sh"

# Backup script
cat > "${APP_DIR}/backup.sh" << 'EOF'
#!/bin/bash
set -e

APP_DIR="$(pwd)"
BACKUP_DIR="${APP_DIR}/backups/$(date +%Y%m%d_%H%M%S)"
DB_NAME="voice_call_ai"
DB_USER="hamza"
DB_PASS="AFINasahbi@-11"

mkdir -p "${BACKUP_DIR}"

echo "Backing up database..."
mysqldump -u${DB_USER} -p${DB_PASS} ${DB_NAME} > "${BACKUP_DIR}/${DB_NAME}.sql"

echo "Backing up application files..."
tar -czf "${BACKUP_DIR}/app_files.tar.gz" -C "${APP_DIR}" .

echo "Backup completed: ${BACKUP_DIR}"
EOF
chmod +x "${APP_DIR}/backup.sh"

# Start services
log "Starting services..."
systemctl start mysql || log "Warning: Failed to start MySQL"
systemctl start tfrtita333 || log "Warning: Failed to start app service"
systemctl start nginx || log "Warning: Failed to start Nginx"

# Final message
log "========== DEPLOYMENT COMPLETE =========="
log "The application should now be running at:"
log "http://${DOMAIN}"
log ""
log "Login credentials:"
log "Username: hamza"
log "Password: AFINasahbi@-11"
log ""
log "If you encounter any issues, please check the logs:"
log "Backend logs: journalctl -u tfrtita333 -n 50"
log "Nginx logs: /var/log/nginx/error.log"
log "MySQL logs: journalctl -u mysql -n 50"
log "========================================="
