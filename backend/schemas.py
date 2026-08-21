"""GlbTOKEN — Pydantic Schemas

All request/response models extracted from the main.py monolith.
Do NOT modify — these are auto-generated from the original main.py.
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, timedelta, timezone


def _default_api_key_expiry() -> str:
    """Return a fresh 90-day default instead of creating immortal keys."""
    return (datetime.now(timezone.utc) + timedelta(days=90)).isoformat()


# ── Auth Schemas ──

class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    country: str = ""
    ref: str = ""  # optional referral code or link
    src: str = ""  # optional channel attribution (twitter/whatsapp/telegram/email/facebook/linkedin)


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
    ref: str = ""  # optional referral code or link
    src: str = ""  # optional channel attribution (twitter/whatsapp/telegram/email/facebook/linkedin)


class TwoFactorCodeRequest(BaseModel):
    code: str


class DeleteAccountRequest(BaseModel):
    email: str           # must match the logged-in user's email
    password: str = ""   # current password (required if the account has one)
    code: str = ""       # TOTP 6-digit OR one-time recovery code (required if 2FA on)


class TwoFactorConfirmRequest(BaseModel):
    pre_token: str
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


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str = ""


class PaystackVerifyRequest(BaseModel):
    reference: str


# ── API Key Schemas ──

class ApiKeyCreate(BaseModel):
    name: str = "My API Key"
    permissions: str = "read_write"
    expires_at: Optional[str] = Field(default_factory=_default_api_key_expiry)  # pass "" explicitly for never
    rate_limit_rpm: Optional[int] = 60  # requests per minute cap
    ip_allowlist: Optional[str] = None  # comma-separated IPs/CIDRs
    monthly_token_limit: Optional[float] = None  # calendar-month token cap; null/0 disables


class ApiKeyUpdate(BaseModel):
    name: Optional[str] = None
    permissions: Optional[str] = None
    is_active: Optional[bool] = None
    expires_at: Optional[str] = None
    rate_limit_rpm: Optional[int] = None
    ip_allowlist: Optional[str] = None
    monthly_token_limit: Optional[float] = None


# ── Payment Schemas ──

class TopupRequest(BaseModel):
    amount: float
    currency: str = "USD"
    payment_method: str = "stripe"
    payment_ref: str = ""  # required: pending deposit tx reference from a payment provider


class InitiatePaymentRequest(BaseModel):
    amount: float
    currency: str = "USD"
    payment_method: str = "stripe"
    email: str = ""
    payment_method_id: str = ""  # saved card PM id for one-click recharge


class CardConfirmRequest(BaseModel):
    session_id: str


class CardRemoveRequest(BaseModel):
    payment_method_id: str


class CardDefaultRequest(BaseModel):
    payment_method_id: str


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
    phone: Optional[str] = None


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


# ── Organization Schemas ──

class CreateOrgRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class UpdateOrgRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class InviteMemberRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    role: str = "member"  # admin | member (owner reserved for creator)
    name: str = ""  # optional recipient name (CSV batch invites) — used in the email greeting
    resend: bool = False  # if an active invite already exists for this email, resend it instead of creating a duplicate


class JoinOrgRequest(BaseModel):
    token: str


class ChangeRoleRequest(BaseModel):
    role: str


class TransferOwnerRequest(BaseModel):
    user_id: int


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
    webhook_url: Optional[str] = None
    webhook_secret: Optional[str] = None
    webhook_events: Optional[list] = None
    monthly_token_limit: Optional[float] = None


# ── Announcement Schemas ──

class AnnouncementCreate(BaseModel):
    title: str = ""
    message: str = Field(min_length=1)
    priority: str = "info"  # info | warning | success
    expires_at: Optional[str] = None  # ISO datetime string or null


class AnnouncementUpdate(BaseModel):
    is_active: Optional[bool] = None
    title: Optional[str] = None
    message: Optional[str] = None
    priority: Optional[str] = None
    expires_at: Optional[str] = None
