# Instructions for Deploying the Application to Your Server

To deploy this application to your server and make it fully functional, you need to perform the following steps:

1.  **Set up a suitable environment:**
    *   Choose a cloud provider (e.g., AWS, Google Cloud, Azure) or a local server.
    *   Install Node.js (version 14 or later) and Python 3.7 or later.
    *   Install `npm` and `pip`.
2.  **Install backend dependencies:**
    *   Navigate to the `backend` directory.
    *   Create a virtual environment: `python3 -m venv venv`
    *   Activate the virtual environment: `source venv/bin/activate`
    *   Install the required Python packages: `pip install -r requirements.txt`
3.  **Configure environment variables:**
    *   Create a `.env` file in the `backend` directory.
    *   Set the following environment variables:
        *   `TWILIO_ACCOUNT_SID`: Your Twilio Account SID
        *   `TWILIO_AUTH_TOKEN`: Your Twilio Auth Token
        *   `SUPABASE_URL`: Your Supabase URL
        *   `SUPABASE_KEY`: Your Supabase API Key
        *   `GOOGLE_CLIENT_ID`: Your Google Client ID
        *   `GOOGLE_CLIENT_SECRET`: Your Google Client Secret
        *   `ULTRAVOX_API_KEY`: Your Ultravox API Key
        *   `DATABASE_URL`: The URL for your LibSQL database (e.g., `file:./data.db`)
    *   Ensure that the database is properly configured and accessible.
4.  **Run the backend:**
    *   Activate the virtual environment: `source venv/bin/activate`
    *   Start the FastAPI server: `uvicorn backend/app/main:app --reload`
5.  **Install frontend dependencies:**
    *   Navigate to the `frontend` directory.
    *   Install the required Node.js packages: `npm install`
6.  **Configure frontend:**
    *   Create a `.env` file in the `frontend` directory.
    *   Set the following environment variables:
        *   `VITE_GOOGLE_CLIENT_ID`: Your Google Client ID
        *   `VITE_GOOGLE_CLIENT_SECRET`: Your Google Client Secret
    *   Update the `vite.config.js` file to point to your backend server.
7.  **Run the frontend:**
    *   Start the Vite development server: `npm run dev`
8.  **Configure Twilio:**
    *   Purchase a phone number from Twilio.
    *   Configure the Twilio webhook to point to your backend server's `/incoming-call` endpoint.
9.  **Configure Google OAuth:**
    *   Create a Google OAuth application and obtain the necessary credentials.
    *   Configure the redirect URI to point to your frontend server's `/oauth/callback` endpoint.
10. **Configure Ultravox:**
    *   Obtain an Ultravox API key.
    *   Configure the Ultravox client SDK in your frontend application.
11. **Test the application:**
    *   Test all the functionalities to ensure they are working as expected.
    *   Pay special attention to the Ultravox integration, Twilio integration, and Google API integration.

**Please note that this is a complex process and may require significant technical expertise. If you encounter any issues, please consult the documentation for the respective services.**
