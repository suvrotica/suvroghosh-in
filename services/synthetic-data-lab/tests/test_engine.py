import copy
import json
import math

import numpy as np
import pytest

from synthetic_lab.distributions import DISTRIBUTIONS, DistributionError, sample, theoretical, validate_distribution
from synthetic_lab.engine import capabilities, generate
from synthetic_lab.models import evaluate_expression, validate_config


def config(rows=2000, distribution="normal", parameters=None):
    return {"version": 1, "name": "test", "rows": rows, "seed": 1847, "variables": [
        {"id": "x", "name": "x", "kind": "numeric", "distribution": distribution,
         "parameters": parameters if parameters is not None else {"mean": 0, "std": 1}, "decimals": 8},
    ]}


@pytest.mark.parametrize("name", list(DISTRIBUTIONS))
def test_every_registered_distribution_produces_finite_valid_shape(name):
    p = validate_distribution(name, {})
    values = sample(name, p, 257, np.random.default_rng(45))
    assert len(values) == 257
    if name != "categorical": assert np.isfinite(values).all()
    if DISTRIBUTIONS[name].get("vector"): assert values.ndim == 2


def test_normal_parameter_changes_use_common_random_numbers():
    first = generate(config())
    changed = config(parameters={"mean": 10, "std": 2})
    second = generate(changed)
    a = np.array([r["x"] for r in first["rows"]])
    b = np.array([r["x"] for r in second["rows"]])
    assert np.allclose(b, 10+2*a, atol=3e-8)
    assert abs(a.mean()) < .08
    assert abs(a.std()-1) < .08


def test_reproducibility_and_named_streams():
    c = config()
    first = generate(c)
    assert first["rows"] == generate(c)["rows"]
    c["variables"].append({"id": "other", "name": "other", "distribution": "uniform", "parameters": {"lower": 0, "upper": 1}})
    assert [r["x"] for r in first["rows"]] == [r["x"] for r in generate(c)["rows"]]
    assert first["config_hash"] != generate(c)["config_hash"]


def test_invalid_parameters_and_matrices_rejected():
    assert not validate_config(config(parameters={"mean": 0, "std": -1}))["valid"]
    assert not validate_config(config(parameters={"mean": 0, "std": 1, "unrecognized": 2}))["valid"]
    c = config()
    c["variables"].append({"id": "y", "name": "y", "distribution": "normal", "parameters": {"mean": 0, "std": 1}})
    c["dependence"] = {"mode": "gaussian_copula", "columns": ["x", "y"], "matrix": [[1, 2], [2, 1]]}
    assert not validate_config(c)["valid"]


def test_gaussian_copula_realizes_gaussian_correlation():
    c = config(5000)
    c["variables"].append({"id": "y", "name": "y", "distribution": "normal", "parameters": {"mean": 0, "std": 1}})
    c["dependence"] = {"mode": "gaussian_copula", "columns": ["x", "y"], "matrix": [[1, .8], [.8, 1]]}
    result = generate(c)
    assert abs(result["correlation"]["matrix"][0][1]-.8) < .04


@pytest.mark.parametrize("distribution,parameters,total", [
    ("multinomial", {"trials": 12, "probabilities": [.2, .3, .5], "names": ["a", "b", "c"]}, 12),
    ("dirichlet", {"alpha": [2, 3, 4], "names": ["a", "b", "c"]}, 1),
])
def test_vector_row_invariants(distribution, parameters, total):
    r = generate(config(500, distribution, parameters))
    assert np.allclose([sum(row.values()) for row in r["rows"]], total, atol=3e-8)


def test_undefined_population_moments_remain_undefined():
    assert theoretical("cauchy", {"location": 0, "scale": 1}) == {"mean": None, "variance": None, "sd": None}
    r = generate(config(100, "cauchy", {"location": 0, "scale": 1}))
    assert r["stats"]["x"]["theoretical"]["mean"] is None
    assert r["stats"]["x"]["mean"] is not None
    json.dumps(r, allow_nan=False)


def test_exact_category_counts_and_scaled_preview_are_disclosed():
    c = config(10_000, "categorical", {"categories": ["A", "B"], "probabilities": [.7, .3]})
    c["variables"][0]["exact_counts"] = [7000, 3000]
    r = generate(c)
    assert sum(x["x"] == "A" for x in r["rows"]) == 7000
    p = generate(c, preview=True)
    assert len(p["rows"]) == 5000
    assert sum(x["x"] == "A" for x in p["rows"]) == 3500
    assert any("preview exact counts" in w for w in p["warnings"])


def test_exact_sample_moments_are_distinct_from_population_parameters():
    c = config()
    c["variables"][0].update(exact_mean=11, exact_std=3)
    r = generate(c)
    x = np.array([row["x"] for row in r["rows"]])
    assert abs(x.mean()-11) < 1e-8
    assert abs(x.std(ddof=1)-3) < 1e-8
    assert any("iid" in w for w in r["warnings"])


def test_truncation_and_clipping_have_different_boundary_mass():
    c = config(5000)
    c["variables"][0]["truncate"] = {"lower": -1, "upper": 1}
    trunc = generate(c)
    assert all(-1 <= row["x"] <= 1 for row in trunc["rows"])
    assert not any(row["x"] in (-1, 1) for row in trunc["rows"])
    del c["variables"][0]["truncate"]
    c["variables"][0]["clip"] = {"lower": -1, "upper": 1}
    clipped = generate(c)
    assert sum(row["x"] in (-1, 1) for row in clipped["rows"]) > 1000
    assert "density" not in clipped["stats"]["x"]


def test_derived_expression_dependency_and_sandbox():
    c = config(100)
    c["variables"] += [
        {"id": "z", "name": "z", "kind": "derived", "expression": "y + 1"},
        {"id": "y", "name": "y", "kind": "derived", "expression": "x * 2"},
    ]
    r = generate(c)
    assert all(abs(row["z"]-(2*row["x"]+1)) < .0002 for row in r["rows"])
    for expression in ("__import__('os')", "x.__class__", "[x for x in x]", "2 ** x", "open(1)"):
        with pytest.raises((ValueError, SyntaxError)): evaluate_expression(expression, {"x": np.arange(3)}, 3)


def test_ml_labels_and_clean_truth_are_separate():
    c = config()
    c["outcome"] = {"task": "classification", "name": "target", "coefficients": {"x": 2}, "intercept": 0, "label_noise": 0}
    r = generate(c)
    assert set(row["target"] for row in r["rows"]) == {0, 1}
    assert not any("probability" in key for key in r["rows"][0])
    assert "target_probability" in r["ground_truth"][0]
    assert .4 < np.mean([row["target"] for row in r["rows"]]) < .6


def test_mcar_and_mnar_masks_are_recorded_and_rate_calibrated():
    c = config(5000)
    c["quality"] = {"missingness": "mnar", "rate": .4}
    r = generate(c)
    assert .36 < r["stats"]["x"]["missing_rate"] < .44
    observed = np.array([v["x"] is None for v in r["rows"]])
    clean = np.array([v["x_clean"] for v in r["ground_truth"]])
    assert clean[observed].mean() > clean[~observed].mean()


def test_poisson_arrivals_have_positive_gaps_and_expected_mean():
    c = config(5000)
    c["event"] = {"enabled": True, "process": "poisson", "stop": "count", "count": 5000, "parameters": {"rate": 2}, "unit": "seconds", "start": "2026-01-01T00:00:00Z"}
    r = generate(c)
    gaps = np.array([row["interarrival"] for row in r["rows"]])
    assert (gaps > 0).all()
    assert abs(gaps.mean()-.5) < .025
    assert np.all(np.diff([row["elapsed"] for row in r["rows"]]) > 0)


def test_window_arrivals_stay_inside_window():
    c = config(100)
    c["event"] = {"enabled": True, "process": "nonhomogeneous", "stop": "window", "window": 100, "parameters": {"rate": 2}, "intensity_amplitude": .5, "period": 25}
    r = generate(c)
    assert all(0 < row["elapsed"] <= 100 for row in r["rows"])
    assert 130 < r["row_count"] < 270


def test_group_split_never_splits_entities():
    c = config(1000)
    c["variables"].append({"id": "group", "name": "group", "kind": "categorical", "distribution": "categorical", "parameters": {"categories": ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"], "probabilities": [.1]*10}})
    c["split"] = {"mode": "group", "group_column": "group", "train": .6, "validation": .2}
    r = generate(c)
    for label in "abcdefghij": assert len({row["_split"] for row in r["rows"] if row["group"] == label}) == 1


def test_independent_replications_and_cancellation():
    c = config(100)
    c["replications"] = 2
    r = generate(c)
    assert r["row_count"] == 200
    assert r["rows"][0]["x"] != r["rows"][100]["x"]
    with pytest.raises(RuntimeError, match="cancelled"): generate(c, cancel_check=lambda: True)


def test_serialization_and_registry_agree():
    r = generate(config(50))
    assert len(r["rows"]) == r["row_count"] == r["stats"]["x"]["count"]
    json.dumps(r, allow_nan=False)
    assert {d["id"] for d in capabilities()["distributions"]} == set(DISTRIBUTIONS)


def test_violated_constraints_are_reported_not_silently_repaired():
    c = config(500)
    c["constraints"] = [{"name": "positive", "expression": "x >= 0"}]
    r = generate(c)
    check = next(v for v in r["validation"] if v["name"] == "positive")
    assert check["status"] == "fail"
    assert check["actual"] > 150


def test_unknown_config_and_nested_controls_are_rejected():
    c = config(100)
    c["privacy"] = {"epsilon": 1}
    assert not validate_config(c)["valid"]
    del c["privacy"]
    c["outcome"] = {"task": "classification", "classes": 7}
    assert not validate_config(c)["valid"]


def test_causal_counterfactuals_reuse_unit_exogenous_noise():
    c = config(1000)
    c["domain"] = {"type": "causal", "parameters": {
        "nodes": [{"name": "treatment", "expression": "x", "noise_std": 1}, {"name": "response", "expression": "2*treatment+x", "noise_std": 1, "role": "target"}],
        "interventions": {"treatment": 1},
    }}
    r = generate(c)
    for row, truth in zip(r["rows"], r["ground_truth"]):
        assert abs(truth["counterfactual_response"]-row["response"]-2*(1-row["treatment"])) < 1e-10
    assert not any("counterfactual" in key for key in r["rows"][0])


def test_survival_observations_and_latent_times_reconcile():
    c = config(3000)
    c["domain"] = {"type": "survival", "parameters": {"shape": 1, "scale": 10, "censor_time": 5, "coefficients": {}}}
    r = generate(c)
    for row, truth in zip(r["rows"], r["ground_truth"]):
        assert row["survival_time"] == min(truth["survival_latent_event_time"], truth["survival_censor_time"])
        assert row["survival_event"] == int(truth["survival_latent_event_time"] <= truth["survival_censor_time"])
    # Exponential survival with mean 10: P(T <= 5) = 1-exp(-.5).
    assert abs(r["domain"]["event_fraction"]-(1-math.exp(-.5))) < .04
    curve = r["domain"]["kaplan_meier"]
    assert all(a["survival"] >= b["survival"] for a, b in zip(curve, curve[1:]))


def test_spatial_clusters_match_their_declared_centres():
    c = config(1000)
    c["domain"] = {"type": "spatial", "parameters": {"centres": [[-10, 0], [10, 0]], "std": .1}}
    r = generate(c)
    for label, centre in ((0, -10), (1, 10)):
        points = [row["spatial_x"] for row, truth in zip(r["rows"], r["ground_truth"]) if truth["spatial_cluster"] == label]
        assert abs(np.mean(points)-centre) < .02


def test_graph_edges_reference_valid_distinct_nodes_and_degrees_reconcile():
    c = config(100)
    c["domain"] = {"type": "graph", "parameters": {"communities": 3, "within_probability": .2, "between_probability": .01, "ensure_connected": True}}
    r = generate(c)
    ids = {row["node_id"] for row in r["rows"]}
    edges = r["tables"]["edges"]["rows"]
    assert all(edge["source"] in ids and edge["target"] in ids and edge["source"] != edge["target"] for edge in edges)
    assert len({(edge["source"], edge["target"]) for edge in edges}) == len(edges)
    assert sum(row["degree"] for row in r["rows"]) == 2*len(edges)
    assert len(edges) >= 99


def test_relational_foreign_keys_and_counts_are_valid():
    c = config(500)
    c["domain"] = {"type": "relational", "parameters": {"mean_children": 3, "driver": "x"}}
    r = generate(c)
    counts = {row["parent_id"]: row["child_count"] for row in r["rows"]}
    children = r["tables"]["children"]["rows"]
    assert sum(counts.values()) == len(children)
    assert all(row["parent_id"] in counts for row in children)
    assert len({row["child_id"] for row in children}) == len(children)


def test_repeated_entities_use_one_split_per_entity():
    c = config(1000)
    c["domain"] = {"type": "longitudinal", "parameters": {"entities": 100, "random_intercept_std": 2, "random_slope_std": .1, "measurement_std": .3}}
    c["split"] = {"mode": "group", "group_column": "entity_id", "train": .7, "validation": .15}
    r = generate(c)
    groups = {}
    for row in r["rows"]: groups.setdefault(row["entity_id"], set()).add(row["_split"])
    assert len(groups) == 100
    assert all(len(splits) == 1 for splits in groups.values())


def test_domain_options_not_implemented_are_rejected():
    c = config(100)
    c["domain"] = {"type": "survival", "parameters": {"competing_risks": True}}
    assert not validate_config(c)["valid"]


def test_custom_piecewise_density_and_cdf_have_expected_shapes():
    rng = np.random.default_rng(123)
    # f(x)=2x on [0,1], whose CDF is x² and mean is 2/3.
    x = sample("custom_pdf", {"values": [0, 1], "density": [0, 2]}, 20000, rng)
    assert (x >= 0).all() and (x <= 1).all()
    assert abs(x.mean()-2/3) < .01
    assert abs(np.mean(x <= .5)-.25) < .015
    # A flat CDF interval contains no sampled values.
    y = sample("custom_cdf", {"values": [0, 1, 2, 3], "cdf": [0, .5, .5, 1]}, 10000, rng)
    assert not ((y > 1) & (y < 2)).any()


def test_zero_inflation_and_hurdle_have_different_zero_semantics():
    inflated = config(5000, "poisson", {"mean": 2})
    inflated["variables"][0]["zero_inflation"] = .3
    a = generate(inflated)
    hurdle = copy.deepcopy(inflated)
    del hurdle["variables"][0]["zero_inflation"]
    hurdle["variables"][0]["hurdle"] = {"zero_probability": .3}
    b = generate(hurdle)
    fraction_a = np.mean([row["x"] == 0 for row in a["rows"]])
    fraction_b = np.mean([row["x"] == 0 for row in b["rows"]])
    assert abs(fraction_a-(.3+.7*math.exp(-2))) < .025
    assert abs(fraction_b-.3) < .025
    assert fraction_a > fraction_b+.06


def test_conditional_marginals_follow_clean_subgroups():
    c = config(3000)
    c["variables"].insert(0, {"id": "segment", "name": "segment", "kind": "categorical", "distribution": "categorical", "parameters": {"categories": ["A", "B"], "probabilities": [.5, .5]}})
    c["variables"][1]["conditional"] = {"on": "segment", "cases": {"A": {"distribution": "normal", "parameters": {"mean": -5, "std": .2}}, "B": {"distribution": "normal", "parameters": {"mean": 5, "std": .2}}}}
    r = generate(c)
    assert abs(np.mean([row["x"] for row in r["rows"] if row["segment"] == "A"])+5) < .03
    assert abs(np.mean([row["x"] for row in r["rows"] if row["segment"] == "B"])-5) < .03
    assert r["stats"]["x"]["theoretical"] == {}


def test_stratified_allocation_and_design_weights():
    c = config(1000, "categorical", {"categories": ["A", "B"], "probabilities": [.8, .2]})
    c["variables"][0]["kind"] = "categorical"
    c["sampling"] = {"method": "stratified", "strata": "x", "allocation": {"A": 500, "B": 500}}
    r = generate(c)
    assert sum(row["x"] == "A" for row in r["rows"]) == 500
    assert set(row["_sampling_weight"] for row in r["rows"] if row["x"] == "A") == {1.6}
    assert set(row["_sampling_weight"] for row in r["rows"] if row["x"] == "B") == {.4}


def test_weighted_reference_resampling_preserves_whole_rows():
    c = config(2000)
    c["variables"].append({"id": "y", "name": "y", "distribution": "normal", "parameters": {"mean": 0, "std": 1}})
    c["sampling"] = {"method": "weighted", "source_rows": [{"x": 1, "y": 10}, {"x": 2, "y": 20}], "weights": [9, 1], "replace": True}
    r = generate(c)
    assert all(row["y"] == 10*row["x"] for row in r["rows"])
    assert .86 < np.mean([row["x"] == 1 for row in r["rows"]]) < .94
    assert r["stats"]["x"]["theoretical"] == {}


def test_without_replacement_reference_sampling_has_no_reused_source_positions():
    c = config(10)
    c["sampling"] = {"method": "bootstrap", "source_rows": [{"x": i} for i in range(15)], "replace": False}
    r = generate(c)
    assert len({row["source_row_index"] for row in r["ground_truth"]}) == 10


def test_replication_total_is_used_for_row_count_validation():
    c = config(20)
    c["replications"] = 3
    r = generate(c)
    check = next(item for item in r["validation"] if item["name"] == "Output row count")
    assert check["actual"] == check["target"] == 60
    assert r["requested_rows"] == 20 and r["requested_total_rows"] == 60


def test_custom_pmf_support_can_be_noninteger():
    r = generate(config(500, "custom_pmf", {"values": [.25, 1.5], "probabilities": [.3, .7]}))
    assert set(row["x"] for row in r["rows"]) == {.25, 1.5}
    assert r["columns"][0]["type"] == "numeric"
    assert {point["x"] for point in r["stats"]["x"]["density"]} == {.25, 1.5}


def test_reserved_targets_cannot_overwrite_system_columns():
    c = config(10)
    c["outcome"] = {"task": "regression", "name": "_split", "coefficients": {"x": 1}}
    assert not validate_config(c)["valid"]
