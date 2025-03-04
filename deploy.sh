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
log "Updating system packages..."
apt update && apt upgrade -y
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
apt purge -y mysql-server mysql-client mysql-common libmysqlclient-dev default-libmysqlclient-dev
apt autoremove -y
rm -rf /var/lib/mysql /etc/mysql /var/log/mysql

# Remove Nginx completely
apt purge -y nginx nginx-common
apt autoremove -y
rm -rf /etc/nginx /var/log/nginx

# Reinstall required packages
log "Installing required packages..."
apt install -y nginx certbot python3-certbot-nginx ufw git python3 python3-pip python3-venv \
    libyaml-dev build-essential pkg-config python3-dev libssl-dev
check_error "Failed to install required packages"

# -----------------------------------------------------------
# III. FIREWALL SETUP
# -----------------------------------------------------------
log "Configuring UFW firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow "Nginx Full"
ufw allow 8000
ufw allow 8080
ufw allow 3306/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status

# -----------------------------------------------------------
# IV. IPTABLES RULES
# -----------------------------------------------------------
log "Configuring iptables rules..."
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

iptables-restore < /etc/iptables/rules.v4
check_error "Failed to apply iptables rules"

# Make iptables rules persistent across reboots
log "Making iptables rules persistent..."
# Prevent interactive prompts during installation
export DEBIAN_FRONTEND=noninteractive
echo "iptables-persistent iptables-persistent/autosave_v4 boolean true" | debconf-set-selections
echo "iptables-persistent iptables-persistent/autosave_v6 boolean true" | debconf-set-selections
apt install -y iptables-persistent
netfilter-persistent save
netfilter-persistent reload

# -----------------------------------------------------------
# V. MYSQL SETUP
# -----------------------------------------------------------
log "Installing MySQL Server..."

# Install MySQL with non-interactive configuration
log "Installing MySQL Server..."
export DEBIAN_FRONTEND=noninteractive

# Ensure MySQL root password is secure
if [ ${#MYSQL_ROOT_PASSWORD} -lt 8 ]; then
    log "ERROR: MySQL root password must be at least 8 characters long"
    exit 1
fi

# Configure MySQL installation
echo "mysql-server mysql-server/root_password password ${MYSQL_ROOT_PASSWORD}" | debconf-set-selections
echo "mysql-server mysql-server/root_password_again password ${MYSQL_ROOT_PASSWORD}" | debconf-set-selections
echo "mysql-server mysql-server/default-auth-override select Use Legacy Authentication Method (Retain MySQL 5.x Compatibility)" | debconf-set-selections

# Install MySQL packages
apt update || { log "ERROR: Failed to update package list"; exit 1; }
apt install -y mysql-server mysql-client libmysqlclient-dev default-libmysqlclient-dev || { log "ERROR: Failed to install MySQL packages"; exit 1; }

# Start and enable MySQL with error handling
log "Starting MySQL service..."
systemctl start mysql || { log "ERROR: Failed to start MySQL service"; exit 1; }
systemctl enable mysql || { log "ERROR: Failed to enable MySQL service"; exit 1; }

# Wait for MySQL to be ready with timeout
log "Waiting for MySQL to be ready..."
MAX_TRIES=30
COUNT=0
while ! mysqladmin ping -h localhost --silent; do
    sleep 1
    COUNT=$((COUNT + 1))
    if [ $COUNT -ge $MAX_TRIES ]; then
        log "ERROR: MySQL failed to start after ${MAX_TRIES} seconds"
        exit 1
    fi
done

# Secure MySQL
log "Securing MySQL installation..."
mysql -uroot -p${MYSQL_ROOT_PASSWORD} <<EOF
DELETE FROM mysql.user WHERE User='';
DELETE FROM mysql.user WHERE User='root' AND Host NOT IN ('localhost', '127.0.0.1', '::1');
DROP DATABASE IF EXISTS test;
DELETE FROM mysql.db WHERE Db='test' OR Db='test\\_%';
FLUSH PRIVILEGES;
EOF

# Create database and user
log "Creating MySQL database and user..."
mysql -uroot -p${MYSQL_ROOT_PASSWORD} <<EOF
CREATE DATABASE IF NOT EXISTS ${MYSQL_DATABASE} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${MYSQL_USER}'@'localhost' IDENTIFIED BY '${MYSQL_PASSWORD}';
GRANT ALL PRIVILEGES ON ${MYSQL_DATABASE}.* TO '${MYSQL_USER}'@'localhost';
FLUSH PRIVILEGES;
EOF

# Create application tables
log "Creating application tables..."
mysql -u${MYSQL_USER} -p${MYSQL_PASSWORD} ${MYSQL_DATABASE} <<EOF
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

# Verify database connection
log "Testing MySQL connection..."
if mysql -u${MYSQL_USER} -p${MYSQL_PASSWORD} -e "SELECT 'MySQL connection successful!'" ${MYSQL_DATABASE}; then
    log "MySQL connection successful!"
else
    log "ERROR: Could not connect to MySQL with user ${MYSQL_USER}"
    exit 1
fi

# -----------------------------------------------------------
# VI. APPLICATION SETUP
# -----------------------------------------------------------
log "Setting up the application environment in ${APP_DIR}..."

# Create backup directory
BACKUP_DIR="${APP_DIR}/backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "${BACKUP_DIR}"

# Clean previous deployment folders
rm -rf "${APP_DIR}/venv"
rm -rf "${WEB_ROOT}"

# Create and activate Python virtual environment
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip setuptools wheel cython
check_error "Failed to create Python virtual environment"

# -----------------------------------------------------------
# VII. BACKEND SETUP
# -----------------------------------------------------------
log "Installing backend dependencies..."
cd "${BACKEND_DIR}"

# Install backend requirements
if [ -f "requirements.txt" ]; then
    log "Installing Python requirements from requirements.txt..."
    pip install -r requirements.txt || log "Warning: Some requirements failed to install"
fi

# Install additional dependencies
log "Installing additional Python packages..."
pip install gunicorn uvicorn pymysql sqlalchemy pydantic
pip install python-jose[cryptography] passlib[bcrypt] python-multipart fastapi
check_error "Failed to install Python packages"

# -----------------------------------------------------------
# VIII. CONFIGURE APPLICATION
# -----------------------------------------------------------
log "Configuring application files..."

# Create app directory if it doesn't exist
mkdir -p "${BACKEND_DIR}/app"
touch "${BACKEND_DIR}/app/__init__.py"

# Create config.py with proper URL encoding
log "Creating backend/app/config.py file..."
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

# Create backend .env file with properly encoded MySQL password
log "Creating backend environment configuration..."
RANDOM_SECRET_KEY=$(openssl rand -hex 32)
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
check_error "Failed to create backend .env file"

# Test database connection with SQLAlchemy
log "Testing database connection..."
cat > "${BACKEND_DIR}/db_test.py" << EOF
from sqlalchemy import create_engine, text
import urllib.parse

# URL-encode the password
password = "${MYSQL_PASSWORD}"
encoded_password = urllib.parse.quote_plus(password)

# Database connection string with encoded password
database_url = f"mysql+pymysql://${MYSQL_USER}:{encoded_password}@localhost/${MYSQL_DATABASE}"
print(f"Testing connection to: {database_url}")

try:
    engine = create_engine(database_url)
    with engine.connect() as conn:
        result = conn.execute(text("SELECT 'Database connection successful!' as message"))
        print(result.fetchone()[0])
    print("Database connection test passed")
except Exception as e:
    print(f"Error connecting to database: {e}")
EOF

python3 "${BACKEND_DIR}/db_test.py" || log "Warning: Database connection test failed. Continuing anyway."

# Create a simple main.py if it doesn't exist
if [ ! -f "${BACKEND_DIR}/app/main.py" ]; then
    log "Creating a simple main.py file..."
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
log "Building frontend..."
cd "${FRONTEND_DIR}"

# Create frontend .env file
cat > "${FRONTEND_DIR}/.env" << EOF
VITE_API_URL=https://${DOMAIN}/api
VITE_WEBSOCKET_URL=wss://${DOMAIN}/ws
VITE_GOOGLE_CLIENT_ID=placeholder-value
EOF
check_error "Failed to create frontend .env file"

# Install frontend dependencies and build
log "Installing frontend dependencies..."
npm ci || npm install || npm install --force
check_error "Failed to install frontend dependencies"

log "Building frontend..."
npm run build || log "Warning: Frontend build failed, continuing anyway..."

log "Deploying frontend files to ${WEB_ROOT}..."
mkdir -p "${WEB_ROOT}"
rm -rf "${WEB_ROOT:?}"/* || true

# Check if dist directory exists before trying to copy
if [ -d "dist" ]; then
  cp -r dist/* "${WEB_ROOT}/" || log "Warning: Failed to copy some frontend files"
else
  log "Warning: dist directory not found. Frontend build may have failed."
  # Create a simple index.html as fallback
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

# Set proper permissions
chown -R www-data:www-data "${WEB_ROOT}"
chmod -R 755 "${WEB_ROOT}"

# -----------------------------------------------------------
# X. SYSTEMD SERVICE SETUP
# -----------------------------------------------------------
log "Creating systemd service for backend..."
mkdir -p /var/log/tfrtita333
chown -R $(whoami):$(whoami) /var/log/tfrtita333
check_error "Failed to create log directory"

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
check_error "Failed to create systemd service file"

systemctl daemon-reload
systemctl enable tfrtita333.service
check_error "Failed to enable tfrtita333 service"

# -----------------------------------------------------------
# XI. NGINX CONFIGURATION
# -----------------------------------------------------------
log "Configuring Nginx..."
NGINX_CONF="/etc/nginx/sites-available/${DOMAIN}"
mkdir -p /etc/nginx/sites-available
mkdir -p /etc/nginx/sites-enabled

# Ensure that nginx service is running
systemctl start nginx || true
systemctl enable nginx || true

# Check server IP and domain resolution with retries
log "Checking domain resolution..."
MAX_RETRIES=3
RETRY_COUNT=0
SERVER_IP=""
DOMAIN_IP=""

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    SERVER_IP=$(curl -s --max-time 10 https://ipinfo.io/ip) || SERVER_IP=""
    DOMAIN_IP=$(dig +short +time=5 +tries=1 ${DOMAIN} A | head -n 1) || DOMAIN_IP=""
    
    if [ -n "$SERVER_IP" ] && [ -n "$DOMAIN_IP" ]; then
        break
    fi
    
    RETRY_COUNT=$((RETRY_COUNT + 1))
    log "Attempt $RETRY_COUNT: Waiting for IP resolution..."
    sleep 5
done

log "Server IP: ${SERVER_IP:-'Not found'}, Domain IP: ${DOMAIN_IP:-'Not found'}"

if [ -z "$SERVER_IP" ]; then
    log "Warning: Could not determine server IP address"
    DOMAIN_CONFIG="localhost"
elif [ -z "$DOMAIN_IP" ]; then
    log "Warning: Could not resolve domain ${DOMAIN}"
    DOMAIN_CONFIG="localhost"
elif [ "$SERVER_IP" != "$DOMAIN_IP" ] && [ "$DOMAIN" != "localhost" ]; then
    log "Warning: Domain ${DOMAIN} does not resolve to this server's IP ($SERVER_IP)"
    log "Using localhost configuration for initial setup"
    DOMAIN_CONFIG="localhost"
else
    DOMAIN_CONFIG="${DOMAIN} www.${DOMAIN}"
fi

# Initial HTTP-only configuration for certbot
cat > ${NGINX_CONF} << EOF
server {
    listen 80;
    server_name ${DOMAIN_CONFIG};
    
    location / {
        root ${WEB_ROOT};
        try_files \$uri \$uri/ /index.html;
    }
}
EOF

log "Enabling Nginx configuration..."
ln -sf ${NGINX_CONF} /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
check_error "Failed to setup initial Nginx configuration"

# -----------------------------------------------------------
# XII. SSL CERTIFICATE SETUP
# -----------------------------------------------------------
log "Obtaining SSL certificate..."
# Only try to get SSL if domain resolves correctly
if [ "$SERVER_IP" == "$DOMAIN_IP" ] || [ "$DOMAIN" == "localhost" ]; then
    if [ "$DOMAIN" != "localhost" ]; then
        certbot --nginx -d ${DOMAIN} -d www.${DOMAIN} --non-interactive --agree-tos --email ${EMAIL} --redirect || log "Warning: SSL setup failed, proceeding with HTTP only"
    else
        log "Using localhost - skipping SSL certificate setup"
    fi
else
    log "Domain does not resolve to this server - skipping SSL setup"
fi

# Create the appropriate Nginx configuration
log "Creating final Nginx configuration..."

# Check if SSL certificates exist
if [ -d "/etc/letsencrypt/live/${DOMAIN}" ] && [ "$DOMAIN" != "localhost" ]; then
    log "SSL certificates found, creating HTTPS configuration"
    cat > ${NGINX_CONF} << EOF
map \$http_upgrade \$connection_upgrade {
    default upgrade;
    '' close;
}

server {
    listen 80;
    server_name ${DOMAIN} www.${DOMAIN};
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ${DOMAIN} www.${DOMAIN};

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_session_tickets off;

    # Modern SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # OCSP Stapling
    ssl_stapling on;
    ssl_stapling_verify on;
    resolver 8.8.8.8 8.8.4.4 valid=300s;
    resolver_timeout 5s;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' https: data: 'unsafe-inline' 'unsafe-eval';" always;

    # Root directory
    root ${WEB_ROOT};
    index index.html;

    # Frontend location
    location / {
        try_files \$uri \$uri/ /index.html;
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }

    # API location
    location /api {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_buffering off;
        proxy_read_timeout 86400;
    }

    # WebSocket location
    location /ws {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_read_timeout 86400;
    }

    # Static files caching
    location ~* \\.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot)\$ {
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }

    # Deny access to hidden files
    location ~ /\\. {
        deny all;
        access_log off;
        log_not_found off;
    }
}
EOF
else
    log "SSL certificates not found or using localhost, creating HTTP-only configuration"
    cat > ${NGINX_CONF} << EOF
map \$http_upgrade \$connection_upgrade {
    default upgrade;
    '' close;
}

server {
    listen 80;
    server_name ${DOMAIN_CONFIG};

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    # Root directory
    root ${WEB_ROOT};
    index index.html;

    # Frontend location
    location / {
        try_files \$uri \$uri/ /index.html;
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }

    # API location
    location /api {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_buffering off;
        proxy_read_timeout 86400;
    }

    # WebSocket location
    location /ws {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_read_timeout 86400;
    }

    # Static files caching
    location ~* \\.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot)\$ {
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }

    # Deny access to hidden files
    location ~ /\\. {
        deny all;
        access_log off;
        log_not_found off;
    }
}
EOF
fi
check_error "Failed to create final Nginx configuration"

nginx -t && systemctl reload nginx
check_error "Failed to reload Nginx with new configuration"

# -----------------------------------------------------------
# XIII. FINAL SETUP AND VERIFICATION
# -----------------------------------------------------------
log "Restarting all services..."
systemctl restart mysql || log "Failed to restart MySQL, attempting to continue"
systemctl start tfrtita333 || log "Failed to start tfrtita333, attempting to continue"
systemctl restart nginx || log "Failed to restart Nginx, attempting to continue"

# Wait a moment for services to start
sleep 5

# Create maintenance and backup scripts
log "Creating maintenance scripts..."

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
npm ci
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

# Verify services are running
log "Verifying services..."
services=("mysql" "nginx" "tfrtita333")
for service in "${services[@]}"; do
    if ! systemctl is-active --quiet $service; then
        log "WARNING: $service is not running!"
        systemctl status $service || true
        
        # Try to restart the service if it's not running
        log "Attempting to restart $service..."
        systemctl restart $service || true
        
        # Check again if it's running after restart
        if ! systemctl is-active --quiet $service; then
            log "Failed to start $service. Check logs for more details."
            
            # For tfrtita333 service, provide more debugging info
            if [ "$service" == "tfrtita333" ]; then
                log "Checking tfrtita333 service logs:"
                journalctl -u tfrtita333 -n 20 || true
                
                # Check if the backend files exist and are accessible
                if [ ! -f "${BACKEND_DIR}/app/main.py" ]; then
                    log "ERROR: Backend main.py file not found!"
                    log "Creating simplified main.py to ensure service starts"
                    
                    # Create a basic main.py file to ensure service can start
                    mkdir -p "${BACKEND_DIR}/app"
                    cat > "${BACKEND_DIR}/app/main.py" << MAINPY
from fastapi import FastAPI

app = FastAPI()

@app.get("/")
async def root():
    return {"message": "API is running. Setup in progress."}

@app.get("/api/health")
async def health_check():
    return {"status": "healthy"}
MAINPY
                    
                    # Try to restart the service after creating basic file
                    systemctl restart tfrtita333
                fi
            fi
        else
            log "$service successfully restarted."
        fi
    else
        log "$service is running correctly."
    fi
done
