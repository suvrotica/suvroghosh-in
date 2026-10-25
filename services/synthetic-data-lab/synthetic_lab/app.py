"""Bounded, owner-isolated HTTP jobs for the Synthetic Data Lab engine.

Local mode uses one long-lived process. Hosted mode completes computation inside
its request and persists immutable private results with shared admission state.
"""

from __future__ import annotations

import asyncio
import copy
import csv
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
import zipfile
from concurrent.futures import Future, ThreadPoolExecutor
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, Response, StreamingResponse


@dataclass(frozen=True)
class Settings:
    token: str = field(default_factory=lambda: os.environ.get("SYNTHETIC_DATA_SERVICE_TOKEN", ""))
    storage_mode: str = field(default_factory=lambda: os.environ.get("SYNTHETIC_DATA_STORAGE_MODE", "blob" if os.environ.get("VERCEL") == "1" else "memory"))
    cron_secret: str = field(default_factory=lambda: os.environ.get("CRON_SECRET", ""))
    max_body_bytes: int = 2 * 1024 * 1024
    max_rows: int = 100_000
    max_cells: int = 2_000_000
    preview_rows: int = 5_000
    max_jobs: int = 6
    workers: int = 2
    result_ttl: float = 1800
    max_results: int = 24
    max_store_bytes: int = 256 * 1024 * 1024
    max_result_bytes: int = 128 * 1024 * 1024
    max_download_bytes: int = 64 * 1024 * 1024
    preview_timeout: float = 28
    job_timeout: float = 120


class RequestBoundary:
    """Authenticate before reading, and count actual streamed body bytes."""

    def __init__(self, app: Any, settings: Settings):
        self.app = app
        self.settings = settings

    async def __call__(self, scope: dict, receive: Any, send: Any) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        headers = {key.lower(): value for key, value in scope.get("headers", [])}
        if scope["path"] != "/health":
            cleanup = scope["path"] == "/cleanup"
            token = self.settings.cron_secret if cleanup else self.settings.token
            expected = f"Bearer {token}".encode()
            if len(token) < 24 or not hmac.compare_digest(headers.get(b"authorization", b""), expected):
                await JSONResponse({"detail": "Service authentication required."}, status_code=401)(scope, receive, send)
                return
            owner = headers.get(b"x-lab-owner", b"").decode("ascii", errors="ignore")
            if not cleanup and not re.fullmatch(r"[A-Za-z0-9_-]{16,128}", owner):
                await JSONResponse({"detail": "A valid private owner session is required."}, status_code=400)(scope, receive, send)
                return
        body = bytearray()
        body_started = time.monotonic()
        while True:
            try:
                remaining = 10 - (time.monotonic() - body_started)
                if remaining <= 0:
                    raise asyncio.TimeoutError
                message = await asyncio.wait_for(receive(), timeout=remaining)
            except asyncio.TimeoutError:
                await JSONResponse({"detail": "Request body timed out."}, status_code=408)(scope, receive, send)
                return
            if message["type"] == "http.disconnect":
                return
            body.extend(message.get("body", b""))
            if len(body) > self.settings.max_body_bytes:
                await JSONResponse({"detail": "Request exceeds the 2 MiB body limit."}, status_code=413)(scope, receive, send)
                return
            if not message.get("more_body", False):
                break
        delivered = False

        async def replay() -> dict:
            nonlocal delivered
            if not delivered:
                delivered = True
                return {"type": "http.request", "body": bytes(body), "more_body": False}
            return await receive()

        async def secure_send(message: dict) -> None:
            if message["type"] == "http.response.start":
                message.setdefault("headers", []).extend([
                    (b"cache-control", b"private, no-store"),
                    (b"x-content-type-options", b"nosniff"),
                ])
            await send(message)

        await self.app(scope, replay, secure_send)


@dataclass
class StoredResult:
    owner: str
    data: dict
    size: int
    created: float = field(default_factory=time.monotonic)


@dataclass
class Job:
    id: str
    owner: str
    config: dict
    status: str = "queued"
    progress: float = 0
    stage: str = "Waiting for a worker"
    result_id: str | None = None
    error: str | None = None
    created: float = field(default_factory=time.monotonic)
    cancel: threading.Event = field(default_factory=threading.Event)
    future: Future | None = None


def _json_safe(value: Any) -> Any:
    if hasattr(value, "model_dump"):
        return _json_safe(value.model_dump(mode="json"))
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(v) for v in value]
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if hasattr(value, "tolist"):
        return _json_safe(value.tolist())
    if hasattr(value, "item"):
        return _json_safe(value.item())
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def _column_names(data: dict) -> list[str]:
    columns = data.get("columns", [])
    names = [col if isinstance(col, str) else col["name"] for col in columns]
    return names or list(data.get("rows", [{}])[0] if data.get("rows") else [])


def _csv_cell(value: Any, safe: bool = False, null_value: str = "") -> Any:
    if value is None:
        value = null_value
    if isinstance(value, (dict, list, tuple)):
        value = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    # Formula protection applies only to text. A negative numeric value stays numeric.
    if safe and isinstance(value, str) and value.lstrip().startswith(("=", "+", "-", "@", "\t", "\r")):
        return "'" + value
    return value


def _csv_chunks(data: dict, safe: bool = False, null_value: str = ""):
    names = _column_names(data)
    stream = io.StringIO(newline="")
    writer = csv.writer(stream, lineterminator="\r\n")
    writer.writerow(names)
    yield stream.getvalue().encode("utf-8")
    stream.seek(0)
    stream.truncate(0)
    for index, row in enumerate(data.get("rows", [])):
        writer.writerow([_csv_cell(row.get(name), safe, null_value) for name in names])
        if index % 250 == 249:
            yield stream.getvalue().encode("utf-8")
            stream.seek(0)
            stream.truncate(0)
    if stream.tell():
        yield stream.getvalue().encode("utf-8")


def _json_bytes(value: Any) -> bytes:
    return json.dumps(_json_safe(value), ensure_ascii=False, indent=2, allow_nan=False).encode("utf-8")


def _json_stream(value: Any):
    encoder = json.JSONEncoder(ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    chunks = []
    length = 0
    for fragment in encoder.iterencode(value):
        chunks.append(fragment)
        length += len(fragment)
        if length >= 32_768:
            yield "".join(chunks).encode("utf-8")
            chunks, length = [], 0
    if chunks:
        yield "".join(chunks).encode("utf-8")


class StreamedJSONResponse(StreamingResponse):
    """JSON without a buffered Content-Length; large previews remain streamable."""

    def __init__(self, content: Any, status_code: int = 200, headers: dict | None = None,
                 media_type: str | None = None, background: Any = None):
        super().__init__(_json_stream(content), status_code=status_code, headers=headers,
                         media_type=media_type or "application/json", background=background)


def _bundle(data: dict, safe: bool, include_truth: bool = False, null_value: str = "") -> bytes:
    content = b"".join(_csv_chunks(data, safe, null_value))
    dictionary = io.StringIO(newline="")
    writer = csv.writer(dictionary)
    writer.writerow(["column", "type", "role", "description", "units"])
    column_defs = data.get("columns", [])
    for column in column_defs:
        if isinstance(column, str):
            column = {"name": column}
        writer.writerow([column.get(key, "") for key in ("name", "type", "role", "description", "units")])
    files: dict[str, bytes] = {
        "dataset.csv": content,
        "configuration.json": _json_bytes(data.get("config", {})),
        "effective_configuration.json": _json_bytes(data.get("effective_config", data.get("config", {}))),
        "schema.json": _json_bytes(column_defs),
        "data_dictionary.csv": dictionary.getvalue().encode("utf-8"),
        "validation_report.json": _json_bytes(data.get("validation", [])),
        "summary_statistics.json": _json_bytes(data.get("stats", {})),
    }
    if include_truth and data.get("ground_truth"):
        files["ground_truth/annotations.json"] = _json_bytes(data["ground_truth"])
    table_manifest = {}
    for name, table in data.get("tables", {}).items():
        file_name = re.sub(r"[^a-zA-Z0-9_-]+", "-", name).strip("-")[:60] or "table"
        file_name += "-" + hashlib.sha256(name.encode()).hexdigest()[:8]
        csv_name = f"tables/{file_name}.csv"
        schema_name = f"tables/{file_name}.schema.json"
        files[csv_name] = b"".join(_csv_chunks(table, safe, null_value))
        files[schema_name] = _json_bytes(table.get("columns", []))
        table_manifest[name] = {"csv": csv_name, "schema": schema_name, "row_count": len(table.get("rows", []))}
    # This script is static source. User-selected values are read as JSON data,
    # never interpolated into executable Python (including the null sentinel).
    reproduction = '''"""Reproduce this archive using its matching installed scientific engine."""
import hashlib
import json
from pathlib import Path
import numpy
import scipy
from synthetic_lab import __version__
from synthetic_lab.engine import generate
from synthetic_lab.app import _csv_chunks

folder = Path(__file__).resolve().parent
manifest = json.loads((folder / "generation_manifest.json").read_text(encoding="utf-8"))
expected = manifest.get("engine", {})
actual = {"version": __version__, "numpy": numpy.__version__, "scipy": scipy.__version__}
for name, installed in actual.items():
    required = expected.get(name)
    if not required or required != installed:
        raise SystemExit(
            f"Cannot reproduce: {name} version mismatch. Archive requires {required!r}; "
            f"installed version is {installed!r}. Install the matching engine/dependencies first."
        )

config = json.loads((folder / "configuration.json").read_text(encoding="utf-8"))
policy = manifest.get("csv", {})
result = generate(config, preview=bool(manifest.get("preview", False)))
content = b"".join(_csv_chunks(
    result,
    safe=bool(policy.get("spreadsheet_safe", False)),
    null_value=policy.get("requested_null", policy.get("null", "")),
))
checksum = manifest.get("files", {}).get("dataset.csv", {}).get("sha256")
if not checksum or hashlib.sha256(content).hexdigest() != checksum:
    raise SystemExit(
        "Reproduction checksum does not match dataset.csv. Confirm the configuration, "
        "engine build, dependencies, and supported execution environment."
    )
(folder / "reproduced.csv").write_bytes(content)
print(f"Reproduced {result['row_count']:,} rows with matching CSV checksum.")
'''
    files["reproduce.py"] = reproduction.encode("utf-8")
    manifest = {
        "result_id": data.get("result_id"),
        "config_hash": data.get("config_hash"),
        "created_at": data.get("created_at"),
        "preview": data.get("preview", False),
        "row_count": data.get("row_count", len(data.get("rows", []))),
        "engine": data.get("engine", {"version": data.get("engine_version"), **data.get("provenance", {})}),
        "seed": data.get("config", {}).get("seed"),
        "csv": {"encoding": "UTF-8", "delimiter": ",", "null": _csv_cell(None, safe, null_value), "requested_null": null_value, "null_note": "Empty cells are ambiguous with empty strings" if null_value == "" else "Explicit nonempty sentinel; checked for serialized value collisions", "spreadsheet_safe": safe},
        "ground_truth_included": include_truth and bool(data.get("ground_truth")),
        "tables": table_manifest,
        "warnings": data.get("warnings", []),
        "reproduction": "Requires the same engine/dependency versions. Any empirical/reference observations in the configuration are included; treat the bundle as potentially sensitive.",
        "files": {name: {"sha256": hashlib.sha256(value).hexdigest(), "bytes": len(value)} for name, value in files.items()},
    }
    files["generation_manifest.json"] = _json_bytes(manifest)
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=5) as archive:
        for name, value in files.items():
            archive.writestr(name, value)
    return buffer.getvalue()


class LabStore:
    def __init__(self, settings: Settings, engine: Any):
        self.settings = settings
        self.engine = engine
        self.lock = threading.RLock()
        self.executor = ThreadPoolExecutor(max_workers=settings.workers, thread_name_prefix="synthetic-lab")
        self.jobs: dict[str, Job] = {}
        self.results: dict[str, StoredResult] = {}
        self.idempotency: dict[tuple[str, str], tuple[str, str]] = {}
        self.preview_slots = threading.BoundedSemaphore(settings.workers)
        self.download_slots = threading.BoundedSemaphore(2)
        self.closed = False

    def cleanup(self) -> None:
        now = time.monotonic()
        with self.lock:
            for result_id in list(self.results):
                if now - self.results[result_id].created > self.settings.result_ttl:
                    del self.results[result_id]
            for job_id in list(self.jobs):
                job = self.jobs[job_id]
                if job.status in ("completed", "failed", "cancelled") and now - job.created > self.settings.result_ttl:
                    del self.jobs[job_id]
            self.idempotency = {key: value for key, value in self.idempotency.items() if value[0] in self.jobs}

    def close(self) -> None:
        self.closed = True
        with self.lock:
            for job in self.jobs.values():
                job.cancel.set()
        self.executor.shutdown(wait=False, cancel_futures=True)

    def save_result(self, owner: str, result: dict, config: dict, preview: bool) -> str:
        # Deep copy exactly once: later HTTP requests never mutate completed data.
        data = _json_safe(copy.deepcopy(result))
        result_id = uuid.uuid4().hex
        data["result_id"] = result_id
        data.setdefault("config", config)
        data.setdefault("config_hash", hashlib.sha256(json.dumps(config, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest())
        data["preview"] = preview
        data.setdefault("created_at", datetime.now(timezone.utc).isoformat())
        data.setdefault("row_count", len(data.get("rows", [])))
        size = len(json.dumps(data, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8"))
        if size > min(self.settings.max_store_bytes, self.settings.max_result_bytes):
            raise ValueError("Result exceeds the service serialized-size budget; reduce rows or columns.")
        self.cleanup()
        with self.lock:
            while self.results and (len(self.results) >= self.settings.max_results or sum(value.size for value in self.results.values()) + size > self.settings.max_store_bytes):
                del self.results[next(iter(self.results))]
            self.results[result_id] = StoredResult(owner, data, size)
        return result_id

    def get_result(self, owner: str, result_id: str) -> dict:
        self.cleanup()
        with self.lock:
            result = self.results.get(result_id)
            if result is None or not hmac.compare_digest(result.owner, owner):
                raise HTTPException(404, "Result not found or expired. Generate it again from the saved configuration.")
            return result.data

    @staticmethod
    def public_result(result: dict) -> dict:
        public = {key: value for key, value in result.items() if key not in ("ground_truth", "tables")}
        public["tables"] = {name: {key: value for key, value in table.items() if key != "rows"} for name, table in result.get("tables", {}).items()}
        return public

    def result_page(self, owner: str, result_id: str, offset: int = 0, limit: int = 200, table: str | None = None) -> dict:
        if offset < 0 or limit < 1 or limit > 1000:
            raise HTTPException(422, "Use offset >= 0 and a limit between 1 and 1,000.")
        result = self.get_result(owner, result_id)
        selected = result
        if table:
            selected = result.get("tables", {}).get(table)
            if selected is None:
                raise HTTPException(404, "Secondary table not found in this result.")
        page = self.public_result(result)
        page["rows"] = selected.get("rows", [])[offset:offset + limit]
        if table:
            page["columns"] = selected.get("columns", [])
            page["main_row_count"] = page.get("row_count")
            page["row_count"] = len(selected.get("rows", []))
            page["stats"] = {}
            page["correlation"] = {"columns": [], "matrix": []}
            page["table_name"] = table
        page["offset"] = offset
        page["limit"] = limit
        page["total_rows"] = len(selected.get("rows", []))
        return page

    def job_view(self, owner: str, job_id: str) -> dict:
        self.cleanup()
        with self.lock:
            job = self.jobs.get(job_id)
            if job is None or not hmac.compare_digest(job.owner, owner):
                raise HTTPException(404, "Job not found or expired.")
            view = {"job_id": job.id, "status": job.status, "progress": job.progress, "stage": job.stage, "result_id": job.result_id, "error": job.error}
        if job.result_id:
            try:
                view["result"] = self.result_page(owner, job.result_id)
            except HTTPException:
                view["result_expired"] = True
        return view

    def _run_job(self, job: Job) -> None:
        started = time.monotonic()

        def cancelled() -> bool:
            return self.closed or job.cancel.is_set() or time.monotonic() - started > self.settings.job_timeout

        def progress(value: float, stage: str = "Generating") -> None:
            with self.lock:
                job.progress = min(0.99, max(0, float(value)))
                job.stage = str(stage)[:160]

        try:
            with self.lock:
                job.status = "running"
                job.stage = "Generating dataset"
            if cancelled():
                raise InterruptedError("Generation cancelled.")
            result = self.engine.generate(copy.deepcopy(job.config), preview=False, cancel_check=cancelled, progress=progress)
            if cancelled():
                raise InterruptedError("Generation cancelled or time budget reached.")
            result_id = self.save_result(job.owner, result, job.config, False)
            with self.lock:
                job.result_id = result_id
                job.status = "completed"
                job.progress = 1
                job.stage = "Dataset ready"
        except Exception as error:
            with self.lock:
                expired = time.monotonic() - started > self.settings.job_timeout
                if job.cancel.is_set() or self.closed:
                    job.status, job.stage, job.error = "cancelled", "Cancelled", None
                elif expired:
                    job.status, job.stage, job.error = "failed", "Time limit reached", "Generation exceeded the 120-second time budget; reduce the dataset or model complexity."
                else:
                    job.status, job.stage, job.error = "failed", "Generation failed", str(error)[:500]

    def start_job(self, owner: str, config: dict, key: str | None) -> dict:
        self.cleanup()
        digest = hashlib.sha256(json.dumps(config, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()
        with self.lock:
            if key:
                prior = self.idempotency.get((owner, key))
                if prior:
                    if prior[1] != digest:
                        raise HTTPException(409, "This idempotency key belongs to a different configuration.")
                    return self.job_view(owner, prior[0])
            active = [job for job in self.jobs.values() if job.status in ("queued", "running")]
            if len(active) >= self.settings.max_jobs or sum(job.owner == owner for job in active) >= 2:
                raise HTTPException(429, "Generation workers are busy. Wait for or cancel an active job.")
            job = Job(uuid.uuid4().hex, owner, copy.deepcopy(config))
            self.jobs[job.id] = job
            if key:
                self.idempotency[(owner, key)] = (job.id, digest)
            job.future = self.executor.submit(self._run_job, job)
            return self.job_view(owner, job.id)


def create_app(settings: Settings | None = None, engine: Any = None, hosted_control: Any = None, hosted_blobs: Any = None) -> FastAPI:
    settings = settings or Settings()
    if engine is None:
        from . import engine as scientific_engine
        engine = scientific_engine
    if settings.storage_mode not in ("memory", "blob"):
        raise RuntimeError("SYNTHETIC_DATA_STORAGE_MODE must be memory or blob.")
    hosted = settings.storage_mode == "blob"
    if hosted:
        from .hosted import HostedLabStore
        store = HostedLabStore(settings, engine, hosted_control, hosted_blobs)
    else:
        store = LabStore(settings, engine)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        if len(settings.token) < 24:
            raise RuntimeError("Set SYNTHETIC_DATA_SERVICE_TOKEN to a random value of at least 24 characters.")
        if hosted:
            if len(settings.cron_secret) < 24:
                raise RuntimeError("Hosted mode requires a random CRON_SECRET of at least 24 characters.")
            store.check_configuration()
            try:
                yield
            finally:
                store.close()
            return

        async def clean_expired() -> None:
            while True:
                await asyncio.sleep(30)
                store.cleanup()

        cleaner = asyncio.create_task(clean_expired())
        try:
            yield
        finally:
            cleaner.cancel()
            store.close()

    application = FastAPI(title="Synthetic Data Lab", version="1.0.0", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None,
                          default_response_class=StreamedJSONResponse if hosted else JSONResponse)
    application.state.store = store
    application.add_middleware(RequestBoundary, settings=settings)

    def owner(request: Request) -> str:
        return request.headers["x-lab-owner"]

    async def read_config(request: Request) -> tuple[dict, dict]:
        try:
            payload = await request.json()
        except (ValueError, UnicodeError):
            raise HTTPException(400, "Request must contain valid JSON.")
        if not isinstance(payload, dict):
            raise HTTPException(422, "Expected a configuration object.")
        config = payload.get("config", payload)
        if not isinstance(config, dict):
            raise HTTPException(422, "config must be an object.")
        # Reject JavaScript's nonfinite numeric extensions accepted by Python's JSON parser.
        try:
            json.dumps(config, allow_nan=False)
        except (ValueError, TypeError):
            raise HTTPException(422, "Configuration values must be finite JSON values.")
        rows = config.get("rows", 5000)
        for field_name in ("variables", "columns"):
            if field_name in config and not isinstance(config[field_name], list):
                raise HTTPException(422, f"{field_name} must be an array.")
        columns = max(len(config.get("variables", [])), len(config.get("columns", [])), 1)
        if not isinstance(rows, int) or isinstance(rows, bool) or not 1 <= rows <= settings.max_rows:
            raise HTTPException(422, f"rows must be an integer between 1 and {settings.max_rows:,}.")
        replications = config.get("replications", 1)
        if not isinstance(replications, int) or isinstance(replications, bool) or replications < 1:
            raise HTTPException(422, "replications must be a positive integer.")
        if columns > 100 or rows * columns * replications > settings.max_cells:
            raise HTTPException(422, "Dataset exceeds 100 columns or the 2,000,000-cell generation budget.")
        return config, payload

    def checked(config: dict) -> Any:
        try:
            result = engine.validate_config(config)
        except Exception as error:
            raise HTTPException(422, str(error)[:1000])
        if isinstance(result, dict) and result.get("valid") is False:
            raise HTTPException(422, result)
        return result

    @application.get("/health")
    def health() -> dict:
        return {"status": "ok", "service": "synthetic-data-lab", "version": "1.0.0"}

    @application.get("/cleanup")
    @application.post("/cleanup")
    def cleanup() -> dict:
        if not hosted:
            raise HTTPException(404, "Hosted cleanup is unavailable in local mode.")
        return store.cleanup(limit=500)

    @application.get("/capabilities")
    def capabilities() -> dict:
        result = _json_safe(engine.capabilities())
        result["execution_mode"] = "request_bound" if hosted else "background"
        result["cancellation_mode"] = "request_abort" if hosted else "job_cancel"
        engine_limits = result.get("limits", {})
        result["limits"] = {
            **engine_limits,
            "rows": min(engine_limits.get("rows", settings.max_rows), settings.max_rows),
            "preview_rows": min(engine_limits.get("preview_rows", settings.preview_rows), settings.preview_rows),
            "cells": settings.max_cells,
            "result_retention_seconds": settings.result_ttl,
            "serialized_result_bytes": settings.max_result_bytes,
            "serialized_store_bytes": settings.max_store_bytes,
            "download_bytes": settings.max_download_bytes,
            "workers": settings.workers,
            "active_jobs_per_owner": 2,
            "job_time_seconds": settings.job_timeout,
            "preview_time_seconds": min(settings.preview_timeout, 20) if hosted else settings.preview_timeout,
        }
        return result

    @application.post("/validate")
    async def validate(request: Request) -> dict:
        try:
            config, _ = await read_config(request)
            result = _json_safe(engine.validate_config(config))
            if isinstance(result, dict) and "valid" in result:
                return result
            return {"valid": True, "errors": [], "warnings": []}
        except HTTPException as error:
            return {"valid": False, "errors": [{"path": "config", "message": str(error.detail)}], "warnings": []}
        except Exception as error:
            return {"valid": False, "errors": [{"path": "config", "message": str(error)[:1000]}], "warnings": []}

    @application.post("/preview")
    async def preview(request: Request) -> dict:
        config, _ = await read_config(request)
        checked(config)
        if hosted:
            return StreamedJSONResponse(await store.run_request(request, owner(request), config, None, True))
        if not store.preview_slots.acquire(blocking=False):
            raise HTTPException(429, "Preview workers are busy. Retry after the current preview finishes.")
        cancel = threading.Event()
        started = time.monotonic()

        def work() -> dict:
            try:
                result = engine.generate(config, preview=True, cancel_check=lambda: cancel.is_set() or time.monotonic() - started > settings.preview_timeout, progress=None)
                if cancel.is_set():
                    raise InterruptedError("Preview was superseded or cancelled.")
                result_id = store.save_result(owner(request), result, config, True)
                # Preview charts may need all of its bounded 5k rows; full jobs use pages.
                return store.public_result(store.get_result(owner(request), result_id))
            finally:
                store.preview_slots.release()

        future = store.executor.submit(work)

        async def disconnect_watch() -> None:
            while not future.done():
                if await request.is_disconnected():
                    cancel.set()
                    return
                await asyncio.sleep(0.2)

        watcher = asyncio.create_task(disconnect_watch())
        try:
            return await asyncio.wait_for(asyncio.wrap_future(future), timeout=settings.preview_timeout)
        except asyncio.TimeoutError:
            cancel.set()
            raise HTTPException(504, "Preview exceeded its time budget. Reduce model complexity.")
        except asyncio.CancelledError:
            cancel.set()
            raise
        except Exception as error:
            raise HTTPException(422, str(error)[:1000])
        finally:
            watcher.cancel()

    @application.post("/jobs")
    async def start_job(request: Request) -> dict:
        config, payload = await read_config(request)
        checked(config)
        key = payload.get("idempotency_key") or request.headers.get("idempotency-key")
        if key is not None and (not isinstance(key, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", key)):
            raise HTTPException(422, "idempotency_key must contain 1-128 letters, numbers, underscores, or hyphens.")
        if hosted:
            return StreamedJSONResponse(await store.run_request(request, owner(request), config, key, False))
        return store.start_job(owner(request), config, key)

    @application.get("/jobs/{job_id}")
    def job_status(job_id: str, request: Request) -> dict:
        view = store.job_view(owner(request), job_id)
        return StreamedJSONResponse(view) if hosted else view

    @application.post("/jobs/{job_id}/cancel")
    @application.delete("/jobs/{job_id}")
    def cancel_job(job_id: str, request: Request) -> dict:
        view = store.job_view(owner(request), job_id)
        if hosted:
            if view["status"] == "running":
                raise HTTPException(409, "This deployment generates inside the original request. Stop that request to cancel it.")
            return StreamedJSONResponse(view)
        with store.lock:
            job = store.jobs[job_id]
            if job.status in ("queued", "running"):
                job.cancel.set()
                if job.future and job.future.cancel():
                    job.status, job.stage = "cancelled", "Cancelled"
                else:
                    job.stage = "Cancelling"
        return store.job_view(owner(request), job_id)

    @application.get("/results/{result_id}")
    @application.get("/results/{result_id}/rows")
    def result_rows(result_id: str, request: Request, offset: int = 0, limit: int = 200, table: str | None = None) -> dict:
        page = store.result_page(owner(request), result_id, offset, limit, table)
        return StreamedJSONResponse(page) if hosted else page

    @application.get("/results/{result_id}/download")
    def download(result_id: str, request: Request, format: str = "csv", safe: bool = False, spreadsheet_safe: bool = False, truth: bool = False, null_value: str = "", table: str | None = None) -> Response:
        lease = store.acquire_download(owner(request)) if hosted else None
        try:
            response = download_response(result_id, request, format, safe, spreadsheet_safe, truth, null_value, table)
        except Exception:
            if lease:
                store.release_download(owner(request), lease)
            raise
        if lease:
            original = response.body_iterator

            async def shared_download_stream():
                try:
                    async for chunk in original:
                        yield chunk
                finally:
                    await asyncio.to_thread(store.release_download, owner(request), lease)

            response.body_iterator = shared_download_stream()
        return response

    def download_response(result_id: str, request: Request, format: str, safe: bool, spreadsheet_safe: bool, truth: bool, null_value: str, table: str | None) -> Response:
        data = store.get_result(owner(request), result_id)
        if format not in ("csv", "zip"):
            raise HTTPException(422, "format must be csv or zip.")
        selected = data
        if table:
            selected = data.get("tables", {}).get(table)
            if selected is None:
                raise HTTPException(404, "Secondary table not found in this result.")
            if format == "zip":
                raise HTTPException(422, "ZIP exports include every table; omit the table parameter.")
        if len(null_value) > 32 or any(char in null_value for char in "\r\n\x00"):
            raise HTTPException(422, "Null sentinel must contain at most 32 characters without line breaks or NUL.")
        if null_value:
            datasets = [selected] + (list(data.get("tables", {}).values()) if format == "zip" else [])
            emitted_null = _csv_cell(None, safe or spreadsheet_safe, null_value)
            if any(value is not None and str(_csv_cell(value, safe or spreadsheet_safe, null_value)) == str(emitted_null) for dataset in datasets for row in dataset.get("rows", []) for value in row.values()):
                raise HTTPException(422, "Null sentinel collides with an existing string value. Choose a different sentinel.")
        if not store.download_slots.acquire(blocking=False):
            raise HTTPException(429, "Download workers are busy. Retry after another download finishes.")
        safe = safe or spreadsheet_safe
        base = re.sub(r"[^a-zA-Z0-9_-]+", "-", str(data.get("config", {}).get("name", "synthetic-data")))[:64].strip("-") or "synthetic-data"
        base += "-preview" if data.get("preview") else "-full"
        if table:
            base += "-" + (re.sub(r"[^a-zA-Z0-9_-]+", "-", table)[:40] or "table")
        if format == "csv":
            # Preflight byte count without retaining another copy. An oversize
            # download fails before response headers or a partial CSV is sent.
            size = sum(len(chunk) for chunk in _csv_chunks(selected, safe, null_value))
            if size > store.settings.max_download_bytes:
                store.download_slots.release()
                raise HTTPException(413, "CSV exceeds the 64 MiB download budget; reduce the dataset or use a compressed ZIP export.")
            def csv_stream():
                try:
                    yield from _csv_chunks(selected, safe, null_value)
                finally:
                    store.download_slots.release()
            return StreamingResponse(csv_stream(), media_type="text/csv; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="{base}.csv"'})
        try:
            archive = _bundle(data, safe, truth, null_value)
            if len(archive) > store.settings.max_download_bytes:
                raise HTTPException(413, "ZIP exceeds the 64 MiB download budget; reduce the dataset or omit optional ground truth.")
        except Exception:
            store.download_slots.release()
            raise

        def archive_stream():
            try:
                for offset in range(0, len(archive), 1024 * 1024):
                    yield archive[offset:offset + 1024 * 1024]
            finally:
                store.download_slots.release()

        return StreamingResponse(archive_stream(), media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="{base}.zip"'})

    return application


app = create_app()
