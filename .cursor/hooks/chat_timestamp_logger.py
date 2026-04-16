#!/usr/bin/env python3
import argparse
import json
import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[2]
LOG_DIR = PROJECT_ROOT / "logs" / "chat_events"
PENDING_PATH = PROJECT_ROOT / ".cursor" / "hooks" / ".chat_logger_pending.json"


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


def pick_session_key(payload: Any) -> str:
    if isinstance(payload, dict):
        for key in ("session_id", "sessionId", "conversation_id", "conversationId", "chat_id", "chatId"):
            value = payload.get(key)
            if isinstance(value, str) and value:
                return value
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


def handle_before_submit(payload: Any) -> None:
    request_at = now_iso()
    session_key = pick_session_key(payload)
    prompt_text = find_first_text(payload)
    request_id = str(uuid.uuid4())

    pending = load_json(PENDING_PATH, {})
    queue = pending.get(session_key, [])
    queue.append(
        {
            "request_id": request_id,
            "request_at": request_at,
            "prompt_preview": preview_text(prompt_text),
            "prompt_length": len(prompt_text),
        }
    )
    pending[session_key] = queue
    save_json(PENDING_PATH, pending)


def handle_after_response(payload: Any) -> None:
    response_end_at = now_iso()
    session_key = pick_session_key(payload)
    response_text = find_first_text(payload)

    pending = load_json(PENDING_PATH, {})
    queue = pending.get(session_key, [])
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
        record["latency_ms"] = int((end - start).total_seconds() * 1000) if start and end else None
    else:
        record["request_id"] = None
        record["request_at"] = None
        record["latency_ms"] = None

    append_jsonl(daily_log_path(), record)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--event", required=True)
    args = parser.parse_args()

    try:
        raw = os.sys.stdin.read()
        payload = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        payload = {}

    try:
        if args.event == "beforeSubmitPrompt":
            handle_before_submit(payload)
            print(json.dumps({"permission": "allow"}))
        elif args.event == "afterAgentResponse":
            handle_after_response(payload)
            print("{}")
        else:
            print("{}")
    except Exception:
        # Never block the chat flow; fail open and return valid hook JSON.
        if args.event == "beforeSubmitPrompt":
            print(json.dumps({"permission": "allow"}))
        else:
            print("{}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
