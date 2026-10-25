"""Request-bound hosted execution with private Blob snapshots and atomic Redis state.

Blob objects are immutable. Mutable admission, idempotency and owner/expiry metadata
live in Redis; the Python Blob SDK does not support conditional uploads. No task in
this module may continue after its HTTP request has returned.
"""
from __future__ import annotations

import asyncio
import copy
import gzip
import hashlib
import hmac
import io
import json
import math
import os
import re
import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import HTTPException, Request

from .app import LabStore, Settings, _json_safe

PREFIX = "{synthetic-lab-v1}:"
BLOB_PREFIX = "synthetic-lab/v1/data/"
OBJECT_PATTERN = re.compile(r"synthetic-lab/v1/data/[0-9]{10,12}/[a-f0-9]{32}\.json\.gz")

# All keys share a Redis hash tag. Admission, owner/global rate limits, the job
# record and its owner/config-bound idempotency key are one atomic operation.
ADMIT = """
local prior = redis.call('GET', KEYS[5])
if ARGV[11] == '1' and prior then
  local old = cjson.decode(prior)
  if old.digest ~= ARGV[9] then return {'conflict'} end
  return {'existing', old.job_id}
end
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', now)
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[3]) or redis.call('ZCARD', KEYS[2]) >= tonumber(ARGV[4]) then return {'busy'} end
if tonumber(redis.call('GET', KEYS[3]) or '0') >= tonumber(ARGV[5]) or tonumber(redis.call('GET', KEYS[4]) or '0') >= tonumber(ARGV[6]) then return {'rate'} end
for i = 3, 4 do
  local count = redis.call('INCR', KEYS[i])
  if count == 1 then redis.call('PEXPIRE', KEYS[i], 60000) end
end
local expiry = now + tonumber(ARGV[2])
redis.call('ZADD', KEYS[1], expiry, ARGV[1])
redis.call('ZADD', KEYS[2], expiry, ARGV[1])
redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[2]) + 1000)
redis.call('PEXPIRE', KEYS[2], tonumber(ARGV[2]) + 1000)
local job = cjson.decode(ARGV[10])
job.lease_expires_at = expiry / 1000
redis.call('SET', KEYS[6], cjson.encode(job), 'PX', ARGV[7])
if ARGV[11] == '1' then redis.call('SET', KEYS[5], cjson.encode({job_id=ARGV[1], digest=ARGV[9]}), 'PX', ARGV[7]) end
return {'started', ARGV[1]}
"""

FINISH = """
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local current = cjson.decode(raw)
if current.status ~= 'running' then return 0 end
local clock = redis.call('TIME')
if tonumber(clock[1]) >= current.lease_expires_at then return 0 end
redis.call('SET', KEYS[2], ARGV[2], 'PX', ARGV[3])
redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[3])
return 1
"""

RATE = """
if tonumber(redis.call('GET', KEYS[1]) or '0') >= tonumber(ARGV[1]) or tonumber(redis.call('GET', KEYS[2]) or '0') >= tonumber(ARGV[2]) then return 0 end
for i = 1, 2 do
  local count = redis.call('INCR', KEYS[i])
  if count == 1 then redis.call('PEXPIRE', KEYS[i], 60000) end
end
return 1
"""

RESERVE_RESULT = """
local clock = redis.call('TIME')
local expired = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', clock[1])
for _, id in ipairs(expired) do redis.call('HDEL', KEYS[2], id) end
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', clock[1])
local total = tonumber(ARGV[3])
for _, size in ipairs(redis.call('HVALS', KEYS[2])) do total = total + tonumber(size) end
-- Evict oldest completed snapshots just as the local bounded store does. Never
-- evict an in-flight reservation: its job could otherwise publish outside quota.
local candidates = redis.call('ZRANGE', KEYS[1], 0, -1)
for _, id in ipairs(candidates) do
  if redis.call('ZCARD', KEYS[1]) < tonumber(ARGV[4]) and total <= tonumber(ARGV[5]) then break end
  local key = ARGV[7] .. 'result:' .. id
  local raw = redis.call('GET', key)
  if raw then
    local metadata = cjson.decode(raw)
    redis.call('ZADD', KEYS[3], clock[1], metadata.path)
    redis.call('DEL', key)
    total = total - tonumber(redis.call('HGET', KEYS[2], id) or '0')
    redis.call('ZREM', KEYS[1], id)
    redis.call('HDEL', KEYS[2], id)
  end
end
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[4]) or total > tonumber(ARGV[5]) then return 0 end
redis.call('ZADD', KEYS[1], ARGV[2], ARGV[1])
redis.call('HSET', KEYS[2], ARGV[1], ARGV[3])
redis.call('EXPIRE', KEYS[1], ARGV[6])
redis.call('EXPIRE', KEYS[2], ARGV[6])
return 1
"""


def owner_digest(owner: str) -> str:
    return hashlib.sha256(owner.encode("ascii")).hexdigest()


def encode(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


class RedisControl:
    """Upstash's documented POST command-array API, with bounded network waits."""

    def __init__(self, url: str | None = None, token: str | None = None, command: Any = None):
        self.url = url or os.environ.get("UPSTASH_REDIS_REST_URL") or os.environ.get("KV_REST_API_URL", "")
        self.token = token or os.environ.get("UPSTASH_REDIS_REST_TOKEN") or os.environ.get("KV_REST_API_TOKEN", "")
        self._command = command

    def check_configuration(self) -> None:
        if self._command:
            return
        if not self.url.startswith("https://") or not self.token:
            raise RuntimeError("Hosted mode requires UPSTASH_REDIS_REST_URL/TOKEN or KV_REST_API_URL/TOKEN.")

    def command(self, *args: Any) -> Any:
        if self._command:
            value = self._command(*args)
            return value.decode() if isinstance(value, bytes) else value
        self.check_configuration()
        try:
            with httpx.Client(timeout=3, follow_redirects=False) as client:
                response = client.post(self.url, json=list(args), headers={"Authorization": f"Bearer {self.token}"})
                response.raise_for_status()
                value = response.json()
                if "error" in value:
                    raise ValueError("Redis command failed")
                return value["result"]
        except Exception:
            # Never put a storage URL, credential, or upstream body in a response.
            raise HTTPException(503, "Private job storage is temporarily unavailable. Retry shortly.") from None

    def eval(self, script: str, keys: list[str], *args: Any) -> Any:
        result = self.command("EVAL", script, len(keys), *keys, *args)
        if isinstance(result, list):
            return [v.decode() if isinstance(v, bytes) else v for v in result]
        return result

    def get(self, key: str) -> dict | None:
        raw = self.command("GET", PREFIX + key)
        return json.loads(raw) if raw else None

    def put(self, key: str, value: dict, ttl: float) -> None:
        self.command("SET", PREFIX + key, encode(value), "PX", max(1, math.ceil(ttl * 1000)))


class PrivateBlob:
    """Use only public SDK methods, explicit private access and immutable writes."""

    def check_configuration(self) -> None:
        if not (os.environ.get("BLOB_READ_WRITE_TOKEN") or os.environ.get("VERCEL_BLOB_READ_WRITE_TOKEN") or
                (os.environ.get("BLOB_STORE_ID") and os.environ.get("VERCEL_OIDC_TOKEN"))):
            raise RuntimeError("Hosted mode requires a connected private Vercel Blob store.")

    @staticmethod
    def session():
        from vercel.api import session
        import httpx2
        return session(httpx_client_factory=lambda: httpx2.Client(timeout=6, follow_redirects=False))

    def put(self, path: str, value: bytes) -> None:
        from vercel.blob import sync as blob
        with self.session():
            blob.put_blob(path, value, access="private", content_type="application/gzip", add_random_suffix=False, allow_overwrite=False)

    def get(self, path: str, max_bytes: int) -> bytes:
        from vercel.blob import sync as blob
        chunks = bytearray()
        with self.session():
            with blob.stream_blob(path, access="private") as result:
                if result.metadata.size is not None and result.metadata.size > max_bytes:
                    raise ValueError("Stored result exceeds the size budget")
                for chunk in result:
                    chunks.extend(chunk)
                    if len(chunks) > max_bytes:
                        raise ValueError("Stored result exceeds the size budget")
        return bytes(chunks)

    def delete(self, paths: list[str]) -> None:
        from vercel.blob import sync as blob
        if paths:
            with self.session():
                blob.delete_blob(paths)


class HostedLabStore(LabStore):
    """A request owns computation until completion, cancellation, or failure."""

    def __init__(self, settings: Settings, engine: Any, control: RedisControl | None = None, blobs: Any = None):
        super().__init__(settings, engine)
        self.control = control or RedisControl()
        self.blobs = blobs or PrivateBlob()

    def check_configuration(self) -> None:
        self.control.check_configuration()
        self.blobs.check_configuration()

    def cleanup(self, limit: int = 100, opportunistic: bool = False) -> dict:
        # Expiry is checked independently on every read. This sorted-set index is
        # written BEFORE each upload, so interrupted uploads cannot orphan data.
        if opportunistic and not self.control.command("SET", PREFIX + "cleanup-lock", "1", "NX", "EX", 60):
            return {"deleted": 0}
        paths = self.control.command("ZRANGEBYSCORE", PREFIX + "cleanup", "-inf", time.time(), "LIMIT", 0, min(500, max(1, limit))) or []
        paths = [p.decode() if isinstance(p, bytes) else p for p in paths]
        if any(not OBJECT_PATTERN.fullmatch(p) for p in paths):
            raise HTTPException(503, "Cleanup index is invalid.")
        if paths:
            try:
                self.blobs.delete(paths)
            except Exception:
                raise HTTPException(503, "Private result cleanup is temporarily unavailable.") from None
            self.control.command("ZREM", PREFIX + "cleanup", *paths)
        return {"deleted": len(paths), "limit": limit}

    def _admit(self, owner: str, config: dict, key: str | None, kind: str = "generation", rate_kind: str | None = None) -> tuple[dict, bool]:
        identity = owner_digest(owner)
        rate_kind = rate_kind or kind
        job_id = uuid.uuid4().hex
        digest = hashlib.sha256(json.dumps(config, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()
        job = {"job_id": job_id, "owner": identity, "config_hash": digest, "status": "running", "progress": None,
               "stage": "Generating during this request", "result_id": None, "error": None,
               "created_at": time.time(), "expires_at": time.time() + self.settings.result_ttl}
        idem = hashlib.sha256((key or job_id).encode()).hexdigest()
        keys = [PREFIX + f"active:{kind}", PREFIX + f"active:{kind}:{identity}",
                PREFIX + f"rate:{rate_kind}:{identity}", PREFIX + f"rate:{rate_kind}:global",
                PREFIX + f"idem:{identity}:{idem}", PREFIX + "job:" + job_id]
        maximum = self.settings.workers if kind == "generation" else 2
        owner_rate, global_rate = (60, 300) if rate_kind == "preview" else ((12, 120) if kind == "generation" else (30, 180))
        result = self.control.eval(ADMIT, keys, job_id, 180_000, maximum, 2, owner_rate,
                                   global_rate, math.ceil(self.settings.result_ttl * 1000),
                                   identity, digest, encode(job), "1" if key else "0")
        if result[0] == "conflict":
            raise HTTPException(409, "This idempotency key belongs to a different configuration.")
        if result[0] in ("busy", "rate"):
            raise HTTPException(429, "Generation capacity or request rate is busy. Retry after current requests finish.", headers={"Retry-After": "5" if result[0] == "busy" else "60"})
        if result[0] == "existing":
            return self._get_job(owner, result[1]), False
        return self._get_job(owner, job_id), True

    def _release(self, owner: str, job_id: str, kind: str = "generation") -> None:
        # A failed release is safe: server-time leases recover after 180 seconds.
        try:
            self.control.command("ZREM", PREFIX + f"active:{kind}", job_id)
            self.control.command("ZREM", PREFIX + f"active:{kind}:{owner_digest(owner)}", job_id)
        except HTTPException:
            pass

    def acquire_download(self, owner: str) -> str:
        job, _ = self._admit(owner, {}, None, "download")
        return job["job_id"]

    def release_download(self, owner: str, job_id: str) -> None:
        self._release(owner, job_id, "download")

    def _release_result(self, result_id: str) -> None:
        self.control.command("ZREM", PREFIX + "retained:expiry", result_id)
        self.control.command("HDEL", PREFIX + "retained:sizes", result_id)

    def _get_job(self, owner: str, job_id: str) -> dict:
        if not re.fullmatch(r"[a-f0-9]{32}", job_id):
            raise HTTPException(404, "Job not found or expired.")
        job = self.control.get("job:" + job_id)
        if not job or job.get("expires_at", 0) <= time.time() or not hmac.compare_digest(job.get("owner", ""), owner_digest(owner)):
            raise HTTPException(404, "Job not found or expired.")
        if job["status"] == "running" and time.time() >= job.get("lease_expires_at", 0):
            job.update(status="failed", stage="Request ended", error="The generation request ended before completion. Start generation again with a new request key.")
        return job

    def job_view(self, owner: str, job_id: str) -> dict:
        job = self._get_job(owner, job_id)
        view = {key: job.get(key) for key in ("job_id", "status", "progress", "stage", "result_id", "error")}
        view["execution_mode"] = "request_bound"
        if job.get("result_id"):
            try:
                view["result"] = self.result_page(owner, job["result_id"])
            except HTTPException as error:
                if error.status_code != 404:
                    raise
                view["result_expired"] = True
        return view

    def get_result(self, owner: str, result_id: str) -> dict:
        if not re.fullmatch(r"[a-f0-9]{32}", result_id):
            raise HTTPException(404, "Result not found or expired. Generate it again from the saved configuration.")
        metadata = self.control.get("result:" + result_id)
        if not metadata or metadata.get("expires_at", 0) <= time.time() or not hmac.compare_digest(metadata.get("owner", ""), owner_digest(owner)):
            raise HTTPException(404, "Result not found or expired. Generate it again from the saved configuration.")
        if not self.control.eval(RATE, [PREFIX + "reads:" + owner_digest(owner), PREFIX + "reads:global"], 60, 300):
            raise HTTPException(429, "Result request rate exceeded. Retry shortly.")
        path = metadata.get("path", "")
        if not OBJECT_PATTERN.fullmatch(path):
            raise HTTPException(503, "Private result metadata is invalid.")
        try:
            compressed = self.blobs.get(path, self.settings.max_result_bytes)
            if not hmac.compare_digest(hashlib.sha256(compressed).hexdigest(), metadata["sha256"]):
                raise ValueError("Snapshot integrity mismatch")
            with gzip.GzipFile(fileobj=io.BytesIO(compressed)) as stream:
                raw = stream.read(self.settings.max_result_bytes + 1)
            if len(raw) > self.settings.max_result_bytes:
                raise ValueError("Snapshot exceeds result budget")
            return json.loads(raw)
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(503, "Private result storage is temporarily unavailable. Retry shortly.") from None

    def _save(self, owner: str, job: dict, result: dict, config: dict, preview: bool, cancelled: Any) -> dict:
        data = _json_safe(result)
        result_id = uuid.uuid4().hex
        data.update(result_id=result_id, preview=preview)
        data.setdefault("config", config)
        data.setdefault("config_hash", hashlib.sha256(encode(config).encode()).hexdigest())
        data.setdefault("created_at", datetime.now(timezone.utc).isoformat())
        data.setdefault("row_count", len(data.get("rows", [])))
        raw = encode(data).encode("utf-8")
        if len(raw) > self.settings.max_result_bytes:
            raise ValueError("Result exceeds the service serialized-size budget; reduce rows or columns.")
        compressed = gzip.compress(raw, compresslevel=5, mtime=0)
        expires = time.time() + self.settings.result_ttl
        path = f"{BLOB_PREFIX}{math.ceil(expires)}/{result_id}.json.gz"
        metadata = {"owner": owner_digest(owner), "path": path, "expires_at": expires,
                    "size": len(raw), "sha256": hashlib.sha256(compressed).hexdigest()}
        if cancelled():
            raise InterruptedError("Generation cancelled or time budget reached.")
        if not self.control.eval(RESERVE_RESULT, [PREFIX + "retained:expiry", PREFIX + "retained:sizes", PREFIX + "cleanup"],
                                 result_id, math.ceil(expires), len(raw), self.settings.max_results,
                                 self.settings.max_store_bytes, math.ceil(self.settings.result_ttl + 1), PREFIX):
            raise HTTPException(429, "Retained result storage is busy. Retry after current requests finish or use a smaller dataset.", headers={"Retry-After": "5"})
        try:
            self.control.command("ZADD", PREFIX + "cleanup", math.ceil(expires), path)
            self.blobs.put(path, compressed)
            if cancelled():
                raise InterruptedError("Generation cancelled or time budget reached.")
            job.update(status="completed", progress=1, stage="Dataset ready", result_id=result_id, expires_at=expires)
            committed = self.control.eval(FINISH, [PREFIX + "job:" + job["job_id"], PREFIX + "result:" + result_id],
                                          encode(job), encode(metadata), math.ceil(self.settings.result_ttl * 1000))
            if not committed:
                raise InterruptedError("The generation request lease expired before completion.")
        except Exception:
            # The index survives failed deletion, so cron can retry safely.
            try:
                self.blobs.delete([path])
            except Exception:
                pass
            self._release_result(result_id)
            raise
        return data

    async def run_request(self, request: Request, owner: str, config: dict, key: str | None, preview: bool) -> dict:
        cancel = threading.Event()
        started = time.monotonic()
        # Reserve network/commit time inside the proxy's 40/150-second envelope.
        compute_budget = min(self.settings.preview_timeout, 20) if preview else self.settings.job_timeout

        def cancelled() -> bool:
            return self.closed or cancel.is_set() or time.monotonic() - started > compute_budget

        def commit_cancelled() -> bool:
            return self.closed or cancel.is_set() or time.monotonic() - started > compute_budget + 16

        def work() -> dict:
            job, fresh = self._admit(owner, config, key, rate_kind="preview" if preview else "generation")
            if not fresh:
                return self.job_view(owner, job["job_id"])
            try:
                try:
                    self.cleanup(limit=500, opportunistic=True)
                except HTTPException:
                    pass
                if cancelled():
                    raise InterruptedError("Generation cancelled or time budget reached.")
                result = self.engine.generate(copy.deepcopy(config), preview=preview, cancel_check=cancelled, progress=None)
                if cancelled():
                    raise InterruptedError("Generation cancelled or time budget reached.")
                # Generation has completed; the deadline still bounds the commit.
                data = self._save(owner, job, result, config, preview, commit_cancelled)
                if preview:
                    return self.public_result(data)
                view = {name: job.get(name) for name in ("job_id", "status", "progress", "stage", "result_id", "error")}
                view["execution_mode"] = "request_bound"
                page = self.public_result(data)
                page.update(rows=data.get("rows", [])[:200], offset=0, limit=200, total_rows=len(data.get("rows", [])))
                view["result"] = page
                return view
            except Exception as error:
                stopped = cancelled() or isinstance(error, InterruptedError)
                job.update(status="cancelled" if cancel.is_set() or self.closed else "failed", progress=None,
                           stage="Cancelled" if cancel.is_set() or self.closed else "Generation failed",
                           error=None if cancel.is_set() else ("Generation exceeded its request time budget; reduce the dataset or model complexity." if stopped else "Generation or private storage failed. Retry with a new request key."))
                self.control.put("job:" + job["job_id"], job, self.settings.result_ttl)
                if isinstance(error, HTTPException):
                    raise
                if stopped:
                    raise HTTPException(499 if cancel.is_set() else 504, "Generation cancelled." if cancel.is_set() else "Generation exceeded its time budget. Reduce model complexity.") from None
                raise HTTPException(422, str(error)[:1000] if isinstance(error, ValueError) else "Generation or private storage failed. Retry shortly.") from None
            finally:
                self._release(owner, job["job_id"])

        future = asyncio.create_task(asyncio.to_thread(work))

        async def watch_disconnect() -> None:
            while not future.done():
                if await request.is_disconnected():
                    cancel.set()
                    return
                await asyncio.sleep(0.1)

        watcher = asyncio.create_task(watch_disconnect())
        try:
            return await asyncio.shield(future)
        except asyncio.CancelledError:
            # Await the cooperative worker even when the client goes away. A
            # detached future must never carry hosted generation past response.
            cancel.set()
            while not future.done():
                try:
                    await asyncio.shield(future)
                except asyncio.CancelledError:
                    continue
                except Exception:
                    break
            if future.done() and not future.cancelled():
                future.exception()
            raise
        finally:
            watcher.cancel()
