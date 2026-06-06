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
