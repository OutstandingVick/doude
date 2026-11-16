"""Numeric rounding with decimal round-half-up semantics.

Python's ``round`` and C-style ``%.f`` formatting use round-half-to-even,
which disagrees with JavaScript's ``toFixed``. These helpers round half up so
the PDF and the dashboard show identical values.
"""

from decimal import ROUND_HALF_UP, Decimal


def round_half_up(value, places=0):
    """Round ``value`` to ``places`` decimal places using round-half-up."""
    if value is None:
        return None
    quantum = Decimal(1).scaleb(-places)
    return float(Decimal(str(value)).quantize(quantum, rounding=ROUND_HALF_UP))