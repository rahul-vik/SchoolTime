"""
AWS Lambda entry (Function URL or API Gateway HTTP API v2).
POST /solve — same JSON body and Bearer auth as the local HTTP sidecar.
GET /health — liveness for operators.
"""
from __future__ import annotations

import base64
import json
import os
from typing import Any, Dict, Optional, Tuple

from service import solve_request

_JSON = "application/json"


def _response(status: int, body: Any, headers: Optional[Dict[str, str]] = None) -> dict:
    h = {"Content-Type": _JSON}
    if headers:
        h.update(headers)
    payload = body if isinstance(body, str) else json.dumps(body)
    return {"statusCode": status, "headers": h, "body": payload}


def _http_method(event: dict) -> str:
    rc = event.get("requestContext") or {}
    http = rc.get("http") or {}
    if http.get("method"):
        return str(http["method"]).upper()
    return str(event.get("httpMethod") or event.get("method") or "GET").upper()


def _raw_path(event: dict) -> str:
    path = event.get("rawPath") or event.get("path") or "/"
    return str(path).split("?")[0].rstrip("/") or "/"


def _headers_lower(event: dict) -> Dict[str, str]:
    raw = event.get("headers") or {}
    return {str(k).lower(): str(v) for k, v in raw.items()}


def _parse_body(event: dict) -> Tuple[Optional[dict], Optional[dict]]:
    """Returns (payload_dict, error_response)."""
    if "solve" in event and isinstance(event.get("solve"), dict):
        return event["solve"], None
    if "tenant" in event and isinstance(event.get("tenant"), dict):
        return event, None

    body = event.get("body")
    if body is None:
        return None, _response(400, {"error": "missing_body"})
    if event.get("isBase64Encoded"):
        try:
            body = base64.b64decode(body).decode("utf-8")
        except Exception:
            return None, _response(400, {"error": "invalid_base64_body"})
    if isinstance(body, dict):
        return body, None
    try:
        return json.loads(str(body) or "{}"), None
    except json.JSONDecodeError:
        return None, _response(400, {"error": "invalid_json"})


def _check_auth(event: dict) -> Optional[dict]:
    expected = os.environ.get("CP_SAT_SOLVER_SECRET", "").strip()
    if not expected:
        return None
    headers = _headers_lower(event)
    auth = headers.get("authorization") or ""
    secret = ""
    if auth.lower().startswith("bearer "):
        secret = auth[7:].strip()
    if secret != expected:
        return _response(401, {"error": "unauthorized"})
    return None


def _is_direct_solve_invoke(event: dict) -> bool:
    if not event or not isinstance(event, dict):
        return False
    if "solve" in event:
        return True
    if "tenant" in event and ("contractVersion" in event or "requestId" in event):
        return True
    return False


def handler(event: dict, context: Any) -> dict:
    event = event or {}

    if _is_direct_solve_invoke(event):
        auth_err = _check_auth(event)
        if auth_err:
            return auth_err
        payload, err = _parse_body(event)
        if err:
            return err
        if not payload:
            return _response(400, {"error": "empty_payload"})
        return _response(200, solve_request(payload))

    method = _http_method(event)
    path = _raw_path(event)

    if method == "GET" and path in ("/health", ""):
        return _response(200, {"ok": True, "service": "schooltime-cpsat", "runtime": "lambda"})

    if method == "POST" and path in ("/solve", ""):
        auth_err = _check_auth(event)
        if auth_err:
            return auth_err
        payload, err = _parse_body(event)
        if err:
            return err
        if not payload:
            return _response(400, {"error": "empty_payload"})
        out = solve_request(payload)
        return _response(200, out)

    return _response(404, {"error": "not_found", "path": path, "method": method})
