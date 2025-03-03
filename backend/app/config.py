from pydantic_settings import BaseSettings
from pydantic import Field
import urllib.parse

class Settings(BaseSettings):
    # Database configuration
    db_host: str = Field(default="", env="DB_HOST")
    db_user: str = Field(default="", env="DB_USER")
    db_password: str = Field(default="", env="DB_PASSWORD")
    db_database: str = Field(default="", env="DB_DATABASE")
    
    # URL-encoded database URL for SQLAlchemy
    @property
    def get_database_url(self):
        encoded_password = urllib.parse.quote_plus(self.db_password)
        return f"mysql+pymysql://{self.db_user}:{encoded_password}@{self.db_host}/{self.db_database}"
    
    # Twilio credentials
    twilio_account_sid: str = Field("", env="TWILIO_ACCOUNT_SID")
    twilio_auth_token: str = Field("", env="TWILIO_AUTH_TOKEN")
    
    # Supabase credentials
    supabase_url: str = Field("", env="SUPABASE_URL")
    supabase_key: str = Field("", env="SUPABASE_KEY")
    
    # Google OAuth credentials
    google_client_id: str = Field("", env="GOOGLE_CLIENT_ID")
    google_client_secret: str = Field("", env="GOOGLE_CLIENT_SECRET")
    
    # Ultravox API
    ultravox_api_key: str = Field("", env="ULTRAVOX_API_KEY")
    
    # JWT configuration
    jwt_secret: str = Field(default="", env="JWT_SECRET")
    jwt_algorithm: str = Field(default="HS256", env="JWT_ALGORITHM")
    access_token_expire_minutes: int = Field(default=30, env="ACCESS_TOKEN_EXPIRE_MINUTES")
    
    # Application settings
    cors_origins: str = Field(default="", env="CORS_ORIGINS")
    server_domain: str = Field(default="", env="SERVER_DOMAIN")
    debug: bool = Field(default=False, env="DEBUG")
    
    # Database URL (for compatibility)
    database_url: str = Field(default="", env="DATABASE_URL")
    
    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "allow"

settings = Settings()
