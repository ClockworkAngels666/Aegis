"""Two-level cache: per-instance memory, then Upstash Redis (REST) when configured."""

from __future__ import annotations

import json
import time

import httpx

from . import config

_memory: dict[str, tuple[float, object]] = {}


def _redis_enabled() -> bool:
    return bool(config.UPSTASH_URL and config.UPSTASH_TOKEN)


async def _redis(command: list) -> object:
    async with httpx.AsyncClient(timeout=3) as client:
        resp = await client.post(
            config.UPSTASH_URL,
            headers={"Authorization": f"Bearer {config.UPSTASH_TOKEN}"},
            json=command,
        )
        resp.raise_for_status()
        return resp.json().get("result")


async def get(key: str):
    hit = _memory.get(key)
    if hit and hit[0] > time.time():
        return hit[1]
    if _redis_enabled():
        try:
            raw = await _redis(["GET", key])
            if raw:
                value = json.loads(raw)
                _memory[key] = (time.time() + 3600, value)
                return value
        except (httpx.HTTPError, ValueError):
            pass  # cache is best-effort
    return None


async def set(key: str, value, ttl: int = 7 * 86400) -> None:
    _memory[key] = (time.time() + min(ttl, 3600), value)
    if _redis_enabled():
        try:
            await _redis(["SET", key, json.dumps(value), "EX", ttl])
        except httpx.HTTPError:
            pass
