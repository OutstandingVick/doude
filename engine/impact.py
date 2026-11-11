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
