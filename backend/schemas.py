"""GlbTOKEN — Pydantic Schemas

Request models include explicit bounds so malformed input is rejected before it
reaches database, payment, or upstream-provider code.
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, timedelta, timezone


def _default_api_key_expiry() -> str:
    """Return a fresh 90-day default instead of creating immortal keys."""
    return (datetime.now(timezone.utc) + timedelta(days=90)).isoformat()


# ── Auth Schemas ──

class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=8, max_length=128)
    country: str = Field(default="", max_length=100)
    ref: str = Field(default="", max_length=200)  # optional referral code or link
    src: str = Field(default="", max_length=50)  # optional channel attribution


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=128)


class GoogleAuthRequest(BaseModel):
    token: str = Field(min_length=1, max_length=8192)


class GithubAuthRequest(BaseModel):
    code: str = Field(min_length=1, max_length=2048)


class Auth0LoginRequest(BaseModel):
    token: str = Field(min_length=1, max_length=8192)


class SendCodeRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)


class VerifyCodeRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    code: str = Field(min_length=4, max_length=20)
    ref: str = Field(default="", max_length=200)
    src: str = Field(default="", max_length=50)


class TwoFactorCodeRequest(BaseModel):
    code: str = Field(min_length=6, max_length=32)


class DeleteAccountRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(default="", max_length=128)
    code: str = Field(default="", max_length=32)


class TwoFactorConfirmRequest(BaseModel):
    pre_token: str = Field(min_length=1, max_length=4096)
    code: str = Field(min_length=6, max_length=32)


class SendSmsCodeRequest(BaseModel):
    phone: str = Field(min_length=7, max_length=32)


class VerifySmsCodeRequest(BaseModel):
    phone: str = Field(min_length=7, max_length=32)
    code: str = Field(min_length=4, max_length=20)


class Auth0PasswordLoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=128)


class Auth0SignupRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=8, max_length=128)


class OptionalEmailRequest(BaseModel):
    email: str = Field(default="", max_length=320)


class VerifyEmailRequest(BaseModel):
    otp: str = Field(min_length=6, max_length=6)


class ForgotPasswordRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=32, max_length=512)
    new_password: str = Field(min_length=8, max_length=128)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=64, max_length=128)


class LogoutRequest(BaseModel):
    refresh_token: str = Field(default="", max_length=128)


class PaystackVerifyRequest(BaseModel):
    reference: str = Field(min_length=1, max_length=255)


# ── API Key Schemas ──

class ApiKeyCreate(BaseModel):
    name: str = Field(default="My API Key", min_length=1, max_length=100)
    permissions: str = Field(default="read_write", max_length=20)
    expires_at: Optional[str] = Field(default_factory=_default_api_key_expiry, max_length=64)
    rate_limit_rpm: Optional[int] = Field(default=60, ge=1, le=10000)
    ip_allowlist: Optional[str] = Field(default=None, max_length=4000)
    monthly_token_limit: Optional[float] = Field(default=None, le=1_000_000_000)


class ApiKeyUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    permissions: Optional[str] = Field(default=None, max_length=20)
    is_active: Optional[bool] = None
    expires_at: Optional[str] = Field(default=None, max_length=64)
    rate_limit_rpm: Optional[int] = Field(default=None, ge=0, le=10000)
    ip_allowlist: Optional[str] = Field(default=None, max_length=4000)
    monthly_token_limit: Optional[float] = Field(default=None, le=1_000_000_000)


# ── Payment Schemas ──

class TopupRequest(BaseModel):
    amount: float = Field(gt=0, le=1_000_000)
    currency: str = Field(default="USD", min_length=3, max_length=8)
    payment_method: str = Field(default="stripe", min_length=1, max_length=32)
    payment_ref: str = Field(default="", max_length=255)


class InitiatePaymentRequest(BaseModel):
    amount: float = Field(gt=0, le=1_000_000)
    currency: str = Field(default="USD", min_length=3, max_length=8)
    payment_method: str = Field(default="stripe", min_length=1, max_length=32)
    email: str = Field(default="", max_length=320)
    payment_method_id: str = Field(default="", max_length=255)


class CardConfirmRequest(BaseModel):
    session_id: str


class CardRemoveRequest(BaseModel):
    payment_method_id: str


class CardDefaultRequest(BaseModel):
    payment_method_id: str


# ── Proxy / Chat Schemas ──

class ProxyChatRequest(BaseModel):
    model: str = Field(min_length=1, max_length=200)
    messages: list = Field(min_length=1, max_length=200)
    max_tokens: int = Field(default=4096, ge=1, le=4096)
    temperature: float = Field(default=0.7, ge=0, le=2)


class PlaygroundChatRequest(BaseModel):
    model: str = Field(min_length=1, max_length=200)
    models: list[str] = Field(default_factory=list)
    messages: list = Field(min_length=1, max_length=200)
    temperature: float = Field(default=0.7, ge=0, le=2)
    max_tokens: int = Field(default=4096, ge=1, le=4096)
    top_p: float = Field(default=1.0, ge=0, le=1)
    frequency_penalty: float = Field(default=0.0, ge=-2, le=2)
    presence_penalty: float = Field(default=0.0, ge=-2, le=2)
    stream: bool = False


class SaveConversationRequest(BaseModel):
    title: str = Field(default="New Conversation", min_length=1, max_length=200)
    messages: list = Field(default_factory=list)
    model: str = Field(default="", max_length=200)


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
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    country: Optional[str] = Field(default=None, max_length=100)
    phone: Optional[str] = Field(default=None, max_length=32)


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
    name: str = Field(min_length=1, max_length=100)
    email: str = Field(min_length=3, max_length=320)
    message: str = Field(min_length=1, max_length=10000)


# ── Settings Schemas ──

class UserSettingsUpdate(BaseModel):
    email_notifications: Optional[bool] = None
    low_balance_alert: Optional[bool] = None
    login_alerts: Optional[bool] = None
    theme: Optional[str] = Field(default=None, max_length=20)
    webhook_url: Optional[str] = Field(default=None, max_length=2048)
    webhook_secret: Optional[str] = Field(default=None, max_length=512)
    webhook_events: Optional[list] = None
    monthly_token_limit: Optional[float] = Field(default=None, le=1_000_000_000)


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
