import os

# Define the directory structure
directories = [
    "backend",
    "backend/app",
    "backend/app/routes",
    "backend/app/services",
    "backend/app/models",
    "backend/app/utils",
    "frontend",
    "frontend/public",
    "frontend/src",
    "frontend/src/components",
    "frontend/src/pages",
    "frontend/src/services"
]

# Define files to create with placeholder content
files = {
    "backend/app/main.py": "# FastAPI entry point (call handling, API routes)\n",
    "backend/app/config.py": "# Configuration (environment variables, secrets)\n",
    "backend/app/prompts.py": "# System prompt templates for AI responses\n",
    "backend/app/routes/auth.py": "# OAuth integrations endpoints (Supabase, Google, Airtable, etc.)\n",
    "backend/app/routes/calls.py": "# Inbound/outbound calls and history logs endpoints\n",
    "backend/app/routes/schedule.py": "# Scheduling meetings (Google Calendar integration) endpoints\n",
    "backend/app/routes/vectorization.py": "# Manage the knowledge base (vectorization, document selection) endpoints\n",
    "backend/app/services/twilio_service.py": "# Integration with Twilio for calls\n",
    "backend/app/services/ultravox_service.py": "# Integration with Ultravox for voice processing\n",
    "backend/app/services/supabase_service.py": "# Supabase API wrapper (database, auth)\n",
    "backend/app/services/google_service.py": "# Google APIs integration (Calendar, Gmail, Drive)\n",
    "backend/app/services/airtable_service.py": "# Airtable integration\n",
    "backend/app/models/__init__.py": "# Pydantic models for request/response validation\n",
    "backend/app/utils/__init__.py": "# Utility functions (logging, error handling, etc.)\n",
    "backend/requirements.txt": "# Python dependencies\n",
    "backend/.env": "# Environment configuration (keys, secrets, endpoints)\n",
    "frontend/src/App.js": "// Main React component\n",
    "frontend/src/index.js": "// React entry point\n",
    "frontend/package.json": '{\n  "name": "frontend",\n  "version": "1.0.0"\n}\n',
    "frontend/.env": "# Frontend environment variables (API endpoints, domain settings, etc.)\n",
    "README.md": "# Project documentation and deployment instructions\n"
}

# Create directories
for directory in directories:
    os.makedirs(directory, exist_ok=True)
    print(f"Created directory: {directory}")

# Create files with placeholder content
for file_path, content in files.items():
    # Ensure parent directory exists
    parent_dir = os.path.dirname(file_path)
    if parent_dir and not os.path.exists(parent_dir):
        os.makedirs(parent_dir, exist_ok=True)
    with open(file_path, "w", encoding="utf-8") as file:
        file.write(content)
    print(f"Created file: {file_path}")

print("Project structure created successfully!")
