# Voice Call AI Application

## Setup Instructions

1. **Backend Setup**
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

2. **Frontend Setup**
```bash
cd frontend
npm install
npm run dev
```

## Environment Variables
Create `.env` files in both backend and frontend with:
```
# Backend .env
TWILIO_ACCOUNT_SID=your_twilio_sid
SUPABASE_URL=your_supabase_url
ULTRAVOX_API_KEY=your_ultravox_key
```

## Deployment
- Use Nginx reverse proxy for HTTPS
- Configure cloud server (e.g., DigitalOcean)
- Set DNS records for your domain
