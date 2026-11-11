"""Environmental impact: oil spreading on water.

Estimates the surface slick from a released volume using the Fay
gravity-viscous spreading regime, then drifts the slick centre along the
prevailing current and wind and returns the outline for a map.
"""

import math
from typing import Dict, List, Optional

WATER_DENSITY = 1000.0
G = 9.81
WATER_KIN_VISCOSITY = 1.0e-6
FAY_K = 1.45
DEFAULT_HOURS = 6
CURRENT_MS = 0.05
WIND_MS = 2.0
WIND_FACTOR = 0.03
DRIFT_BEARING_DEG = 200.0
POLYGON_POINTS = 32


def slick_radius_m(volume_m3: float, hours: float, oil_density: float) -> float:
    """Fay gravity-viscous slick radius in metres after ``hours`` of spreading.

    Returns 0.0 when the volume or time is not positive.
    """
    if volume_m3 <= 0 or hours <= 0:
        return 0.0
    delta = (WATER_DENSITY - oil_density) / WATER_DENSITY
    t = hours * 3600.0
    inner = delta * G * volume_m3 ** 2 * t ** 1.5 / math.sqrt(WATER_KIN_VISCOSITY)
    return FAY_K * inner ** (1.0 / 6.0)


def drift_m(hours: float) -> float:
    """Downstream drift distance in metres after ``hours``."""
    return (CURRENT_MS + WIND_FACTOR * WIND_MS) * hours * 3600.0


def offset_lonlat(lonlat, east_m: float, north_m: float) -> List[float]:
    """Offset a ``[lon, lat]`` point by ``east_m``/``north_m`` metres."""
    lon, lat = lonlat
    dlat = north_m / 110540.0
    dlon = east_m / (111320.0 * math.cos(math.radians(lat)))
    return [lon + dlon, lat + dlat]


def slick_polygon(center_lonlat, radius_m: float) -> List[List[float]]:
    """Closed ring of ``POLYGON_POINTS`` points on a circle, first == last."""
    pts = []
    for i in range(POLYGON_POINTS):
        angle = 2.0 * math.pi * i / POLYGON_POINTS
        east = radius_m * math.sin(angle)
        north = radius_m * math.cos(angle)
        p = offset_lonlat(center_lonlat, east, north)
        pts.append([round(p[0], 5), round(p[1], 5)])
    pts.append(pts[0])
    return pts


def estimate_impact(detection, location, quant, scenario, hours=DEFAULT_HOURS) -> Optional[Dict]:
    """Estimate the impact after ``hours``, or ``None`` if no leak was detected.

    For water terrain, computes the Fay radius, drifts the centre along
    ``DRIFT_BEARING_DEG``, and returns the slick outline. For land, returns a
    ``not_modelled`` placeholder.
    """
    if not detection["detected"]:
        return None
    terrain = scenario["pipeline"]["terrain_at_leak"]
    if terrain != "water":
        return {
            "type": "land",
            "model": "not_modelled_v0.1",
            "hours_modelled": hours,
            "slick_area_m2": 0,
            "polygon_lonlat": [],
        }
    volume_spread = min(quant["leak_rate_m3s"] * hours * 3600.0, quant["volume_m3"])
    radius = slick_radius_m(
        volume_spread, hours, scenario["fluid"]["density_kg_m3"]
    )
    distance = drift_m(hours)
    bearing = math.radians(DRIFT_BEARING_DEG)
    east = distance * math.sin(bearing)
    north = distance * math.cos(bearing)
    center = offset_lonlat(location["location_lonlat"], east, north)
    area = math.pi * radius * radius
    return {
        "type": "water",
        "model": "fay_spreading+drift",
        "hours_modelled": hours,
        "volume_spread_m3": round(volume_spread, 1),
        "slick_radius_m": round(radius, 0),
        "slick_area_m2": round(area),
        "center_lonlat": [round(center[0], 5), round(center[1], 5)],
        "polygon_lonlat": slick_polygon(center, radius),
    }
