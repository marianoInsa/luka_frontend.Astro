"""Unit tests for the F1 migration facade (app.proxy.ProxyMiddleware).

All tests are in-process: the "origin" is a tiny ASGI app driven through
httpx.ASGITransport. No real network is involved.
"""

import httpx
import pytest
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response, StreamingResponse

from app.proxy import ProxyMiddleware, parse_migrated_paths


async def _noop_app(scope, receive, send):
    raise AssertionError("the local app should not have been reached")


def _origin_client(app: FastAPI) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), follow_redirects=False
    )


def _facade_with(client: httpx.AsyncClient, paths, origin: str = "http://origin.test"):
    facade = FastAPI()
    facade.add_middleware(
        ProxyMiddleware, origin=origin, paths=paths, client=client
    )
    return facade


# --- parse_migrated_paths ------------------------------------------------------


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (None, ()),
        ("", ()),
        ("   ", ()),
        (", ,", ()),
        ("registro", ("/registro",)),
        ("/registro/", ("/registro",)),
        ("/", ("/",)),
        ("/a//", ("/a",)),
        ("  /a  ,  b/c/  ", ("/a", "/b/c")),
        ("/a,/a/,/a//", ("/a",)),
    ],
)
def test_parse_migrated_paths(raw, expected):
    assert parse_migrated_paths(raw) == expected


# --- should_proxy --------------------------------------------------------------


def test_root_matches_only_the_exact_root():
    middleware = ProxyMiddleware(_noop_app, origin="http://origin.test", paths=("/",))
    assert middleware.should_proxy("/") is True
    assert middleware.should_proxy("/app") is False
    assert middleware.should_proxy("/foo") is False


def test_prefix_boundary_matches_only_full_segments():
    middleware = ProxyMiddleware(
        _noop_app, origin="http://origin.test", paths=("/registro",)
    )
    assert middleware.should_proxy("/registro") is True
    assert middleware.should_proxy("/registro/continuar") is True
    assert middleware.should_proxy("/registrofoo") is False
    assert middleware.should_proxy("/registros") is False
    assert middleware.should_proxy("/") is False


def test_static_is_never_proxied_even_if_listed():
    middleware = ProxyMiddleware(
        _noop_app,
        origin="http://origin.test",
        paths=parse_migrated_paths("/static,/,/registro"),
    )
    assert middleware.should_proxy("/static") is False
    assert middleware.should_proxy("/static/css/style.css") is False
    assert middleware.should_proxy("/registro") is True


def test_empty_origin_forces_no_proxy():
    middleware = ProxyMiddleware(
        _noop_app, origin="", paths=parse_migrated_paths("/,/registro")
    )
    assert middleware.should_proxy("/") is False
    assert middleware.should_proxy("/registro") is False


# --- no-op ---------------------------------------------------------------------


@pytest.mark.asyncio
async def test_empty_origin_forwards_to_local_app():
    local = FastAPI()

    @local.get("/")
    async def root():
        return {"marker": "local"}

    local.add_middleware(ProxyMiddleware, origin="", paths=parse_migrated_paths("/"))

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=local),
        base_url="http://facade.test",
        follow_redirects=False,
    ) as client:
        response = await client.get("/")

    assert response.status_code == 200
    assert response.json() == {"marker": "local"}


@pytest.mark.asyncio
async def test_non_migrated_path_is_served_locally():
    async with _origin_client(FastAPI()) as origin_client:
        facade = FastAPI()

        @facade.get("/local")
        async def local_page():
            return {"marker": "local"}

        facade.add_middleware(
            ProxyMiddleware,
            origin="http://origin.test",
            paths=("/registro",),
            client=origin_client,
        )
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=facade), base_url="http://facade.test", follow_redirects=False
        ) as client:
            response = await client.get("/local")

    assert response.status_code == 200
    assert response.json() == {"marker": "local"}


@pytest.mark.asyncio
async def test_non_proxied_path_keeps_the_original_origin_header():
    async with _origin_client(FastAPI()) as origin_client:
        facade = FastAPI()

        @facade.post("/local")
        async def local_page(request: Request):
            return {"origin": request.headers.get("origin", "")}

        facade.add_middleware(
            ProxyMiddleware,
            origin="http://origin.test",
            paths=("/registro",),
            client=origin_client,
        )
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=facade),
            base_url="http://facade.test",
            follow_redirects=False,
        ) as client:
            response = await client.post(
                "/local", headers={"Origin": "https://public.example"}
            )

    assert response.status_code == 200
    assert response.json()["origin"] == "https://public.example"


# --- forwarding ----------------------------------------------------------------


def _echo_origin() -> FastAPI:
    origin = FastAPI()

    @origin.api_route("/{path:path}", methods=["GET", "POST"])
    async def echo(request: Request, path: str):
        body = await request.body()
        return JSONResponse(
            {
                "method": request.method,
                "path": request.url.path,
                "query": request.url.query,
                "raw_path": request.scope["raw_path"].decode("latin-1"),
                "raw_query": request.scope["query_string"].decode("latin-1"),
                "cookie": request.headers.get("cookie", ""),
                "x_custom": request.headers.get("x-custom", ""),
                "connection": request.headers.get("connection", ""),
                "host": request.headers.get("host", ""),
                "origin": request.headers.get("origin", ""),
                "body": body.decode(),
            }
        )

    return origin


@pytest.mark.asyncio
async def test_proxies_method_path_query_cookie_and_body():
    async with _origin_client(_echo_origin()) as origin_client:
        facade = _facade_with(
            origin_client, paths=parse_migrated_paths("/registro")
        )
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=facade),
            base_url="http://facade.test",
            follow_redirects=False,
            cookies={"luka_session": "abc"},
        ) as client:
            response = await client.post(
                "/registro",
                params={"paso": "2"},
                content="nombre=Luka",
                headers={
                    "Content-Type": "application/x-www-form-urlencoded",
                    "X-Custom": "yes",
                    "Connection": "x-hop-by-hop",
                },
            )

    assert response.status_code == 200
    payload = response.json()
    assert payload["method"] == "POST"
    assert payload["path"] == "/registro"
    assert payload["query"] == "paso=2"
    assert payload["cookie"] == "luka_session=abc"
    assert payload["body"] == "nombre=Luka"
    assert payload["x_custom"] == "yes"
    assert "x-hop-by-hop" not in payload["connection"]
    assert payload["host"] == "origin.test"


@pytest.mark.asyncio
async def test_preserves_percent_encoding_of_path_and_query():
    async with _origin_client(_echo_origin()) as origin_client:
        facade = _facade_with(
            origin_client, paths=parse_migrated_paths("/registro")
        )
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=facade),
            base_url="http://facade.test",
            follow_redirects=False,
        ) as client:
            encoded = await client.get("/registro/a%20b?q=a%2Fb%20c&t=1")
            utf8 = await client.get("/registro/caf%C3%A9?x=%E2%82%AC")

    assert encoded.status_code == 200
    payload = encoded.json()
    assert payload["raw_path"] == "/registro/a%20b"
    assert payload["raw_query"] == "q=a%2Fb%20c&t=1"
    assert payload["path"] == "/registro/a b"
    assert payload["query"] == "q=a%2Fb%20c&t=1"

    assert utf8.status_code == 200
    payload = utf8.json()
    assert payload["raw_path"] == "/registro/caf%C3%A9"
    assert payload["raw_query"] == "x=%E2%82%AC"
    assert payload["path"] == "/registro/caf\u00e9"


@pytest.mark.asyncio
async def test_rewrites_origin_header_to_the_astro_origin():
    async with _origin_client(_echo_origin()) as origin_client:
        facade = _facade_with(
            origin_client, paths=parse_migrated_paths("/registro")
        )
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=facade),
            base_url="http://facade.test",
            follow_redirects=False,
        ) as client:
            response = await client.post(
                "/registro", headers={"Origin": "https://public.example"}
            )

    assert response.status_code == 200
    assert response.json()["origin"] == "http://origin.test"


@pytest.mark.asyncio
async def test_does_not_add_origin_header_when_absent():
    async with _origin_client(_echo_origin()) as origin_client:
        facade = _facade_with(
            origin_client, paths=parse_migrated_paths("/registro")
        )
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=facade),
            base_url="http://facade.test",
            follow_redirects=False,
        ) as client:
            response = await client.post("/registro")

    assert response.status_code == 200
    assert response.json()["origin"] == ""


# --- status and header passthrough ---------------------------------------------


@pytest.mark.asyncio
async def test_forwards_status_and_duplicate_headers():
    origin = FastAPI()

    @origin.get("/handoff")
    async def handoff():
        response = Response(status_code=303, headers={"location": "/app"})
        response.headers.append("set-cookie", "luka_session=new; Path=/; HttpOnly")
        response.headers.append("set-cookie", "luka_sb_pkce=xyz; Path=/; HttpOnly")
        response.headers.append("hx-trigger", "refresh")
        return response

    async with _origin_client(origin) as origin_client:
        facade = _facade_with(origin_client, paths=("/handoff",))
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=facade), base_url="http://facade.test", follow_redirects=False
        ) as client:
            response = await client.get("/handoff")

    assert response.status_code == 303
    assert response.headers["location"] == "/app"
    assert response.headers["hx-trigger"] == "refresh"
    set_cookies = response.headers.get_list("set-cookie")
    assert len(set_cookies) == 2
    assert "luka_session=new" in set_cookies[0]
    assert "luka_sb_pkce=xyz" in set_cookies[1]


# --- streaming -----------------------------------------------------------------


@pytest.mark.asyncio
async def test_streams_chunked_response_body():
    origin = FastAPI()

    @origin.get("/stream")
    async def stream():
        async def generate():
            yield b"chunk-1|"
            yield b"chunk-2|"
            yield b"chunk-3"

        return StreamingResponse(generate(), media_type="text/plain")

    async with _origin_client(origin) as origin_client:
        facade = _facade_with(origin_client, paths=("/stream",))
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=facade), base_url="http://facade.test", follow_redirects=False
        ) as client:
            response = await client.get("/stream")

    assert response.status_code == 200
    assert response.content == b"chunk-1|chunk-2|chunk-3"


# --- upstream failure ----------------------------------------------------------


class _FailingTransport(httpx.AsyncBaseTransport):
    async def handle_async_request(self, request):
        raise httpx.ConnectError("connection refused")


@pytest.mark.asyncio
async def test_upstream_failure_returns_502_without_leaking_details():
    client = httpx.AsyncClient(
        transport=_FailingTransport(), follow_redirects=False
    )
    facade = _facade_with(
        client, paths=parse_migrated_paths("/"), origin="http://origin.internal:9999"
    )

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=facade), base_url="http://facade.test", follow_redirects=False
    ) as browser:
        response = await browser.get("/")

    assert response.status_code == 502
    assert response.headers["content-type"].startswith("application/json")
    assert response.json() == {
        "message": "Servicio de migracion no disponible",
        "errors": [],
    }
    assert "origin.internal" not in response.text
