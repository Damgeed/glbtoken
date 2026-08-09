"""PROOF-OF-BYPASS — watchdog Round 7 attack re-simulated.

The claim to verify: attacker direct-connects to the Railway origin with a
FORGED cf-ray + FORGED CF-Connecting-IP. Does the guard let it through?
Does real_client_ip then trust the forged CF-CIP?

If YES to both, the Round 7 'fix' did NOT close the bypass — cf-ray is
client-controlled when the origin is hit directly, exactly like CF-CIP was.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

os.environ.setdefault("JWT_SECRET", "pytest-secret-key")
os.environ.setdefault("GLBTOKEN_SECRET", "pytest-secret-key")
os.environ.setdefault("DATABASE_URL", "sqlite:///./test_glbtoken.db")

from fastapi.testclient import TestClient
from database import Base, engine, SessionLocal, get_db
import main as app_module
from common import limiter, real_client_ip


def make_client(db, peer="100.64.0.99"):
    def override_get_db():
        try:
            yield db
        finally:
            pass
    app_module.app.dependency_overrides[get_db] = override_get_db
    c = TestClient(app_module.app, raise_server_exceptions=True)
    c.headers["x-forwarded-for"] = peer
    return c


def main():
    # Fresh DB
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    limiter.enabled = True  # production enforcement
    c = make_client(db)

    print("=" * 70)
    print("ATTACK 1: no headers (old watchdog vector) — expect 403 guard block")
    r = c.post("/api/auth/login", json={"email": "a@b.com", "password": "x"})
    print(f"  -> {r.status_code} {r.json().get('detail', '')[:60]}")

    print("=" * 70)
    print("ATTACK 2: FORGED cf-ray + FORGED CF-Connecting-IP (Round 7 bypass?)")
    r = c.post(
        "/api/auth/login",
        json={"email": "a@b.com", "password": "x"},
        headers={
            "cf-ray": "deadbeefdeadbeef-SIN",          # attacker-chosen value
            "CF-Connecting-IP": "93.3.3.3",            # attacker-chosen value
        },
    )
    status = r.status_code
    guard_verdict = (
        "⚠️ guard passed (expected: cf-ray is defense-in-depth only, forgeable)"
        if status == 401
        else "❌ unexpected — guard blocked?"
    )
    print(f"  -> {status} {r.json().get('detail', '')[:60]}")
    print(f"  {guard_verdict}")
    print("  The REAL check is below: is the forged CF-CIP trusted for rate limiting?")

    print("=" * 70)
    print("real_client_ip with the SAME forged headers:")
    print("  (using Starlette Headers — case-insensitive, exactly like production)")
    from starlette.datastructures import Headers
    class FakeReq:
        client = type("C", (), {"host": "100.64.0.99"})()
        headers = Headers({
            "cf-ray": "deadbeefdeadbeef-SIN",
            "CF-Connecting-IP": "93.3.3.3",
            "x-forwarded-for": "100.64.0.99",
        })
    ip = real_client_ip(FakeReq())
    print(f"  -> resolved client IP = {ip}")
    if ip == "93.3.3.3":
        print("  ❌ Forged CF-CIP TRUSTED — rate limiter keys on attacker-chosen IP.")
    else:
        print("  ✅ Forged CF-CIP ignored")

    limiter.enabled = False
    app_module.app.dependency_overrides.clear()
    db.close()


if __name__ == "__main__":
    main()
