from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_login_page_renders():
    response = client.get("/login")
    assert response.status_code == 200
    assert "LUKA" in response.text
    assert "WhatsApp" in response.text


def test_root_redirects_to_app():
    response = client.get("/", follow_redirects=False)
    # F1: / becomes the Astro landing; without the facade, this is the fallback.
    assert response.status_code == 307
    assert response.headers["location"] == "/app"


def test_root_redirect_preserves_query_string():
    response = client.get("/?date_from=2026-08-01", follow_redirects=False)
    assert response.status_code == 307
    assert response.headers["location"] == "/app?date_from=2026-08-01"


def test_dashboard_redirects_unauthorized():
    response = client.get("/app", follow_redirects=False)
    # The app returns a 401 which the exception handler converts to a 303 redirect to /login
    assert response.status_code == 303
    assert response.headers["location"] == "/login"
