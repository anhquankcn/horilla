"""Reverse geocoding via Nominatim (OpenStreetMap) — returns Ward, City string."""

import logging
import urllib.request
import json

logger = logging.getLogger(__name__)

_NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse?lat={lat}&lon={lng}&format=json&accept-language=vi&zoom=16"
_TIMEOUT = 5


def reverse_geocode(lat, lng) -> str:
    try:
        lat_f = float(lat)
        lng_f = float(lng)
    except (TypeError, ValueError):
        return ""
    try:
        url = _NOMINATIM_URL.format(lat=lat_f, lng=lng_f)
        req = urllib.request.Request(url, headers={"User-Agent": "HorillaHRM/1.0"})
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
            data = json.loads(resp.read())
        addr = data.get("address", {})
        parts = []
        for key in ("quarter", "suburb", "city_district"):
            val = addr.get(key)
            if val:
                parts.append(val)
                break
        for key in ("city", "town", "county", "state"):
            val = addr.get(key)
            if val:
                parts.append(val)
                break
        return ", ".join(parts) if parts else data.get("display_name", "")[:255]
    except Exception as exc:
        logger.warning("Reverse geocode failed for %s,%s: %s", lat, lng, exc)
        return ""
