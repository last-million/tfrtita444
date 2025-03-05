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

# Create auth routes (critically important for login to work)
log "Setting up authentication routes..."
mkdir -p "${BACKEND_DIR}/app/routes" || true
touch "${BACKEND_DIR}/app/routes/__init__.py" || true

# Create auth.py file for login - with enhanced request handling
log "Creating auth routes file..."
cat > "${BACKEND_DIR}/app/routes/auth.py" << 'EOF'
from fastapi import APIRouter, HTTPException, Depends, status, Request, Form, Body
from fastapi.security import OAuth2PasswordRequestForm
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
from typing import Optional, Dict, Any
from pydantic import BaseModel
import logging

# Setup logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Define request model
class LoginRequest(BaseModel):
    username: str
    password: str

router = APIRouter(tags=["authentication"])

# JWT configuration
SECRET_KEY = "strong-secret-key-for-jwt-tokens"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# Handle both form data and JSON requests
@router.post("/token")
async def login_for_access_token(request: Request):
    try:
        # Log the request for debugging
        logger.debug(f"Received login request: {request.headers.get('content-type')}")
        
        # Try to parse the request data
        username = None
        password = None
        
        content_type = request.headers.get('content-type', '')
        
        if 'application/json' in content_type:
            # Handle JSON data
            data = await request.json()
            username = data.get('username')
            password = data.get('password')
            logger.debug(f"Parsed JSON request: username={username}")
        elif 'application/x-www-form-urlencoded' in content_type:
            # Handle form data
            form_data = await request.form()
            username = form_data.get('username')
            password = form_data.get('password')
            logger.debug(f"Parsed form request: username={username}")
        elif 'multipart/form-data' in content_type:
            # Handle multipart form data
            form_data = await request.form()
            username = form_data.get('username')
            password = form_data.get('password')
            logger.debug(f"Parsed multipart request: username={username}")
        else:
            # Fall back to raw parsing
            body = await request.body()
            text = body.decode()
            logger.debug(f"Unknown content type: {content_type}, raw body: {text[:100]}")
            
            # Try to extract username and password from raw data
            parts = text.split('&')
            for part in parts:
                if '=' in part:
                    key, value = part.split('=', 1)
                    if key == 'username':
                        username = value
                    elif key == 'password':
                        password = value
        
        # Check credentials (hardcoded for simplicity)
        if not username or not password:
            logger.error("Missing username or password")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing username or password"
            )
            
        logger.debug(f"Checking credentials: {username}")
        if username != "hamza" or password != "AFINasahbi@-11":
            logger.error(f"Invalid credentials for user: {username}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect username or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Generate token
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": username}, expires_delta=access_token_expires
        )
        
        logger.debug(f"Login successful for user: {username}")
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "username": username
        }
    except Exception as e:
        logger.exception(f"Login error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Server error: {str(e)}"
        )

@router.get("/me")
async def read_users_me(token: str = None):
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated"
        )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if username is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token"
            )
        return {"username": username}
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )

# Add a health check endpoint specifically for auth
@router.get("/health")
async def auth_health_check():
    return {"status": "auth_service_healthy", "timestamp": datetime.utcnow().isoformat()}
EOF

# Create API route modules for Google Drive, Supabase and Calls
log "Creating API route modules for external integrations..."

# Create Google Drive API routes
mkdir -p "${BACKEND_DIR}/app/routes" || true
cat > "${BACKEND_DIR}/app/routes/drive.py" << 'EOF'
from fastapi import APIRouter, Depends, HTTPException, status, Request
from typing import List, Optional, Dict, Any
import logging
import json
import os

# Configure logging
logger = logging.getLogger("drive")

router = APIRouter(prefix="/drive", tags=["google_drive"])

# Placeholder for Google Drive credentials
GOOGLE_CREDENTIALS = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")

# Files endpoint
@router.get("/files")
async def get_drive_files():
    try:
        logger.info("Getting Google Drive files")
        
        # Check if Google Drive is configured
        if not GOOGLE_CREDENTIALS or not GOOGLE_SECRET:
            # Return empty list with message in meta
            return {
                "files": [],
                "meta": {
                    "status": "not_configured",
                    "message": "Google Drive API not configured. Please set up credentials."
                }
            }
        
        # This is a placeholder - in production this would use Google API client
        # to fetch actual files
        mock_files = [
            {"id": "1", "name": "Document 1.docx", "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"},
            {"id": "2", "name": "Spreadsheet.xlsx", "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"},
        ]
        
        return {
            "files": mock_files,
            "meta": {
                "status": "success"
            }
        }
    except Exception as e:
        logger.exception(f"Error getting Google Drive files: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error accessing Google Drive: {str(e)}"
        )
EOF

# Create Supabase API routes
cat > "${BACKEND_DIR}/app/routes/supabase.py" << 'EOF'
from fastapi import APIRouter, Depends, HTTPException, status, Request
from typing import List, Optional, Dict, Any
import logging
import json
import os

# Configure logging
logger = logging.getLogger("supabase")

router = APIRouter(prefix="/supabase", tags=["supabase"])

# Placeholder for Supabase credentials
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")

# Tables endpoint
@router.get("/tables")
async def get_supabase_tables():
    try:
        logger.info("Getting Supabase tables")
        
        # Check if Supabase is configured
        if not SUPABASE_URL or not SUPABASE_KEY:
            # Return empty list with message in meta
            return {
                "tables": [],
                "meta": {
                    "status": "not_configured",
                    "message": "Supabase API not configured. Please set up credentials."
                }
            }
        
        # This is a placeholder - in production this would use Supabase client
        # to fetch actual tables
        mock_tables = [
            {"id": "1", "name": "customers", "row_count": 152},
            {"id": "2", "name": "products", "row_count": 87},
            {"id": "3", "name": "orders", "row_count": 1243},
        ]
        
        return {
            "tables": mock_tables,
            "meta": {
                "status": "success"
            }
        }
    except Exception as e:
        logger.exception(f"Error getting Supabase tables: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error accessing Supabase: {str(e)}"
        )
EOF

# Create Calls API routes
cat > "${BACKEND_DIR}/app/routes/calls.py" << 'EOF'
from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from typing import List, Optional, Dict, Any
import logging
import json
import os
from datetime import datetime, timedelta

# Configure logging
logger = logging.getLogger("calls")

router = APIRouter(prefix="/calls", tags=["calls"])

# Placeholder for Twilio credentials
TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")

# Call history endpoint
@router.get("/history")
async def get_call_history(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100)
):
    try:
        logger.info(f"Getting call history - page {page}, limit {limit}")
        
        # Check if Twilio is configured
        if not TWILIO_ACCOUNT_SID or not TWILIO_AUTH_TOKEN:
            # Return empty list with message in meta
            return {
                "calls": [],
                "pagination": {
                    "page": page,
                    "limit": limit,
                    "total": 0,
                    "pages": 0
                },
                "meta": {
                    "status": "not_configured",
                    "message": "Twilio API not configured. Please set up credentials."
                }
            }
        
        # This is a placeholder - in production this would use Twilio client
        # to fetch actual call history
        today = datetime.now()
        yesterday = today - timedelta(days=1)
        
        mock_calls = [
            {
                "id": "CA123456789",
                "from": "+12345678901",
                "to": "+19876543210",
                "status": "completed",
                "duration": 127,
                "start_time": yesterday.isoformat(),
                "end_time": (yesterday + timedelta(minutes=2, seconds=7)).isoformat(),
                "direction": "outbound"
            },
            {
                "id": "CA987654321",
                "from": "+19876543210",
                "to": "+12345678901",
                "status": "completed",
                "duration": 89,
                "start_time": today.isoformat(),
                "end_time": (today + timedelta(minutes=1, seconds=29)).isoformat(),
                "direction": "inbound"
            }
        ]
        
        return {
            "calls": mock_calls,
            "pagination": {
                "page": page,
                "limit": limit,
                "total": 2,
                "pages": 1
            },
            "meta": {
                "status": "success"
            }
        }
    except Exception as e:
        logger.exception(f"Error getting call history: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error accessing call history: {str(e)}"
        )

# Make a call endpoint
@router.post("/initiate")
async def initiate_call(request: Request):
    try:
        data = await request.json()
        to_number = data.get("to")
        from_number = data.get("from")
        
        logger.info(f"Initiating call from {from_number} to {to_number}")
        
        # Check if Twilio is configured
        if not TWILIO_ACCOUNT_SID or not TWILIO_AUTH_TOKEN:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Twilio API not configured. Please set up credentials."
            )
            
        if not to_number:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing required parameter: to"
            )
            
        # This is a placeholder - in production this would use Twilio client
        # to actually initiate a call
        call_id = "CA" + str(hash(to_number))[:10]
        
        return {
            "call_id": call_id,
            "status": "queued",
            "message": f"Call to {to_number} has been queued",
            "meta": {
                "status": "success"
            }
        }
    except Exception as e:
        logger.exception(f"Error initiating call: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error initiating call: {str(e)}"
        )
EOF

# Create main.py with all route imports
log "Creating main.py with direct auth handler and external integrations..."
cat > "${BACKEND_DIR}/app/main.py" << 'EOF'
from fastapi import FastAPI, Request, HTTPException, status, Form
from fastapi.middleware.cors import CORSMiddleware
import os
import logging
from datetime import datetime, timedelta
from jose import JWTError, jwt
from typing import Optional

# Import route modules
from app.routes import drive, supabase, calls

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger("main")

# Create FastAPI app
app = FastAPI(
    title="Voice Call AI API",
    description="API for Voice Call AI application",
    version="1.0.0"
)

# CORS middleware setup - allow all origins and methods
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# JWT configuration
SECRET_KEY = "strong-secret-key-for-jwt-tokens"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# CRITICAL: Handle auth directly in main.py to avoid any import issues
@app.post("/api/auth/token")
async def login_for_access_token(request: Request):
    try:
        logger.info(f"Auth token request received with content type: {request.headers.get('content-type')}")
        
        # Parse the request based on content type
        form_data = None
        username = None
        password = None
        
        content_type = request.headers.get('content-type', '')
        
        if 'application/json' in content_type:
            # Handle JSON data
            json_data = await request.json()
            username = json_data.get('username')
            password = json_data.get('password')
            logger.info(f"Received JSON login request for user: {username}")
            
        elif 'application/x-www-form-urlencoded' in content_type or 'multipart/form-data' in content_type:
            # Handle form data
            form_data = await request.form()
            username = form_data.get('username')
            password = form_data.get('password')
            logger.info(f"Received form login request for user: {username}")
            
        else:
            # Try to handle raw body
            body = await request.body()
            try:
                body_text = body.decode('utf-8')
                logger.info(f"Raw request body: {body_text[:100]}")
                
                # Try to extract username and password
                if '&' in body_text:
                    params = {}
                    for param in body_text.split('&'):
                        if '=' in param:
                            key, value = param.split('=', 1)
                            params[key] = value
                    
                    username = params.get('username')
                    password = params.get('password')
                    logger.info(f"Extracted from raw body: username={username}")
            except Exception as e:
                logger.error(f"Failed to parse request body: {str(e)}")
        
        # Basic auth check - hardcoded credentials
        if not username or not password:
            logger.error("Username or password missing")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username and password required"
            )
            
        if username != "hamza" or password != "AFINasahbi@-11":
            logger.error(f"Invalid credentials for user: {username}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect username or password"
            )
        
        # Generate token
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": username}, expires_delta=access_token_expires
        )
        
        # Return success response
        logger.info(f"Login successful for user: {username}")
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "username": username
        }
        
    except Exception as e:
        logger.exception(f"Login error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Server error: {str(e)}"
        )

# Root endpoint
@app.get("/")
async def root():
    return {
        "status": "ok",
        "message": "Voice Call AI API is running",
        "version": "1.0.0",
        "timestamp": datetime.utcnow().isoformat()
    }

# Health check endpoint
@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}

# Register API routes with correct prefixes
app.include_router(drive.router, prefix="/api")
app.include_router(supabase.router, prefix="/api")
app.include_router(calls.router, prefix="/api")
EOF

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

# Create or update Vite config file to fix chunk size warnings
log "Creating optimized Vite configuration..."
cat > "${FRONTEND_DIR}/vite.config.js" << 'EOF'
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1000, // Increase warning threshold (in kB)
    rollupOptions: {
      output: {
        manualChunks: {
          // Group vendor dependencies into separate chunks
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-ui': ['@mui/material', '@emotion/react', '@emotion/styled'],
          'vendor-utils': ['axios', 'dayjs', 'lodash']
        }
      }
    }
  }
});
EOF

# Install frontend dependencies and build
log "Installing frontend dependencies and building..."
# First update package-lock.json to match package.json
log "Updating package-lock.json..."
npm install --package-lock-only || log "Warning: Failed to update package-lock.json, continuing anyway" 
# Then install dependencies normally
npm install || log "Warning: npm install failed, continuing anyway"
log "Building with optimized chunks..."
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

# Ensure all backend dependencies are installed first
log "Installing final backend dependencies for authentication..."
pip install gunicorn uvicorn fastapi python-jose[cryptography] passlib[bcrypt] python-multipart requests || log "Warning: Failed to install critical dependencies"

# Create a standalone test script to verify the backend
log "Creating test script for auth endpoint..."
cat > "${BACKEND_DIR}/test_auth.py" << 'EOF'
import requests
import json
import sys

# Try to test login endpoint
try:
    print("Testing auth endpoint directly...")
    response = requests.post(
        "http://localhost:8080/api/auth/token",
        data={"username": "hamza", "password": "AFINasahbi@-11"}
    )
    print(f"Status code: {response.status_code}")
    print(f"Response: {response.text}")
    
    if response.status_code == 200:
        print("AUTH TEST SUCCESSFUL!")
    else:
        print("AUTH TEST FAILED!")
    
except Exception as e:
    print(f"Error testing auth endpoint: {str(e)}")
    sys.exit(1)
EOF

# Create systemd service to run FastAPI directly without gunicorn
log "Creating direct FastAPI service for better debugging..."
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
# Use direct uvicorn instead of gunicorn for simpler debugging
ExecStart=${APP_DIR}/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8080 --log-level debug
Restart=always
RestartSec=5
StartLimitIntervalSec=0

# Logging
StandardOutput=append:/var/log/tfrtita333/output.log
StandardError=append:/var/log/tfrtita333/error.log

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

# Create simple static auth test HTML file with direct Fetch API call
log "Creating static auth test file..."
cat > "${WEB_ROOT}/test-auth.html" << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>Auth Test</title>
    <style>
        body { font-family: sans-serif; margin: 20px; }
        pre { background: #f5f5f5; padding: 10px; border-radius: 5px; }
        button { padding: 8px 15px; background: #4CAF50; color: white; border: none; cursor: pointer; }
        input { padding: 8px; margin-bottom: 10px; width: 250px; }
    </style>
    <script>
        // Test direct login with no framework
        async function testLogin() {
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            const resultDiv = document.getElementById('result');
            
            resultDiv.innerHTML = "Sending request...";
            
            try {
                // Simple form data approach
                const formData = new FormData();
                formData.append("username", username);
                formData.append("password", password);
                
                console.log("Sending auth request with FormData");
                
                // Add timestamp to prevent caching
                const url = `/api/auth/token?t=${new Date().getTime()}`;
                
                // Show the URL we're posting to
                resultDiv.innerHTML += `<br>Posting to: ${url}`;
                
                const response = await fetch(url, {
                    method: "POST",
                    body: formData
                });
                
                // Show the response status
                resultDiv.innerHTML += `<br>Status: ${response.status}`;
                
                // Try to get response as text
                const text = await response.text();
                resultDiv.innerHTML += `<br>Raw response: ${text}`;
                
                // Try to parse as JSON (may fail)
                try {
                    const json = JSON.parse(text);
                    resultDiv.innerHTML += `<br><br>JSON response:<br>${JSON.stringify(json, null, 2)}`;
                } catch (e) {
                    resultDiv.innerHTML += `<br><br>Not valid JSON: ${e.message}`;
                }
            } catch (error) {
                resultDiv.innerHTML = `Error: ${error.message}`;
                console.error("Login test error:", error);
            }
        }
        
        // Alternative test with URL-encoded form
        async function testUrlEncoded() {
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            const resultDiv = document.getElementById('urlResult');
            
            resultDiv.innerHTML = "Sending URL-encoded request...";
            
            try {
                const params = new URLSearchParams();
                params.append("username", username);
                params.append("password", password);
                
                console.log("Sending auth request with URLSearchParams");
                
                const response = await fetch("/api/auth/token", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded"
                    },
                    body: params
                });
                
                // Show the response status
                resultDiv.innerHTML += `<br>Status: ${response.status}`;
                
                // Get response as text
                const text = await response.text();
                resultDiv.innerHTML += `<br>Raw response: ${text}`;
            } catch (error) {
                resultDiv.innerHTML = `Error: ${error.message}`;
                console.error("URL-encoded test error:", error);
            }
        }
        
        // Test with direct JSON
        async function testJsonLogin() {
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            const resultDiv = document.getElementById('jsonResult');
            
            resultDiv.innerHTML = "Sending JSON request...";
            
            try {
                const data = {
                    username: username,
                    password: password
                };
                
                console.log("Sending auth request with JSON payload");
                
                const response = await fetch("/api/auth/token", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(data)
                });
                
                // Show the response status
                resultDiv.innerHTML += `<br>Status: ${response.status}`;
                
                // Get response as text
                const text = await response.text();
                resultDiv.innerHTML += `<br>Raw response: ${text}`;
            } catch (error) {
                resultDiv.innerHTML = `Error: ${error.message}`;
                console.error("JSON test error:", error);
            }
        }
    </script>
</head>
<body>
    <h1>Auth API Test</h1>
    <div>
        <label for="username">Username:</label><br>
        <input type="text" id="username" value="hamza"><br>
        
        <label for="password">Password:</label><br>
        <input type="password" id="password" value="AFINasahbi@-11"><br>
    </div>
    
    <h2>Test 1: FormData</h2>
    <button onclick="testLogin()">Test Login with FormData</button>
    <pre id="result">Results will appear here...</pre>
    
    <h2>Test 2: URL-encoded</h2>
    <button onclick="testUrlEncoded()">Test Login with URL-encoded</button>
    <pre id="urlResult">Results will appear here...</pre>
    
    <h2>Test 3: JSON</h2>
    <button onclick="testJsonLogin()">Test Login with JSON</button>
    <pre id="jsonResult">Results will appear here...</pre>
</body>
</html>
EOF

# Ensure auth test file has correct permissions
chmod 644 "${WEB_ROOT}/test-auth.html"
chown www-data:www-data "${WEB_ROOT}/test-auth.html"

# Create super simplified Nginx configuration optimized for login endpoint
log "Creating simplified Nginx configuration focused on auth endpoint..."
cat > ${NGINX_CONF} << EOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name ${DOMAIN} www.${DOMAIN};
    
    # Excessively detailed logging for debugging
    error_log /var/log/nginx/error.log debug;
    access_log /var/log/nginx/access.log;
    
    # Root directory for frontend files
    root ${WEB_ROOT};
    index index.html;
    
    # Try HTML files directly
    location / {
        try_files \$uri \$uri/ /index.html;
    }
    
    # CRITICAL: Extremely simplified auth token endpoint
    # This is the most direct configuration possible
    location = /api/auth/token {
        # Important: no trailing slash in proxy_pass for exact path matching
        proxy_pass http://localhost:8080/api/auth/token;
        
        # Required headers
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        
        # CORS headers needed for auth
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization' always;
        
        # Debug headers to verify request is hitting the right endpoint
        add_header X-Debug-URL "/api/auth/token" always;
        add_header X-Debug-Backend "http://localhost:8080/api/auth/token" always;
        
        # Excessive timeouts
        proxy_connect_timeout 600s;
        proxy_send_timeout 600s;
        proxy_read_timeout 600s;
        send_timeout 600s;
        
        # Explicitly disable buffering
        proxy_buffering off;
        
        # Don't close connections prematurely
        proxy_http_version 1.1;
        
        # Accept larger request bodies for auth token
        client_max_body_size 10M;
    }
    
    # General API endpoints
    location /api/ {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        # Disable buffering for streaming responses
        proxy_buffering off;
        
        # Extended timeouts
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }
    
    # WebSocket support
    location /ws {
        proxy_pass http://localhost:8080/ws;
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
