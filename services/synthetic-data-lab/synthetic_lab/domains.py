"""Small, explicit parametric domain simulators with auditable assumptions.

These modules are user-designed mechanisms. They do not infer causal structure,
promise geographic realism, or claim to fit a private source population.
"""

from __future__ import annotations

import math

import numpy as np
from scipy.special import expit

from .models import MAX_ROWS, evaluate_expression, expression_dependencies


DOMAIN_TYPES = {"causal", "survival", "spatial", "graph", "relational", "longitudinal"}


def bounded(p, key, default, low, high, integer=False):
    value = p.get(key, default)
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high or (integer and int(value) != value):
        raise ValueError(f"domain.parameters.{key} must be {'an integer' if integer else 'finite'} between {low} and {high}")
    return int(value) if integer else float(value)


def descriptor(name, kind="numeric", role="feature", **kwargs):
    return {"name": name, "id": name, "type": kind, "role": role, **kwargs}


def validate_domain(config):
    domain = config.get("domain")
    if not domain: return
    if not isinstance(domain, dict) or domain.get("type") not in DOMAIN_TYPES or not isinstance(domain.get("parameters", {}), dict):
        raise ValueError("domain needs a supported type and a parameters object")
    if config.get("replications", 1) != 1: raise ValueError("Domain modules currently support one replication per job")
    if config.get("event", {}).get("enabled"): raise ValueError("Domain modules and event-arrival mode cannot currently be combined")
    if config.get("quality", {}).get("duplicate_rate", 0) and domain["type"] in ("graph", "relational", "longitudinal"):
        raise ValueError("Injected duplicates cannot currently be combined with structural entity/key domain modules")
    p, kind = domain.get("parameters", {}), domain["type"]
    allowed = {
        "graph": {"probability", "within_probability", "between_probability", "communities", "directed", "ensure_connected"},
        "spatial": {"centres", "probabilities", "std", "crs", "units"},
        "survival": {"shape", "scale", "censor_time", "dropout_rate", "coefficients", "units"},
        "longitudinal": {"entities", "random_intercept_std", "random_slope_std", "measurement_std", "trend"},
        "relational": {"mean_children", "child_noise", "parent_coefficient", "driver"},
        "causal": {"nodes", "interventions"},
    }
    unknown = set(p)-allowed[kind]
    if unknown: raise ValueError("Unsupported domain parameter(s): " + ", ".join(sorted(unknown)))
    if kind == "graph":
        if config.get("rows", 5000) > 1000: raise ValueError("Graph generation supports at most 1,000 nodes; rows is node count")
        for key, default in (("probability", .03), ("within_probability", .15), ("between_probability", .01)):
            bounded(p, key, default, 0, 1)
        bounded(p, "communities", 1, 1, 50, integer=True)
    elif kind == "spatial":
        centres = np.asarray(p.get("centres", [[-3, -2], [3, 2]]), dtype=float)
        if centres.ndim != 2 or not 1 <= len(centres) <= 50 or centres.shape[1] not in (2, 3) or not np.isfinite(centres).all():
            raise ValueError("Spatial centres must be 1–50 finite 2D or 3D coordinates")
        bounded(p, "std", .8, .000001, 1e6)
        if p.get("crs", "cartesian") != "cartesian": raise ValueError("Spatial module currently supports Cartesian coordinates only; no latitude/longitude distance conversion")
    elif kind == "survival":
        bounded(p, "shape", 1.5, .01, 100)
        bounded(p, "scale", 10, .000001, 1e8)
        bounded(p, "censor_time", 15, .000001, 1e10)
        bounded(p, "dropout_rate", 0, 0, 1e6)
        coefficients = p.get("coefficients", {})
        if not isinstance(coefficients, dict) or any(not isinstance(v, (int, float)) or not math.isfinite(v) for v in coefficients.values()): raise ValueError("Survival coefficients must be a finite numeric mapping")
    elif kind == "longitudinal":
        bounded(p, "entities", 100, 1, min(MAX_ROWS, config.get("rows", 5000)), integer=True)
        for key, default in (("random_intercept_std", 2), ("random_slope_std", .2), ("measurement_std", .5)):
            bounded(p, key, default, 0, 1e6)
        bounded(p, "trend", .1, -1e6, 1e6)
    elif kind == "relational":
        bounded(p, "mean_children", 3, 0, 100)
        bounded(p, "child_noise", 1, 0, 1e6)
        bounded(p, "parent_coefficient", 2, -1e6, 1e6)
    elif kind == "causal":
        nodes = p.get("nodes", [{"name": "treatment", "expression": "x", "noise_std": 1}, {"name": "outcome", "expression": "2*treatment + x", "noise_std": 1}])
        if not isinstance(nodes, list) or not 1 <= len(nodes) <= 20: raise ValueError("Causal models require 1–20 structural nodes")
        names = set()
        for node in nodes:
            if not isinstance(node, dict) or not isinstance(node.get("name"), str) or not node["name"].isidentifier() or node["name"] in names: raise ValueError("Structural node names must be unique identifiers")
            names.add(node["name"])
            if set(node)-{"name", "expression", "noise_std", "kind", "role"}: raise ValueError("Unsupported causal structural-node parameter")
            expression_dependencies(node.get("expression", ""))
            bounded(node, "noise_std", 1, 0, 1e6)
            if node.get("kind", "continuous") not in ("continuous", "binary"): raise ValueError("Causal nodes support continuous or binary logistic assignments")
        interventions = p.get("interventions", {"treatment": 1})
        if not isinstance(interventions, dict) or not set(interventions) <= names or any(not isinstance(x, (int, float)) or not math.isfinite(x) for x in interventions.values()): raise ValueError("Interventions must map structural node names to finite constants")


def apply_domain(config, columns, descriptors, ground_truth, rng, n, preview):
    domain = config.get("domain")
    if not domain: return {}, None, []
    validate_domain(config)
    p, kind = domain.get("parameters", {}), domain["type"]
    warnings, tables = [], {}
    metadata = {"type": kind, "parameters": p, "assumptions": []}

    def add(name, values, type="numeric", role="feature", **kw):
        if name in columns: raise ValueError(f"Domain output column conflicts with schema: {name}")
        columns[name] = np.asarray(values)
        descriptors.append(descriptor(name, type, role, **kw))

    if kind == "spatial":
        centres = np.asarray(p.get("centres", [[-3, -2], [3, 2]]), dtype=float)
        probabilities = p.get("probabilities", np.full(len(centres), 1/len(centres)))
        probabilities = np.asarray(probabilities, dtype=float)
        if probabilities.shape != (len(centres),) or (probabilities < 0).any() or not np.isclose(probabilities.sum(), 1): raise ValueError("Spatial cluster probabilities must be nonnegative and sum to one")
        cluster = rng.choice(len(centres), n, p=probabilities)
        coordinates = centres[cluster]+rng.normal(0, p.get("std", .8), (n, centres.shape[1]))
        for i, axis in enumerate("xyz"[:centres.shape[1]]): add("spatial_"+axis, coordinates[:, i], units=p.get("units", "model units"))
        ground_truth["spatial_cluster"] = cluster
        metadata["assumptions"] = ["Cartesian coordinates", "Independent isotropic Gaussian clusters", "Cluster membership is simulator ground truth"]
    elif kind == "survival":
        score = np.zeros(n)
        for name, coefficient in p.get("coefficients", {}).items():
            variable = next((v for v in config["variables"] if name in (v.get("id"), v["name"])), None)
            output = variable["name"] if variable else name
            if output not in columns or np.asarray(columns[output]).dtype.kind not in "biuf": raise ValueError(f"Survival covariate {name} must be numeric")
            score += coefficient*np.asarray(columns[output], dtype=float)
        if (np.abs(score) > 600).any(): raise ValueError("Survival linear predictor exceeds stable exponentiation range")
        u = np.maximum(rng.random(n), np.finfo(float).tiny)
        true_time = p.get("scale", 10)*(-np.log(u)/np.exp(score))**(1/p.get("shape", 1.5))
        admin = np.full(n, p.get("censor_time", 15))
        censor = np.minimum(admin, rng.exponential(1/p["dropout_rate"], n)) if p.get("dropout_rate", 0) > 0 else admin
        event = true_time <= censor
        add("survival_time", np.minimum(true_time, censor), role="target", units=p.get("units", "time units"))
        add("survival_event", event.astype(int), "integer", "target")
        ground_truth["survival_latent_event_time"] = true_time
        ground_truth["survival_censor_time"] = censor
        metadata["assumptions"] = ["Weibull proportional hazards", "Independent administrative/exponential right censoring", "No competing risks or delayed entry"]
        metadata["event_fraction"] = float(event.mean()) if n else None
        # A bounded, stepwise Kaplan-Meier curve for the observed output.
        ordered = np.argsort(np.minimum(true_time, censor))
        times, indicators = np.minimum(true_time, censor)[ordered], event[ordered]
        survival, points, at_risk = 1.0, [{"time": 0.0, "survival": 1.0}], n
        unique, first, counts = np.unique(times, return_index=True, return_counts=True)
        deaths_at_time = np.add.reduceat(indicators.astype(int), first) if len(first) else []
        for time, deaths, removed in zip(unique, deaths_at_time, counts):
            deaths, removed = int(deaths), int(removed)
            if at_risk: survival *= 1-deaths/at_risk
            points.append({"time": float(time), "survival": survival})
            at_risk -= removed
        if len(points) > 500: points = [points[i] for i in np.unique(np.linspace(0, len(points)-1, 500).astype(int))]
        metadata["kaplan_meier"] = points
    elif kind == "longitudinal":
        entities = min(p.get("entities", 100), n)
        if not entities:
            entity_index, visit = np.array([], dtype=int), np.array([], dtype=int)
        else:
            entity_index, visit = np.arange(n)%entities, np.arange(n)//entities
        intercepts = rng.normal(0, p.get("random_intercept_std", 2), entities)
        slopes = rng.normal(0, p.get("random_slope_std", .2), entities)
        outcome = intercepts[entity_index]+(p.get("trend", .1)+slopes[entity_index])*visit+rng.normal(0, p.get("measurement_std", .5), n)
        add("entity_id", np.asarray([f"entity_{x+1:06d}" for x in entity_index]), "categorical", "group")
        add("visit", visit, "integer", "timestamp")
        add("measurement", outcome, role="target")
        ground_truth["entity_random_intercept"] = intercepts[entity_index]
        ground_truth["entity_random_slope"] = slopes[entity_index]
        metadata["effective_entities"] = entities
        metadata["assumptions"] = ["Crossed independent Gaussian intercept/slope effects", "Balanced visits except possibly the final visit", "Separate entity-safe splitting is recommended"]
        if preview and entities != p.get("entities", 100): warnings.append("Preview reduces the entity count; effective domain metadata records the change")
    elif kind == "relational":
        counts = rng.poisson(p.get("mean_children", 3), n)
        if counts.sum() > MAX_ROWS: raise ValueError("Child table would exceed 100,000 rows; reduce parent rows or mean children")
        parent_ids = np.asarray([f"parent_{i+1:07d}" for i in range(n)])
        add("parent_id", parent_ids, "categorical", "identifier")
        add("child_count", counts, "integer")
        parent_index = np.repeat(np.arange(n), counts)
        driver = p.get("driver")
        if driver:
            variable = next((v for v in config["variables"] if driver in (v.get("id"), v["name"])), None)
            driver = variable["name"] if variable else driver
        else: driver = next((name for name, values in columns.items() if np.asarray(values).dtype.kind in "fiub" and name != "child_count"), None)
        if driver is None or driver not in columns or np.asarray(columns[driver]).dtype.kind not in "fiub": raise ValueError("Relational generation needs a numeric parent driver")
        values = p.get("parent_coefficient", 2)*np.asarray(columns[driver], dtype=float)[parent_index]+rng.normal(0, p.get("child_noise", 1), len(parent_index))
        child_rows = [{"child_id": f"child_{i+1:07d}", "parent_id": str(parent_ids[parent_index[i]]), "value": float(values[i])} for i in range(len(parent_index))]
        tables["children"] = {"columns": [descriptor("child_id", "categorical", "identifier"), descriptor("parent_id", "categorical", "foreign_key"), descriptor("value")], "rows": child_rows, "row_count": len(child_rows), "relationships": [{"column": "parent_id", "parent_table": "main", "parent_column": "parent_id"}]}
        metadata["assumptions"] = ["Poisson child counts per parent", "Child value is a conditional linear Gaussian model", "Foreign keys are valid by construction"]
        metadata["child_rows"] = len(child_rows)
    elif kind == "graph":
        communities = p.get("communities", 1)
        group = np.arange(n)%communities
        source, target = np.where(~np.eye(n, dtype=bool)) if p.get("directed", False) else np.triu_indices(n, 1)
        probabilities = np.full(len(source), p.get("probability", .03)) if communities == 1 else np.where(group[source] == group[target], p.get("within_probability", .15), p.get("between_probability", .01))
        selected = rng.random(len(source)) < probabilities
        source, target = source[selected], target[selected]
        edge_set = set(zip(source.tolist(), target.tolist()))
        if p.get("ensure_connected", False):
            if p.get("directed", False): raise ValueError("ensure_connected currently applies only to undirected graphs")
            edge_set.update((i, i+1) for i in range(n-1))
            warnings.append("Connectivity is enforced by adding chain edges; the final graph is no longer an unconditioned Erdos-Renyi/block-model draw")
        if len(edge_set) > MAX_ROWS: raise ValueError("Edge table exceeds 100,000 edges; reduce nodes or edge probabilities")
        edges = sorted(edge_set)
        node_ids = np.asarray([f"node_{i+1:06d}" for i in range(n)])
        degree = np.zeros(n, dtype=int)
        for a, b in edges: degree[a] += 1; degree[b] += 1
        add("node_id", node_ids, "categorical", "identifier")
        add("degree", degree, "integer")
        ground_truth["graph_community"] = group
        tables["edges"] = {"columns": [descriptor("source", "categorical", "foreign_key"), descriptor("target", "categorical", "foreign_key"), descriptor("weight")], "rows": [{"source": str(node_ids[a]), "target": str(node_ids[b]), "weight": 1.0} for a, b in edges], "row_count": len(edges), "relationships": [{"column": name, "parent_table": "main", "parent_column": "node_id"} for name in ("source", "target")]}
        metadata["assumptions"] = ["Simple graph without self loops", "Independent Bernoulli edges before optional connectivity enforcement", "Stochastic block model when communities > 1"]
        metadata["edge_count"] = len(edges)
        metadata["directed"] = p.get("directed", False)
        metadata["degree_definition"] = "total incident degree (in + out)" if p.get("directed", False) else "undirected degree"
    elif kind == "causal":
        nodes = p.get("nodes", [{"name": "treatment", "expression": "x", "noise_std": 1}, {"name": "outcome", "expression": "2*treatment + x", "noise_std": 1}])
        factual = {name: np.asarray(values) for name, values in columns.items()}
        for variable in config["variables"]:
            if variable["name"] in factual: factual[variable.get("id", variable["name"])] = factual[variable["name"]]
        counterfactual = {name: values.copy() for name, values in factual.items()}
        interventions = p.get("interventions", {"treatment": 1})
        pending = list(nodes)
        while pending:
            advanced = False
            for node in pending[:]:
                if node["name"] in columns: raise ValueError("Causal node collides with an existing input column")
                if not expression_dependencies(node["expression"]) <= factual.keys(): continue
                noise = rng.random(n) if node.get("kind") == "binary" else rng.normal(0, node.get("noise_std", 1), n)
                clean = evaluate_expression(node["expression"], factual, n)
                alternative = evaluate_expression(node["expression"], counterfactual, n)
                if node.get("kind") == "binary":
                    value = (noise < expit(clean)).astype(int)
                    alternative = (noise < expit(alternative)).astype(int)
                else: value, alternative = clean+noise, alternative+noise
                if node["name"] in interventions: alternative = np.full(n, interventions[node["name"]])
                factual[node["name"]], counterfactual[node["name"]] = value, alternative
                add(node["name"], value, "integer" if node.get("kind") == "binary" else "numeric", node.get("role", "feature"))
                ground_truth[node["name"]+"_exogenous"] = noise
                ground_truth["counterfactual_"+node["name"]] = alternative
                ground_truth["counterfactual_difference_"+node["name"]] = alternative-value
                pending.remove(node)
                advanced = True
            if not advanced: raise ValueError("Causal graph has a cycle, unknown parent, or unavailable input")
        metadata["assumptions"] = ["User-specified acyclic structural equations", "Independent node disturbances", "Counterfactuals preserve each unit's input values and exogenous disturbances", "No causal identification is inferred from observed correlations"]
        metadata["interventions"] = interventions
    return tables, metadata, warnings
