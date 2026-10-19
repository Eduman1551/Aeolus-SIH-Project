from app.config import load_settings


def test_allowed_origins_from_env(monkeypatch):
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://aeolus.vercel.app/, https://demo.example.org")
    monkeypatch.setenv("ALLOWED_ORIGIN_REGEX", r"https://.*\.vercel\.app")
    s = load_settings()
    assert "https://aeolus.vercel.app" in s.cors_origins
    assert "https://demo.example.org" in s.cors_origins
    assert any(o.startswith("http://localhost:") for o in s.cors_origins)
    assert s.cors_origin_regex == r"https://.*\.vercel\.app"


def test_no_origin_regex_by_default(monkeypatch):
    monkeypatch.delenv("ALLOWED_ORIGIN_REGEX", raising=False)
    assert load_settings().cors_origin_regex is None
