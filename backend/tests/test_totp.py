"""TOTP (RFC 6238) unit tests — pure stdlib, no DB needed."""
import time

from totp import generate_secret, totp_at, verify, otpauth_url


def test_generate_secret_format():
    s = generate_secret()
    assert len(s) == 32  # 160 bits → 32 base32 chars
    assert s.isalnum()


def test_verify_current_code():
    s = generate_secret()
    code = totp_at(s)
    assert verify(s, code)


def test_verify_rejects_wrong_code():
    s = generate_secret()
    code = totp_at(s)
    wrong = "000000" if code != "000000" else "111111"
    assert not verify(s, wrong)


def test_verify_rejects_malformed():
    s = generate_secret()
    assert not verify(s, "abc")
    assert not verify(s, "12345")       # too short
    assert not verify(s, "1234567")     # too long
    assert not verify(s, "")


def test_verify_window_tolerance():
    s = generate_secret()
    now = int(time.time())
    past = totp_at(s, now - 30)   # one step back (within window)
    future = totp_at(s, now + 30) # one step ahead
    assert verify(s, past)
    assert verify(s, future)


def test_secret_determinism_same_step():
    s = generate_secret()
    now = int(time.time())
    assert totp_at(s, now) == totp_at(s, now)


def test_otpauth_url():
    s = generate_secret()
    url = otpauth_url(s, "user@glbtoken.com")
    assert url.startswith("otpauth://totp/GlbTOKEN%3Auser%40glbtoken.com?secret=")
    assert f"secret={s}" in url
    assert "issuer=GlbTOKEN" in url
