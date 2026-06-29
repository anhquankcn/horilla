from geopy.distance import geodesic

from geofencing.models import GeoFencing


def check_geofence(lat, lng, company=None):
    """
    Check if (lat, lng) is within ANY active office geofence của tổ chức.

    Tổ chức HNH có nhiều văn phòng = nhiều Company (trụ sở Lê Thánh Tôn,
    chi nhánh Vemaybay 43 Thủ Khoa Huân, Liên Lục Địa, CN Đà Nẵng/Hà Nội).
    Nhân viên HNH có thể ngồi làm ở văn phòng khác (vd Marketing ngồi tại
    Vemaybay). Vì vậy "trong VP" = nằm trong bán kính của BẤT KỲ văn phòng
    đang bật nào; ``company`` chỉ giữ cho tương thích chữ ký, không lọc theo.

    Returns (inside: bool, distance_m: float, error: str|None) — distance_m là
    khoảng cách tới văn phòng GẦN NHẤT. Nếu không có geofence nào bật thì trả
    (True, 0.0, None) để các caller coi như pass-through.
    """
    fences = list(GeoFencing.objects.filter(start=True).select_related("company_id"))
    if not fences:
        return True, 0.0, None

    try:
        point = (float(lat), float(lng))
    except (TypeError, ValueError):
        return True, 0.0, None

    best_distance = None
    inside = False
    for fence in fences:
        # Tâm mỗi VP: ưu tiên toạ độ địa chỉ Company, fallback toạ độ dòng geofence.
        co = fence.company_id
        clat = getattr(co, "latitude", None) if co else None
        clng = getattr(co, "longitude", None) if co else None
        if clat and clng:
            center = (float(clat), float(clng))
        else:
            center = (fence.latitude, fence.longitude)

        distance_m = geodesic(center, point).meters
        if best_distance is None or distance_m < best_distance:
            best_distance = distance_m
        if distance_m <= fence.radius_in_meters:
            inside = True

    return inside, round(best_distance, 1), None
