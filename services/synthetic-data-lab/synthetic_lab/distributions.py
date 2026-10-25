"""Explicit, validated distribution adapters backed by NumPy and SciPy.

The UI registry is generated from the same definitions used by the engine.
Parameters are expressed in data units, not SciPy's occasionally standardized
shape conventions. Distribution objects are deliberately never user-supplied.
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np
from scipy import stats


class DistributionError(ValueError):
    pass


def parameter(name, label, default, minimum=None, maximum=None, step=0.1, **extra):
    return dict(name=name, label=label, default=default, min=minimum, max=maximum, step=step, **extra)


MEAN = parameter("mean", "Mean", 0, step=0.5)
SD = parameter("std", "Standard deviation", 1, 0.001, step=0.1)
LOC = parameter("location", "Location", 0, step=0.5)
SCALE = parameter("scale", "Scale", 1, 0.001, step=0.1)
PROB = parameter("p", "Success probability", 0.5, 0, 1, 0.01)
LOWER = parameter("lower", "Lower bound", 0, step=0.5)
UPPER = parameter("upper", "Upper bound", 10, step=0.5)


def spec(label, parameters, description, discrete=False, **extra):
    return dict(label=label, parameters=parameters, description=description, discrete=discrete, **extra)


DISTRIBUTIONS = {
    "normal": spec("Normal", [MEAN, SD], "A symmetric bell curve. Mean locates its centre; standard deviation controls spread."),
    "uniform": spec("Uniform", [LOWER, UPPER], "Equal density across a bounded continuous interval."),
    "discrete_uniform": spec("Discrete uniform", [parameter("lower", "First integer", 0, step=1), parameter("upper", "Last integer (inclusive)", 10, step=1)], "Equal probability for each integer between inclusive bounds.", True),
    "lognormal": spec("Lognormal", [parameter("log_mean", "Log-space mean", 0), parameter("log_sd", "Log-space standard deviation", 0.6, 0.001)], "Positive, right-skewed values; parameters describe their natural logarithms."),
    "exponential": spec("Exponential", [parameter("rate", "Rate (per unit)", 1, 0.001)], "Positive waiting times. Mean equals 1 / rate."),
    "gamma": spec("Gamma", [parameter("shape", "Shape", 2, 0.001), SCALE], "Positive values with independently adjustable shape and scale."),
    "beta": spec("Beta", [parameter("alpha", "Alpha", 2, 0.001), parameter("beta", "Beta", 5, 0.001), parameter("lower", "Lower bound", 0), parameter("upper", "Upper bound", 1)], "Bounded proportions, optionally transformed to another interval."),
    "weibull": spec("Weibull", [parameter("shape", "Shape", 1.5, 0.001), SCALE], "Positive lifetimes; shape changes the hazard profile."),
    "poisson": spec("Poisson", [parameter("mean", "Expected count per interval", 5, 0, step=0.5)], "Nonnegative event counts for a stated exposure interval.", True),
    "bernoulli": spec("Bernoulli", [PROB], "A binary success/failure indicator.", True),
    "binomial": spec("Binomial", [parameter("trials", "Number of trials", 10, 0, step=1), PROB], "Success count in a fixed number of independent trials.", True),
    "negative_binomial": spec("Negative binomial", [parameter("successes", "Required successes", 5, 0.001), parameter("p", "Success probability", 0.5, 0.001, 1, 0.01)], "Failures before r successes; mean = r(1-p)/p.", True),
    "categorical": spec("Categorical", [parameter("categories", "Category labels", ["A", "B", "C"], kind="array"), parameter("probabilities", "Probabilities", [0.5, 0.3, 0.2], kind="array")], "Unordered labels drawn with specified probabilities.", True),
    "student_t": spec("Student’s t", [parameter("df", "Degrees of freedom", 5, 0.001), LOC, SCALE], "Symmetric heavy tails. Population moments depend on degrees of freedom."),
    "cauchy": spec("Cauchy", [LOC, SCALE], "Very heavy tails; no population mean or variance exists."),
    "laplace": spec("Laplace", [LOC, SCALE], "A sharply peaked distribution with exponential tails."),
    "logistic": spec("Logistic", [LOC, SCALE], "Symmetric continuous values with heavier tails than a normal."),
    "pareto": spec("Pareto", [parameter("minimum", "Minimum value", 1, 0.001), parameter("tail_index", "Tail index", 3, 0.001)], "Power-law tail above a positive minimum; moments may not exist."),
    "zipf": spec("Zipf", [parameter("exponent", "Exponent (>1)", 2, 1.001)], "Unbounded positive integer ranks with a power-law tail.", True),
    "geometric": spec("Geometric", [parameter("p", "Success probability", 0.4, 0.001, 1, 0.01), parameter("counting", "Counting convention", "trials", kind="choice", choices=["trials", "failures"])], "Trials until first success, or failures before first success.", True),
    "hypergeometric": spec("Hypergeometric", [parameter("population", "Population size", 100, 1, step=1), parameter("successes", "Successes in population", 30, 0, step=1), parameter("draws", "Draw count", 10, 0, step=1)], "Successes sampled without replacement from a finite population.", True),
    "triangular": spec("Triangular", [parameter("lower", "Minimum", 0), parameter("mode", "Mode", 3), parameter("upper", "Maximum", 10)], "A bounded distribution described by minimum, mode, maximum."),
    "gev": spec("Generalized extreme value", [parameter("shape", "Tail shape ξ", 0.1), LOC, SCALE], "Extreme-value family using conventional ξ; SciPy c is -ξ."),
    "mixture": spec("Normal mixture", [parameter("weight", "First component probability", 0.5, 0, 1, 0.01), parameter("mean1", "First mean", -2), parameter("sd1", "First standard deviation", 0.7, 0.001), parameter("mean2", "Second mean", 2), parameter("sd2", "Second standard deviation", 0.7, 0.001)], "Two normal components, useful for multimodal examples."),
    "empirical": spec("Empirical", [parameter("values", "Reference observations", [1, 2, 2, 3, 5, 8], kind="array")], "Resample the supplied observations with replacement.", True),
    "histogram": spec("Histogram", [parameter("edges", "Bin edges", [0, 1, 2, 4], kind="array"), parameter("counts", "Bin counts", [10, 30, 10], kind="array")], "Piecewise-constant density based on explicit bin counts and edges."),
    "kde": spec("Kernel density", [parameter("values", "Reference observations", [1, 2, 2, 3, 5, 8], kind="array"), parameter("bandwidth", "Bandwidth factor", 0.4, 0.001)], "Gaussian kernel mixture around reference values; may extend beyond their range."),
    "constant": spec("Constant", [parameter("value", "Value", 1)], "The same explicit value on each row."),
    "custom_pmf": spec("Custom probability masses", [parameter("values", "Support values", [0, 1, 5], kind="array"), parameter("probabilities", "Point probabilities", [0.2, 0.5, 0.3], kind="array")], "Explicit finite numeric support with validated probability masses.", True),
    "custom_cdf": spec("Custom CDF", [parameter("values", "Increasing support knots", [0, 1, 3, 5], kind="array"), parameter("cdf", "CDF at each knot", [0, 0.2, 0.8, 1], kind="array")], "A monotone piecewise-linear CDF on bounded support; slopes define piecewise-constant densities."),
    "custom_pdf": spec("Custom density", [parameter("values", "Increasing support knots", [0, 1, 3, 5], kind="array"), parameter("density", "Density heights", [0, 1, 0.5, 0], kind="array")], "A nonnegative piecewise-linear bounded density, normalized by exact trapezoidal areas."),
    "multivariate_normal": spec("Multivariate normal", [parameter("means", "Mean vector", [0, 0], kind="array"), parameter("covariance", "Covariance matrix", [[1, 0.5], [0.5, 1]], kind="matrix"), parameter("names", "Output column names", ["x", "y"], kind="array")], "A jointly Gaussian vector with a positive-semidefinite covariance matrix.", vector=True),
    "multinomial": spec("Multinomial", [parameter("trials", "Trial count", 10, 0, step=1), parameter("probabilities", "Category probabilities", [0.5, 0.3, 0.2], kind="array"), parameter("names", "Output column names", ["count_A", "count_B", "count_C"], kind="array")], "An integer vector whose entries sum to the specified trial count.", True, vector=True),
    "dirichlet": spec("Dirichlet", [parameter("alpha", "Concentration vector", [2, 3, 5], kind="array"), parameter("names", "Output column names", ["share_A", "share_B", "share_C"], kind="array")], "A positive probability vector with entries summing to one.", vector=True),
}


def number(p: dict, name: str, default=None, *, positive=False, nonnegative=False, integer=False):
    value = p.get(name, default)
    if isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(value):
        raise DistributionError(f"{name} must be a finite number")
    if positive and value <= 0:
        raise DistributionError(f"{name} must be greater than zero")
    if nonnegative and value < 0:
        raise DistributionError(f"{name} must be nonnegative")
    if integer and int(value) != value:
        raise DistributionError(f"{name} must be an integer")
    return int(value) if integer else float(value)


def probability(p, name="p", default=0.5, *, positive=False):
    value = number(p, name, default)
    if value > 1 or value < 0 or (positive and value == 0):
        raise DistributionError(f"{name} must lie {'strictly above 0 and ' if positive else ''}between 0 and 1")
    return value


def vector(p, name, *, positive=False, length=None):
    value = np.asarray(p.get(name, []), dtype=float)
    if value.ndim != 1 or value.size == 0 or value.size > 10000 or not np.isfinite(value).all():
        raise DistributionError(f"{name} must be a nonempty finite vector (at most 10,000 entries)")
    if positive and (value <= 0).any():
        raise DistributionError(f"{name} entries must be positive")
    if length is not None and value.size != length:
        raise DistributionError(f"{name} must contain {length} entries")
    return value


def probabilities(p, name="probabilities"):
    value = vector(p, name)
    if (value < 0).any() or not np.isclose(value.sum(), 1, atol=1e-9, rtol=0):
        raise DistributionError(f"{name} must be nonnegative and sum to 1")
    return value


def covariance_matrix(value, dimension):
    m = np.asarray(value, dtype=float)
    if m.shape != (dimension, dimension) or not np.isfinite(m).all():
        raise DistributionError("Covariance matrix dimensions must match the mean vector")
    if not np.allclose(m, m.T, atol=1e-10, rtol=0):
        raise DistributionError("Covariance matrix must be symmetric")
    if np.linalg.eigvalsh(m).min() < -1e-9:
        raise DistributionError("Covariance matrix must be positive semidefinite")
    return m


def normalized_parameters(name: str, parameters: dict | None):
    if name not in DISTRIBUTIONS:
        raise DistributionError(f"Unsupported distribution: {name}")
    if parameters is not None and not isinstance(parameters, dict):
        raise DistributionError("Distribution parameters must be an object")
    defaults = {x["name"]: x["default"] for x in DISTRIBUTIONS[name]["parameters"]}
    supplied = parameters or {}
    unknown = set(supplied) - set(defaults)
    if unknown:
        raise DistributionError("Unknown parameter(s): " + ", ".join(sorted(unknown)))
    defaults.update(supplied)
    return defaults


def frozen(name: str, parameters: dict | None):
    p = normalized_parameters(name, parameters)
    n = lambda key, **kw: number(p, key, **kw)
    loc = lambda: n("location")
    scale = lambda: n("scale", positive=True)
    if name == "normal": return stats.norm(n("mean"), n("std", positive=True))
    if name in ("uniform", "discrete_uniform", "beta", "triangular"):
        lo, hi = n("lower"), n("upper")
        if hi <= lo: raise DistributionError("upper must be greater than lower")
        if name == "uniform": return stats.uniform(lo, hi-lo)
        if name == "discrete_uniform":
            lo, hi = n("lower", integer=True), n("upper", integer=True)
            return stats.randint(lo, hi+1)
        if name == "beta": return stats.beta(n("alpha", positive=True), n("beta", positive=True), loc=lo, scale=hi-lo)
        mode = n("mode")
        if not lo <= mode <= hi: raise DistributionError("mode must lie between minimum and maximum")
        return stats.triang((mode-lo)/(hi-lo), loc=lo, scale=hi-lo)
    if name == "lognormal": return stats.lognorm(s=n("log_sd", positive=True), scale=math.exp(n("log_mean")))
    if name == "exponential": return stats.expon(scale=1/n("rate", positive=True))
    if name == "gamma": return stats.gamma(n("shape", positive=True), scale=scale())
    if name == "weibull": return stats.weibull_min(n("shape", positive=True), scale=scale())
    if name == "poisson": return stats.poisson(n("mean", nonnegative=True))
    if name == "bernoulli": return stats.bernoulli(probability(p))
    if name == "binomial": return stats.binom(n("trials", integer=True, nonnegative=True), probability(p))
    if name == "negative_binomial": return stats.nbinom(n("successes", positive=True), probability(p, positive=True))
    if name == "student_t": return stats.t(n("df", positive=True), loc=loc(), scale=scale())
    if name == "cauchy": return stats.cauchy(loc=loc(), scale=scale())
    if name == "laplace": return stats.laplace(loc=loc(), scale=scale())
    if name == "logistic": return stats.logistic(loc=loc(), scale=scale())
    if name == "pareto": return stats.pareto(n("tail_index", positive=True), scale=n("minimum", positive=True))
    if name == "zipf":
        exponent = n("exponent")
        if exponent <= 1: raise DistributionError("Zipf exponent must exceed 1")
        return stats.zipf(exponent)
    if name == "geometric":
        convention = p["counting"]
        if convention not in ("trials", "failures"): raise DistributionError("counting must be trials or failures")
        return stats.geom(probability(p, positive=True), loc=-1 if convention == "failures" else 0)
    if name == "hypergeometric":
        population, successes, draws = n("population", positive=True, integer=True), n("successes", nonnegative=True, integer=True), n("draws", nonnegative=True, integer=True)
        if successes > population or draws > population: raise DistributionError("Successes and draws cannot exceed population size")
        return stats.hypergeom(population, successes, draws)
    if name == "gev": return stats.genextreme(-n("shape"), loc=loc(), scale=scale())
    if name == "histogram":
        edges, counts = vector(p, "edges"), vector(p, "counts")
        if len(edges) != len(counts)+1 or (np.diff(edges) <= 0).any() or (counts < 0).any() or counts.sum() <= 0:
            raise DistributionError("Histogram needs increasing edges and nonnegative counts with positive total")
        return stats.rv_histogram((counts, edges), density=False)
    if name == "custom_pmf":
        values, masses = vector(p, "values"), probabilities(p)
        if len(values) != len(masses) or len(np.unique(values)) != len(values): raise DistributionError("Custom masses need unique numeric values and one probability each")
        return stats.rv_discrete(values=(values, masses))
    return None


def validate_distribution(name, parameters):
    p = normalized_parameters(name, parameters)
    f = frozen(name, p)
    if f is not None:
        return p
    if name == "categorical":
        categories = p["categories"]
        if not isinstance(categories, list) or not 1 <= len(categories) <= 1000 or any(not isinstance(x, (str, int, float)) or isinstance(x, bool) or (isinstance(x, str) and len(x) > 128) or (isinstance(x, (float, int)) and not math.isfinite(x)) for x in categories):
            raise DistributionError("categories must be 1–1,000 scalar labels")
        if len(set(str(x) for x in categories)) != len(categories): raise DistributionError("Category labels must be unique")
        if len(probabilities(p)) != len(categories): raise DistributionError("Each category needs one probability")
    elif name == "mixture":
        probability(p, "weight")
        for key in ("mean1", "mean2"): number(p, key)
        for key in ("sd1", "sd2"): number(p, key, positive=True)
    elif name in ("empirical", "kde"):
        values = vector(p, "values")
        if name == "kde":
            number(p, "bandwidth", positive=True)
            if len(values) < 2 or np.std(values) == 0: raise DistributionError("KDE requires at least two observations with nonzero variation")
    elif name == "constant": number(p, "value")
    elif name in ("custom_cdf", "custom_pdf"):
        values = vector(p, "values")
        if len(values) < 2 or (np.diff(values) <= 0).any(): raise DistributionError("Custom support knots must be strictly increasing")
        heights = vector(p, "cdf" if name == "custom_cdf" else "density", length=len(values))
        if name == "custom_cdf":
            if heights[0] != 0 or heights[-1] != 1 or (np.diff(heights) < 0).any(): raise DistributionError("Custom CDF must be nondecreasing, start at 0 and end at 1")
        elif (heights < 0).any() or np.trapezoid(heights, values) <= 0: raise DistributionError("Custom density heights must be nonnegative with positive integral")
    elif name in ("multivariate_normal", "multinomial", "dirichlet"):
        if name == "multivariate_normal":
            values = vector(p, "means")
            covariance_matrix(p["covariance"], len(values))
        elif name == "multinomial":
            values = probabilities(p)
            number(p, "trials", integer=True, nonnegative=True)
        else: values = vector(p, "alpha", positive=True)
        names = p["names"]
        if not isinstance(names, list) or len(names) != len(values) or len(set(names)) != len(names) or any(not isinstance(x, str) or not x.isidentifier() for x in names):
            raise DistributionError("Vector output names must be unique identifiers, one per dimension")
        if len(values) > 20: raise DistributionError("Vector generators support at most 20 dimensions")
    return p


def sample(name, parameters, size, rng, *, uniforms=None, truncate=None):
    p = validate_distribution(name, parameters)
    f = frozen(name, p)
    u = np.clip(uniforms if uniforms is not None else rng.random(size), np.finfo(float).eps, 1-np.finfo(float).eps)
    if truncate is not None:
        if f is None: raise DistributionError("Truncation currently requires a standard scalar distribution")
        lo, hi = truncate
        discrete = DISTRIBUTIONS[name]["discrete"]
        a = f.cdf(np.nextafter(lo, -np.inf) if discrete else lo)
        b = f.cdf(hi)
        if not 0 <= a < b <= 1: raise DistributionError("Truncation interval contains no numerically resolvable probability mass")
        return f.ppf(a + u*(b-a))
    if f is not None: return f.ppf(u)
    if name == "categorical":
        index = np.minimum(np.searchsorted(np.cumsum(p["probabilities"]), u, side="right"), len(p["categories"])-1)
        return np.asarray(p["categories"], dtype=object)[index]
    if name == "mixture":
        component = u < p["weight"]
        z = stats.norm.ppf(np.clip(rng.random(size), np.finfo(float).eps, 1-np.finfo(float).eps))
        return np.where(component, p["mean1"]+p["sd1"]*z, p["mean2"]+p["sd2"]*z)
    if name == "empirical":
        values = np.asarray(p["values"], dtype=float)
        return values[np.minimum((u*len(values)).astype(int), len(values)-1)]
    if name == "kde":
        model = stats.gaussian_kde(p["values"], bw_method=p["bandwidth"])
        return model.resample(size=size, seed=rng).reshape(-1)
    if name == "constant": return np.full(size, p["value"], dtype=float)
    if name == "custom_cdf":
        values, cdf = np.asarray(p["values"]), np.asarray(p["cdf"])
        # searchsorted handles zero-density flat CDF segments without sampling
        # their interior or treating repeated CDF knots as an interpolation input.
        index = np.minimum(np.searchsorted(cdf, u, side="right")-1, len(values)-2)
        return values[index]+(u-cdf[index])/(cdf[index+1]-cdf[index])*(values[index+1]-values[index])
    if name == "custom_pdf":
        values, density = np.asarray(p["values"], dtype=float), np.asarray(p["density"], dtype=float)
        area = (density[:-1]+density[1:])*np.diff(values)/2
        total = area.sum()
        cumulative = np.r_[0, np.cumsum(area)]
        target = u*total
        index = np.minimum(np.searchsorted(cumulative, target, side="right")-1, len(values)-2)
        mass = target-cumulative[index]
        a, b = density[index], (density[index+1]-density[index])/(values[index+1]-values[index])
        root = np.sqrt(np.maximum(a*a+2*b*mass, 0))
        distance = np.divide(2*mass, a+root, out=np.zeros_like(mass), where=(a+root) != 0)
        return values[index]+distance
    if name == "multivariate_normal": return rng.multivariate_normal(p["means"], p["covariance"], size=size, check_valid="raise")
    if name == "multinomial": return rng.multinomial(p["trials"], p["probabilities"], size=size)
    if name == "dirichlet": return rng.dirichlet(p["alpha"], size=size)
    raise DistributionError(f"No sampler implemented for {name}")


def theoretical(name, parameters):
    p = validate_distribution(name, parameters)
    f = frozen(name, p)
    if f is None:
        if name == "mixture":
            mean = p["weight"]*p["mean1"]+(1-p["weight"])*p["mean2"]
            variance = p["weight"]*(p["sd1"]**2+(p["mean1"]-mean)**2)+(1-p["weight"])*(p["sd2"]**2+(p["mean2"]-mean)**2)
            return {"mean": mean, "variance": variance, "sd": math.sqrt(variance)}
        if name == "constant": return {"mean": p["value"], "variance": 0, "sd": 0}
        return {}
    with np.errstate(all="ignore"):
        mean, variance = f.stats(moments="mv")
    clean = lambda x: float(x) if np.isfinite(x) else None
    return {"mean": clean(mean), "variance": clean(variance), "sd": clean(math.sqrt(variance)) if variance >= 0 else None}


def curve(name, parameters, low, high, points=160, truncate=None):
    """Return an honest base or truncated theoretical overlay, never a KDE labelled PDF."""
    p = validate_distribution(name, parameters)
    f = frozen(name, p)
    discrete = DISTRIBUTIONS[name]["discrete"]
    if not math.isfinite(low) or not math.isfinite(high) or high <= low: return []
    if name == "custom_pmf": x = np.asarray(p["values"], dtype=float)
    elif discrete:
        if high-low > 250: return []
        x = np.arange(math.ceil(low), math.floor(high)+1)
    else: x = np.linspace(low, high, points)
    if f is not None:
        y = f.pmf(x) if discrete else f.pdf(x)
        if truncate is not None:
            lo, hi = truncate
            denominator = f.cdf(hi)-f.cdf(np.nextafter(lo, -np.inf) if discrete else lo)
            y = np.where((x >= lo) & (x <= hi), y/denominator, 0)
    elif name == "mixture":
        y = p["weight"]*stats.norm.pdf(x, p["mean1"], p["sd1"])+(1-p["weight"])*stats.norm.pdf(x, p["mean2"], p["sd2"])
    elif name == "kde": y = stats.gaussian_kde(p["values"], bw_method=p["bandwidth"])(x)
    elif name == "custom_pdf": y = np.interp(x, p["values"], p["density"], left=0, right=0)/np.trapezoid(p["density"], p["values"])
    elif name == "custom_cdf":
        knots, cdf = np.asarray(p["values"]), np.asarray(p["cdf"])
        index = np.clip(np.searchsorted(knots, x, side="right")-1, 0, len(knots)-2)
        y = np.where((x >= knots[0]) & (x <= knots[-1]), np.diff(cdf)[index]/np.diff(knots)[index], 0)
    else: return []
    return [{"x": float(a), "y": float(b)} for a, b in zip(x, y) if np.isfinite(a) and np.isfinite(b)]
