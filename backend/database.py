from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Boolean, Text, ForeignKey, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime, timezone
import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./glbtoken.db")
# Railway/Heroku PostgreSQL may use postgres:// scheme — SQLAlchemy needs postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# Auto-create database if using PostgreSQL and it doesn't exist
if DATABASE_URL.startswith("postgresql://"):
    try:
        from urllib.parse import urlparse
        parsed = urlparse(DATABASE_URL)
        db_name = parsed.path.lstrip("/")
        # Connect to 'postgres' default database to create our database
        import psycopg2
        admin_url = DATABASE_URL.replace(f"/{db_name}", "/postgres")
        admin_conn = psycopg2.connect(admin_url, connect_timeout=5)
        admin_conn.autocommit = True
        admin_cur = admin_conn.cursor()
        admin_cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (db_name,))
        if not admin_cur.fetchone():
            # Need to quote the db name for the CREATE DATABASE statement
            import re
            safe_db = re.sub(r'[^a-zA-Z0-9_]', '', db_name)
            if not safe_db:
                raise ValueError("Invalid database name")
            admin_cur.execute(f"CREATE DATABASE \"{safe_db}\"")
            print(f"✅ Created PostgreSQL database: {db_name}")
        admin_cur.close()
        admin_conn.close()
    except Exception as e:
        print(f"⚠️ Could not auto-create database: {e}")
        # Don't block startup

is_sqlite = DATABASE_URL.startswith("sqlite")
connect_args = {"check_same_thread": False} if is_sqlite else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=True)
    country = Column(String, default="")
    google_id = Column(String, unique=True, nullable=True)
    github_id = Column(String, unique=True, nullable=True)
    token_balance = Column(Float, default=0.0)
    total_spent = Column(Float, default=0.0)
    email_verified = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    is_admin = Column(Boolean, default=False)
    email_otp = Column(String, nullable=True)          # 6-digit verification code
    email_otp_expiry = Column(DateTime, nullable=True)
    reset_token = Column(String, nullable=True)         # password reset token
    reset_token_expiry = Column(DateTime, nullable=True)
    newapi_user_id = Column(Integer, nullable=True)    # New API user ID
    newapi_token = Column(String, nullable=True)       # New API access token
    settings = Column(Text, default="{}")              # JSON settings (notifications, theme, etc.)
    
    api_keys = relationship("ApiKey", back_populates="user", cascade="all, delete-orphan")
    transactions = relationship("Transaction", back_populates="user", cascade="all, delete-orphan")

class ApiKey(Base):
    __tablename__ = "api_keys"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    key = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, default="My API Key")
    permissions = Column(String, default="read_write")
    last_used = Column(DateTime, nullable=True)
    request_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    is_active = Column(Boolean, default=True)
    
    user = relationship("User", back_populates="api_keys")

class Transaction(Base):
    __tablename__ = "transactions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    type = Column(String, nullable=False)  # "deposit" or "consumption"
    amount = Column(Float, default=0)
    currency = Column(String, default="USD")
    payment_method = Column(String, default="")
    tokens = Column(Float, default=0)
    model_used = Column(String, default="")
    payment_ref = Column(String, nullable=True)  # Paystack/Stripe/Crypto reference
    status = Column(String, default="completed")  # completed, pending, failed
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    user = relationship("User", back_populates="transactions")

class AIModel(Base):
    __tablename__ = "ai_models"
    id = Column(Integer, primary_key=True, index=True)
    model_id = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, default="")
    provider = Column(String, nullable=False)
    context_length = Column(Integer, default=128000)
    prompt_price = Column(Float, default=0.0)
    completion_price = Column(Float, default=0.0)
    is_active = Column(Boolean, default=True)
    category = Column(String, default="")
    version = Column(String, default="")
    description = Column(Text, default="")

class Preset(Base):
    __tablename__ = "presets"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    model = Column(String, nullable=False)
    system_prompt = Column(Text, nullable=True, default=None)
    temperature = Column(Float, default=0.7)
    max_tokens = Column(Integer, nullable=True, default=None)
    top_p = Column(Float, default=1.0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    user = relationship("User", backref="presets")

# Create all tables
def init_db():
    Base.metadata.create_all(bind=engine)

if __name__ == "__main__":
    init_db()
    print("Database initialized!")
