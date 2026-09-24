"""Transient FastAPI facade for the Astro migration (F1).

A pure ASGI middleware (no BaseHTTPMiddleware) that forwards the request to
``ASTRO_ORIGIN`` when the path is listed in ``ASTRO_MIGRATED_PATHS``. With an
empty origin it is a no-op, which keeps the default behavior untouched.
"""

from collections.abc import Sequence

import httpx

_HOP_BY_HOP_HEADERS = frozenset(
    {
        "connection",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailers",
        "transfer-encoding",
        "upgrade",
    }
)

_EXCLUDED_REQUEST_HEADERS = _HOP_BY_HOP_HEADERS | {"host", "content-length"}


def parse_migrated_paths(raw: str | None) -> tuple[str, ...]:
    """Normalize the CSV env var into unique, prefixed path entries."""
    if not raw:
        return ()
    entries: list[str] = []
    for chunk in raw.split(","):
        candidate = chunk.strip()
        if not candidate:
            continue
        if not candidate.startswith("/"):
            candidate = "/" + candidate
        candidate = candidate.rstrip("/") or "/"
        if candidate not in entries:
            entries.append(candidate)
    return tuple(entries)


class ProxyMiddleware:
    def __init__(
        self,
        app,
        *,
        origin: str = "",
        paths: Sequence[str] = (),
        client: httpx.AsyncClient | None = None,
        timeout: float = 30.0,
    ):
        self.app = app
        self.origin = origin.strip().rstrip("/")
        self.paths = tuple(paths) if self.origin else ()
        if client is not None:
            self.client = client
        else:
            # ponytail: one client for the whole process (no per-request close);
            # revisit if connections start leaking or need draining on shutdown.
            self.client = httpx.AsyncClient(
                timeout=timeout, follow_redirects=False
            )

    def should_proxy(self, path: str) -> bool:
        if path.startswith("/static"):
            return False
        for entry in self.paths:
            if entry == "/":
                if path == "/":
                    return True
            elif path == entry or path.startswith(entry + "/"):
                return True
        return False

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or not self.should_proxy(scope.get("path", "")):
            await self.app(scope, receive, send)
            return

        body = await self._read_body(receive)

        raw_path = scope.get("raw_path")
        if raw_path is None:
            raw_path = scope["path"].encode("latin-1")
        query = scope.get("query_string", b"")
        # httpx raw_path carries path + query; combining keeps the bytes exact.
        target = httpx.URL(self.origin).copy_with(
            raw_path=raw_path + (b"?" + query if query else b"")
        )

        headers: list[tuple[str, str]] = []
        for name, value in scope.get("headers", []):
            header_name = name.decode("latin-1")
            if header_name.lower() in _EXCLUDED_REQUEST_HEADERS:
                continue
            if header_name.lower() == "origin":
                # Transitional facade adaptation: Astro's checkOrigin (on by
                # default) rejects requests whose Origin does not match the
                # host it sees (the Astro origin). Removed with the facade at F5.
                headers.append((header_name, self.origin))
                continue
            headers.append((header_name, value.decode("latin-1")))

        request = self.client.build_request(
            scope["method"], target, headers=headers, content=body
        )
        try:
            upstream = await self.client.send(request, stream=True)
        except httpx.HTTPError:
            await self._send_unavailable(send)
            return

        try:
            await send(
                {
                    "type": "http.response.start",
                    "status": upstream.status_code,
                    "headers": [
                        (
                            name.lower().encode("latin-1"),
                            value.encode("latin-1"),
                        )
                        for name, value in upstream.headers.multi_items()
                        if name.lower() not in _HOP_BY_HOP_HEADERS
                    ],
                }
            )
            async for chunk in upstream.aiter_raw():
                await send(
                    {
                        "type": "http.response.body",
                        "body": chunk,
                        "more_body": True,
                    }
                )
            await send(
                {"type": "http.response.body", "body": b"", "more_body": False}
            )
        finally:
            await upstream.aclose()

    async def _read_body(self, receive) -> bytes:
        # ponytail: buffers the whole request body; fine for the small forms and
        # JSON this facade carries. Stream to a temp file if uploads show up.
        chunks: list[bytes] = []
        while True:
            message = await receive()
            if message["type"] != "http.request":
                break
            chunks.append(message.get("body", b""))
            if not message.get("more_body", False):
                break
        return b"".join(chunks)

    async def _send_unavailable(self, send) -> None:
        payload = b'{"message":"Servicio de migracion no disponible","errors":[]}'
        await send(
            {
                "type": "http.response.start",
                "status": 502,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(payload)).encode("ascii")),
                ],
            }
        )
        await send(
            {"type": "http.response.body", "body": payload, "more_body": False}
        )
