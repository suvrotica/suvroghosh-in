"""Configuration validation and restricted, vectorized derived expressions."""

from __future__ import annotations

import ast
import copy
import math
from typing import Any

import numpy as np

from .distributions import DISTRIBUTIONS, DistributionError, covariance_matrix, validate_distribution


MAX_ROWS = 100_000
MAX_COLUMNS = 50
MAX_PREVIEW = 5_000
MAX_REPLICATIONS = 10


class SpecificationError(ValueError):
    def __init__(self, errors):
        self.errors = errors
        super().__init__("; ".join(f"{x['path']}: {x['message']}" for x in errors[:10]))


FUNCTIONS = {
    "sin": np.sin, "cos": np.cos, "tan": np.tan, "exp": np.exp,
    "log": np.log, "log1p": np.log1p, "sqrt": np.sqrt, "abs": np.abs,
    "minimum": np.minimum, "maximum": np.maximum, "clip": np.clip,
    "where": np.where,
}


def expression_tree(expression: str):
    if not isinstance(expression, str) or not expression.strip() or len(expression) > 1000:
        raise ValueError("Expression must be 1–1,000 characters")
    tree = ast.parse(expression, mode="eval")
    nodes = list(ast.walk(tree))
    allowed = (ast.Expression, ast.Constant, ast.Name, ast.Load, ast.BinOp, ast.UnaryOp, ast.Call, ast.Compare,
               ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Pow, ast.Mod, ast.USub, ast.UAdd,
               ast.Lt, ast.LtE, ast.Gt, ast.GtE, ast.Eq, ast.NotEq, ast.BitAnd, ast.BitOr)
    if len(nodes) > 150:
        raise ValueError("Expression is too complex")
    for node in nodes:
        if not isinstance(node, allowed): raise ValueError(f"Expression operation {type(node).__name__} is not allowed")
        if isinstance(node, ast.Constant) and (not isinstance(node.value, (int, float, bool)) or abs(node.value) > 1e10):
            raise ValueError("Only bounded numeric/boolean constants are allowed")
        if isinstance(node, ast.Call) and (not isinstance(node.func, ast.Name) or node.func.id not in FUNCTIONS or node.keywords):
            raise ValueError("Only documented mathematical functions are allowed")
        if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Pow):
            if not isinstance(node.right, ast.Constant) or not isinstance(node.right.value, (int, float)) or abs(node.right.value) > 12:
                raise ValueError("Exponents must be constant numbers between -12 and 12")
    return tree


def expression_dependencies(expression):
    return {node.id for node in ast.walk(expression_tree(expression)) if isinstance(node, ast.Name) and node.id not in FUNCTIONS}


def evaluate_expression(expression, columns, size):
    tree = expression_tree(expression)

    def visit(node):
        if isinstance(node, ast.Expression): return visit(node.body)
        if isinstance(node, ast.Constant): return node.value
        if isinstance(node, ast.Name):
            if node.id not in columns: raise ValueError(f"Unknown or not-yet-generated field: {node.id}")
            return np.asarray(columns[node.id])
        if isinstance(node, ast.Call): return FUNCTIONS[node.func.id](*(visit(x) for x in node.args))
        if isinstance(node, ast.UnaryOp): return -visit(node.operand) if isinstance(node.op, ast.USub) else visit(node.operand)
        if isinstance(node, ast.BinOp):
            left, right = visit(node.left), visit(node.right)
            operations = {ast.Add: np.add, ast.Sub: np.subtract, ast.Mult: np.multiply, ast.Div: np.divide,
                          ast.Pow: np.power, ast.Mod: np.mod, ast.BitAnd: np.logical_and, ast.BitOr: np.logical_or}
            return operations[type(node.op)](left, right)
        if isinstance(node, ast.Compare):
            operations = {ast.Lt: np.less, ast.LtE: np.less_equal, ast.Gt: np.greater, ast.GtE: np.greater_equal, ast.Eq: np.equal, ast.NotEq: np.not_equal}
            value = np.ones(size, dtype=bool)
            left = visit(node.left)
            for operator, right_node in zip(node.ops, node.comparators):
                right = visit(right_node)
                value &= operations[type(operator)](left, right)
                left = right
            return value
        raise ValueError("Unsupported expression")

    with np.errstate(all="ignore"):
        result = np.asarray(visit(tree))
    if result.ndim == 0: result = np.full(size, result.item())
    if result.shape != (size,): raise ValueError("Expression must produce one value per row")
    if result.dtype.kind not in "biuf" or not np.isfinite(result).all():
        raise ValueError("Expression produced nonfinite or nonnumeric values; check support and denominators")
    return result


def validate_config(config: Any):
    errors, warnings = [], []
    err = lambda path, message: errors.append({"path": path, "message": message})
    if not isinstance(config, dict):
        return {"valid": False, "errors": [{"path": "config", "message": "Configuration must be an object"}], "warnings": []}
    def unknown_fields(value, allowed, path):
        if isinstance(value, dict):
            for key in set(value)-set(allowed): err(f"{path}.{key}" if path else key, "Unsupported configuration field; consult the capability coverage report")
    unknown_fields(config, {"version", "name", "purpose", "target_population", "observation_unit", "rows", "seed", "replications", "variables", "dependence", "outcome", "event", "timeseries", "quality", "split", "constraints", "sampling", "domain"}, "")
    section_fields = {
        "dependence": {"mode", "columns", "matrix"},
        "outcome": {"task", "name", "coefficients", "intercept", "noise", "label_noise"},
        "event": {"enabled", "process", "stop", "count", "window", "distribution", "parameters", "start", "unit", "duration", "intensity_amplitude", "period"},
        "timeseries": {"enabled", "column", "trend", "seasonal_period", "amplitude", "ar"},
        "quality": {"missingness", "rate", "driver", "outlier_rate", "outlier_scale", "duplicate_rate"},
        "split": {"mode", "train", "validation", "group_column"},
        "sampling": {"method", "scramble", "strata", "allocation", "source_rows", "weights", "replace"},
        "domain": {"type", "parameters"},
    }
    for section, allowed in section_fields.items(): unknown_fields(config.get(section), allowed, section)
    if config.get("version", 1) != 1: err("version", "Only configuration version 1 is supported")
    for field, default, lower, upper in (("rows", 5000, 1, MAX_ROWS), ("seed", 42, 0, 2**53-1), ("replications", 1, 1, MAX_REPLICATIONS)):
        value = config.get(field, default)
        if isinstance(value, bool) or not isinstance(value, int) or not lower <= value <= upper:
            err(field, f"Must be an integer between {lower} and {upper}")
    if isinstance(config.get("rows"), int) and isinstance(config.get("replications", 1), int) and config["rows"]*config.get("replications", 1) > MAX_ROWS:
        err("replications", f"Total rows across replications cannot exceed {MAX_ROWS:,}")
    for field in ("name", "purpose", "target_population", "observation_unit"):
        if field in config and (not isinstance(config[field], str) or len(config[field]) > 2000): err(field, "Must be text of at most 2,000 characters")
    variables = config.get("variables", [])
    if not isinstance(variables, list) or not 1 <= len(variables) <= MAX_COLUMNS:
        err("variables", f"Define 1–{MAX_COLUMNS} variables")
        return {"valid": False, "errors": errors, "warnings": warnings}
    ids, names, output_names, numeric_ids = set(), set(), set(), set()
    for i, variable in enumerate(variables):
        path = f"variables.{i}"
        if not isinstance(variable, dict):
            err(path, "Variable must be an object")
            continue
        unknown_fields(variable, {"id", "name", "kind", "distribution", "parameters", "role", "decimals", "missing", "noise", "truncate", "clip", "censor", "expression", "units", "description", "exact_counts", "exact_mean", "exact_std", "zero_inflation", "hurdle", "conditional"}, path)
        identifier = variable.get("id", variable.get("name"))
        name = variable.get("name", identifier)
        for field, value, seen in (("id", identifier, ids), ("name", name, names)):
            if not isinstance(value, str) or not value.isidentifier() or len(value) > 64 or value in FUNCTIONS:
                err(path+"."+field, "Use a unique identifier of up to 64 characters, starting with a letter or underscore")
            elif value in seen: err(path+"."+field, "Duplicate variable identifier/name")
            else: seen.add(value)
        kind = variable.get("kind", "numeric")
        if kind not in ("numeric", "categorical", "id", "datetime", "derived", "text"):
            err(path+".kind", "Unsupported variable kind")
        if not isinstance(variable.get("role", "feature"), str) or len(variable.get("role", "feature")) > 64: err(path+".role", "Role must be bounded text")
        if not isinstance(variable.get("units", ""), str) or len(variable.get("units", "")) > 128: err(path+".units", "Units must be bounded text")
        for field in ("missing", "noise"):
            value = variable.get(field, 0)
            if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value) or value < 0 or (field == "missing" and value > 1):
                err(path+"."+field, "Missingness must be 0–1; noise must be finite and nonnegative")
        decimals = variable.get("decimals", 4)
        if isinstance(decimals, bool) or not isinstance(decimals, int) or not 0 <= decimals <= 12: err(path+".decimals", "Must be an integer from 0 to 12")
        try:
            if kind in ("numeric", "categorical"):
                distribution = variable.get("distribution", "normal")
                params = validate_distribution(distribution, variable.get("parameters"))
                spec = DISTRIBUTIONS[distribution]
                zero_inflation = variable.get("zero_inflation", 0)
                if not isinstance(zero_inflation, (int, float)) or not math.isfinite(zero_inflation) or not 0 <= zero_inflation <= 1: raise ValueError("zero_inflation must be a probability between 0 and 1")
                hurdle = variable.get("hurdle")
                if hurdle is not None:
                    unknown_fields(hurdle, {"zero_probability"}, path+".hurdle")
                    if not isinstance(hurdle, dict) or not isinstance(hurdle.get("zero_probability"), (int, float)) or not 0 <= hurdle["zero_probability"] <= 1: raise ValueError("hurdle needs zero_probability between 0 and 1")
                    if zero_inflation: raise ValueError("Choose zero inflation or a hurdle, not both")
                    from .distributions import frozen
                    f = frozen(distribution, params)
                    if f is None or f.cdf(0) >= 1: raise ValueError("Hurdle requires a standard scalar distribution with positive probability above zero")
                conditional = variable.get("conditional")
                if conditional is not None:
                    unknown_fields(conditional, {"on", "cases"}, path+".conditional")
                    if not isinstance(conditional, dict) or not isinstance(conditional.get("cases"), dict) or not 1 <= len(conditional["cases"]) <= 100: raise ValueError("Conditional generator needs on and 1–100 case definitions")
                    parents = [v for v in variables[:i] if isinstance(v, dict) and conditional.get("on") in (v.get("id"), v.get("name"))]
                    if not parents or parents[0].get("distribution") != "categorical": raise ValueError("Conditional on must identify an earlier categorical field")
                    for case in conditional["cases"].values():
                        if not isinstance(case, dict): raise ValueError("Conditional cases must be distribution/parameters objects")
                        unknown_fields(case, {"distribution", "parameters"}, path+".conditional.cases")
                        case_name = case.get("distribution", distribution)
                        validate_distribution(case_name, case.get("parameters"))
                        if DISTRIBUTIONS[case_name].get("vector") or ((case_name == "categorical") != (distribution == "categorical")): raise ValueError("Conditional cases must preserve the scalar numeric/categorical output type")
                if (zero_inflation or hurdle) and (distribution == "categorical" or spec.get("vector")): raise ValueError("Zero/hurdle mechanisms require a scalar numeric output")
                if (zero_inflation or hurdle or conditional) and any(key in variable for key in ("exact_counts", "exact_mean", "exact_std")): raise ValueError("Conditional/zero/hurdle generators cannot currently combine with exact sample constraints")
                if hurdle and conditional: raise ValueError("Conditional hurdle mixtures are not currently supported")
                generated_names = params["names"] if spec.get("vector") else [name]
                for n in generated_names:
                    if n in output_names: raise ValueError(f"Duplicate output column: {n}")
                    output_names.add(n)
                if distribution != "categorical": numeric_ids.add(identifier)
                if spec.get("vector") and any(variable.get(x) for x in ("truncate", "clip", "exact_counts", "exact_mean", "exact_std")):
                    raise ValueError("Vector generators cannot use scalar truncation, clipping, or exact-sample controls")
                for operation in ("truncate", "clip", "censor"):
                    bounds = variable.get(operation)
                    if bounds is not None:
                        unknown_fields(bounds, {"lower", "upper"}, path+"."+operation)
                        if not isinstance(bounds, dict) or not all(isinstance(bounds.get(k), (int, float)) and math.isfinite(bounds[k]) for k in ("lower", "upper")) or bounds["lower"] >= bounds["upper"]:
                            raise ValueError(f"{operation} requires finite lower < upper")
                        if distribution == "categorical": raise ValueError(f"{operation} is not applicable to categorical values")
                if "exact_counts" in variable:
                    counts = variable["exact_counts"]
                    if distribution != "categorical" or not isinstance(counts, list) or len(counts) != len(params["categories"]) or any(not isinstance(x, int) or x < 0 for x in counts) or sum(counts) != config.get("rows", 5000):
                        raise ValueError("Exact category counts require one nonnegative integer per category summing to requested rows")
                if "exact_mean" in variable or "exact_std" in variable:
                    if distribution != "normal" or config.get("rows", 5000) < 2 or variable.get("truncate") or variable.get("clip"):
                        raise ValueError("Exact sample moments currently require an unbounded normal generator with at least two rows")
                    for key in ("exact_mean", "exact_std"):
                        if key in variable and (not isinstance(variable[key], (int, float)) or not math.isfinite(variable[key]) or (key == "exact_std" and variable[key] <= 0)):
                            raise ValueError("Exact moments must be finite; exact_std must be positive")
                    warnings.append(f"{name}: exact sample moments change iid sampling; ddof=1 and final rounding tolerance apply")
            elif kind == "derived":
                expression_tree(variable.get("expression", ""))
                numeric_ids.add(identifier)
                output_names.add(name)
            elif kind == "datetime":
                from datetime import datetime
                p = variable.get("parameters", {})
                unknown_fields(p, {"start", "end"}, path+".parameters")
                start, end = datetime.fromisoformat(p.get("start", "2026-01-01T00:00:00+00:00").replace("Z", "+00:00")), datetime.fromisoformat(p.get("end", "2027-01-01T00:00:00+00:00").replace("Z", "+00:00"))
                if start.tzinfo is None or end.tzinfo is None or end <= start: raise ValueError("Dates need explicit time zones and end > start")
                output_names.add(name)
            else:
                parameters = variable.get("parameters", {})
                if not isinstance(parameters, dict): raise ValueError("Variable parameters must be an object")
                unknown_fields(parameters, {"prefix"} if kind == "id" else {"vocabulary", "words"} if kind == "text" else set(), path+".parameters")
                if kind == "id" and (not isinstance(parameters.get("prefix", ""), str) or len(parameters.get("prefix", "")) > 64): raise ValueError("Identifier prefix must be bounded text")
                if kind == "text":
                    vocabulary, words = parameters.get("vocabulary", ["sample", "observation", "synthetic", "record"]), parameters.get("words", 4)
                    if not isinstance(vocabulary, list) or not 1 <= len(vocabulary) <= 1000 or any(not isinstance(word, str) or len(word) > 128 for word in vocabulary): raise ValueError("Text vocabulary must be 1–1,000 bounded strings")
                    if isinstance(words, bool) or not isinstance(words, int) or not 1 <= words <= 50: raise ValueError("Text word count must be 1–50")
                output_names.add(name)
        except (ValueError, TypeError, OverflowError, KeyError) as exc: err(path, str(exc))
    known = ids | names
    split_known = set(known)
    if isinstance(config.get("domain"), dict):
        domain_names = {"longitudinal": {"entity_id", "visit", "measurement"}, "relational": {"parent_id", "child_count"}, "graph": {"node_id", "degree"}, "spatial": {"spatial_x", "spatial_y", "spatial_z"}, "survival": {"survival_time", "survival_event"}}
        split_known |= domain_names.get(config["domain"].get("type"), set())
    for i, variable in enumerate(variables):
        if isinstance(variable, dict) and variable.get("kind") == "derived":
            try:
                unknown = expression_dependencies(variable.get("expression", ""))-known
                if unknown: err(f"variables.{i}.expression", "Unknown fields: " + ", ".join(sorted(unknown)))
            except ValueError: pass
    dependence = config.get("dependence", {})
    if not isinstance(dependence, dict): err("dependence", "Must be an object")
    elif dependence.get("mode", "independent") not in ("independent", "gaussian_copula"): err("dependence.mode", "Supported modes are independent and gaussian_copula")
    elif dependence.get("mode") == "gaussian_copula":
        try:
            columns = dependence.get("columns", [])
            if not isinstance(columns, list) or len(columns) < 2 or len(set(columns)) != len(columns) or not set(columns) <= numeric_ids:
                raise ValueError("Copula columns need at least two unique numeric variable IDs")
            matrix = covariance_matrix(dependence.get("matrix"), len(columns))
            if not np.allclose(np.diag(matrix), 1, atol=1e-9): raise ValueError("Correlation matrix diagonal must equal one")
            for v in variables:
                if v.get("id", v.get("name")) in columns and DISTRIBUTIONS.get(v.get("distribution"), {}).get("vector"):
                    raise ValueError("Copula requires scalar marginal generators")
                if v.get("id", v.get("name")) in columns and any(v.get(k) for k in ("conditional", "hurdle", "zero_inflation")): raise ValueError("Copula cannot currently be combined with conditional/zero/hurdle marginal mechanisms")
            warnings.append("Copula matrix is latent Gaussian correlation; output Pearson/rank correlations may differ")
        except (ValueError, TypeError) as exc: err("dependence", str(exc))
    outcome = config.get("outcome", {})
    if not isinstance(outcome, dict): err("outcome", "Must be an object")
    elif outcome.get("task", "none") not in ("none", "regression", "classification"): err("outcome.task", "Supported tasks: none, regression, classification")
    elif outcome.get("task", "none") != "none":
        name = outcome.get("name", "target")
        if not isinstance(name, str) or not name.isidentifier() or name in output_names: err("outcome.name", "Target needs a unique identifier name")
        coefficients = outcome.get("coefficients", {})
        numeric_names = {v["name"] for v in variables if isinstance(v, dict) and v.get("id", v.get("name")) in numeric_ids and not DISTRIBUTIONS.get(v.get("distribution"), {}).get("vector")}
        numeric_keys = numeric_names | {v.get("id", v.get("name")) for v in variables if isinstance(v, dict) and v.get("name") in numeric_names}
        if not isinstance(coefficients, dict) or not set(coefficients) <= numeric_keys or any(not isinstance(x, (int, float)) or not math.isfinite(x) for x in coefficients.values()): err("outcome.coefficients", "Use finite coefficients keyed by existing scalar numeric variable IDs")
        for key in ("intercept", "noise", "label_noise"):
            value = outcome.get(key, 0)
            if not isinstance(value, (int, float)) or not math.isfinite(value) or (key != "intercept" and value < 0) or (key == "label_noise" and value > 1): err("outcome."+key, "Invalid finite outcome parameter")
    quality = config.get("quality", {})
    if not isinstance(quality, dict): err("quality", "Must be an object")
    else:
        if quality.get("missingness", "mcar") not in ("mcar", "mar", "mnar"): err("quality.missingness", "Supported mechanisms are mcar, mar, mnar")
        for key in ("rate", "outlier_rate", "duplicate_rate"):
            value = quality.get(key, 0)
            if not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 <= value <= 1: err("quality."+key, "Must be a probability between 0 and 1")
        scale = quality.get("outlier_scale", 5)
        if not isinstance(scale, (int, float)) or not math.isfinite(scale) or not 0 <= scale <= 1e9: err("quality.outlier_scale", "Must be finite and between 0 and 1e9")
        if quality.get("missingness") == "mar" and quality.get("rate", 0) > 0 and quality.get("driver") not in numeric_ids: err("quality.driver", "MAR needs an observed numeric driver ID, protected from the global missingness mask")
    split = config.get("split", {})
    if not isinstance(split, dict): err("split", "Must be an object")
    else:
        mode = split.get("mode", "none")
        if mode not in ("none", "random", "stratified", "temporal", "group"): err("split.mode", "Unsupported split strategy")
        train, validation = split.get("train", 0.7), split.get("validation", 0.15)
        if any(not isinstance(x, (int, float)) or not math.isfinite(x) or not 0 <= x <= 1 for x in (train, validation)) or train+validation > 1: err("split", "Train and validation fractions must be nonnegative and sum to at most one")
        if mode == "group" and split.get("group_column") not in split_known: err("split.group_column", "Choose an existing group field")
        if mode == "stratified" and outcome.get("task") != "classification": err("split.mode", "Stratification requires a classification target")
    event = config.get("event", {})
    if not isinstance(event, dict): err("event", "Must be an object")
    elif event.get("enabled"):
        try:
            if event.get("process", "renewal") not in ("renewal", "poisson", "nonhomogeneous"): raise ValueError("Unsupported arrival process")
            if event.get("stop", "count") not in ("count", "window"): raise ValueError("Stop policy must be count or window")
            count, window = event.get("count", config.get("rows", 5000)), event.get("window", 3600)
            if not isinstance(count, int) or not 1 <= count <= MAX_ROWS: raise ValueError("Event count must be 1–100,000")
            if not isinstance(window, (int, float)) or not math.isfinite(window) or window <= 0: raise ValueError("Event window must be positive and finite")
            if event.get("unit", "seconds") not in ("seconds", "minutes", "hours", "days"): raise ValueError("Units: seconds, minutes, hours, days")
            distribution = "exponential" if event.get("process") in ("poisson", "nonhomogeneous") else event.get("distribution", "exponential")
            params = validate_distribution(distribution, event.get("parameters", {"rate": 1}))
            if distribution not in ("exponential", "gamma", "weibull", "lognormal", "constant", "uniform"):
                raise ValueError("Arrival gaps need a supported strictly positive distribution")
            if distribution == "uniform" and params["lower"] <= 0: raise ValueError("Uniform arrival gaps must have lower > 0")
            if distribution == "constant" and params["value"] <= 0: raise ValueError("Constant arrival gap must be positive")
            amplitude = event.get("intensity_amplitude", 0)
            if not isinstance(amplitude, (int, float)) or not 0 <= amplitude < 1: raise ValueError("Intensity amplitude must lie in [0,1)")
            if not isinstance(event.get("period", 3600), (int, float)) or not math.isfinite(event.get("period", 3600)) or event.get("period", 3600) <= 0: raise ValueError("Intensity period must be positive and finite")
            from datetime import datetime
            start = datetime.fromisoformat(event.get("start", "2026-01-01T00:00:00Z").replace("Z", "+00:00"))
            if start.tzinfo is None: raise ValueError("Start timestamp needs an explicit time zone")
            duration = event.get("duration", 0)
            if not isinstance(duration, (int, float)) or not math.isfinite(duration) or duration < 0: raise ValueError("Duration must be finite and nonnegative")
        except (ValueError, TypeError, OverflowError) as exc: err("event", str(exc))
        if config.get("replications", 1) != 1: err("replications", "Event mode currently supports one replication per run")
    timeseries = config.get("timeseries", {})
    if not isinstance(timeseries, dict): err("timeseries", "Must be an object")
    elif timeseries.get("enabled"):
        if timeseries.get("column") not in numeric_ids: err("timeseries.column", "Choose a numeric scalar variable ID")
        for key, default in (("trend", 0), ("amplitude", 0), ("ar", 0), ("seasonal_period", 50)):
            value = timeseries.get(key, default)
            if not isinstance(value, (int, float)) or not math.isfinite(value) or (key == "ar" and abs(value) >= 1) or (key == "seasonal_period" and value <= 0): err("timeseries."+key, "Use finite values, |AR| < 1, and a positive seasonal period")
    sampling = config.get("sampling", {})
    if not isinstance(sampling, dict): err("sampling", "Sampling must be an object")
    elif sampling.get("method", "random") not in ("random", "latin_hypercube", "sobol", "halton", "quantile", "linear", "stratified", "bootstrap", "weighted"): err("sampling.method", "Unsupported sampling design")
    elif not isinstance(sampling.get("scramble", True), bool): err("sampling.scramble", "Must be true or false")
    if isinstance(sampling, dict):
        method = sampling.get("method", "random")
        if method == "stratified":
            strata = next((v for v in variables if isinstance(v, dict) and sampling.get("strata") in (v.get("id"), v.get("name"))), None)
            allocation = sampling.get("allocation", {})
            if not strata or strata.get("distribution") != "categorical": err("sampling.strata", "Stratification requires an existing categorical field")
            elif not isinstance(allocation, dict) or set(allocation) != set(str(x) for x in validate_distribution("categorical", strata.get("parameters"))["categories"]) or any(not isinstance(x, int) or x < 0 for x in allocation.values()) or sum(allocation.values()) != config.get("rows", 5000): err("sampling.allocation", "Specify one nonnegative integer per category, summing to requested rows")
            elif strata.get("exact_counts") is not None: err("sampling.allocation", "Choose stratified allocation or per-field exact_counts, not both")
            elif any(allocation[str(label)] == 0 and probability > 0 for label, probability in zip(validate_distribution("categorical", strata.get("parameters"))["categories"], validate_distribution("categorical", strata.get("parameters"))["probabilities"])):
                warnings.append("A positive-population stratum has zero sample allocation; sampling weights cannot recover its missing observations")
        if method in ("bootstrap", "weighted"):
            source = sampling.get("source_rows", [])
            needed = {v["name"] for v in variables if isinstance(v, dict) and v.get("kind") != "derived"}
            if not isinstance(source, list) or not 1 <= len(source) <= 10000 or any(not isinstance(row, dict) or set(row) != needed or any(not isinstance(x, (str, int, float, bool)) or (isinstance(x, str) and len(x) > 128) or (isinstance(x, (int, float)) and not math.isfinite(x)) for x in row.values()) for row in source): err("sampling.source_rows", "Reference resampling needs 1–10,000 complete scalar source records matching non-derived schema columns")
            elif not sampling.get("replace", True) and config.get("rows", 5000) > len(source): err("sampling.replace", "Without replacement, requested rows cannot exceed source records")
            weights = sampling.get("weights")
            if weights is not None and (not isinstance(weights, list) or len(weights) != len(source) or any(not isinstance(x, (int, float)) or not math.isfinite(x) or x < 0 for x in weights) or sum(weights) <= 0): err("sampling.weights", "Use a nonnegative finite weight per source row with positive total")
            if method == "weighted" and weights is None: err("sampling.weights", "Weighted resampling requires explicit source-row weights")
            if isinstance(weights, list) and not sampling.get("replace", True) and sum(isinstance(x, (int, float)) and x > 0 for x in weights) < config.get("rows", 5000): err("sampling.weights", "Without replacement, at least requested_rows source records need positive weights")
            if not isinstance(sampling.get("replace", True), bool): err("sampling.replace", "Must be true or false")
            if config.get("dependence", {}).get("mode") == "gaussian_copula": err("sampling", "Reference resampling preserves row relationships; copula generation is not applicable")
            if config.get("event", {}).get("enabled"): err("sampling", "Reference-row resampling cannot currently combine with generated event timelines")
            if any(DISTRIBUTIONS.get(v.get("distribution"), {}).get("vector") or any(v.get(k) is not None for k in ("conditional", "zero_inflation", "hurdle", "truncate", "exact_counts", "exact_mean", "exact_std")) for v in variables if isinstance(v, dict)):
                err("sampling", "Reference-row resampling cannot combine with vector generators or marginal-only synthesis constraints")
        if method in ("latin_hypercube", "sobol", "halton", "quantile", "linear") and any(v.get("conditional") or v.get("hurdle") or v.get("zero_inflation") for v in variables if isinstance(v, dict)):
            err("sampling", "QMC/grid sampling cannot currently combine with conditional or structural-zero mechanisms")
    constraints = config.get("constraints", [])
    if not isinstance(constraints, list) or len(constraints) > 100:
        err("constraints", "Use a list of at most 100 constraints")
        constraints = []
    for i, constraint in enumerate(constraints):
        try:
            if not isinstance(constraint, dict): raise ValueError("Constraint must be an object")
            unknown_fields(constraint, {"name", "expression"}, f"constraints.{i}")
            expression_tree(constraint.get("expression", ""))
        except ValueError as exc: err(f"constraints.{i}", str(exc))
    reserved = {"_split", "_replication", "_sampling_weight", "event_id", "timestamp", "elapsed", "interarrival", "duration", "time_index"}
    overlap = reserved & output_names
    if isinstance(outcome, dict) and outcome.get("task", "none") != "none" and outcome.get("name", "target") in reserved: overlap.add(outcome.get("name", "target"))
    if overlap: err("variables", "Reserved generated names: " + ", ".join(sorted(overlap)))
    try:
        from .domains import validate_domain
        validate_domain(config)
    except (ValueError, TypeError, KeyError) as exc: err("domain", str(exc))
    return {"valid": not errors, "errors": errors, "warnings": warnings}


def checked_config(config):
    validation = validate_config(config)
    if not validation["valid"]: raise SpecificationError(validation["errors"])
    return copy.deepcopy(config), validation["warnings"]
