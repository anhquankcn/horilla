"""
Keycloak Admin API service for syncing HRM roles & users.
Uses python-keycloak with either client-credentials or admin password.
"""
import logging

from django.conf import settings

logger = logging.getLogger(__name__)


def _get_admin():
    """Lazy-init KeycloakAdmin, returns None if not configured.

    Admin credentials authenticate against the 'master' realm, then
    the connection targets the application realm for management ops.
    """
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

    if not username and not client_secret:
        return None

    try:
        conn = KeycloakOpenIDConnection(
            server_url=server,
            realm_name=realm,
            user_realm_name="master",
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
    """Create missing KC realm roles and return mapping data for each.

    Optimized: creates all missing roles first, then fetches the full
    role list once to resolve IDs — avoids per-role API calls.
    """
    admin = _get_admin()
    if not admin:
        return {"ok": False, "error": "Keycloak not configured"}

    results = {"created": 0, "exists": 0, "errors": [], "mappings": []}
    try:
        existing = admin.get_realm_roles(brief_representation=False)
        by_name = {r["name"]: r for r in existing}

        created_names = []
        for rd in roles_data:
            name = rd["name"]
            desc = rd.get("description", "")
            job_role_id = rd.get("job_role_id")
            if name in by_name:
                results["exists"] += 1
                results["mappings"].append({
                    "job_role_id": job_role_id,
                    "kc_role_id": by_name[name]["id"],
                    "kc_role_name": name,
                })
                continue
            try:
                admin.create_realm_role(
                    payload={"name": name, "description": desc},
                    skip_exists=True,
                )
                results["created"] += 1
                created_names.append(rd)
            except Exception as exc:
                results["errors"].append({"role": name, "error": str(exc)})

        if created_names:
            all_roles = admin.get_realm_roles(brief_representation=False)
            by_name_final = {r["name"]: r for r in all_roles}
            for rd in created_names:
                name = rd["name"]
                role = by_name_final.get(name)
                if role:
                    results["mappings"].append({
                        "job_role_id": rd.get("job_role_id"),
                        "kc_role_id": role["id"],
                        "kc_role_name": name,
                    })
                else:
                    results["errors"].append({
                        "role": name,
                        "error": "Created but not found in re-fetch",
                    })
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

        return {
            "ok": True, "action": action,
            "kc_user_id": kc_user_id,
            "kc_username": email,
            "employee_id": employee.pk,
        }
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def sync_all_employees(employees):
    results = {"created": 0, "updated": 0, "errors": [], "mappings": []}
    for emp in employees:
        r = sync_employee_to_kc(emp)
        if r.get("ok"):
            if r.get("action") == "created":
                results["created"] += 1
            else:
                results["updated"] += 1
            results["mappings"].append({
                "employee_id": r["employee_id"],
                "kc_user_id": r["kc_user_id"],
                "kc_username": r["kc_username"],
            })
        else:
            results["errors"].append(
                {"employee": str(emp), "error": r.get("error", "")}
            )
    results["ok"] = True
    return results


def sync_selective_roles(admin, roles_data):
    """Create/update selective KC realm roles. Reuses an existing admin connection."""
    results = {"created": 0, "exists": 0, "errors": [], "mappings": []}
    try:
        existing = admin.get_realm_roles(brief_representation=False)
        by_name = {r["name"]: r for r in existing}

        created_names = []
        for rd in roles_data:
            name = rd["name"]
            desc = rd.get("description", "")
            if name in by_name:
                results["exists"] += 1
                results["mappings"].append({
                    "job_role_id": rd.get("job_role_id"),
                    "kc_role_id": by_name[name]["id"],
                    "kc_role_name": name,
                })
                continue
            try:
                admin.create_realm_role(
                    payload={"name": name, "description": desc},
                    skip_exists=True,
                )
                results["created"] += 1
                created_names.append(rd)
            except Exception as exc:
                results["errors"].append({"role": name, "error": str(exc)})

        if created_names:
            all_roles = admin.get_realm_roles(brief_representation=False)
            by_name_final = {r["name"]: r for r in all_roles}
            for rd in created_names:
                name = rd["name"]
                role = by_name_final.get(name)
                if role:
                    results["mappings"].append({
                        "job_role_id": rd.get("job_role_id"),
                        "kc_role_id": role["id"],
                        "kc_role_name": name,
                    })
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
    results["ok"] = True
    return results


def sync_selective_employees(admin, employees):
    """Create/update selective KC users. Reuses an existing admin connection."""
    results = {"created": 0, "updated": 0, "errors": [], "mappings": []}
    for emp in employees:
        email = emp.email
        if not email:
            results["errors"].append({"employee": str(emp), "error": "No email"})
            continue
        try:
            existing = admin.get_users(query={"email": email, "exact": True})
            first_name = emp.employee_first_name or ""
            last_name = emp.employee_last_name or ""

            if existing:
                kc_user = existing[0]
                admin.update_user(
                    user_id=kc_user["id"],
                    payload={
                        "firstName": first_name,
                        "lastName": last_name,
                        "enabled": emp.is_active,
                    },
                )
                kc_user_id = kc_user["id"]
                action = "updated"
            else:
                kc_user_id = admin.create_user(
                    payload={
                        "username": email,
                        "email": email,
                        "firstName": first_name,
                        "lastName": last_name,
                        "enabled": emp.is_active,
                        "emailVerified": True,
                    },
                    exist_ok=True,
                )
                action = "created"

            wi = getattr(emp, "employee_work_info", None)
            if wi and wi.job_role_id:
                try:
                    realm_role = admin.get_realm_role(wi.job_role_id.job_role)
                    admin.assign_realm_roles(user_id=kc_user_id, roles=[realm_role])
                except Exception:
                    pass

            if action == "created":
                results["created"] += 1
            else:
                results["updated"] += 1
            results["mappings"].append({
                "employee_id": emp.pk,
                "kc_user_id": kc_user_id,
                "kc_username": email,
            })
        except Exception as exc:
            results["errors"].append({"employee": str(emp), "error": str(exc)})
    results["ok"] = True
    return results
