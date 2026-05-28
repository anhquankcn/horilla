from geopy.distance import geodesic

from geofencing.models import GeoFencing


def check_geofence(lat, lng, company):
    """
    Check if (lat, lng) is within the geofence radius for the given company.
    Returns (inside: bool, distance_m: float, error: str|None).
    If geofencing is not configured or not started, returns (True, 0.0, None)
    so callers can treat it as a non-blocking pass-through.
    """
    try:
        geofence = GeoFencing.objects.get(company_id=company)
    except GeoFencing.DoesNotExist:
        return True, 0.0, None

    if not geofence.start:
        return True, 0.0, None

    center = (geofence.latitude, geofence.longitude)
    point = (float(lat), float(lng))
    distance_m = geodesic(center, point).meters

    inside = distance_m <= geofence.radius_in_meters
    return inside, round(distance_m, 1), None
