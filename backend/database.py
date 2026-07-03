from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Boolean, Text, ForeignKey, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime, timezone

DATABASE_URL = "sqlite:///./glbtoken.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
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

# Create all tables
def init_db():
    Base.metadata.create_all(bind=engine)

if __name__ == "__main__":
    init_db()
    print("Database initialized!")
