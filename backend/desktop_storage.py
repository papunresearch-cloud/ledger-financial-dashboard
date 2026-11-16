"""Persistent desktop & local storage under %LOCALAPPDATA%\\Ledger."""
from __future__ import annotations

import json
import os
import re
import shutil
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    from backend.company_research import load_env_setting
except ImportError:  # pragma: no cover - direct script execution from backend/
    from company_research import load_env_setting

_STORAGE_LOCK = threading.Lock()
_CACHE_VERSION = 8
_ALIAS_FILENAME = "_aliases.json"


def get_data_dir() -> Path:
    """Return %LOCALAPPDATA%\\Ledger on Windows (or LEDGER_DATA_DIR override)."""
    override = os.environ.get("LEDGER_DATA_DIR", "").strip()
    if override:
        base = Path(override)
    elif os.name == "nt":
        local_app_data = os.environ.get("LOCALAPPDATA", "").strip()
        if local_app_data:
            base = Path(local_app_data) / "Ledger"
        else:
            base = Path.home() / "AppData" / "Local" / "Ledger"
    else:
        xdg = os.environ.get("XDG_DATA_HOME", "").strip()
        base = (Path(xdg) if xdg else Path.home() / ".local" / "share") / "Ledger"
    base.mkdir(parents=True, exist_ok=True)
    return base


def get_settings_path() -> Path:
    return get_data_dir() / "settings.json"


def get_about_cache_dir() -> Path:
    path = get_data_dir() / "about-cache"
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_browser_profile_base_dir() -> Path:
    path = get_data_dir() / "browser-profile"
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_webview_data_dir() -> Path:
    path = get_data_dir() / "webview"
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_logs_dir() -> Path:
    path = get_data_dir() / "logs"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _read_json(path: Path, default: Any) -> Any:
    if not path.is_file():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def _write_json_atomic(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_name(f"{path.name}.{os.getpid()}.{threading.get_ident()}.tmp")
    tmp_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp_path, path)


def load_settings() -> dict[str, Any]:
    with _STORAGE_LOCK:
        raw = _read_json(get_settings_path(), {})
        return raw if isinstance(raw, dict) else {}


def mask_secret(secret: str) -> str:
    clean = (secret or "").strip()
    if not clean:
        return ""
    if len(clean) <= 10:
        return "•" * len(clean)
    return f"{clean[:6]}{'•' * 6}{clean[-4:]}"


def get_effective_gemini_api_key() -> tuple[str, str]:
    """Return (api_key, source) where source is 'settings' | 'env' | 'none'."""
    settings = load_settings()
    saved = str(settings.get("geminiApiKey") or "").strip().strip("\"'")
    if saved:
        return saved, "settings"
    env_key = load_env_setting("GEMINI_API_KEY")
    if env_key:
        return env_key, "env"
    return "", "none"


def get_effective_screener_credentials() -> tuple[str, str, str]:
    """Return (email, password, source) where source is 'settings' | 'env' | 'none'."""
    settings = load_settings()
    saved_email = str(settings.get("screenerEmail") or "").strip().strip("\"'")
    saved_pw = str(settings.get("screenerPassword") or "")
    if saved_email and saved_pw:
        return saved_email, saved_pw, "settings"
    env_email = load_env_setting("SCREENER_EMAIL")
    env_pw = load_env_setting("SCREENER_PASSWORD")
    if env_email and env_pw:
        return env_email, env_pw, "env"
    return "", "", "none"


def get_browser_preference() -> str:
    settings = load_settings()
    pref = str(settings.get("browserPreference") or "auto").strip().lower()
    return pref if pref in ("auto", "chrome", "edge") else "auto"


def detect_installed_browsers() -> list[str]:
    """Return installed desktop browsers in preference order (['chrome', 'msedge'])."""
    found: list[str] = []
    if os.name == "nt":
        program_files = os.environ.get("PROGRAMFILES", r"C:\Program Files")
        program_files_x86 = os.environ.get("PROGRAMFILES(X86)", r"C:\Program Files (x86)")
        local_app_data = os.environ.get("LOCALAPPDATA", "")

        chrome_candidates = [
            Path(program_files) / "Google" / "Chrome" / "Application" / "chrome.exe",
            Path(program_files_x86) / "Google" / "Chrome" / "Application" / "chrome.exe",
            Path(local_app_data) / "Google" / "Chrome" / "Application" / "chrome.exe" if local_app_data else None,
        ]
        edge_candidates = [
            Path(program_files_x86) / "Microsoft" / "Edge" / "Application" / "msedge.exe",
            Path(program_files) / "Microsoft" / "Edge" / "Application" / "msedge.exe",
            Path(local_app_data) / "Microsoft" / "Edge" / "Application" / "msedge.exe" if local_app_data else None,
        ]
        if any(p and p.is_file() for p in chrome_candidates) or shutil.which("chrome"):
            found.append("chrome")
        if any(p and p.is_file() for p in edge_candidates) or shutil.which("msedge"):
            found.append("msedge")
    else:
        if shutil.which("google-chrome") or shutil.which("chrome"):
            found.append("chrome")
        if shutil.which("microsoft-edge") or shutil.which("msedge"):
            found.append("msedge")
    return found


def save_settings(
    *,
    gemini_api_key: str | None = None,
    clear_gemini_api_key: bool = False,
    screener_email: str | None = None,
    screener_password: str | None = None,
    clear_screener_credentials: bool = False,
    browser_preference: str | None = None,
) -> dict[str, Any]:
    with _STORAGE_LOCK:
        current = _read_json(get_settings_path(), {})
        if not isinstance(current, dict):
            current = {}

        if clear_gemini_api_key:
            current.pop("geminiApiKey", None)
        elif gemini_api_key is not None:
            cleaned = gemini_api_key.strip().strip("\"'")
            if cleaned:
                current["geminiApiKey"] = cleaned

        if clear_screener_credentials:
            current.pop("screenerEmail", None)
            current.pop("screenerPassword", None)
        else:
            if screener_email is not None:
                cleaned_email = screener_email.strip().strip("\"'")
                if cleaned_email:
                    current["screenerEmail"] = cleaned_email
            if screener_password is not None and screener_password != "":
                current["screenerPassword"] = screener_password

        if browser_preference is not None:
            pref = browser_preference.strip().lower()
            if pref in ("auto", "chrome", "edge"):
                current["browserPreference"] = pref

        current["updatedAt"] = datetime.now(timezone.utc).isoformat()
        _write_json_atomic(get_settings_path(), current)
    return get_public_settings_summary()


def get_public_settings_summary() -> dict[str, Any]:
    api_key, key_source = get_effective_gemini_api_key()
    scr_email, scr_pw, scr_source = get_effective_screener_credentials()
    cache_stats = get_about_cache_stats()
    return {
        "hasGeminiApiKey": bool(api_key),
        "geminiApiKeyMasked": mask_secret(api_key) if api_key else "",
        "keySource": key_source,
        "hasScreenerCredentials": bool(scr_email and scr_pw),
        "screenerEmail": scr_email,
        "screenerSource": scr_source,
        "browserPreference": get_browser_preference(),
        "detectedBrowsers": detect_installed_browsers(),
        "dataDir": str(get_data_dir()),
        "browserProfileDir": str(get_browser_profile_base_dir()),
        "aboutCacheDir": str(get_about_cache_dir()),
        "aboutCacheCount": cache_stats["count"],
        "aboutCacheBytes": cache_stats["bytes"],
    }


def _normalize_cache_token(raw: str) -> str:
    cleaned = re.sub(r"\.xlsx$", "", (raw or "").strip(), flags=re.IGNORECASE)
    cleaned = re.sub(r"[^A-Za-z0-9&._-]+", "_", cleaned.upper()).strip("_.")
    return cleaned[:80]


def _resolve_canonical_cache_id(code_hint: str, company_name: str, aliases: dict[str, str]) -> str | None:
    for candidate in (_normalize_cache_token(code_hint), _normalize_cache_token(company_name)):
        if not candidate:
            continue
        if candidate in aliases:
            return aliases[candidate]
        cache_dir = get_about_cache_dir()
        if (cache_dir / f"{candidate}.json").is_file():
            return candidate
    return None


def _derive_canonical_id(sources_payload: dict[str, Any], code_hint: str = "", company_name: str = "") -> str:
    comp_info = sources_payload.get("company_info") if isinstance(sources_payload, dict) else {}
    if not isinstance(comp_info, dict):
        comp_info = {}
    for candidate in (
        str(comp_info.get("symbol") or ""),
        code_hint,
        str(comp_info.get("name") or ""),
        company_name,
    ):
        token = _normalize_cache_token(candidate)
        if token and token != "COMPANY":
            return token
    return "COMPANY"


def load_about_cache(code_hint: str, company_name: str = "") -> dict[str, Any]:
    """Load cached About sources and/or AI synthesis from %LOCALAPPDATA%\\Ledger\\about-cache."""
    with _STORAGE_LOCK:
        cache_dir = get_about_cache_dir()
        aliases = _read_json(cache_dir / _ALIAS_FILENAME, {})
        if not isinstance(aliases, dict):
            aliases = {}

        canon_id = _resolve_canonical_cache_id(code_hint, company_name, aliases)
        if not canon_id:
            return {"hit": False}

        entry = _read_json(cache_dir / f"{canon_id}.json", None)
        if (
            not isinstance(entry, dict)
            or entry.get("version") != _CACHE_VERSION
            or not isinstance(entry.get("sources"), dict)
        ):
            return {"hit": False}

        return {
            "hit": True,
            "symbol": entry.get("symbol") or canon_id,
            "companyName": entry.get("companyName") or "",
            "cachedAt": entry.get("cachedAt") or "",
            "sources": entry.get("sources"),
            "ai": entry.get("ai") if isinstance(entry.get("ai"), dict) else None,
        }


def save_about_sources(code_hint: str, company_name: str, sources_payload: dict[str, Any]) -> None:
    """Persist fetched Step 1 corporate sources to disk cache."""
    if not isinstance(sources_payload, dict) or not sources_payload.get("company_info"):
        return
    with _STORAGE_LOCK:
        cache_dir = get_about_cache_dir()
        canon_id = _derive_canonical_id(sources_payload, code_hint, company_name)
        cache_file = cache_dir / f"{canon_id}.json"

        existing = _read_json(cache_file, {})
        if not isinstance(existing, dict):
            existing = {}

        comp_info = sources_payload.get("company_info") or {}
        now_label = str(sources_payload.get("generated_at") or datetime.now().strftime("%d %b %Y, %I:%M %p"))

        # Preserve prior AI only if caller explicitly didn't replace sources? Fresh sources invalidate stale AI.
        entry = {
            "version": _CACHE_VERSION,
            "symbol": str(comp_info.get("symbol") or canon_id),
            "companyName": str(comp_info.get("name") or company_name or canon_id),
            "cachedAt": now_label,
            "cachedTimestamp": int(time.time()),
            "sources": sources_payload,
            "ai": None,
        }
        _write_json_atomic(cache_file, entry)
        _update_aliases_locked(cache_dir, canon_id, code_hint, company_name, comp_info)


def save_about_ai(sources_payload: dict[str, Any], ai_payload: dict[str, Any]) -> None:
    """Persist completed Step 2 Gemini AI report alongside sources in disk cache."""
    if not isinstance(sources_payload, dict) or not isinstance(ai_payload, dict):
        return
    with _STORAGE_LOCK:
        cache_dir = get_about_cache_dir()
        canon_id = _derive_canonical_id(sources_payload)
        cache_file = cache_dir / f"{canon_id}.json"

        existing = _read_json(cache_file, {})
        if not isinstance(existing, dict):
            existing = {}

        comp_info = sources_payload.get("company_info") or {}
        now_label = str(sources_payload.get("generated_at") or existing.get("cachedAt") or datetime.now().strftime("%d %b %Y, %I:%M %p"))

        entry = {
            "version": _CACHE_VERSION,
            "symbol": str(comp_info.get("symbol") or canon_id),
            "companyName": str(comp_info.get("name") or existing.get("companyName") or canon_id),
            "cachedAt": now_label,
            "cachedTimestamp": int(time.time()),
            "sources": sources_payload,
            "ai": ai_payload,
        }
        _write_json_atomic(cache_file, entry)
        _update_aliases_locked(cache_dir, canon_id, "", "", comp_info)


def _update_aliases_locked(
    cache_dir: Path,
    canon_id: str,
    code_hint: str,
    company_name: str,
    comp_info: dict[str, Any],
) -> None:
    aliases_path = cache_dir / _ALIAS_FILENAME
    aliases = _read_json(aliases_path, {})
    if not isinstance(aliases, dict):
        aliases = {}
    for raw in (
        canon_id,
        code_hint,
        company_name,
        str(comp_info.get("symbol") or ""),
        str(comp_info.get("name") or ""),
    ):
        token = _normalize_cache_token(raw)
        if token and token != "COMPANY":
            aliases[token] = canon_id
    _write_json_atomic(aliases_path, aliases)


def get_about_cache_stats() -> dict[str, int]:
    with _STORAGE_LOCK:
        cache_dir = get_about_cache_dir()
        count = 0
        total_bytes = 0
        for item in cache_dir.glob("*.json"):
            if item.name == _ALIAS_FILENAME:
                continue
            count += 1
            try:
                total_bytes += item.stat().st_size
            except OSError:
                pass
        return {"count": count, "bytes": total_bytes}


def clear_about_cache(code_hint: str = "", company_name: str = "") -> int:
    with _STORAGE_LOCK:
        cache_dir = get_about_cache_dir()
        aliases_path = cache_dir / _ALIAS_FILENAME
        aliases = _read_json(aliases_path, {})
        if not isinstance(aliases, dict):
            aliases = {}

        if not code_hint and not company_name:
            removed = 0
            for item in cache_dir.glob("*.json"):
                try:
                    item.unlink()
                    if item.name != _ALIAS_FILENAME:
                        removed += 1
                except OSError:
                    pass
            return removed

        canon_id = _resolve_canonical_cache_id(code_hint, company_name, aliases)
        if not canon_id:
            return 0
        target = cache_dir / f"{canon_id}.json"
        removed = 0
        if target.is_file():
            target.unlink()
            removed = 1
        aliases = {k: v for k, v in aliases.items() if v != canon_id}
        _write_json_atomic(aliases_path, aliases)
        return removed
