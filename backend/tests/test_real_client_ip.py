"""Unit tests for common.real_client_ip — Railway CGNAT proxy scenarios.

Empirical: Railway's internal proxy presents a VARYING 100.64.0.0/10 (CGNAT)
peer per request; the real client IP must come from CF-Connecting-IP or the
FIRST public (is_global) X-Forwarded-For entry (the edge-appended value).

NOTE: 100.64.0.0/10 is NOT flagged is_private on Python 3.11 (is_global=False
is the reliable discriminator), and TEST-NET documentation ranges
(203.0.113.x / 198.51.100.x) are also not global — real public IPs are used
in the expectations below (8.8.8.8, 1.1.1.1, 172.70.x = Cloudflare edge).
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from common import real_client_ip


class FakeHeaders(dict):
    def get(self, name, default=None):
        return dict.get(self, name.lower(), default)


class FakeReq:
    def __init__(self, direct, headers=None):
        self.client = type("C", (), {"host": direct})()
        self.headers = FakeHeaders(headers or {})


# 1. Through Cloudflare: CF-Connecting-IP is the authoritative client IP.
def test_cf_connecting_ip_preferred():
    r = FakeReq("100.64.0.17", {"cf-connecting-ip": "8.8.8.8",
                                "x-forwarded-for": "8.8.8.8, 172.70.10.1, 100.64.0.12"})
    assert real_client_ip(r) == "8.8.8.8"


# 2. No CF header (direct Railway origin): first PUBLIC XFF entry = client IP;
#    Railway's own private proxy entries (100.64.0.x) are skipped.
def test_xff_first_public_entry():
    r = FakeReq("100.64.0.19", {"x-forwarded-for": "1.1.1.1, 100.64.0.12"})
    assert real_client_ip(r) == "1.1.1.1"


# 3. XFF with Cloudflare edge in the chain: client → CF → Railway proxy.
def test_xff_with_cf_edge_chain():
    r = FakeReq("100.64.0.12", {"x-forwarded-for": "8.8.8.8, 172.70.10.1, 100.64.0.16"})
    assert real_client_ip(r) == "8.8.8.8"


# 4. Local dev / direct connection: no proxy headers, public peer.
def test_direct_public_peer():
    r = FakeReq("45.32.14.2", {})
    assert real_client_ip(r) == "45.32.14.2"


# 5. Private peer with NO headers at all → fall back to the peer (not "unknown").
def test_private_peer_no_headers():
    r = FakeReq("100.64.0.20", {})
    assert real_client_ip(r) == "100.64.0.20"


# 6. Spoof attempt: attacker sets CF-Connecting-IP via direct origin — the
#    documented limitation (mitigated by not exposing the direct origin).
def test_forged_cf_header_direct_origin():
    r = FakeReq("100.64.0.15", {"cf-connecting-ip": "1.1.1.1"})
    assert real_client_ip(r) == "1.1.1.1"


# 7. IPv6 loopback / ULA / CGNAT entries are never picked as the client IP.
def test_ipv6_private_skipped():
    r = FakeReq("100.64.0.11", {"x-forwarded-for": "::1, fc00::1, 100.64.0.11"})
    # ::1 loopback, fc00::/7 ULA, 100.64.0.11 CGNAT → none global → peer fallback
    assert real_client_ip(r) == "100.64.0.11"


# 8. Real public IPv6 client works.
def test_public_ipv6_client():
    r = FakeReq("100.64.0.13", {"x-forwarded-for": "2606:4700:4700::1111, 100.64.0.13"})
    assert real_client_ip(r) == "2606:4700:4700::1111"


# 9. CGNAT-only chain (no real client IP anywhere) → peer fallback, never a
#    private/CGNAT value picked as the "client".
def test_cgnat_only_chain():
    r = FakeReq("100.64.0.14", {"x-forwarded-for": "100.64.0.1, 100.64.0.2"})
    assert real_client_ip(r) == "100.64.0.14"


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    passed = 0
    for fn in fns:
        fn()
        print(f"✅ {fn.__name__}")
        passed += 1
    print(f"\n{passed}/{len(fns)} passed")
