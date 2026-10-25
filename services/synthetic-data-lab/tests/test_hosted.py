from __future__ import annotations

import asyncio
import copy
import csv
import io
import json
import threading
import time
import zipfile
from concurrent.futures import ThreadPoolExecutor
from contextlib import ExitStack

import fakeredis
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from synthetic_lab.app import Settings, create_app
from synthetic_lab.hosted import PREFIX, HostedLabStore, PrivateBlob, RedisControl, owner_digest
from test_service import FakeEngine, OWNER, OTHER, TOKEN

CRON = "test-only-cron-secret-with-more-than-24-characters"


class FakeBlobs:
    def __init__(self):
        self.objects = {}
        self.deleted = []
        self.reads = 0
        self.fail_put = False
        self.lock = threading.Lock()

    def check_configuration(self):
        pass

    def put(self, path, body):
        if self.fail_put:
            raise OSError("injected private storage failure")
        with self.lock:
            assert path not in self.objects, "snapshot writes must be immutable"
            self.objects[path] = body

    def get(self, path, max_bytes):
        self.reads += 1
        return self.objects[path]

    def delete(self, paths):
        for path in paths:
            self.deleted.append(path)
            self.objects.pop(path, None)


def shared_backends():
    redis = fakeredis.FakeStrictRedis(decode_responses=True)
    control = RedisControl(command=redis.execute_command)
    return redis, control, FakeBlobs()


def settings(**kwargs):
    return Settings(token=TOKEN, storage_mode="blob", cron_secret=CRON, **kwargs)


def client(stack, configuration, engine, control, blobs, owner=OWNER):
    app = create_app(configuration, engine, control, blobs)
    result = stack.enter_context(TestClient(app))
    result.headers.update({"Authorization": f"Bearer {TOKEN}", "X-Lab-Owner": owner})
    return result, app


def test_hosted_complete_before_response_and_survive_another_instance():
    redis, control, blobs = shared_backends()
    first_engine, second_engine = FakeEngine(), FakeEngine()
    with ExitStack() as stack:
        first, app = client(stack, settings(), first_engine, control, blobs)
        second, _ = client(stack, settings(), second_engine, control, blobs)
        response = first.post("/jobs", json={"config": {"rows": 10, "tables": True}, "idempotency_key": "cross-instance"})
        assert response.status_code == 200, response.text
        assert "content-length" not in response.headers
        job = response.json()
        assert job["status"] == "completed"
        assert job["execution_mode"] == "request_bound"
        assert job["result"]["preview"] is False
        assert not app.state.store.jobs and not app.state.store.results
        assert redis.zcard(PREFIX + "active:generation") == 0
        result_id = job["result_id"]
        cold = second.get(f"/jobs/{job['job_id']}")
        assert cold.status_code == 200, cold.text
        assert cold.json()["result"]["rows"] == job["result"]["rows"]
        assert second.get(f"/results/{result_id}?table=child_records").json()["total_rows"] == 3
        download = second.get(f"/results/{result_id}/download")
        assert download.status_code == 200, download.text
        rows = list(csv.DictReader(io.StringIO(download.text)))
        assert rows[0]["text"] == job["result"]["rows"][0]["text"]
        zipped = second.get(f"/results/{result_id}/download?format=zip")
        with zipfile.ZipFile(io.BytesIO(zipped.content)) as archive:
            assert archive.read("dataset.csv") == download.content
        assert second_engine.calls == 0
        assert redis.zcard(PREFIX + "active:download") == 0


def test_owner_config_bound_idempotency_across_instances_and_key_order():
    _, control, blobs = shared_backends()
    engine = FakeEngine()
    with ExitStack() as stack:
        first, _ = client(stack, settings(), engine, control, blobs)
        second, _ = client(stack, settings(), FakeEngine(), control, blobs)
        a = first.post("/jobs", json={"config": {"rows": 10, "seed": 42}, "idempotency_key": "same"}).json()
        b = second.post("/jobs", json={"config": {"seed": 42, "rows": 10}, "idempotency_key": "same"})
        assert b.status_code == 200, b.text
        assert a["job_id"] == b.json()["job_id"]
        assert engine.calls == 1
        assert second.post("/jobs", json={"config": {"rows": 11}, "idempotency_key": "same"}).status_code == 409
        for route in (f"/jobs/{a['job_id']}", f"/results/{a['result_id']}", f"/results/{a['result_id']}/download"):
            assert second.get(route, headers={"X-Lab-Owner": OTHER}).status_code == 404
        assert second.post(f"/jobs/{a['job_id']}/cancel", headers={"X-Lab-Owner": OTHER}).status_code == 404


def test_atomic_lua_idempotency_and_shared_global_admission():
    redis, control, blobs = shared_backends()
    a = HostedLabStore(settings(), FakeEngine(), control, blobs)
    b = HostedLabStore(settings(), FakeEngine(), control, blobs)
    try:
        with ThreadPoolExecutor(max_workers=8) as pool:
            attempts = list(pool.map(lambda _: a._admit(OWNER, {"rows": 10}, "simultaneous"), range(8)))
        assert sum(fresh for _, fresh in attempts) == 1
        assert len({job["job_id"] for job, _ in attempts}) == 1
        second, fresh = b._admit(OTHER, {"rows": 10}, None)
        assert fresh
        with pytest.raises(HTTPException) as error:
            a._admit("third_owner_0123456789", {"rows": 10}, None)
        assert error.value.status_code == 429
        # Simulate abandoned invocations. Server-time leases recover atomically.
        redis.zadd(PREFIX + "active:generation", {job["job_id"]: 1 for job, _ in attempts})
        redis.zadd(PREFIX + "active:generation", {second["job_id"]: 1})
        third, fresh = a._admit("third_owner_0123456789", {"rows": 10}, None)
        assert fresh
        a._release("third_owner_0123456789", third["job_id"])
    finally:
        a.close()
        b.close()


def test_shared_rate_limit_and_retained_result_quota():
    redis, control, blobs = shared_backends()
    a = HostedLabStore(settings(), FakeEngine(), control, blobs)
    try:
        for _ in range(12):
            job, _ = a._admit(OWNER, {}, None)
            a._release(OWNER, job["job_id"])
        with pytest.raises(HTTPException) as error:
            a._admit(OWNER, {}, None)
        assert error.value.status_code == 429
    finally:
        a.close()
    redis.flushall()
    with ExitStack() as stack:
        first, _ = client(stack, settings(max_results=1), FakeEngine(), control, blobs)
        second, _ = client(stack, settings(max_results=1), FakeEngine(), control, blobs)
        result = first.post("/preview", json={"config": {"rows": 10}}).json()
        replacement = second.post("/preview", json={"config": {"rows": 10}})
        assert replacement.status_code == 200, replacement.text
        assert second.get(f"/results/{result['result_id']}").status_code == 404
        assert second.get(f"/results/{replacement.json()['result_id']}").status_code == 200
        assert redis.zcard(PREFIX + "retained:expiry") == 1
        # Eviction revokes access immediately; private bytes await bounded cleanup.
        assert len(blobs.objects) == 2


def test_preview_rate_budget_is_separate_with_shared_cpu_leases():
    _, control, blobs = shared_backends()
    store = HostedLabStore(settings(), FakeEngine(), control, blobs)
    try:
        for _ in range(20):
            job, _ = store._admit(OWNER, {}, None, rate_kind="preview")
            store._release(OWNER, job["job_id"])
        full, _ = store._admit(OWNER, {}, None)
        preview, _ = store._admit(OTHER, {}, None, rate_kind="preview")
        with pytest.raises(HTTPException) as error:
            store._admit("third_owner_0123456789", {}, None, rate_kind="preview")
        assert error.value.status_code == 429
        assert error.value.headers["Retry-After"] == "5"
        store._release(OWNER, full["job_id"])
        store._release(OTHER, preview["job_id"])
    finally:
        store.close()


def test_expiry_denies_reads_and_authenticated_bounded_cleanup_removes_bytes():
    redis, control, blobs = shared_backends()
    with ExitStack() as stack:
        first, _ = client(stack, settings(result_ttl=0.05), FakeEngine(), control, blobs)
        second, _ = client(stack, settings(result_ttl=0.05), FakeEngine(), control, blobs)
        result = first.post("/preview", json={"config": {"rows": 10}}).json()
        assert len(blobs.objects) == 1
        time.sleep(1.05)  # Includes the integer-second physical-cleanup grace.
        assert second.get(f"/results/{result['result_id']}").status_code == 404
        assert second.get("/cleanup").status_code == 401  # Service token cannot clean.
        response = second.get("/cleanup", headers={"Authorization": f"Bearer {CRON}", "X-Lab-Owner": ""})
        assert response.status_code == 200, response.text
        assert response.json()["deleted"] == 1
        assert not blobs.objects
        assert redis.zcard(PREFIX + "cleanup") == 0


def test_failed_upload_keeps_cleanup_index_and_does_not_publish_result():
    redis, control, blobs = shared_backends()
    blobs.fail_put = True
    with ExitStack() as stack:
        first, _ = client(stack, settings(), FakeEngine(), control, blobs)
        response = first.post("/jobs", json={"config": {"rows": 10}, "idempotency_key": "failure"})
        assert response.status_code == 422
        assert not list(redis.scan_iter(PREFIX + "result:*"))
        assert redis.zcard(PREFIX + "cleanup") == 1
        assert redis.zcard(PREFIX + "retained:expiry") == 0
        assert redis.zcard(PREFIX + "active:generation") == 0


def test_hosted_disconnect_cooperates_and_waits_for_worker_before_return():
    redis, control, blobs = shared_backends()
    engine = FakeEngine()
    store = HostedLabStore(settings(), engine, control, blobs)

    class Disconnect:
        async def is_disconnected(self):
            return engine.started.is_set()

    try:
        with pytest.raises(HTTPException) as error:
            asyncio.run(store.run_request(Disconnect(), OWNER, {"rows": 10, "slow": True}, "disconnect", False))
        assert error.value.status_code == 499
        assert not blobs.objects
        assert not list(redis.scan_iter(PREFIX + "result:*"))
        assert redis.zcard(PREFIX + "active:generation") == 0
        job = json.loads(redis.get(next(redis.scan_iter(PREFIX + "job:*"))))
        assert job["status"] == "cancelled"
    finally:
        store.close()


def test_hosted_time_budget_and_false_background_cancellation_rejected():
    _, control, blobs = shared_backends()
    with ExitStack() as stack:
        first, app = client(stack, settings(job_timeout=0.02), FakeEngine(), control, blobs)
        response = first.post("/jobs", json={"config": {"rows": 10, "slow": True}})
        assert response.status_code == 504
        assert not blobs.objects
        job, _ = app.state.store._admit(OWNER, {}, "pending")
        cancel = first.post(f"/jobs/{job['job_id']}/cancel")
        assert cancel.status_code == 409
        assert "original request" in cancel.json()["detail"]
        limits = first.get("/capabilities").json()
        assert limits["execution_mode"] == "request_bound"
        assert limits["cancellation_mode"] == "request_abort"


def test_large_preview_json_and_csv_are_streaming_and_exact():
    class LargeEngine(FakeEngine):
        def generate(self, config, **kwargs):
            rows = [{"value": "বাংলা" * 100 + "-" + str(i)} for i in range(5000)]
            return {"rows": rows, "columns": [{"name": "value", "type": "text"}], "stats": {}, "warnings": []}

    _, control, blobs = shared_backends()
    with ExitStack() as stack:
        first, _ = client(stack, settings(), LargeEngine(), control, blobs)
        response = first.post("/preview", json={"config": {"rows": 5000}})
        assert response.status_code == 200, response.text[:1000]
        assert len(response.content) > 4_500_000
        assert "content-length" not in response.headers
        result = response.json()
        download = first.get(f"/results/{result['result_id']}/download")
        assert download.status_code == 200
        assert len(download.content) > 4_500_000
        assert "content-length" not in download.headers
        rows = list(csv.DictReader(io.StringIO(download.text)))
        assert rows[-1]["value"] == result["rows"][-1]["value"]


def test_hosted_configuration_fails_closed_and_accepts_vercel_kv_aliases(monkeypatch):
    for name in ("UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN"):
        monkeypatch.delenv(name, raising=False)
    with pytest.raises(RuntimeError):
        RedisControl().check_configuration()
    monkeypatch.setenv("KV_REST_API_URL", "https://example.upstash.io")
    monkeypatch.setenv("KV_REST_API_TOKEN", "test-token")
    RedisControl().check_configuration()
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.delenv("SYNTHETIC_DATA_STORAGE_MODE", raising=False)
    assert Settings().storage_mode == "blob"
    for name in ("BLOB_READ_WRITE_TOKEN", "VERCEL_BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID", "VERCEL_OIDC_TOKEN"):
        monkeypatch.delenv(name, raising=False)
    with pytest.raises(RuntimeError):
        PrivateBlob().check_configuration()

