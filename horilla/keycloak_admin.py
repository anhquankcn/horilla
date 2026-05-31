"""
Keycloak Admin API service for syncing HRM roles & users.
Uses python-keycloak with either client-credentials or admin password.
"""
import logging

from django.conf import settings

logger = logging.getLogger(__name__)


def _get_admin():
    """Lazy-init KeycloakAdmin, returns None if not configured."""
    try:
        from keycloak import KeycloakAdmin, KeycloakOpenIDConnection
    except ImportError:
        logger.warning("python-keycloak not installed")
        return None

    server = getattr(settings, "KC_SERVER_URL", "")
    realm = getattr(settings, "KC_REALM", "")
    if not server or not realm:
        return None

    username = getattr(settings, "KC_ADMIN_USERNAME", "")
    password = getattr(settings, "KC_ADMIN_PASSWORD", "")
    client_id = getattr(settings, "KC_ADMIN_CLIENT_ID", "admin-cli")
    client_secret = getattr(settings, "KC_ADMIN_CLIENT_SECRET", "")

    try:
        conn = KeycloakOpenIDConnection(
            server_url=server,
            realm_name=realm,
            client_id=client_id,
            client_secret_key=client_secret or None,
            username=username or None,
            password=password or None,
            verify=getattr(settings, "OIDC_VERIFY_SSL", False),
        )
        return KeycloakAdmin(connection=conn)
    except Exception as exc:
        logger.error("Keycloak admin connection failed: %s", exc)
        return None


def get_realm_roles():
    admin = _get_admin()
    if not admin:
        return None
    try:
        roles = admin.get_realm_roles(brief_representation=False)
        return [
            {
                "id": r["id"],
                "name": r["name"],
                "description": r.get("description", ""),
                "composite": r.get("composite", False),
            }
            for r in roles
            if not r["name"].startswith("uma_") and r["name"] != "offline_access"
            and r["name"] != "default-roles-" + settings.KC_REALM.lower()
        ]
    except Exception as exc:
        logger.error("Failed to fetch KC roles: %s", exc)
        return None


def sync_role_to_kc(role_name, description=""):
    admin = _get_admin()
    if not admin:
        return {"ok": False, "error": "Keycloak not configured"}
    try:
        existing = admin.get_realm_roles(brief_representation=True)
        names = {r["name"] for r in existing}
        if role_name in names:
            return {"ok": True, "action": "exists"}
        admin.create_realm_role(
            payload={"name": role_name, "description": description},
            skip_exists=True,
        )
        return {"ok": True, "action": "created"}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def sync_all_roles(roles_data):
    admin = _get_admin()
    if not admin:
        return {"ok": False, "error": "Keycloak not configured"}

    results = {"created": 0, "exists": 0, "errors": []}
    try:
        existing = admin.get_realm_roles(brief_representation=True)
        names = {r["name"] for r in existing}

        for rd in roles_data:
            name = rd["name"]
            desc = rd.get("description", "")
            if name in names:
                results["exists"] += 1
                continue
            try:
                admin.create_realm_role(
                    payload={"name": name, "description": desc},
                    skip_exists=True,
                )
                results["created"] += 1
            except Exception as exc:
                results["errors"].append({"role": name, "error": str(exc)})
    except Exception as exc:
        return {"ok": False, "error": str(exc)}

    results["ok"] = True
    return results


def get_kc_users():
    admin = _get_admin()
    if not admin:
        return None
    try:
        return admin.get_users(query={"max": 500})
    except Exception as exc:
        logger.error("Failed to fetch KC users: %s", exc)
        return None


def sync_employee_to_kc(employee):
    admin = _get_admin()
    if not admin:
        return {"ok": False, "error": "Keycloak not configured"}

    email = employee.email
    if not email:
        return {"ok": False, "error": "No email"}

    try:
        existing = admin.get_users(query={"email": email, "exact": True})
        first_name = employee.employee_first_name or ""
        last_name = employee.employee_last_name or ""
        username = email

        if existing:
            kc_user = existing[0]
            admin.update_user(
                user_id=kc_user["id"],
                payload={
                    "firstName": first_name,
                    "lastName": last_name,
                    "enabled": employee.is_active,
                },
            )
            kc_user_id = kc_user["id"]
            action = "updated"
        else:
            kc_user_id = admin.create_user(
                payload={
                    "username": username,
                    "email": email,
                    "firstName": first_name,
                    "lastName": last_name,
                    "enabled": employee.is_active,
                    "emailVerified": True,
                },
                exist_ok=True,
            )
            action = "created"

        role_name = None
        wi = getattr(employee, "employee_work_info", None)
        if wi and wi.job_role_id:
            role_name = wi.job_role_id.job_role
        if role_name:
            try:
                realm_role = admin.get_realm_role(role_name)
                admin.assign_realm_roles(
                    user_id=kc_user_id,
                    roles=[realm_role],
                )
            except Exception:
                pass

        return {"ok": True, "action": action, "kc_user_id": kc_user_id}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def sync_all_employees(employees):
    results = {"created": 0, "updated": 0, "errors": []}
    for emp in employees:
        r = sync_employee_to_kc(emp)
        if r.get("ok"):
            if r.get("action") == "created":
                results["created"] += 1
            else:
                results["updated"] += 1
        else:
            results["errors"].append(
                {"employee": str(emp), "error": r.get("error", "")}
            )
    results["ok"] = True
    return results
