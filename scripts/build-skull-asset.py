#!/usr/bin/env python3
"""Build the segmented human skull GLB asset from BodyParts3D 4.0 meshes.

Source dataset:
  BodyParts3D 4.0, (c) The Database Center for Life Science (DBCLS)
  License: Creative Commons Attribution 4.0 International (CC BY 4.0)
  https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html

This is an offline asset-preparation script (not executed during `npm run build`).
It packs the 22 individual cranial and facial bones, the associated hyoid bone,
and the 28 permanent teeth (grouped into upper-left, upper-right, and lower
dentition arches parented under their supporting jaw bones) into a standard,
uncompressed glTF 2.0 binary (.glb) file with per-vertex sutural proximity
weights (`_SUTURE`) computed directly from inter-bone geometry.
"""

from __future__ import annotations

import argparse
import gzip
import json
import os
import struct
import tempfile
import urllib.request
from pathlib import Path
from typing import Any

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "static" / "data" / "exploded-human-skull"
GLB_PATH = OUT_DIR / "human-skull-bp3d.glb"
MANIFEST_PATH = OUT_DIR / "manifest.json"
ATTRIBUTION_PATH = OUT_DIR / "ATTRIBUTION.md"

SOURCE_BASE_URL = "https://raw.githubusercontent.com/slorksmo/Human-Atlas/main/public/models"
CACHE_DIR = Path(tempfile.gettempdir()) / "bp3d_inspect"
SCALE = 10.0  # meters -> 1 unit = 100 mm (10 cm)

# Canonical 22 skull bones + associated hyoid mapped to BodyParts3D 4.0 part IDs.
BONE_SPECS: list[dict[str, Any]] = [
    {"id": "frontal", "bp3d": "FJ3200", "fma": "FMA52734", "label": "Frontal bone", "category": "neurocranium"},
    {"id": "parietal-left", "bp3d": "FJ3274", "fma": "FMA52789", "label": "Left parietal bone", "category": "neurocranium"},
    {"id": "parietal-right", "bp3d": "FJ3380", "fma": "FMA52788", "label": "Right parietal bone", "category": "neurocranium"},
    {"id": "temporal-left", "bp3d": "FJ3281", "fma": "FMA52739", "label": "Left temporal bone", "category": "neurocranium"},
    {"id": "temporal-right", "bp3d": "FJ3386", "fma": "FMA52738", "label": "Right temporal bone", "category": "neurocranium"},
    {"id": "occipital", "bp3d": "FJ3309", "fma": "FMA52735", "label": "Occipital bone", "category": "neurocranium"},
    {"id": "sphenoid", "bp3d": "FJ3394", "fma": "FMA52736", "label": "Sphenoid bone", "category": "neurocranium"},
    {"id": "ethmoid", "bp3d": "FJ3199", "fma": "FMA52740", "label": "Ethmoid bone", "category": "neurocranium"},
    {"id": "nasal-left", "bp3d": "FJ3272", "fma": "FMA53648", "label": "Left nasal bone", "category": "viscerocranium"},
    {"id": "nasal-right", "bp3d": "FJ3378", "fma": "FMA53647", "label": "Right nasal bone", "category": "viscerocranium"},
    {"id": "maxilla-left", "bp3d": "FJ3269", "fma": "FMA53650", "label": "Left maxilla", "category": "viscerocranium"},
    {"id": "maxilla-right", "bp3d": "FJ3375", "fma": "FMA53649", "label": "Right maxilla", "category": "viscerocranium"},
    {"id": "zygomatic-left", "bp3d": "FJ3287", "fma": "FMA52893", "label": "Left zygomatic bone", "category": "viscerocranium"},
    {"id": "zygomatic-right", "bp3d": "FJ3392", "fma": "FMA52892", "label": "Right zygomatic bone", "category": "viscerocranium"},
    {"id": "lacrimal-left", "bp3d": "FJ3265", "fma": "FMA53646", "label": "Left lacrimal bone", "category": "viscerocranium"},
    {"id": "lacrimal-right", "bp3d": "FJ3371", "fma": "FMA53645", "label": "Right lacrimal bone", "category": "viscerocranium"},
    {"id": "palatine-left", "bp3d": "FJ3273", "fma": "FMA53656", "label": "Left palatine bone", "category": "viscerocranium"},
    {"id": "palatine-right", "bp3d": "FJ3379", "fma": "FMA53655", "label": "Right palatine bone", "category": "viscerocranium"},
    {"id": "inferior-nasal-concha-left", "bp3d": "FJ3263", "fma": "FMA54738", "label": "Left inferior nasal concha", "category": "viscerocranium"},
    {"id": "inferior-nasal-concha-right", "bp3d": "FJ3369", "fma": "FMA54737", "label": "Right inferior nasal concha", "category": "viscerocranium"},
    {"id": "vomer", "bp3d": "FJ3395", "fma": "FMA9710", "label": "Vomer", "category": "viscerocranium"},
    {"id": "mandible", "bp3d": "FJ3289", "fma": "FMA52748", "label": "Mandible", "category": "mandible"},
    {"id": "hyoid", "bp3d": "FJ3201", "fma": "FMA52749", "label": "Hyoid bone", "category": "associated"},
]

DENTITION_GROUPS: list[dict[str, Any]] = [
    {
        "id": "dentition-maxilla-left",
        "parent": "maxilla-left",
        "label": "Upper left permanent dentition",
        "bp3dIds": ["FJ1261", "FJ1262", "FJ1263", "FJ1264", "FJ1265", "FJ1266", "FJ1267"],
    },
    {
        "id": "dentition-maxilla-right",
        "parent": "maxilla-right",
        "label": "Upper right permanent dentition",
        "bp3dIds": ["FJ1275", "FJ1276", "FJ1277", "FJ1278", "FJ1279", "FJ1280", "FJ1281"],
    },
    {
        "id": "dentition-mandible",
        "parent": "mandible",
        "label": "Lower permanent dentition",
        "bp3dIds": [
            "FJ1254", "FJ1255", "FJ1256", "FJ1257", "FJ1258", "FJ1259", "FJ1260",
            "FJ1268", "FJ1269", "FJ1270", "FJ1271", "FJ1272", "FJ1273", "FJ1274",
        ],
    },
]


def ensure_cached(filename: str, allow_fetch: bool) -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = CACHE_DIR / filename
    if not path.exists():
        if not allow_fetch:
            raise FileNotFoundError(
                f"Missing cached source file {path}. Pass --fetch to download BodyParts3D source chunks."
            )
        url = f"{SOURCE_BASE_URL}/{filename}"
        print(f"Downloading {url}...")
        urllib.request.urlretrieve(url, path)
    return path


def extract_part(part: dict[str, Any], chunks: dict[int, bytes]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    buf = chunks[part["chunk"]]
    pos = np.frombuffer(buf, dtype=np.float32, count=part["vertexCount"] * 3, offset=part["positions"]).reshape(-1, 3).copy()
    nrm = (
        np.frombuffer(buf, dtype=np.int16, count=part["vertexCount"] * 3, offset=part["normals"])
        .reshape(-1, 3)
        .astype(np.float32)
        / 32767.0
    )
    # Re-normalize after Int16 quantization
    nlen = np.linalg.norm(nrm, axis=1, keepdims=True)
    nrm = nrm / np.maximum(nlen, 1e-8)
    idx = np.frombuffer(buf, dtype=np.uint32, count=part["indexCount"], offset=part["indices"]).copy()
    return pos, nrm, idx


def compute_suture_masks(bone_positions_m: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
    """Compute per-vertex suture proximity mask in [0, 1] across the 22 articulated skull bones."""
    skull_ids = [b["id"] for b in BONE_SPECS if b["id"] != "hyoid"]
    masks: dict[str, np.ndarray] = {}
    for bid in skull_ids:
        pts = bone_positions_m[bid]
        other = np.vstack([bone_positions_m[oid] for oid in skull_ids if oid != bid])
        min_d2 = np.full(len(pts), 1e9, dtype=np.float32)
        for start in range(0, len(other), 4096):
            chunk = other[start : start + 4096]
            d2 = ((pts[:, None, :] - chunk[None, :, :]) ** 2).sum(axis=2).min(axis=1)
            min_d2 = np.minimum(min_d2, d2)
        dist = np.sqrt(min_d2)
        # Tight suture threshold (0.12 mm .. 0.72 mm) isolates real interlocking suture margins
        raw = np.clip((0.00072 - dist) / (0.00072 - 0.00012), 0.0, 1.0)
        masks[bid] = (raw ** 1.35).astype(np.float32)
    masks["hyoid"] = np.zeros(len(bone_positions_m["hyoid"]), dtype=np.float32)
    return masks


def pad4(buf: bytearray) -> int:
    while len(buf) % 4:
        buf.append(0)
    return len(buf)


def build_assets(allow_fetch: bool) -> None:
    atlas = json.loads(ensure_cached("atlas.json", allow_fetch).read_text(encoding="utf-8"))
    chunks = {
        idx: gzip.open(ensure_cached(f"body-{idx}.bin.gz", allow_fetch), "rb").read()
        for idx in (0, 12, 13)
    }
    parts_by_id = {p["id"]: p for p in atlas["parts"]}

    # Extract raw positions in meters to compute exact 22-bone skull center
    raw_bones: dict[str, tuple[np.ndarray, np.ndarray, np.ndarray]] = {}
    for spec in BONE_SPECS:
        raw_bones[spec["id"]] = extract_part(parts_by_id[spec["bp3d"]], chunks)

    skull_22_pts = np.vstack([raw_bones[b["id"]][0] for b in BONE_SPECS if b["id"] != "hyoid"])
    skull_center_m = (skull_22_pts.min(axis=0) + skull_22_pts.max(axis=0)) * 0.5

    suture_masks = compute_suture_masks({bid: raw_bones[bid][0] for bid in raw_bones})

    # Extract and merge each dentition arch
    raw_dentition: dict[str, tuple[np.ndarray, np.ndarray, np.ndarray]] = {}
    for dgroup in DENTITION_GROUPS:
        pos_list, nrm_list, idx_list = [], [], []
        v_offset = 0
        for tid in dgroup["bp3dIds"]:
            p, n, i = extract_part(parts_by_id[tid], chunks)
            pos_list.append(p)
            nrm_list.append(n)
            idx_list.append(i + v_offset)
            v_offset += len(p)
        raw_dentition[dgroup["id"]] = (
            np.vstack(pos_list),
            np.vstack(nrm_list),
            np.concatenate(idx_list),
        )

    # Assemble glTF 2.0 binary
    bin_buf = bytearray()
    buffer_views: list[dict[str, Any]] = []
    accessors: list[dict[str, Any]] = []
    meshes: list[dict[str, Any]] = []
    nodes: list[dict[str, Any]] = []
    manifest_bones: list[dict[str, Any]] = []

    def add_accessor(
        array: np.ndarray,
        target: int,
        component_type: int,
        acc_type: str,
        include_minmax: bool = False,
    ) -> int:
        offset = pad4(bin_buf)
        raw = array.tobytes()
        bin_buf.extend(raw)
        bv_idx = len(buffer_views)
        buffer_views.append(
            {
                "buffer": 0,
                "byteOffset": offset,
                "byteLength": len(raw),
                "target": target,
            }
        )
        acc: dict[str, Any] = {
            "bufferView": bv_idx,
            "byteOffset": 0,
            "componentType": component_type,
            "count": int(array.shape[0]),
            "type": acc_type,
        }
        if include_minmax:
            acc["min"] = [float(x) for x in array.min(axis=0)]
            acc["max"] = [float(x) for x in array.max(axis=0)]
        acc_idx = len(accessors)
        accessors.append(acc)
        return acc_idx

    # Root node = index 0
    bone_node_indices: dict[str, int] = {}
    root_children: list[int] = []
    nodes.append({"name": "HumanSkullAssembly", "children": root_children})

    def add_mesh_primitive(
        pos_m: np.ndarray,
        nrm: np.ndarray,
        idx_u32: np.ndarray,
        suture: np.ndarray,
        mesh_name: str,
    ) -> tuple[int, np.ndarray, np.ndarray, np.ndarray]:
        pos_scaled = ((pos_m - skull_center_m) * SCALE).astype(np.float32)
        nrm_f32 = nrm.astype(np.float32)
        suture_f32 = suture.astype(np.float32)

        assert len(pos_scaled) < 65535, f"{mesh_name} exceeds Uint16 index range"
        idx_u16 = idx_u32.astype(np.uint16)

        pos_acc = add_accessor(pos_scaled, 34962, 5126, "VEC3", include_minmax=True)
        nrm_acc = add_accessor(nrm_f32, 34962, 5126, "VEC3")
        sut_acc = add_accessor(suture_f32, 34962, 5126, "SCALAR")
        idx_acc = add_accessor(idx_u16, 34963, 5123, "SCALAR")

        mesh_idx = len(meshes)
        meshes.append(
            {
                "name": mesh_name,
                "primitives": [
                    {
                        "attributes": {
                            "POSITION": pos_acc,
                            "NORMAL": nrm_acc,
                            "_SUTURE": sut_acc,
                        },
                        "indices": idx_acc,
                        "mode": 4,
                    }
                ],
            }
        )
        bmin = pos_scaled.min(axis=0)
        bmax = pos_scaled.max(axis=0)
        centroid = pos_scaled.mean(axis=0)
        return mesh_idx, centroid, bmin, bmax

    for spec in BONE_SPECS:
        bid = spec["id"]
        pos_m, nrm, idx_u32 = raw_bones[bid]
        mesh_idx, centroid, bmin, bmax = add_mesh_primitive(pos_m, nrm, idx_u32, suture_masks[bid], bid)
        node_idx = len(nodes)
        bone_node_indices[bid] = node_idx
        root_children.append(node_idx)
        nodes.append(
            {
                "name": bid,
                "mesh": mesh_idx,
                "extras": {
                    "boneId": bid,
                    "bp3d": spec["bp3d"],
                    "fma": spec["fma"],
                    "category": spec["category"],
                },
            }
        )
        manifest_bones.append(
            {
                "id": bid,
                "bp3d": spec["bp3d"],
                "fma": spec["fma"],
                "label": spec["label"],
                "category": spec["category"],
                "vertexCount": int(len(pos_m)),
                "triangleCount": int(len(idx_u32) // 3),
                "centroid": [round(float(v), 5) for v in centroid],
                "boundsMin": [round(float(v), 5) for v in bmin],
                "boundsMax": [round(float(v), 5) for v in bmax],
            }
        )

    manifest_dentition: list[dict[str, Any]] = []
    for dgroup in DENTITION_GROUPS:
        did = dgroup["id"]
        pos_m, nrm, idx_u32 = raw_dentition[did]
        suture = np.zeros(len(pos_m), dtype=np.float32)
        mesh_idx, centroid, bmin, bmax = add_mesh_primitive(pos_m, nrm, idx_u32, suture, did)
        node_idx = len(nodes)
        parent_node = nodes[bone_node_indices[dgroup["parent"]]]
        parent_node.setdefault("children", []).append(node_idx)
        nodes.append(
            {
                "name": did,
                "mesh": mesh_idx,
                "extras": {
                    "dentitionId": did,
                    "parentBoneId": dgroup["parent"],
                    "bp3dIds": dgroup["bp3dIds"],
                },
            }
        )
        manifest_dentition.append(
            {
                "id": did,
                "parentBoneId": dgroup["parent"],
                "label": dgroup["label"],
                "bp3dIds": dgroup["bp3dIds"],
                "vertexCount": int(len(pos_m)),
                "triangleCount": int(len(idx_u32) // 3),
                "centroid": [round(float(v), 5) for v in centroid],
            }
        )

    pad4(bin_buf)

    gltf: dict[str, Any] = {
        "asset": {
            "version": "2.0",
            "generator": "suvroghosh-in/scripts/build-skull-asset.py",
            "copyright": "BodyParts3D, (c) The Database Center for Life Science licensed under CC Attribution 4.0 International (CC BY 4.0)",
        },
        "scene": 0,
        "scenes": [{"name": "ExplodedHumanSkull", "nodes": [0]}],
        "nodes": nodes,
        "meshes": meshes,
        "bufferViews": buffer_views,
        "accessors": accessors,
        "buffers": [{"byteLength": len(bin_buf)}],
    }

    json_bytes = bytearray(json.dumps(gltf, separators=(",", ":")).encode("utf-8"))
    while len(json_bytes) % 4:
        json_bytes.append(0x20)

    total_length = 12 + 8 + len(json_bytes) + 8 + len(bin_buf)
    header = struct.pack("<III", 0x46546C67, 2, total_length)
    json_header = struct.pack("<II", len(json_bytes), 0x4E4F534A)
    bin_header = struct.pack("<II", len(bin_buf), 0x004E4942)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    GLB_PATH.write_bytes(header + json_header + json_bytes + bin_header + bin_buf)

    all_bmin = np.min([b["boundsMin"] for b in manifest_bones if b["id"] != "hyoid"], axis=0)
    all_bmax = np.max([b["boundsMax"] for b in manifest_bones if b["id"] != "hyoid"], axis=0)
    manifest = {
        "version": 1,
        "source": "BodyParts3D 4.0 (DBCLS), CC BY 4.0",
        "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
        "sourceLicensePage": "https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html",
        "scaleToMeters": 1.0 / SCALE,
        "millimetersPerUnit": 100.0,
        "skullCenterMeters": [round(float(v), 6) for v in skull_center_m],
        "skullProperBounds": {
            "min": [round(float(v), 5) for v in all_bmin],
            "max": [round(float(v), 5) for v in all_bmax],
        },
        "bones": manifest_bones,
        "dentition": manifest_dentition,
        "totalTriangles": sum(b["triangleCount"] for b in manifest_bones)
        + sum(d["triangleCount"] for d in manifest_dentition),
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    ATTRIBUTION_PATH.write_text(
        """# Skull 3D Model Attribution & Provenance

- **Asset**: `human-skull-bp3d.glb` (22 articulated cranial and facial bones, hyoid bone, and 28 permanent teeth grouped by jaw quadrant)
- **Source Dataset**: **BodyParts3D 4.0**, © The Database Center for Life Science (DBCLS)
- **License**: **Creative Commons Attribution 4.0 International (CC BY 4.0)**
  - Official DBCLS License Notice: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html (updated 2025-02-27)
  - Creative Commons Terms: https://creativecommons.org/licenses/by/4.0/
  - Publication: Mitsuhashi N, Fujieda K, Tamura T, Kawamoto S, Takagi T, Okubo K. *BodyParts3D: 3D structure database for anatomical concepts.* Nucleic Acids Research, 2009; 37(Database issue):D782-D785. https://doi.org/10.1093/nar/gkn613
- **Required Attribution**:
  > BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International
- **Adaptations Applied**:
  - Extracted the 22 skull bones (`FMA46565` skeletal subset), the hyoid bone (`FJ3201`), and the 28 permanent teeth (`FJ1254`–`FJ1281`) from the BodyParts3D 4.0 web-optimized polygon distribution (`slorksmo/Human-Atlas` 0.2% meshoptimizer-simplified meters/Y-up adaptation).
  - Centered coordinates on the 22-bone skull proper bounding midpoint and scaled by `10.0` (`1 scene unit = 100 mm`) for WebGL viewport precision.
  - Grouped the 28 permanent teeth into `dentition-maxilla-left`, `dentition-maxilla-right`, and `dentition-mandible` child meshes attached to their supporting jaw bones.
  - Computed per-vertex `_SUTURE` proximity masks from inter-bone geometric distances across the 22 articulated skull bones so cranial and facial sutures can be visually emphasized or hidden without altering bone geometry.
""",
        encoding="utf-8",
    )
    print(f"Wrote {GLB_PATH} ({GLB_PATH.stat().st_size:,} bytes), totalTriangles={manifest['totalTriangles']:,}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build segmented human skull GLB from BodyParts3D 4.0.")
    parser.add_argument("--fetch", action="store_true", help="Download cached BodyParts3D chunks if missing.")
    args = parser.parse_args()
    build_assets(allow_fetch=args.fetch)


if __name__ == "__main__":
    main()
