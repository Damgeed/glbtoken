"""GlbTOKEN — Pydantic Schemas

All request/response models extracted from the main.py monolith.
Do NOT modify — these are auto-generated from the original main.py.
"""

from pydantic import BaseModel, EmailStr
from typing import Optional


# ── Auth Schemas ──

class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    country: str = ""


class LoginRequest(BaseModel):
    email: str
    password: str


class GoogleAuthRequest(BaseModel):
    token: str


class GithubAuthRequest(BaseModel):
    code: str


class Auth0LoginRequest(BaseModel):
    token: str


class SendCodeRequest(BaseModel):
    email: str


class VerifyCodeRequest(BaseModel):
    email: str
    code: str


class SendSmsCodeRequest(BaseModel):
    phone: str


class VerifySmsCodeRequest(BaseModel):
    phone: str
    code: str


class Auth0PasswordLoginRequest(BaseModel):
    email: str
    password: str


class Auth0SignupRequest(BaseModel):
    name: str
    email: str
    password: str


class SendVerificationRequest(BaseModel):
    email: str = ""


class OptionalEmailRequest(BaseModel):
    email: str = ""


class VerifyEmailRequest(BaseModel):
    otp: str


class ForgotPasswordRequest(BaseModel):
    email: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


# ── API Key Schemas ──

class ApiKeyCreate(BaseModel):
    name: str = "My API Key"
    permissions: str = "read_write"


class ApiKeyUpdate(BaseModel):
    name: Optional[str] = None
    permissions: Optional[str] = None
    is_active: Optional[bool] = None


# ── Payment Schemas ──

class TopupRequest(BaseModel):
    amount: float
    currency: str = "USD"
    payment_method: str = "stripe"


class InitiatePaymentRequest(BaseModel):
    amount: float
    currency: str = "USD"
    payment_method: str = "stripe"
    email: str = ""


# ── Proxy / Chat Schemas ──

class ProxyChatRequest(BaseModel):
    model: str
    messages: list
    max_tokens: int = 4096
    temperature: float = 0.7


class PlaygroundChatRequest(BaseModel):
    model: str
    messages: list
    temperature: float = 0.7
    max_tokens: int = 4096
    top_p: float = 1.0
    frequency_penalty: float = 0.0
    presence_penalty: float = 0.0
    stream: bool = False


class SaveConversationRequest(BaseModel):
    title: str = "New Conversation"
    messages: list = []
    model: str = ""


# ── Preset Schemas ──

class CreatePresetRequest(BaseModel):
    name: str
    model: str
    system_prompt: Optional[str] = None
    temperature: Optional[float] = 0.7
    max_tokens: Optional[int] = None
    top_p: Optional[float] = 1.0


class UpdatePresetRequest(BaseModel):
    name: Optional[str] = None
    model: Optional[str] = None
    system_prompt: Optional[str] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    top_p: Optional[float] = None


# ── Profile Schemas ──

class ProfileUpdateRequest(BaseModel):
    name: Optional[str] = None
    country: Optional[str] = None


# ── Analytics / Response Models ──

class CostByModelItem(BaseModel):
    model: str
    cost: float
    tokens: float
    calls: int
    avg_cost_per_token: float


class ErrorRateItem(BaseModel):
    date: str
    success_count: int
    error_count: int
    error_rate_pct: float


class KeyUsageItem(BaseModel):
    key_prefix: str
    model: str
    calls: int
    tokens: float
    cost: float


class ResponseTimeItem(BaseModel):
    date: str
    model: str
    avg_response_time_ms: float
    max_response_time_ms: float
    calls: int


class CostProjectionResponse(BaseModel):
    last_30_days_cost: float
    projected_monthly: float
    daily_avg: float
    days_of_data: int


# ── Referral Schemas ──

class ReferralCodeResponse(BaseModel):
    referral_code: str


class ReferralStatsResponse(BaseModel):
    referral_code: Optional[str] = None
    total_referrals: int = 0
    total_earned: float = 0.0
    recent_referrals: list = []


class ReferralRewardItem(BaseModel):
    amount: float
    created_at: str
    referred_user_name: str = ""


class ReferralRewardsResponse(BaseModel):
    rewards: list[ReferralRewardItem] = []
    total: float = 0.0


class ClaimReferralRequest(BaseModel):
    pass


# ── Organization Schemas ──

class CreateOrgRequest(BaseModel):
    name: str


class InviteMemberRequest(BaseModel):
    email: str


class JoinOrgRequest(BaseModel):
    token: str


class ChangeRoleRequest(BaseModel):
    role: str


# ── Admin Schemas ──

class AdminBalanceRequest(BaseModel):
    user_id: int
    tokens: float
    reason: str = "Manual adjustment"


class TokenRateUpdate(BaseModel):
    token_multiplier: float = 1.0


class SyncUsersRequest(BaseModel):
    dry_run: bool = False


# ── Contact Schema ──

class ContactRequest(BaseModel):
    name: str
    email: str
    message: str


# ── Settings Schemas ──

class UserSettingsUpdate(BaseModel):
    email_notifications: Optional[bool] = None
    low_balance_alert: Optional[bool] = None
    login_alerts: Optional[bool] = None
    theme: Optional[str] = None
