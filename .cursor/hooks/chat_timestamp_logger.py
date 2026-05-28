#!/usr/bin/env python3
import argparse
import json
import os
import re
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[2]
LOG_DIR = PROJECT_ROOT / "logs" / "chat_events"
PENDING_PATH = PROJECT_ROOT / ".cursor" / "hooks" / ".chat_logger_pending.json"
CODEX_SESSIONS_DIR = Path.home() / ".codex" / "sessions"
PENDING_DEFAULT_SINGLE_KEY = "__default_single__"
PENDING_TTL_MS = 30 * 60 * 1000
MAX_LATENCY_MS = 2 * 60 * 60 * 1000
CODEX_DEFAULT_LOOKBACK_DAYS = 14
DEBUG_HOOK_INPUT_ENV = "CHAT_LOGGER_DEBUG_INPUT"

SESSION_KEY_CANDIDATES = (
    "session_key",
    "sessionKey",
    "session_id",
    "sessionId",
    "conversation_id",
    "conversationId",
    "conversation_key",
    "conversationKey",
    "chat_id",
    "chatId",
    "thread_id",
    "threadId",
)
PROMPT_TEXT_KEY_CANDIDATES = (
    "prompt",
    "user_prompt",
    "userPrompt",
    "input",
    "query",
    "text",
    "message",
    "content",
)
RESPONSE_TEXT_KEY_CANDIDATES = (
    "response",
    "assistant_response",
    "assistantResponse",
    "output",
    "completion",
    "final_response",
    "finalResponse",
    "text",
    "message",
    "content",
)
ENV_PROMPT_CANDIDATE_KEYS = (
    "CURSOR_PROMPT",
    "CURSOR_INPUT",
    "CURSOR_MESSAGE",
    "PROMPT",
    "INPUT",
    "MESSAGE",
)
ENV_RESPONSE_CANDIDATE_KEYS = (
    "CURSOR_RESPONSE",
    "CURSOR_OUTPUT",
    "RESPONSE",
    "OUTPUT",
)
ENV_SESSION_CANDIDATE_KEYS = (
    "CURSOR_SESSION_ID",
    "CURSOR_CONVERSATION_ID",
    "CURSOR_CHAT_ID",
    "SESSION_ID",
    "CONVERSATION_ID",
    "CHAT_ID",
)


def now_iso() -> str:
    return datetime.now().isoformat(timespec="milliseconds")


def daily_log_path(now: datetime | None = None) -> Path:
    current = now or datetime.now()
    return LOG_DIR / f"{current.date().isoformat()}.jsonl"


def to_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def parse_codex_datetime(value: Any) -> datetime | None:
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(value, tz=timezone.utc).astimezone().replace(tzinfo=None)
        except (OSError, OverflowError, ValueError):
            return None
    if not isinstance(value, str) or not value.strip():
        return None
    normalized = value.strip()
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo:
        return parsed.astimezone().replace(tzinfo=None)
    return parsed


def normalize_key(value: str) -> str:
    return "".join(ch.lower() for ch in value if ch.isalnum())


def first_by_keys(node: Any, key_candidates: tuple[str, ...]) -> str:
    normalized_candidates = {normalize_key(k) for k in key_candidates}
    queue: list[Any] = [node]
    while queue:
        current = queue.pop(0)
        if isinstance(current, dict):
            for key, value in current.items():
                if normalize_key(str(key)) in normalized_candidates and isinstance(value, str) and value.strip():
                    return value
                queue.append(value)
        elif isinstance(current, list):
            queue.extend(current)
    return ""


def first_nonempty_env(*keys: str) -> str:
    for key in keys:
        value = os.environ.get(key)
        if value and value.strip():
            return value
    return ""


def extract_json_from_env() -> Any:
    for key in ("CURSOR_HOOK_INPUT_JSON", "CURSOR_HOOK_PAYLOAD", "HOOK_INPUT_JSON", "HOOK_PAYLOAD"):
        raw = os.environ.get(key)
        if not raw or not raw.strip():
            continue
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            continue
    return {}


def discover_env_candidates(max_items: int = 80) -> dict[str, str]:
    discovered: dict[str, str] = {}
    patterns = ("cursor", "chat", "prompt", "response", "input", "output", "message", "conversation", "session")
    for key, value in os.environ.items():
        key_lower = key.lower()
        if any(token in key_lower for token in patterns):
            if value and value.strip():
                discovered[key] = preview_text(value, length=80)
            else:
                discovered[key] = ""
        if len(discovered) >= max_items:
            break
    return dict(sorted(discovered.items()))


def transcript_path_from_env() -> Path | None:
    raw = os.environ.get("CURSOR_TRANSCRIPT_PATH", "").strip()
    if not raw:
        return None
    path = Path(raw)
    if not path.exists():
        return None
    return path


def extract_text_from_content(content: Any) -> str:
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict):
                text = item.get("text")
                if isinstance(text, str) and text.strip():
                    parts.append(text.strip())
        if parts:
            return "\n".join(parts)
    return ""


def extract_codex_content_text(content: Any) -> str:
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if not isinstance(item, dict):
                continue
            text = item.get("text")
            if isinstance(text, str) and text.strip():
                parts.append(text.strip())
        return "\n".join(parts)
    return ""


def extract_text_from_transcript(role: str, max_bytes: int = 2_000_000) -> str:
    path = transcript_path_from_env()
    if not path:
        return ""
    try:
        size = path.stat().st_size
        with path.open("rb") as fp:
            if size > max_bytes:
                fp.seek(size - max_bytes)
                fp.readline()
            raw = fp.read()
    except OSError:
        return ""

    text = raw.decode("utf-8", errors="ignore")
    for line in reversed(text.splitlines()):
        line = line.strip()
        if not line:
            continue
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not isinstance(payload, dict):
            continue
        if payload.get("role") != role:
            continue
        message = payload.get("message")
        if not isinstance(message, dict):
            continue
        extracted = extract_text_from_content(message.get("content"))
        if extracted:
            return extracted
    return ""


def session_key_from_transcript_path() -> str:
    path = transcript_path_from_env()
    if not path:
        return ""
    text = str(path)
    match = re.search(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}", text)
    return match.group(0) if match else ""


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return default


def save_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


def append_jsonl(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fp:
        fp.write(json.dumps(payload, ensure_ascii=False) + "\n")


def read_existing_request_ids(path: Path) -> set[str]:
    if not path.exists():
        return set()
    request_ids: set[str] = set()
    try:
        with path.open("r", encoding="utf-8") as fp:
            for line in fp:
                try:
                    payload = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if not isinstance(payload, dict):
                    continue
                request_id = payload.get("request_id")
                if isinstance(request_id, str) and request_id:
                    request_ids.add(request_id)
    except OSError:
        return set()
    return request_ids


def should_update_existing_record(existing: dict[str, Any], incoming: dict[str, Any]) -> bool:
    return (
        not existing.get("response_end_at")
        and bool(incoming.get("response_end_at"))
        or int(existing.get("response_length") or 0) == 0
        and int(incoming.get("response_length") or 0) > 0
    )


def update_existing_jsonl_record(path: Path, incoming: dict[str, Any]) -> bool:
    request_id = incoming.get("request_id")
    if not isinstance(request_id, str) or not request_id or not path.exists():
        return False

    changed = False
    lines: list[str] = []
    try:
        with path.open("r", encoding="utf-8") as fp:
            for raw_line in fp:
                line = raw_line.rstrip("\n")
                try:
                    existing = json.loads(line)
                except json.JSONDecodeError:
                    lines.append(line)
                    continue
                if (
                    isinstance(existing, dict)
                    and existing.get("request_id") == request_id
                    and should_update_existing_record(existing, incoming)
                ):
                    lines.append(json.dumps(incoming, ensure_ascii=False))
                    changed = True
                else:
                    lines.append(line)
    except OSError:
        return False

    if changed:
        path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return changed


def pick_session_key(payload: Any) -> str:
    value = first_by_keys(payload, SESSION_KEY_CANDIDATES)
    if value:
        return value
    env_value = first_nonempty_env(*ENV_SESSION_CANDIDATE_KEYS)
    if env_value:
        return env_value
    transcript_session = session_key_from_transcript_path()
    if transcript_session:
        return transcript_session
    if isinstance(payload, dict):
        for parent_key in ("session", "conversation", "chat", "thread"):
            parent = payload.get(parent_key)
            if isinstance(parent, dict):
                nested_id = parent.get("id")
                if isinstance(nested_id, str) and nested_id:
                    return nested_id
        for key in ("id", "request_id", "requestId"):
            candidate = payload.get(key)
            if isinstance(candidate, str) and candidate:
                return candidate
    return "default"


def find_first_text(node: Any) -> str:
    if isinstance(node, str):
        return node
    if isinstance(node, dict):
        for key in ("prompt", "text", "message", "content", "input"):
            if key in node:
                value = find_first_text(node[key])
                if value:
                    return value
        for value in node.values():
            result = find_first_text(value)
            if result:
                return result
    if isinstance(node, list):
        for item in node:
            result = find_first_text(item)
            if result:
                return result
    return ""


def preview_text(text: str, length: int = 120) -> str:
    compact = " ".join(text.strip().split())
    if len(compact) <= length:
        return compact
    return compact[:length] + "..."


def safe_debug_value(node: Any, max_text_len: int = 80, max_depth: int = 4) -> Any:
    if max_depth <= 0:
        return "<truncated>"
    if isinstance(node, str):
        compact = " ".join(node.strip().split())
        if len(compact) <= max_text_len:
            return compact
        return compact[:max_text_len] + "..."
    if isinstance(node, (int, float, bool)) or node is None:
        return node
    if isinstance(node, dict):
        result: dict[str, Any] = {}
        for key, value in list(node.items())[:30]:
            result[str(key)] = safe_debug_value(value, max_text_len=max_text_len, max_depth=max_depth - 1)
        if len(node) > 30:
            result["__more_keys__"] = len(node) - 30
        return result
    if isinstance(node, list):
        items = [safe_debug_value(item, max_text_len=max_text_len, max_depth=max_depth - 1) for item in node[:20]]
        if len(node) > 20:
            items.append(f"... ({len(node) - 20} more)")
        return items
    return str(node)


def debug_log_path(now: datetime | None = None) -> Path:
    current = now or datetime.now()
    return LOG_DIR / f"debug_hook_input_{current.date().isoformat()}.jsonl"


def append_debug_input(event: str, payload: Any, session_key: str, text_preview: str) -> None:
    if os.environ.get(DEBUG_HOOK_INPUT_ENV) != "1":
        return
    env_hints = {
        key: preview_text(os.environ.get(key, ""), length=80)
        for key in (*ENV_SESSION_CANDIDATE_KEYS, *ENV_PROMPT_CANDIDATE_KEYS, *ENV_RESPONSE_CANDIDATE_KEYS)
        if os.environ.get(key)
    }
    debug_record = {
        "event": event,
        "captured_at": now_iso(),
        "session_key": session_key,
        "top_level_keys": sorted(payload.keys()) if isinstance(payload, dict) else [],
        "text_preview": preview_text(text_preview, length=160),
        "payload_redacted": safe_debug_value(payload),
        "env_hints": env_hints,
        "env_discovered": discover_env_candidates(),
    }
    append_jsonl(debug_log_path(), debug_record)


def extract_prompt_text(payload: Any) -> str:
    by_key = first_by_keys(payload, PROMPT_TEXT_KEY_CANDIDATES)
    if by_key:
        return by_key
    fallback = find_first_text(payload)
    if fallback:
        return fallback
    env_text = first_nonempty_env(*ENV_PROMPT_CANDIDATE_KEYS, *ENV_RESPONSE_CANDIDATE_KEYS)
    if env_text:
        return env_text
    return extract_text_from_transcript("user")


def extract_response_text(payload: Any) -> str:
    by_key = first_by_keys(payload, RESPONSE_TEXT_KEY_CANDIDATES)
    if by_key:
        return by_key
    fallback = find_first_text(payload)
    if fallback:
        return fallback
    env_text = first_nonempty_env(*ENV_RESPONSE_CANDIDATE_KEYS, *ENV_PROMPT_CANDIDATE_KEYS)
    if env_text:
        return env_text
    return extract_text_from_transcript("assistant")


def compute_latency_ms(start: datetime | None, end: datetime | None) -> int | None:
    if not start or not end:
        return None
    latency = int((end - start).total_seconds() * 1000)
    if latency < 0:
        return None
    if latency > MAX_LATENCY_MS:
        return None
    return latency


def prune_expired_queue(queue: list[dict[str, Any]], now_dt: datetime, ttl_ms: int = PENDING_TTL_MS) -> list[dict[str, Any]]:
    cleaned: list[dict[str, Any]] = []
    for item in queue:
        request_at = to_datetime(item.get("request_at")) if isinstance(item, dict) else None
        if not request_at:
            continue
        age_ms = int((now_dt - request_at).total_seconds() * 1000)
        if 0 <= age_ms <= ttl_ms:
            cleaned.append(item)
    return cleaned


def handle_before_submit(payload: Any) -> None:
    now_dt = datetime.now()
    request_at = now_iso()
    session_key = pick_session_key(payload)
    prompt_text = extract_prompt_text(payload)
    request_id = str(uuid.uuid4())
    append_debug_input("beforeSubmitPrompt", payload, session_key, prompt_text)

    pending = load_json(PENDING_PATH, {})
    request_info = {
        "request_id": request_id,
        "request_at": request_at,
        "prompt_preview": preview_text(prompt_text),
        "prompt_length": len(prompt_text),
    }
    if session_key == "default":
        pending[PENDING_DEFAULT_SINGLE_KEY] = request_info
    else:
        queue = pending.get(session_key, [])
        if not isinstance(queue, list):
            queue = []
        queue = prune_expired_queue(queue, now_dt)
        queue.append(request_info)
        pending[session_key] = queue
    save_json(PENDING_PATH, pending)


def handle_after_response(payload: Any) -> None:
    now_dt = datetime.now()
    response_end_at = now_iso()
    session_key = pick_session_key(payload)
    response_text = extract_response_text(payload)
    append_debug_input("afterAgentResponse", payload, session_key, response_text)

    pending = load_json(PENDING_PATH, {})
    request: dict[str, Any] | None
    if session_key == "default":
        default_request = pending.pop(PENDING_DEFAULT_SINGLE_KEY, None)
        request = default_request if isinstance(default_request, dict) else None
    else:
        queue = pending.get(session_key, [])
        if not isinstance(queue, list):
            queue = []
        queue = prune_expired_queue(queue, now_dt)
        request = queue.pop(0) if queue else None
        pending[session_key] = queue
    save_json(PENDING_PATH, pending)

    record: dict[str, Any] = {
        "event": "conversation_turn",
        "session_key": session_key,
        "response_end_at": response_end_at,
        "response_preview": preview_text(response_text),
        "response_length": len(response_text),
    }
    if request:
        record.update(request)
        start = to_datetime(request.get("request_at"))
        end = to_datetime(response_end_at)
        record["latency_ms"] = compute_latency_ms(start, end)
    else:
        record["request_id"] = None
        record["request_at"] = None
        record["latency_ms"] = None

    append_jsonl(daily_log_path(), record)


def extract_codex_session_id(path: Path, payload: dict[str, Any] | None = None) -> str:
    if payload:
        session_id = payload.get("id")
        if isinstance(session_id, str) and session_id:
            return session_id
    match = re.search(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}", path.name)
    return match.group(0) if match else path.stem


def should_import_codex_session(cwd: str) -> bool:
    if not cwd:
        return True
    try:
        return Path(cwd).resolve() == PROJECT_ROOT.resolve()
    except OSError:
        return cwd.lower() == str(PROJECT_ROOT).lower()


def build_codex_record(session_key: str, source: str, turn: dict[str, Any]) -> dict[str, Any] | None:
    turn_id = turn.get("turn_id")
    if not isinstance(turn_id, str) or not turn_id:
        return None
    request_at = turn.get("request_at")
    response_end_at = turn.get("response_end_at")
    if not isinstance(request_at, datetime) and not isinstance(response_end_at, datetime):
        return None
    prompt_text = turn.get("prompt_text") if isinstance(turn.get("prompt_text"), str) else ""
    response_text = turn.get("response_text") if isinstance(turn.get("response_text"), str) else ""

    return {
        "event": "conversation_turn",
        "source": source,
        "session_key": f"codex:{session_key}",
        "request_id": f"codex:{session_key}:{turn_id}",
        "request_at": request_at.isoformat(timespec="milliseconds") if isinstance(request_at, datetime) else None,
        "response_end_at": response_end_at.isoformat(timespec="milliseconds")
        if isinstance(response_end_at, datetime)
        else None,
        "prompt_preview": preview_text(prompt_text),
        "prompt_length": len(prompt_text),
        "response_preview": preview_text(response_text),
        "response_length": len(response_text),
        "latency_ms": compute_latency_ms(
            request_at if isinstance(request_at, datetime) else None,
            response_end_at if isinstance(response_end_at, datetime) else None,
        ),
    }


def iter_codex_records(path: Path) -> list[dict[str, Any]]:
    session_key = extract_codex_session_id(path)
    session_source = "codex"
    session_cwd = ""
    active_turn_id = ""
    turns: dict[str, dict[str, Any]] = {}

    try:
        fp = path.open("r", encoding="utf-8")
    except OSError:
        return []

    with fp:
        for line in fp:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            if not isinstance(entry, dict):
                continue

            timestamp = parse_codex_datetime(entry.get("timestamp"))
            payload = entry.get("payload")
            if not isinstance(payload, dict):
                continue

            entry_type = entry.get("type")
            payload_type = payload.get("type")

            if entry_type == "session_meta":
                session_key = extract_codex_session_id(path, payload)
                source_value = payload.get("originator") or payload.get("source")
                if isinstance(source_value, str) and source_value:
                    session_source = source_value
                cwd_value = payload.get("cwd")
                if isinstance(cwd_value, str):
                    session_cwd = cwd_value
                continue

            if entry_type == "turn_context":
                cwd_value = payload.get("cwd")
                if isinstance(cwd_value, str):
                    session_cwd = cwd_value
                turn_id = payload.get("turn_id")
                if isinstance(turn_id, str) and turn_id:
                    turn = turns.setdefault(turn_id, {"turn_id": turn_id})
                    turn["cwd"] = session_cwd
                continue

            if entry_type == "event_msg" and payload_type == "task_started":
                turn_id = payload.get("turn_id")
                if not isinstance(turn_id, str) or not turn_id:
                    continue
                active_turn_id = turn_id
                turn = turns.setdefault(turn_id, {"turn_id": turn_id})
                turn["request_at"] = parse_codex_datetime(payload.get("started_at")) or timestamp
                turn["cwd"] = session_cwd
                continue

            if entry_type == "event_msg" and payload_type == "user_message":
                if not active_turn_id:
                    continue
                turn = turns.setdefault(active_turn_id, {"turn_id": active_turn_id})
                message = payload.get("message")
                if isinstance(message, str) and message.strip():
                    turn["prompt_text"] = message
                    turn["request_at"] = timestamp or turn.get("request_at")
                continue

            if entry_type == "response_item" and payload.get("role") == "assistant":
                phase = payload.get("phase")
                if phase not in ("final_answer", "final"):
                    continue
                if not active_turn_id:
                    continue
                text = extract_codex_content_text(payload.get("content"))
                if text:
                    turn = turns.setdefault(active_turn_id, {"turn_id": active_turn_id})
                    turn["response_text"] = text
                    turn["response_end_at"] = timestamp or turn.get("response_end_at")
                continue

            if entry_type == "event_msg" and payload_type == "task_complete":
                turn_id = payload.get("turn_id")
                if not isinstance(turn_id, str) or not turn_id:
                    continue
                turn = turns.setdefault(turn_id, {"turn_id": turn_id})
                completed_at = parse_codex_datetime(payload.get("completed_at"))
                turn["response_end_at"] = completed_at or timestamp or turn.get("response_end_at")
                last_message = payload.get("last_agent_message")
                if isinstance(last_message, str) and last_message.strip():
                    turn["response_text"] = last_message
                if active_turn_id == turn_id:
                    active_turn_id = ""

    if not should_import_codex_session(session_cwd):
        return []

    records: list[dict[str, Any]] = []
    for turn in turns.values():
        record = build_codex_record(session_key, session_source, turn)
        if record:
            records.append(record)
    return records


def handle_import_codex_sessions(target_date: date | None, sessions_dir: Path, lookback_days: int) -> int:
    if not sessions_dir.exists():
        print(json.dumps({"imported": 0, "reason": "codex_sessions_dir_missing"}))
        return 0

    search_root = sessions_dir
    if target_date:
        dated_root = sessions_dir / f"{target_date.year:04d}" / f"{target_date.month:02d}" / f"{target_date.day:02d}"
        if not dated_root.exists():
            print(json.dumps({"imported": 0, "updated": 0, "reason": "codex_sessions_date_dir_missing"}))
            return 0
        search_root = dated_root

    cutoff = datetime.now() - timedelta(days=max(lookback_days, 1))
    imported = 0
    updated = 0
    seen_by_path: dict[Path, set[str]] = {}

    for path in sorted(search_root.rglob("*.jsonl"), key=lambda p: p.stat().st_mtime if p.exists() else 0):
        try:
            modified_at = datetime.fromtimestamp(path.stat().st_mtime)
        except OSError:
            continue
        if target_date is None and modified_at < cutoff:
            continue

        for record in iter_codex_records(path):
            event_dt = to_datetime(record.get("response_end_at")) or to_datetime(record.get("request_at"))
            if not event_dt:
                continue
            if target_date and event_dt.date() != target_date:
                continue

            log_path = daily_log_path(event_dt)
            if log_path not in seen_by_path:
                seen_by_path[log_path] = read_existing_request_ids(log_path)
            request_id = record.get("request_id")
            if isinstance(request_id, str) and request_id in seen_by_path[log_path]:
                if update_existing_jsonl_record(log_path, record):
                    updated += 1
                continue

            append_jsonl(log_path, record)
            if isinstance(request_id, str) and request_id:
                seen_by_path[log_path].add(request_id)
            imported += 1

    print(json.dumps({"imported": imported, "updated": updated}, ensure_ascii=False))
    return imported


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--event", required=True)
    parser.add_argument("--date", default=None, help="Target date for Codex import (YYYY-MM-DD)")
    parser.add_argument("--codex-sessions-dir", default=str(CODEX_SESSIONS_DIR))
    parser.add_argument("--codex-lookback-days", type=int, default=CODEX_DEFAULT_LOOKBACK_DAYS)
    args = parser.parse_args()

    payload: Any = {}
    if args.event != "importCodexSessions":
        try:
            raw = os.sys.stdin.read()
            payload = json.loads(raw) if raw.strip() else {}
        except json.JSONDecodeError:
            payload = {}
        if not payload:
            env_payload = extract_json_from_env()
            if env_payload:
                payload = env_payload

    try:
        if args.event == "beforeSubmitPrompt":
            handle_before_submit(payload)
            print(json.dumps({"permission": "allow"}))
        elif args.event == "afterAgentResponse":
            handle_after_response(payload)
            print("{}")
        elif args.event == "importCodexSessions":
            target_date = date.fromisoformat(args.date) if args.date else None
            handle_import_codex_sessions(target_date, Path(args.codex_sessions_dir), args.codex_lookback_days)
        else:
            print("{}")
    except Exception:
        if args.event == "beforeSubmitPrompt":
            print(json.dumps({"permission": "allow"}))
        else:
            print("{}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
