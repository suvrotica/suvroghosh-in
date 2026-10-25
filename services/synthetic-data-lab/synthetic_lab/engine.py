"""Reproducible synthetic-data generation with one engine for preview and export.

The engine owns no HTTP state. Callers retain immutable results and may separately
page or serialize them. Numeric latent values and masks are kept outside ordinary
feature rows, so downstream exports need not leak simulator ground truth.
"""

from __future__ import annotations

import copy
import hashlib
import json
import math
from pathlib import Path
from datetime import datetime, timedelta, timezone

import numpy as np
from scipy import stats
from scipy.special import expit
from scipy.signal import lfilter

from . import __version__
from .distributions import DISTRIBUTIONS, curve, frozen, sample, theoretical, validate_distribution
from .models import MAX_PREVIEW, MAX_ROWS, SpecificationError, checked_config, evaluate_expression, expression_dependencies, validate_config
from .domains import apply_domain


def capabilities():
    coverage_path = Path(__file__).with_name("factor_coverage.json")
    result = {
        "version": 1,
        "engine_version": __version__,
        "distributions": [dict(id=name, kind="vector" if spec.get("vector") else "categorical" if name == "categorical" else "discrete" if spec["discrete"] else "continuous", **spec) for name, spec in DISTRIBUTIONS.items()],
        "modules": [
            {"id": "tabular", "label": "Tabular distributions", "status": "implemented", "description": "Validated standard, empirical, histogram, KDE, mixture and multicolumn distributions."},
            {"id": "dependence", "label": "Gaussian copula", "status": "implemented", "description": "Positive-semidefinite latent Gaussian correlation; achieved Pearson correlation is reported separately."},
            {"id": "events", "label": "Event arrivals", "status": "implemented", "description": "Poisson, renewal, and sinusoidal nonhomogeneous Poisson processes with count/window stopping."},
            {"id": "timeseries", "label": "Time series", "status": "implemented", "description": "AR(1), linear trend, sinusoidal seasonality, initial conditions and warm-up disclosure."},
            {"id": "ml", "label": "ML outcomes and splits", "status": "implemented", "description": "Regression, binary logistic labels, label noise, random/stratified/time/group splits."},
            {"id": "quality", "label": "Missingness and corruption", "status": "implemented", "description": "MCAR/MAR/MNAR, additive noise, injected outliers, exact duplicates and separate ground-truth annotations."},
            {"id": "conditional", "label": "Conditional and zero models", "status": "implemented", "description": "Earlier categorical fields select case-specific scalar marginals; scalar zero-inflation and positive-component hurdle mechanisms are distinct."},
            {"id": "derived", "label": "Derived fields and constraints", "status": "implemented", "description": "Restricted mathematical expressions, acyclic dependencies and explicit constraint reports."},
            {"id": "qmc", "label": "Sampling designs", "status": "implemented", "description": "Latin hypercube, Sobol/Halton, quantile grids, exact stratified allocations with weights, and explicit source-row bootstrap/weighted resampling."},
            {"id": "relational", "label": "Relational and repeated entities", "status": "implemented", "description": "Poisson parent-child tables with valid keys; repeated entities with Gaussian random intercepts/slopes. Arbitrary table DAGs are not supported."},
            {"id": "causal", "label": "Causal counterfactuals", "status": "implemented", "description": "User-specified structural DAGs with continuous/binary nodes and fixed interventions; counterfactuals reuse unit-level exogenous noise."},
            {"id": "survival", "label": "Survival models", "status": "implemented", "description": "Weibull proportional hazards with independent right censoring and Kaplan-Meier summaries. Competing risks/delayed entry are unsupported."},
            {"id": "spatial", "label": "Spatial clusters", "status": "implemented", "description": "Independent isotropic Gaussian clusters in 2D/3D Cartesian coordinates. Geographic covariance and movement are unsupported."},
            {"id": "graph", "label": "Graph models", "status": "implemented", "description": "Erdos-Renyi/stochastic-block simple graphs, optional connected undirected backbone, nodes and edges CSV tables."},
            {"id": "privacy", "label": "Formal differential privacy", "status": "unsupported", "description": "No differential privacy mechanism or privacy guarantee is provided."},
            {"id": "reference_fitting", "label": "Automated reference fitting", "status": "planned", "description": "Explicit empirical/KDE values are supported; uploaded-data model selection and held-out fitting are not implemented."},
        ],
        "limits": {"rows": MAX_ROWS, "preview_rows": MAX_PREVIEW, "variables": 50, "replications": 10},
        "reproducibility": "NumPy PCG64DXSM, SHA-256 named stream derivation; fixed engine, library versions, logical generation size and configuration required.",
    }
    if coverage_path.exists(): result["factor_coverage"] = json.loads(coverage_path.read_text(encoding="utf-8"))
    return result


def stream(seed, *identifiers):
    digest = hashlib.sha256(json.dumps([int(seed), *identifiers], separators=(",", ":"), ensure_ascii=False).encode()).digest()
    words = np.frombuffer(digest, dtype="<u4")
    return np.random.Generator(np.random.PCG64DXSM(np.random.SeedSequence(words)))


def finite(value):
    if isinstance(value, (np.integer,)): return int(value)
    if isinstance(value, (np.bool_,)): return bool(value)
    if isinstance(value, (np.floating, float)): return float(value) if math.isfinite(value) else None
    return value


def check_cancel(cancel_check):
    if cancel_check and cancel_check(): raise RuntimeError("Generation cancelled")


def event_times(config, preview, rng, cancel_check):
    event = config["event"]
    process, stop = event.get("process", "renewal"), event.get("stop", "count")
    count, window = event.get("count", config.get("rows", 5000)), event.get("window", 3600)
    cap = MAX_PREVIEW if preview else MAX_ROWS
    target = min(count, cap) if stop == "count" else cap
    distribution = "exponential" if process in ("poisson", "nonhomogeneous") else event.get("distribution", "exponential")
    parameters = event.get("parameters", {"rate": 1})
    elapsed, warnings = [], []
    if process != "nonhomogeneous":
        while len(elapsed) < target:
            check_cancel(cancel_check)
            # A fixed logical block size makes stopping behaviour independent of
            # the web worker's scheduling. It is part of the versioned contract.
            gaps = sample(distribution, parameters, 1024, rng)
            if not np.isfinite(gaps).all() or (gaps <= 0).any(): raise ValueError("Arrival gaps must be finite and strictly positive")
            block = (elapsed[-1] if elapsed else 0) + np.cumsum(gaps)
            if stop == "window":
                block = block[block <= window]
            remaining = target-len(elapsed)
            elapsed.extend(block[:remaining].tolist())
            if stop == "window" and len(block) < len(gaps): break
    else:
        rate = parameters.get("rate", 1)
        amplitude, period = event.get("intensity_amplitude", 0), event.get("period", 3600)
        maximum = rate*(1+amplitude)
        clock, attempts = 0.0, 0
        while len(elapsed) < target:
            attempts += 1
            if attempts % 1024 == 0: check_cancel(cancel_check)
            if attempts > 1_000_000: raise ValueError("Arrival thinning exceeded its bounded proposal budget")
            clock += rng.exponential(1/maximum)
            if stop == "window" and clock > window: break
            intensity = rate*(1+amplitude*math.sin(2*math.pi*clock/period))
            if rng.random() <= intensity/maximum: elapsed.append(clock)
    times = np.asarray(elapsed, dtype=float)
    if stop == "window" and len(times) >= cap and times[-1] < window:
        if not preview: raise ValueError("Event window exceeds 100,000 events; reduce rate or horizon")
        warnings.append("Preview stopped at 5,000 events before the requested window ended; full-window count checks are not evaluated")
    if stop == "count" and preview and count > cap:
        warnings.append(f"Preview shows the first {cap:,} of {count:,} requested events; fixed count is reduced only in the effective preview configuration")
    if len(times) == 0: warnings.append("No events occurred in this observation window")
    return times, warnings


def sampling_uniforms(config, variables, n, replication, warnings):
    sampling = config.get("sampling", {})
    method = sampling.get("method", "random")
    if method in ("random", "stratified", "bootstrap", "weighted"): return {}
    from scipy.stats import qmc
    eligible = [v for v in variables if v.get("kind", "numeric") in ("numeric", "categorical") and not DISTRIBUTIONS[v.get("distribution", "normal")].get("vector")]
    if config.get("dependence", {}).get("mode") == "gaussian_copula": raise ValueError("QMC/grid sampling cannot currently be combined with Gaussian copula mode")
    if not eligible or n == 0: return {}
    rng = stream(config.get("seed", 42), replication, "sampling")
    dimension = len(eligible)
    if method == "latin_hypercube": u = qmc.LatinHypercube(dimension, seed=rng, scramble=sampling.get("scramble", True)).random(n)
    elif method == "sobol":
        m = math.ceil(math.log2(max(n, 1)))
        u = qmc.Sobol(dimension, scramble=sampling.get("scramble", True), seed=rng).random_base2(m)[:n]
        if n != 2**m: warnings.append("Sobol sample size is not a power of two; balance properties may be degraded")
    elif method == "halton": u = qmc.Halton(dimension, scramble=sampling.get("scramble", True), seed=rng).random(n)
    elif method in ("quantile", "linear"):
        if method == "linear" and any(v.get("distribution") not in ("uniform", "discrete_uniform") for v in eligible):
            raise ValueError("Linear value spacing currently requires bounded uniform marginals; choose quantile for equally spaced probabilities")
        u = np.tile((np.arange(n)+0.5)/n, (dimension, 1)).T
        warnings.append("Quantile/grid points are evenly spaced probabilities, not iid random draws")
    else: raise ValueError("Unsupported sampling method; choose random, latin_hypercube, sobol, halton, or quantile")
    if method not in ("quantile", "linear"):
        warnings.append("Quasi-Monte Carlo observations are not iid; ordinary iid uncertainty intervals are not reported")
    return {v.get("id", v["name"]): u[:, i] for i, v in enumerate(eligible)}


def _generate_replication(config, n, replication, preview, cancel_check, warnings):
    variables, seed = config["variables"], config.get("seed", 42)
    columns, descriptors, sources, ground_truth = {}, [], {}, {}
    aliases, by_id = {}, {}
    uniforms = sampling_uniforms(config, variables, n, replication, warnings)
    dependence = config.get("dependence", {})
    if dependence.get("mode") == "gaussian_copula" and n:
        z = stream(seed, replication, "copula").multivariate_normal(np.zeros(len(dependence["columns"])), dependence["matrix"], size=n, check_valid="raise")
        correlated = stats.norm.cdf(z)
        uniforms.update({identifier: correlated[:, i] for i, identifier in enumerate(dependence["columns"])})
    derived = []
    sampling = config.get("sampling", {})
    source_rows, reference_indices = None, None
    if sampling.get("method") in ("bootstrap", "weighted"):
        source_rows = sampling["source_rows"]
        weights = np.asarray(sampling.get("weights"), dtype=float) if sampling.get("weights") is not None else None
        if weights is not None: weights /= weights.sum()
        reference_indices = stream(seed, replication, "reference_resampling").choice(len(source_rows), size=n, replace=sampling.get("replace", True), p=weights)
        ground_truth["source_row_index"] = reference_indices
        warnings.append("Reference-row resampling copies source observations and overrides per-field distribution controls; it provides no privacy guarantee")
    for variable in variables:
        check_cancel(cancel_check)
        identifier, name = variable.get("id", variable["name"]), variable["name"]
        kind, distribution = variable.get("kind", "numeric"), variable.get("distribution", "normal")
        rng = stream(seed, replication, identifier, "clean")
        if kind == "derived":
            derived.append(variable)
            continue
        if source_rows is not None:
            values = np.asarray([source_rows[index][name] for index in reference_indices])
            if kind in ("numeric",) and values.dtype.kind not in "biuf": raise ValueError(f"Source field {name} must match its declared numeric schema type")
        elif kind == "id":
            prefix = variable.get("parameters", {}).get("prefix", identifier+"_")
            values = np.asarray([f"{prefix}{replication+1}_{i+1:07d}" for i in range(n)], dtype=object)
        elif kind == "datetime":
            p = variable.get("parameters", {})
            start = datetime.fromisoformat(p.get("start", "2026-01-01T00:00:00+00:00").replace("Z", "+00:00")).astimezone(timezone.utc)
            end = datetime.fromisoformat(p.get("end", "2027-01-01T00:00:00+00:00").replace("Z", "+00:00")).astimezone(timezone.utc)
            values = np.asarray([(start+timedelta(seconds=float(x))).isoformat().replace("+00:00", "Z") for x in rng.uniform(0, (end-start).total_seconds(), n)], dtype=object)
        elif kind == "text":
            vocabulary = variable.get("parameters", {}).get("vocabulary", ["sample", "observation", "synthetic", "record"])
            if not isinstance(vocabulary, list) or not vocabulary or len(vocabulary) > 1000 or any(not isinstance(w, str) or len(w) > 200 for w in vocabulary): raise ValueError("Text vocabulary needs 1–1,000 bounded strings")
            words = variable.get("parameters", {}).get("words", 4)
            if not isinstance(words, int) or not 1 <= words <= 50: raise ValueError("Text word count must be 1–50")
            values = np.asarray([" ".join(rng.choice(vocabulary, size=words).tolist()) for _ in range(n)], dtype=object)
        else:
            bounds = variable.get("truncate")
            truncation = [bounds["lower"], bounds["upper"]] if bounds else None
            params = validate_distribution(distribution, variable.get("parameters"))
            stratum_counts = None
            if sampling.get("method") == "stratified" and sampling.get("strata") in (identifier, name):
                stratum_counts = [sampling["allocation"][str(label)] for label in params["categories"]]
            if variable.get("conditional"):
                conditional = variable["conditional"]
                parent = np.asarray(aliases[conditional["on"]], dtype=object)
                values = sample(distribution, params, n, rng, truncate=truncation)
                for label, case in conditional["cases"].items():
                    mask = np.asarray([str(value) == str(label) for value in parent])
                    values[mask] = sample(case.get("distribution", distribution), case.get("parameters"), int(mask.sum()), stream(seed, replication, identifier, "conditional", label), truncate=truncation)
            elif variable.get("exact_counts") is not None or stratum_counts is not None:
                original = np.asarray(variable.get("exact_counts", stratum_counts), dtype=float)
                if n != config.get("rows", 5000):
                    scaled = original*n/original.sum()
                    counts = np.floor(scaled).astype(int)
                    counts[np.argsort(-(scaled-counts))[:n-counts.sum()]] += 1
                    warnings.append(f"{name}: preview exact counts are proportionally allocated with largest-remainder rounding; full counts are not evaluated")
                else: counts = original.astype(int)
                values = np.repeat(np.asarray(params["categories"], dtype=object), counts)
                rng.shuffle(values)
            elif variable.get("hurdle"):
                positive_minimum = np.nextafter(0.0, np.inf)
                lower, upper = (max(positive_minimum, truncation[0]), truncation[1]) if truncation else (positive_minimum, math.inf)
                values = sample(distribution, params, n, rng, truncate=[lower, upper])
            else: values = sample(distribution, params, n, rng, uniforms=uniforms.get(identifier), truncate=truncation)
            if variable.get("zero_inflation") or variable.get("hurdle"):
                zero_probability = variable["hurdle"]["zero_probability"] if variable.get("hurdle") else variable["zero_inflation"]
                mask = stream(seed, replication, identifier, "structural_zeros").random(n) < zero_probability
                values[mask] = 0
                ground_truth[name+"_structural_zero"] = mask
            if DISTRIBUTIONS[distribution].get("vector"):
                for j, output_name in enumerate(params["names"]):
                    column = values[:, j]
                    columns[output_name] = column
                    descriptors.append({"name": output_name, "id": output_name, "type": "integer" if distribution == "multinomial" else "numeric", "role": variable.get("role", "feature"), "units": variable.get("units", "")})
                    sources[output_name] = variable
                    aliases[output_name] = column
                by_id[identifier] = values
                continue
            if values.dtype.kind in "iuf" and not np.isfinite(values).all(): raise ValueError(f"{name}: sampler produced values beyond finite machine range; change extreme parameters")
            if "exact_mean" in variable or "exact_std" in variable:
                target_mean = variable.get("exact_mean", float(np.mean(values)))
                target_sd = variable.get("exact_std", float(np.std(values, ddof=1)))
                if n < 2: raise ValueError("Exact moments need at least two generated rows")
                values = (values-values.mean())/values.std(ddof=1)*target_sd+target_mean
        columns[name] = values
        aliases[identifier] = aliases[name] = values
        by_id[identifier] = values
        sources[name] = variable
        value_type = "categorical" if distribution == "categorical" or kind == "categorical" else "integer" if DISTRIBUTIONS.get(distribution, {}).get("discrete") and distribution not in ("empirical", "custom_pmf") and kind == "numeric" else kind
        descriptors.append({"name": name, "id": identifier, "type": value_type, "role": variable.get("role", "identifier" if kind == "id" else "feature"), "units": variable.get("units", "")})
        if sampling.get("method") == "stratified" and sampling.get("strata") in (identifier, name):
            params = validate_distribution("categorical", variable.get("parameters"))
            sample_fractions = {str(label): sampling["allocation"][str(label)]/config.get("rows", 5000) for label in params["categories"]}
            population = dict(zip((str(label) for label in params["categories"]), params["probabilities"]))
            sampling_weights = np.asarray([population[str(label)]/sample_fractions[str(label)] for label in values])
            columns["_sampling_weight"] = sampling_weights
            descriptors.append({"name": "_sampling_weight", "type": "numeric", "role": "weight"})
            warnings.append("Stratification weights are population-proportion / design-proportion; finite-population inclusion probabilities are not inferred")
    while derived:
        advanced = False
        for variable in derived[:]:
            if not expression_dependencies(variable["expression"]) <= aliases.keys(): continue
            values = evaluate_expression(variable["expression"], aliases, n)
            name, identifier = variable["name"], variable.get("id", variable["name"])
            columns[name] = values
            by_id[identifier] = aliases[identifier] = aliases[name] = values
            sources[name] = variable
            descriptors.append({"name": name, "id": identifier, "type": "numeric", "role": variable.get("role", "feature"), "units": variable.get("units", "")})
            derived.remove(variable)
            advanced = True
        if not advanced: raise ValueError("Derived-field dependency cycle or non-scalar vector reference")
    temporal = config.get("timeseries", {})
    if temporal.get("enabled") and n:
        identifier = temporal["column"]
        variable = next(v for v in variables if v.get("id", v["name"]) == identifier)
        name = variable["name"]
        innovation = np.asarray(columns[name], dtype=float)
        if innovation.ndim != 1: raise ValueError("Time-series column must be scalar")
        time_index = np.arange(n)
        values = lfilter([1], [1, -temporal.get("ar", 0)], innovation)
        values += temporal.get("trend", 0)*time_index + temporal.get("amplitude", 0)*np.sin(2*np.pi*time_index/temporal.get("seasonal_period", 50))
        columns[name] = by_id[identifier] = aliases[identifier] = aliases[name] = values
        columns["time_index"] = time_index
        descriptors.append({"name": "time_index", "type": "integer", "role": "timestamp"})
        warnings.append("Time-series AR(1) starts at zero before the first innovation, with no warm-up removal; trend/seasonality change the original marginal distribution")
    outcome = config.get("outcome", {})
    if outcome.get("task", "none") != "none":
        score = np.full(n, outcome.get("intercept", 0), dtype=float)
        for identifier, coefficient in outcome.get("coefficients", {}).items():
            values = np.asarray(aliases[identifier])
            if values.dtype.kind not in "biuf" or values.ndim != 1: raise ValueError(f"Outcome coefficient field {identifier} must be a scalar numeric feature")
            score += coefficient*values
        rng = stream(seed, replication, "outcome")
        name = outcome.get("name", "target")
        if outcome["task"] == "regression":
            values = score+rng.normal(0, outcome.get("noise", 1), n)
            ground_truth[name+"_clean"] = score
            descriptor_type = "numeric"
        else:
            # The noise slider has explicit semantics for classification too:
            # independent additive normal disturbance in the latent log-odds.
            latent_score = score+stream(seed, replication, "classification_logit_noise").normal(0, outcome.get("noise", 0), n)
            probabilities = expit(latent_score)
            clean = (rng.random(n) < probabilities).astype(int)
            flip = stream(seed, replication, "label_noise").random(n) < outcome.get("label_noise", 0)
            values = np.where(flip, 1-clean, clean)
            ground_truth[name+"_probability"] = probabilities
            ground_truth[name+"_structural_logit"] = score
            ground_truth[name+"_clean"] = clean
            ground_truth[name+"_label_corrupted"] = flip
            descriptor_type = "integer"
        columns[name] = values
        descriptors.append({"name": name, "type": descriptor_type, "role": "target"})
    domain_tables, domain_metadata, domain_warnings = apply_domain(config, columns, descriptors, ground_truth, stream(seed, replication, "domain"), n, preview)
    warnings.extend(domain_warnings)
    clean_columns = {name: value.copy() for name, value in columns.items()}
    quality = config.get("quality", {})
    anomaly_rate = quality.get("outlier_rate", 0)
    driver_id = quality.get("driver")
    driver_name = next((v["name"] for v in variables if v.get("id", v["name"]) == driver_id), None)
    for name, values in list(columns.items()):
        variable = sources.get(name)
        if variable is None: continue
        identifier = variable.get("id", name)
        numeric = values.dtype.kind in "biuf"
        if numeric:
            values = values.astype(float)
            noise = variable.get("noise", 0)
            if noise: values += stream(seed, replication, identifier, "measurement_noise").normal(0, noise, n)
            if anomaly_rate and n:
                mask = stream(seed, replication, identifier, "anomaly_mask").random(n) < anomaly_rate
                scale = np.std(values) or 1
                values[mask] += stream(seed, replication, identifier, "anomaly_size").choice([-1, 1], mask.sum())*quality.get("outlier_scale", 5)*scale
                ground_truth[name+"_injected_anomaly"] = mask
            if variable.get("clip"):
                values = np.clip(values, variable["clip"]["lower"], variable["clip"]["upper"])
            if variable.get("censor"):
                bounds = variable["censor"]
                ground_truth[name+"_censored_lower"] = values < bounds["lower"]
                ground_truth[name+"_censored_upper"] = values > bounds["upper"]
                values = np.clip(values, bounds["lower"], bounds["upper"])
                # Bounds plus indicators remain in the ordinary observations.
                columns[name+"_censoring"] = np.where(ground_truth[name+"_censored_lower"], "left", np.where(ground_truth[name+"_censored_upper"], "right", "none"))
                descriptors.append({"name": name+"_censoring", "type": "categorical", "role": "censoring"})
            values = np.round(values, variable.get("decimals", 4))
        values = np.asarray(values, dtype=object)
        rate = 1-(1-variable.get("missing", 0))*(1-quality.get("rate", 0))
        if quality.get("missingness") == "mar" and name == driver_name:
            rate = variable.get("missing", 0)
            if rate: raise ValueError("MAR driver must remain observed; remove its per-field missingness")
        if rate and n:
            mechanism = quality.get("missingness", "mcar")
            probability = np.full(n, rate)
            if mechanism in ("mar", "mnar"):
                conditioning = np.asarray(clean_columns[driver_name], dtype=float) if mechanism == "mar" else np.asarray(clean_columns[name], dtype=float) if numeric else None
                if conditioning is not None:
                    z = np.clip((conditioning-conditioning.mean())/(conditioning.std() or 1), -8, 8)
                    # Calibrate the intercept so the expected mask rate matches
                    # the requested rate, without claiming an exact realized count.
                    lo, hi = -30.0, 30.0
                    for _ in range(60):
                        mid = (lo+hi)/2
                        if expit(mid+z).mean() > rate: hi = mid
                        else: lo = mid
                    probability = expit((lo+hi)/2+z)
            mask = stream(seed, replication, identifier, "missing").random(n) < probability
            values[mask] = None
            ground_truth[name+"_missing"] = mask
        columns[name] = values
        ground_truth[name+"_clean"] = clean_columns[name]
    split = config.get("split", {})
    if split.get("mode", "none") != "none":
        split_rng = stream(seed, replication, "split")
        mode, train, validation = split["mode"], split.get("train", 0.7), split.get("validation", 0.15)
        assignments = np.full(n, "test", dtype=object)
        def allocate(index):
            first, second = int(len(index)*train), int(len(index)*(train+validation))
            assignments[index[:first]], assignments[index[first:second]] = "train", "validation"
        if mode == "group":
            key = split["group_column"]
            group_name = next((v["name"] for v in variables if key in (v["name"], v.get("id"))), key)
            labels = clean_columns[group_name]
            unique = np.unique(labels)
            split_rng.shuffle(unique)
            first, second = int(len(unique)*train), int(len(unique)*(train+validation))
            assignments[np.isin(labels, unique[:first])] = "train"
            assignments[np.isin(labels, unique[first:second])] = "validation"
        elif mode == "stratified":
            labels = clean_columns[outcome.get("name", "target")]
            for label in np.unique(labels):
                index = np.flatnonzero(labels == label)
                split_rng.shuffle(index)
                allocate(index)
        else:
            index = np.arange(n)
            if mode == "random": split_rng.shuffle(index)
            allocate(index)
        columns["_split"] = assignments
        descriptors.append({"name": "_split", "type": "categorical", "role": "split"})
    # Duplicates are introduced after split assignment, so copied observations
    # inherit their source split and cannot straddle train and test by accident.
    duplicate_count = int(n*quality.get("duplicate_rate", 0))
    if duplicate_count:
        if split.get("mode") in ("temporal", "group"):
            raise ValueError("Injected duplicates are currently incompatible with temporal/group splits")
        duplicate_rng = stream(seed, replication, "duplicates")
        destination = duplicate_rng.choice(n, duplicate_count, replace=False)
        source = duplicate_rng.integers(0, n, duplicate_count)
        original = {name: values.copy() for name, values in columns.items()}
        for name in columns: columns[name][destination] = original[name][source]
        for name in ground_truth:
            original_truth = ground_truth[name].copy()
            ground_truth[name][destination] = original_truth[source]
        ground_truth["is_injected_duplicate"] = np.isin(np.arange(n), destination)
        warnings.append("Exact duplicates can repeat identifier values by design; duplicate families inherit their source split")
    if config.get("replications", 1) > 1:
        columns["_replication"] = np.full(n, replication+1)
        descriptors.append({"name": "_replication", "type": "integer", "role": "replication"})
    return columns, descriptors, sources, ground_truth, domain_tables, domain_metadata


def summarize(columns, descriptors, sources, config, warnings, cancel_check):
    summaries = {}
    types = {d["name"]: d["type"] for d in descriptors}
    for name, values in columns.items():
        check_cancel(cancel_check)
        present = np.asarray([v for v in values if v is not None], dtype=object)
        count = len(present)
        item = {"count": count, "missing": len(values)-count, "missing_rate": (len(values)-count)/max(len(values), 1)}
        numeric = types.get(name) in ("numeric", "integer", "derived")
        if numeric and count:
            x = present.astype(float)
            if not np.isfinite(x).all(): raise ValueError(f"{name}: observed values are nonfinite")
            with np.errstate(all="ignore"):
                mean, std = x.mean(), x.std(ddof=1) if count > 1 else 0
                quantiles = np.quantile(x, [.05, .25, .5, .75, .95])
                item.update(mean=finite(mean), std=finite(std), variance=finite(std**2), min=float(x.min()), max=float(x.max()), median=finite(quantiles[2]), q05=finite(quantiles[0]), q25=finite(quantiles[1]), q75=finite(quantiles[3]), q95=finite(quantiles[4]), skewness=finite(stats.skew(x)) if count > 2 and std else None)
                if x.min() == x.max():
                    edges = np.array([x.min()-.5, x.max()+.5])
                    counts = np.array([count])
                else:
                    try: counts, edges = np.histogram(x, bins=min(40, max(5, int(math.sqrt(count)))))
                    except ValueError: counts, edges = np.array([]), np.array([])
                item["histogram"] = {"edges": [finite(v) for v in edges], "counts": [int(v) for v in counts]}
            ordered = np.sort(x)
            indices = np.unique(np.linspace(0, count-1, min(200, count)).astype(int))
            item["cdf"] = [{"x": float(ordered[i]), "y": (int(i)+1)/count} for i in indices]
            variable = sources.get(name)
            if variable and variable.get("kind", "numeric") == "numeric" and not DISTRIBUTIONS.get(variable.get("distribution", "normal"), {}).get("vector"):
                distribution, params = variable.get("distribution", "normal"), variable.get("parameters")
                reference_sampling = config.get("sampling", {}).get("method") in ("bootstrap", "weighted")
                item["theoretical"] = {} if variable.get("conditional") or variable.get("hurdle") or reference_sampling else theoretical(distribution, params)
                if variable.get("zero_inflation") and item["theoretical"]:
                    mean, variance = item["theoretical"].get("mean"), item["theoretical"].get("variance")
                    z = variable["zero_inflation"]
                    if mean is not None and variance is not None:
                        new_mean = (1-z)*mean
                        new_variance = (1-z)*(variance+mean**2)-new_mean**2
                        item["theoretical"] = {"mean": new_mean, "variance": new_variance, "sd": math.sqrt(max(new_variance, 0))}
                modified = reference_sampling or any(variable.get(k) for k in ("noise", "clip", "censor", "exact_mean", "exact_std", "conditional", "zero_inflation", "hurdle")) or config.get("quality", {}).get("outlier_rate", 0) or config.get("timeseries", {}).get("enabled")
                bounds = variable.get("truncate")
                if not modified:
                    item["density"] = curve(distribution, params, float(x.min()), float(x.max()), truncate=[bounds["lower"], bounds["upper"]] if bounds else None)
                    item["density_kind"] = "pmf" if DISTRIBUTIONS[distribution]["discrete"] else "kde" if distribution == "kde" else "pdf"
                else: item["density_note"] = "Base-model overlay omitted because observation transformations alter its distribution"
                if bounds: item["theoretical_note"] = "Theoretical moments describe the base distribution before truncation"
                if item["theoretical"].get("mean", 0) is None or item["theoretical"].get("variance", 0) is None:
                    warnings.append(f"{name}: at least one population moment is undefined or infinite; empirical summaries do not imply that the population moment exists")
        else:
            frequency = {}
            for value in present:
                label = str(value)
                frequency[label] = frequency.get(label, 0)+1
            item["categories"] = [{"label": k, "count": v} for k, v in sorted(frequency.items(), key=lambda pair: -pair[1])[:100]]
            item["unique"] = len(frequency)
            if len(frequency) > 100: item["category_note"] = "Only the 100 most frequent labels are displayed"
        summaries[name] = item
    numeric_names = [d["name"] for d in descriptors if d["type"] in ("numeric", "integer", "derived") and d.get("role") not in ("replication", "timestamp")][:20]
    dimension = len(numeric_names)
    matrix = [[None]*dimension for _ in range(dimension)]
    pair_counts = [[0]*dimension for _ in range(dimension)]
    arrays = {name: np.asarray([np.nan if value is None else value for value in columns[name]], dtype=float) for name in numeric_names}
    for i, first in enumerate(numeric_names):
        check_cancel(cancel_check)
        for j in range(i, dimension):
            second = numeric_names[j]
            mask = np.isfinite(arrays[first]) & np.isfinite(arrays[second])
            count = int(mask.sum())
            pair_counts[i][j] = pair_counts[j][i] = count
            if count >= 2:
                x, y = arrays[first][mask], arrays[second][mask]
                value = finite(np.corrcoef(x, y)[0, 1]) if x.std() and y.std() else None
                matrix[i][j] = matrix[j][i] = value
    return summaries, {"columns": numeric_names, "matrix": matrix, "pair_counts": pair_counts, "method": "pearson", "note": "Pairwise complete observed rows; undefined correlations are null"}


def generate(config, preview=False, cancel_check=None, progress=None):
    config, warnings = checked_config(config)
    emit = lambda fraction, stage: progress(fraction, stage) if progress else None
    emit(0.02, "Validating specification")
    config_hash = hashlib.sha256(json.dumps(config, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode()).hexdigest()
    effective = copy.deepcopy(config)
    requested = config.get("rows", 5000)
    replications = config.get("replications", 1)
    n = min(requested, MAX_PREVIEW) if preview else requested
    if preview:
        if n != requested: warnings.append(f"Preview uses {n:,} rows instead of {requested:,}; full-output checks are not evaluated")
        if replications > 1:
            warnings.append("Preview shows the first replication only; between-replication uncertainty requires full generation")
            effective["replications"] = 1
        effective["rows"] = n
    event_clock = None
    if config.get("event", {}).get("enabled"):
        emit(.05, "Simulating event arrivals")
        event_clock, event_warnings = event_times(config, preview, stream(config.get("seed", 42), "events"), cancel_check)
        warnings.extend(event_warnings)
        n = len(event_clock)
        effective["rows"] = n
        requested = config["event"].get("count", requested) if config["event"].get("stop", "count") == "count" else None
        if preview:
            effective["event"]["count"] = n
            if config["event"].get("stop") == "window" and n >= MAX_PREVIEW:
                effective["event"]["window"] = float(event_clock[-1])
    all_columns, all_truth, descriptors, sources = {}, {}, [], {}
    domain_tables, domain_metadata = {}, None
    for replication in range(1 if preview else replications):
        check_cancel(cancel_check)
        emit(.1+.5*replication/replications, f"Generating replication {replication+1}")
        columns, descriptors, sources, truth, domain_tables, domain_metadata = _generate_replication(config, n, replication, preview, cancel_check, warnings)
        for name, values in columns.items(): all_columns.setdefault(name, []).append(values)
        for name, values in truth.items(): all_truth.setdefault(name, []).append(values)
    columns = {name: np.concatenate(arrays) for name, arrays in all_columns.items()}
    ground_truth = {name: np.concatenate(arrays) for name, arrays in all_truth.items()}
    if event_clock is not None:
        event = config["event"]
        scale = {"seconds": 1, "minutes": 60, "hours": 3600, "days": 86400}[event.get("unit", "seconds")]
        start = datetime.fromisoformat(event.get("start", "2026-01-01T00:00:00Z").replace("Z", "+00:00")).astimezone(timezone.utc)
        columns["event_id"] = np.arange(1, n+1)
        columns["elapsed"] = event_clock
        columns["interarrival"] = np.diff(np.r_[0, event_clock])
        try: columns["timestamp"] = np.asarray([(start+timedelta(seconds=float(t)*scale)).isoformat().replace("+00:00", "Z") for t in event_clock], dtype=object)
        except OverflowError as exc: raise ValueError("Event times exceed the supported calendar range") from exc
        columns["duration"] = np.full(n, event.get("duration", 0))
        descriptors.extend([{"name": "event_id", "type": "integer", "role": "identifier"}, {"name": "elapsed", "type": "numeric", "role": "timestamp", "units": event.get("unit", "seconds")}, {"name": "interarrival", "type": "numeric", "role": "feature", "units": event.get("unit", "seconds")}, {"name": "timestamp", "type": "datetime", "role": "timestamp"}, {"name": "duration", "type": "numeric", "role": "feature", "units": event.get("unit", "seconds")}])
    emit(.65, "Computing output statistics")
    summaries, correlation = summarize(columns, descriptors, sources, config, warnings, cancel_check)
    row_count = len(next(iter(columns.values()))) if columns else 0
    requested_total = requested*(1 if preview else replications) if requested is not None else None
    validation = [
        {"name": "Configuration feasibility", "status": "pass", "message": "Distribution domains, schema, correlation matrix and applicable model parameters passed validation"},
        {"name": "Output row count", "status": "not_evaluated" if preview else "pass", "target": requested_total, "actual": row_count, "message": "Preview uses its disclosed effective configuration" if preview else "All requested replications completed; target is the combined row count and event-window counts are stochastic"},
        {"name": "Finite observations", "status": "pass", "message": "No NaN or infinity is serialized; intentional missing values use null"},
        {"name": "Correlation interpretation", "status": "warning" if config.get("dependence", {}).get("mode") == "gaussian_copula" else "pass", "message": "Copula targets are latent Gaussian correlations; realized output Pearson correlations are reported" if config.get("dependence", {}).get("mode") == "gaussian_copula" else "No dependence target was requested"},
        {"name": "Privacy guarantee", "status": "not_evaluated", "message": "No formal differential privacy or anonymization guarantee; empirical/KDE values may reproduce or expose source observations"},
    ]
    constraints = config.get("constraints", [])
    if constraints:
        expression_columns = {name: np.asarray(values) for name, values in columns.items()}
        for d in descriptors:
            if d.get("id"): expression_columns[d["id"]] = expression_columns[d["name"]]
        for i, rule in enumerate(constraints):
            try:
                if any(None in values for values in columns.values()):
                    raise ValueError("Constraint evaluation requires complete fields; check clean versus observed rules")
                passed = evaluate_expression(rule["expression"], expression_columns, row_count).astype(bool)
                violations = int((~passed).sum())
                validation.append({"name": rule.get("name", f"Constraint {i+1}"), "status": "fail" if violations else "pass", "actual": violations, "target": 0, "message": f"{violations:,} observed rows violate {rule['expression']}; constraints are checked, not silently repaired"})
            except (ValueError, TypeError) as exc: validation.append({"name": rule.get("name", f"Constraint {i+1}"), "status": "not_evaluated", "message": str(exc)})
    if config.get("event", {}).get("enabled"):
        validation.append({"name": "Event ordering", "status": "pass", "message": "Elapsed event times are strictly increasing before any display-resolution rounding"})
    for v in config["variables"]:
        name = v["name"]
        if name in summaries:
            for control, statistic in (("exact_mean", "mean"), ("exact_std", "std")):
                if control in v:
                    tolerance = 10**(-v.get("decimals", 4))
                    actual = summaries[name].get(statistic)
                    valid = actual is not None and abs(actual-v[control]) <= tolerance
                    validation.append({"name": name+" "+control, "status": "pass" if valid else "fail", "target": v[control], "actual": actual, "message": f"Observed sample statistic, ddof=1 for standard deviation; tolerance {tolerance:g} after rounding/observation operations"})
            if v.get("exact_counts") is not None:
                p = validate_distribution("categorical", v.get("parameters"))
                counts = {str(label): sum(str(value) == str(label) for value in columns[name] if value is not None) for label in p["categories"]}
                targets = dict(zip((str(label) for label in p["categories"]), (x*replications for x in v["exact_counts"])))
                validation.append({"name": name+" exact category counts", "status": "not_evaluated" if preview else "pass" if counts == targets else "fail", "target": targets, "actual": counts, "message": "Full requested allocation is not evaluated in a scaled preview" if preview else "Counts after observation transformations across all replications"})
        if v.get("distribution") in ("multinomial", "dirichlet"):
            parameters = validate_distribution(v["distribution"], v.get("parameters"))
            total = parameters.get("trials", 1)
            if not any(v.get(k) for k in ("noise", "missing")) and not any(config.get("quality", {}).get(k) for k in ("rate", "outlier_rate")):
                sums = np.column_stack([columns[name] for name in parameters["names"]]).astype(float).sum(axis=1)
                validation.append({"name": v["name"]+" vector row totals", "status": "pass" if np.allclose(sums, total, atol=10**(-v.get("decimals", 4))*len(parameters["names"]), rtol=0) else "fail", "target": total, "message": "Integer count total" if v["distribution"] == "multinomial" else "Probability simplex, allowing stated rounding tolerance"})
    emit(.88, "Serializing immutable result")
    names = list(columns)
    rows = [{name: finite(columns[name][i]) for name in names} for i in range(row_count)]
    truth_names = list(ground_truth)
    truth_rows = [{name: finite(ground_truth[name][i]) for name in truth_names} for i in range(row_count)]
    warnings = list(dict.fromkeys(warnings))
    result = {
        "config_hash": config_hash, "config": config, "effective_config": effective, "preview": bool(preview),
        "row_count": row_count, "requested_rows": requested, "requested_total_rows": requested_total, "columns": descriptors, "rows": rows,
        "stats": summaries, "correlation": correlation, "validation": validation, "warnings": warnings,
        "ground_truth": truth_rows, "engine_version": __version__, "created_at": datetime.now(timezone.utc).isoformat(),
        "tables": domain_tables, "domain": domain_metadata,
        "provenance": {"numpy": np.__version__, "scipy": __import__("scipy").__version__, "rng": "PCG64DXSM", "stream_derivation": "SHA-256/SeedSequence", "pipeline": ["clean features", "derived features", "temporal transforms", "clean outcome", "measurement noise", "injected anomalies", "clipping/censoring", "rounding", "missingness", "split assignment", "duplicate injection"]},
    }
    check_cancel(cancel_check)
    emit(1, "Completed")
    return result
