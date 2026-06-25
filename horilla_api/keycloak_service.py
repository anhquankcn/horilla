"""Keycloak Admin REST API helpers."""
import requests
from django.conf import settings

_KC = settings.KC_SERVER_URL
_REALM = settings.KC_REALM


def _token() -> str:
    resp = requests.post(
        f"{_KC}/realms/master/protocol/openid-connect/token",
        data={
            "client_id": settings.KC_ADMIN_CLIENT_ID or "admin-cli",
            "grant_type": "password",
            "username": settings.KC_ADMIN_USERNAME,
            "password": settings.KC_ADMIN_PASSWORD,
        },
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def _h() -> dict:
    return {"Authorization": f"Bearer {_token()}", "Content-Type": "application/json"}


def list_roles() -> list:
    r = requests.get(f"{_KC}/admin/realms/{_REALM}/roles", headers=_h(), timeout=10)
    r.raise_for_status()
    return [
        {"id": role["id"], "name": role["name"], "description": role.get("description", "")}
        for role in r.json()
        if not role.get("composite") or role["name"] not in ("default-roles-" + _REALM.lower(),)
    ]


def list_groups() -> list:
    r = requests.get(
        f"{_KC}/admin/realms/{_REALM}/groups?briefRepresentation=true",
        headers=_h(), timeout=10,
    )
    r.raise_for_status()
    return [{"id": g["id"], "name": g["name"]} for g in r.json()]


def get_user_by_email(email: str) -> dict | None:
    r = requests.get(
        f"{_KC}/admin/realms/{_REALM}/users",
        params={"email": email, "exact": "true"},
        headers=_h(), timeout=10,
    )
    r.raise_for_status()
    users = r.json()
    return users[0] if users else None


def create_user(email: str, first_name: str, last_name: str, password: str) -> str | None:
    """Create KC user; return user_id. Returns existing user's id if already exists."""
    existing = get_user_by_email(email)
    if existing:
        return existing["id"]

    payload = {
        "username": email,
        "email": email,
        "firstName": first_name,
        "lastName": last_name,
        "enabled": True,
        "emailVerified": True,
        "credentials": [{"type": "password", "value": password, "temporary": False}],
    }
    r = requests.post(
        f"{_KC}/admin/realms/{_REALM}/users",
        headers=_h(), json=payload, timeout=10,
    )
    r.raise_for_status()
    location = r.headers.get("Location", "")
    return location.split("/")[-1] if location else None


def assign_roles(user_id: str, role_ids: list[str]) -> None:
    if not role_ids:
        return
    headers = _h()
    roles_payload = []
    for rid in role_ids:
        r = requests.get(
            f"{_KC}/admin/realms/{_REALM}/roles-by-id/{rid}",
            headers=headers, timeout=10,
        )
        if r.ok:
            roles_payload.append(r.json())
    if roles_payload:
        requests.post(
            f"{_KC}/admin/realms/{_REALM}/users/{user_id}/role-mappings/realm",
            headers=headers, json=roles_payload, timeout=10,
        ).raise_for_status()


def assign_groups(user_id: str, group_ids: list[str]) -> None:
    headers = _h()
    for gid in group_ids:
        requests.put(
            f"{_KC}/admin/realms/{_REALM}/users/{user_id}/groups/{gid}",
            headers=headers, timeout=10,
        ).raise_for_status()


def get_user_roles(user_id: str) -> list[str]:
    r = requests.get(
        f"{_KC}/admin/realms/{_REALM}/users/{user_id}/role-mappings/realm",
        headers=_h(), timeout=10,
    )
    return [role["name"] for role in r.json()] if r.ok else []


def get_user_groups(user_id: str) -> list[str]:
    r = requests.get(
        f"{_KC}/admin/realms/{_REALM}/users/{user_id}/groups",
        headers=_h(), timeout=10,
    )
    return [g["name"] for g in r.json()] if r.ok else []


def reset_password(user_id: str, password: str = "Hnh@1234", temporary: bool = False) -> None:
    r = requests.put(
        f"{_KC}/admin/realms/{_REALM}/users/{user_id}/reset-password",
        headers=_h(),
        json={"type": "password", "value": password, "temporary": temporary},
        timeout=10,
    )
    r.raise_for_status()


def has_otp(user_id: str) -> bool:
    """Return True if user has an OTP credential configured."""
    r = requests.get(
        f"{_KC}/admin/realms/{_REALM}/users/{user_id}/credentials",
        headers=_h(), timeout=10,
    )
    return any(c.get("type") == "otp" for c in r.json()) if r.ok else False


def get_required_actions(user_id: str) -> list[str]:
    r = requests.get(
        f"{_KC}/admin/realms/{_REALM}/users/{user_id}",
        headers=_h(), timeout=10,
    )
    r.raise_for_status()
    return r.json().get("requiredActions", [])


def set_required_actions(user_id: str, actions: list[str]) -> None:
    r = requests.put(
        f"{_KC}/admin/realms/{_REALM}/users/{user_id}",
        headers=_h(),
        json={"requiredActions": actions},
        timeout=10,
    )
    r.raise_for_status()


def verify_password(email: str, password: str) -> bool:
    """Verify user's current password via KC Resource Owner Password Grant.
    Returns True if correct, False if wrong password, raises on other errors.
    """
    try:
        resp = requests.post(
            f"{_KC}/realms/{_REALM}/protocol/openid-connect/token",
            data={
                "client_id": settings.OIDC_RP_CLIENT_ID,
                "client_secret": settings.OIDC_RP_CLIENT_SECRET or "",
                "grant_type": "password",
                "username": email,
                "password": password,
                "scope": "openid",
            },
            timeout=10,
        )
        if resp.status_code == 200:
            return True
        if resp.status_code == 401:
            return False
        resp.raise_for_status()
        return False
    except requests.HTTPError:
        raise


def send_reset_password_email(user_id: str) -> None:
    """Trigger KC to send 'Update Password' action email to the user."""
    r = requests.post(
        f"{_KC}/admin/realms/{_REALM}/users/{user_id}/execute-actions-email",
        headers=_h(),
        json=["UPDATE_PASSWORD"],
        timeout=15,
    )
    r.raise_for_status()


# ── Identity (đổi username/email) ─────────────────────────────────────

def get_user(user_id: str) -> dict:
    r = requests.get(
        f"{_KC}/admin/realms/{_REALM}/users/{user_id}", headers=_h(), timeout=10
    )
    r.raise_for_status()
    return r.json()


def get_user_by_username(username: str) -> dict | None:
    r = requests.get(
        f"{_KC}/admin/realms/{_REALM}/users",
        params={"username": username, "exact": "true"},
        headers=_h(), timeout=10,
    )
    r.raise_for_status()
    users = r.json()
    return users[0] if users else None


def get_federated_identities(user_id: str) -> list:
    r = requests.get(
        f"{_KC}/admin/realms/{_REALM}/users/{user_id}/federated-identity",
        headers=_h(), timeout=10,
    )
    return r.json() if r.ok else []


def update_user(user_id: str, payload: dict) -> None:
    r = requests.put(
        f"{_KC}/admin/realms/{_REALM}/users/{user_id}",
        headers=_h(), json=payload, timeout=10,
    )
    r.raise_for_status()


def set_enabled(user_id: str, enabled: bool) -> None:
    update_user(user_id, {"enabled": enabled})


def _realm_edit_username() -> bool:
    r = requests.get(f"{_KC}/admin/realms/{_REALM}", headers=_h(), timeout=10)
    r.raise_for_status()
    return bool(r.json().get("editUsernameAllowed", False))


def _set_realm_edit_username(value: bool) -> None:
    """GET-modify-PUT toàn bộ realm rep (giống kcadm) để không vô tình null
    các thiết lập khác của realm khi chỉ đổi 1 cờ."""
    h = _h()
    r = requests.get(f"{_KC}/admin/realms/{_REALM}", headers=h, timeout=10)
    r.raise_for_status()
    realm = r.json()
    realm["editUsernameAllowed"] = value
    r2 = requests.put(
        f"{_KC}/admin/realms/{_REALM}", headers=h, json=realm, timeout=15
    )
    r2.raise_for_status()


def rename_user(user_id: str, new_username: str, new_email: str) -> None:
    """Đổi username + email của 1 user KC.

    Realm dùng email-as-username với editUsernameAllowed=false nên username bị
    khóa. Hàm bật tạm cờ này để ghi username rồi LUÔN khôi phục giá trị gốc
    trong finally (kể cả khi lỗi)."""
    original = _realm_edit_username()
    toggled = False
    try:
        if not original:
            _set_realm_edit_username(True)
            toggled = True
        update_user(user_id, {"username": new_username, "email": new_email})
    finally:
        if toggled:
            _set_realm_edit_username(original)
