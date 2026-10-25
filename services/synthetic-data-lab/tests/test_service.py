from __future__ import annotations

import csv
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import threading
import time
import zipfile

import pytest
from fastapi.testclient import TestClient

from synthetic_lab.app import Settings, create_app


TOKEN = "test-only-token-with-more-than-24-characters"
OWNER = "test_owner_0123456789"
OTHER = "other_owner_0123456789"


class FakeEngine:
    """Known deterministic rows test transport/export independently of sampling."""

    def __init__(self):
        self.calls = 0
        self.started = threading.Event()

    def capabilities(self):
        return {"distributions": [], "modules": []}

    def validate_config(self, config):
        if config.get("invalid"):
            return {"valid": False, "errors": [{"path": "variables.0", "message": "Bad distribution"}], "warnings": []}
        return {"valid": True, "errors": [], "warnings": []}

    def generate(self, config, preview=False, cancel_check=None, progress=None):
        self.calls += 1
        self.started.set()
        if config.get("slow"):
            while not cancel_check():
                if progress:
                    progress(0.25, "Test stage")
                time.sleep(0.005)
            raise RuntimeError("Generation cancelled")
        rows = [
            {"text": 'Bengali বাংলা, "quoted"\nnext', "numeric": -2.5, "nullable": None},
            {"text": "=SUM(A1:A2)", "numeric": 0, "nullable": "present"},
        ]
        tables = {"child_records": {"columns": [{"name": "parent_id", "type": "integer"}, {"name": "value", "type": "numeric"}], "rows": [{"parent_id": 1, "value": 20}, {"parent_id": 1, "value": 30}, {"parent_id": 2, "value": 40}], "row_count": 3}} if config.get("tables") else {}
        return {"rows": rows, "columns": [{"name": "text", "type": "text"}, {"name": "numeric", "type": "numeric"}, {"name": "nullable", "type": "text"}], "tables": tables, "stats": {"numeric": {"mean": -1.25}}, "validation": [], "warnings": [], "engine": {"version": "test"}}


@pytest.fixture
def setup():
    engine = FakeEngine()
    app = create_app(Settings(token=TOKEN, result_ttl=60), engine)
    with TestClient(app) as client:
        client.headers.update({"Authorization": f"Bearer {TOKEN}", "X-Lab-Owner": OWNER})
        yield client, engine


def wait_for_job(client, job_id):
    deadline = time.monotonic() + 2
    while time.monotonic() < deadline:
        job = client.get(f"/jobs/{job_id}").json()
        if job["status"] not in ("queued", "running"):
            return job
        time.sleep(0.005)
    raise AssertionError("Job did not complete")


def test_requires_service_auth_and_owner(setup):
    client, _ = setup
    assert client.get("/health", headers={"Authorization": ""}).status_code == 200
    assert client.get("/capabilities", headers={"Authorization": ""}).status_code == 401
    assert client.get("/capabilities", headers={"X-Lab-Owner": ""}).status_code == 400


def test_preview_csv_is_exact_immutable_and_round_trips(setup):
    client, engine = setup
    result = client.post("/preview", json={"config": {"rows": 10, "seed": 42, "name": "Dataset"}}).json()
    assert result["preview"] is True
    result_id = result["result_id"]
    first = client.get(f"/results/{result_id}/download?format=csv")
    second = client.get(f"/results/{result_id}/download?format=csv")
    assert first.content == second.content
    assert engine.calls == 1
    reader = list(csv.DictReader(io.StringIO(first.content.decode("utf-8"), newline="")))
    assert reader[0]["text"] == result["rows"][0]["text"]
    assert reader[0]["numeric"] == "-2.5"
    assert reader[0]["nullable"] == ""
    assert reader[1]["text"] == "=SUM(A1:A2)"
    safe = client.get(f"/results/{result_id}/download?format=csv&safe=true")
    safe_rows = list(csv.DictReader(io.StringIO(safe.content.decode("utf-8"))))
    assert safe_rows[1]["text"] == "'=SUM(A1:A2)"
    assert safe_rows[0]["numeric"] == "-2.5"


def test_zip_has_provenance_and_exact_csv(setup):
    client, _ = setup
    result = client.post("/preview", json={"config": {"rows": 10, "seed": 42}}).json()
    response = client.get(f"/results/{result['result_id']}/download?format=zip")
    assert response.status_code == 200
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        assert {"dataset.csv", "configuration.json", "schema.json", "validation_report.json", "generation_manifest.json", "reproduce.py"}.issubset(archive.namelist())
        manifest = json.loads(archive.read("generation_manifest.json"))
        assert manifest["result_id"] == result["result_id"]
        assert manifest["files"]["dataset.csv"]["sha256"]
        assert archive.read("dataset.csv") == client.get(f"/results/{result['result_id']}/download?format=csv").content


def test_owner_isolation_and_result_paging(setup):
    client, _ = setup
    result = client.post("/preview", json={"config": {"rows": 10}}).json()
    result_id = result["result_id"]
    page = client.get(f"/results/{result_id}?offset=1&limit=1").json()
    assert len(page["rows"]) == 1
    assert page["total_rows"] == 2
    assert page["offset"] == 1
    assert client.get(f"/results/{result_id}?limit=1001").status_code == 422
    assert client.get(f"/results/{result_id}", headers={"X-Lab-Owner": OTHER}).status_code == 404
    assert client.get(f"/results/{result_id}/download", headers={"X-Lab-Owner": OTHER}).status_code == 404


def test_job_idempotency_is_owner_scoped_and_config_bound(setup):
    client, engine = setup
    body = {"config": {"rows": 10}, "idempotency_key": "known-key"}
    job = client.post("/jobs", json=body).json()
    complete = wait_for_job(client, job["job_id"])
    assert complete["status"] == "completed"
    assert complete["result"]["preview"] is False
    again = client.post("/jobs", json=body).json()
    assert again["job_id"] == job["job_id"]
    assert engine.calls == 1
    assert client.post("/jobs", json={"config": {"rows": 11}, "idempotency_key": "known-key"}).status_code == 409
    assert client.get(f"/jobs/{job['job_id']}", headers={"X-Lab-Owner": OTHER}).status_code == 404
    assert client.post(f"/jobs/{job['job_id']}/cancel", headers={"X-Lab-Owner": OTHER}).status_code == 404


def test_cancellation_and_busy_limit(setup):
    client, engine = setup
    first = client.post("/jobs", json={"config": {"rows": 10, "slow": True}}).json()
    assert engine.started.wait(1)
    second = client.post("/jobs", json={"config": {"rows": 10, "slow": True}}).json()
    assert client.post("/jobs", json={"config": {"rows": 10}}).status_code == 429
    client.post(f"/jobs/{first['job_id']}/cancel")
    assert wait_for_job(client, first["job_id"])["status"] == "cancelled"
    client.post(f"/jobs/{second['job_id']}/cancel")
    assert wait_for_job(client, second["job_id"])["status"] == "cancelled"


def test_validation_and_bad_json_contract(setup):
    client, _ = setup
    invalid = client.post("/validate", json={"config": {"rows": 10, "invalid": True}}).json()
    assert invalid["valid"] is False
    assert invalid["errors"][0]["path"] == "variables.0"
    assert client.post("/preview", json={"config": {"rows": 10, "invalid": True}}).status_code == 422
    assert client.post("/preview", json={"config": {"rows": 100_001}}).status_code == 422
    assert client.post("/preview", json={"config": {"variables": 3}}).status_code == 422
    assert client.post("/preview", content="{invalid", headers={"Content-Type": "application/json"}).status_code == 400


def test_real_streamed_body_limit_and_expiry():
    engine = FakeEngine()
    app = create_app(Settings(token=TOKEN, max_body_bytes=32, result_ttl=0.01), engine)
    with TestClient(app) as client:
        client.headers.update({"Authorization": f"Bearer {TOKEN}", "X-Lab-Owner": OWNER})
        assert client.post("/preview", content=iter([b"{", b" " * 20, b" " * 20, b"}"])).status_code == 413
        response = client.post("/preview", json={"config": {"rows": 1}})
        assert response.status_code == 200
        result_id = response.json()["result_id"]
        time.sleep(0.02)
        assert client.get(f"/results/{result_id}").status_code == 404


def test_real_engine_preview_to_csv_bundle_and_optional_truth():
    config = {"version": 1, "name": "Transport integration", "rows": 64, "seed": 7,
              "variables": [{"id": "x", "name": "measurement", "kind": "numeric", "role": "feature", "distribution": "normal", "parameters": {"mean": 3, "std": 2}, "decimals": 6}]}
    app = create_app(Settings(token=TOKEN))
    with TestClient(app) as client:
        client.headers.update({"Authorization": f"Bearer {TOKEN}", "X-Lab-Owner": OWNER})
        assert client.post("/validate", json={"config": config}).json()["valid"] is True
        response = client.post("/preview", json={"config": config})
        assert response.status_code == 200, response.text
        result = response.json()
        assert result["row_count"] == 64
        assert "ground_truth" not in result
        csv_data = client.get(f"/results/{result['result_id']}/download").content
        rows = list(csv.DictReader(io.StringIO(csv_data.decode("utf-8"))))
        assert len(rows) == 64
        assert float(rows[0]["measurement"]) == result["rows"][0]["measurement"]
        for include_truth in (False, True):
            zipped = client.get(f"/results/{result['result_id']}/download?format=zip&truth={str(include_truth).lower()}")
            with zipfile.ZipFile(io.BytesIO(zipped.content)) as archive:
                assert ("ground_truth/annotations.json" in archive.namelist()) is include_truth
                manifest = json.loads(archive.read("generation_manifest.json"))
                assert manifest["engine"]["scipy"]
                assert manifest["ground_truth_included"] is include_truth


def test_secondary_table_metadata_paging_csv_and_zip(setup):
    client, _ = setup
    result = client.post("/preview", json={"config": {"rows": 10, "tables": True}}).json()
    result_id = result["result_id"]
    assert result["tables"]["child_records"]["row_count"] == 3
    assert "rows" not in result["tables"]["child_records"]
    page = client.get(f"/results/{result_id}?table=child_records&offset=1&limit=1").json()
    assert page["rows"] == [{"parent_id": 1, "value": 30}]
    assert page["total_rows"] == 3
    assert page["stats"] == {}
    assert page["main_row_count"] == 2
    assert client.get(f"/results/{result_id}?table=unknown").status_code == 404
    csv_rows = list(csv.DictReader(io.StringIO(client.get(f"/results/{result_id}/download?table=child_records").text)))
    assert len(csv_rows) == 3
    zipped = client.get(f"/results/{result_id}/download?format=zip")
    with zipfile.ZipFile(io.BytesIO(zipped.content)) as archive:
        manifest = json.loads(archive.read("generation_manifest.json"))
        file_name = manifest["tables"]["child_records"]["csv"]
        assert manifest["tables"]["child_records"]["row_count"] == 3
        assert len(list(csv.DictReader(io.StringIO(archive.read(file_name).decode())))) == 3


def test_explicit_null_sentinel_and_collision_rejection(setup):
    client, _ = setup
    result = client.post("/preview", json={"config": {"rows": 10}}).json()
    result_id = result["result_id"]
    response = client.get(f"/results/{result_id}/download", params={"null_value": "\\N"})
    rows = list(csv.DictReader(io.StringIO(response.text)))
    assert rows[0]["nullable"] == "\\N"
    assert rows[1]["nullable"] == "present"
    assert client.get(f"/results/{result_id}/download", params={"null_value": "present"}).status_code == 422
    assert client.get(f"/results/{result_id}/download", params={"null_value": "\n"}).status_code == 422


def test_preview_time_budget_cancels_cooperatively():
    engine = FakeEngine()
    app = create_app(Settings(token=TOKEN, preview_timeout=0.02), engine)
    with TestClient(app) as client:
        client.headers.update({"Authorization": f"Bearer {TOKEN}", "X-Lab-Owner": OWNER})
        response = client.post("/preview", json={"config": {"rows": 10, "slow": True}})
        assert response.status_code == 504
        assert "time budget" in response.json()["detail"]


def test_single_result_memory_budget_fails_without_storing():
    app = create_app(Settings(token=TOKEN, max_result_bytes=20), FakeEngine())
    with TestClient(app) as client:
        client.headers.update({"Authorization": f"Bearer {TOKEN}", "X-Lab-Owner": OWNER})
        response = client.post("/preview", json={"config": {"rows": 10}})
        assert response.status_code == 422
        assert "serialized-size budget" in response.json()["detail"]
        assert not app.state.store.results


def test_effective_capabilities_and_download_limit():
    app = create_app(Settings(token=TOKEN, max_download_bytes=20), FakeEngine())
    with TestClient(app) as client:
        client.headers.update({"Authorization": f"Bearer {TOKEN}", "X-Lab-Owner": OWNER})
        limits = client.get("/capabilities").json()["limits"]
        assert limits["serialized_result_bytes"] == 128 * 1024 * 1024
        assert limits["serialized_store_bytes"] == 256 * 1024 * 1024
        assert limits["download_bytes"] == 20
        result = client.post("/preview", json={"config": {"rows": 10}}).json()
        for format in ("csv", "zip"):
            assert client.get(f"/results/{result['result_id']}/download?format={format}").status_code == 413


def test_real_relational_engine_to_secondary_csv_bundle():
    config = {"version": 1, "name": "Relational integration", "rows": 100, "seed": 9,
              "variables": [{"id": "x", "name": "x", "kind": "numeric", "distribution": "normal", "parameters": {"mean": 0, "std": 1}}],
              "domain": {"type": "relational", "parameters": {"mean_children": 3, "parent_coefficient": 2, "child_noise": 1, "driver": "x"}}}
    app = create_app(Settings(token=TOKEN))
    with TestClient(app) as client:
        client.headers.update({"Authorization": f"Bearer {TOKEN}", "X-Lab-Owner": OWNER})
        response = client.post("/preview", json={"config": config})
        assert response.status_code == 200, response.text
        result = response.json()
        assert "children" in result["tables"]
        assert "rows" not in result["tables"]["children"]
        parent_ids = {row["parent_id"] for row in result["rows"]}
        page = client.get(f"/results/{result['result_id']}?table=children&limit=1000").json()
        assert len(page["rows"]) == result["tables"]["children"]["row_count"]
        assert {row["parent_id"] for row in page["rows"]} <= parent_ids
        zipped = client.get(f"/results/{result['result_id']}/download?format=zip")
        with zipfile.ZipFile(io.BytesIO(zipped.content)) as archive:
            manifest = json.loads(archive.read("generation_manifest.json"))
            assert manifest["tables"]["children"]["row_count"] == len(page["rows"])


def test_exported_reproduction_preserves_csv_policy_and_checks_versions(tmp_path):
    config = {"version": 1, "name": "Reproduction policy", "rows": 40, "seed": 91,
              "variables": [
                  {"id": "category", "name": "category", "kind": "categorical", "distribution": "categorical", "parameters": {"categories": ["=SUM(1,2)", 'বাংলা "quoted"'], "probabilities": [0.5, 0.5]}},
                  {"id": "x", "name": "x", "kind": "numeric", "distribution": "normal", "parameters": {"mean": -2, "std": 1}, "missing": 0.5},
              ]}
    app = create_app(Settings(token=TOKEN))
    with TestClient(app) as client:
        client.headers.update({"Authorization": f"Bearer {TOKEN}", "X-Lab-Owner": OWNER})
        response = client.post("/preview", json={"config": config})
        assert response.status_code == 200, response.text
        result_id = response.json()["result_id"]
        # Quotes/backslashes in this chosen value must stay data, never Python source.
        sentinel = "x'\\N;assert False#"
        zipped = client.get(f"/results/{result_id}/download", params={"format": "zip", "safe": "true", "null_value": sentinel})
        assert zipped.status_code == 200, zipped.text[:500]
    bundle = tmp_path / "bundle"
    with zipfile.ZipFile(io.BytesIO(zipped.content)) as archive:
        archive.extractall(bundle)
    other_folder = tmp_path / "unrelated-working-directory"
    other_folder.mkdir()
    environment = dict(os.environ)
    source = str(Path(__file__).resolve().parents[1])
    environment["PYTHONPATH"] = source + (os.pathsep + environment["PYTHONPATH"] if environment.get("PYTHONPATH") else "")
    run = subprocess.run([sys.executable, str(bundle / "reproduce.py")], cwd=other_folder, env=environment, capture_output=True, text=True, timeout=30)
    assert run.returncode == 0, run.stdout + run.stderr
    assert (bundle / "reproduced.csv").read_bytes() == (bundle / "dataset.csv").read_bytes()
    output = (bundle / "reproduced.csv").read_text(encoding="utf-8")
    assert sentinel in output
    assert "'=SUM(1,2)" in output
    manifest_path = bundle / "generation_manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["engine"]["numpy"] = "0.0.incompatible"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    mismatch = subprocess.run([sys.executable, str(bundle / "reproduce.py")], cwd=other_folder, env=environment, capture_output=True, text=True, timeout=30)
    assert mismatch.returncode != 0
    assert "numpy version mismatch" in mismatch.stderr
