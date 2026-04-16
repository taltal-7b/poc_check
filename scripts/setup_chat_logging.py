#!/usr/bin/env python3
import argparse
import json
import shutil
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
SOURCE_HOOK_SCRIPT = REPO_ROOT / ".cursor" / "hooks" / "chat_timestamp_logger.py"
SOURCE_REPORT_SCRIPT = REPO_ROOT / "scripts" / "daily_report.py"

HOOK_COMMANDS = {
    "beforeSubmitPrompt": "python3 .cursor/hooks/chat_timestamp_logger.py --event beforeSubmitPrompt",
    "afterAgentResponse": "python3 .cursor/hooks/chat_timestamp_logger.py --event afterAgentResponse",
}


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def save_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def ensure_hook_entry(hooks: dict[str, Any], event_name: str, command: str) -> None:
    event_hooks = hooks.get(event_name)
    if not isinstance(event_hooks, list):
        event_hooks = []
    exists = any(isinstance(item, dict) and item.get("command") == command for item in event_hooks)
    if not exists:
        event_hooks.append(
            {
                "command": command,
                "timeout": 10,
                "failClosed": False,
            }
        )
    hooks[event_name] = event_hooks


def install_hooks_json(target_project: Path) -> Path:
    hooks_path = target_project / ".cursor" / "hooks.json"
    current = load_json(hooks_path)

    if not current:
        current = {"version": 1, "hooks": {}}
    if current.get("version") != 1:
        current["version"] = 1
    hooks = current.get("hooks")
    if not isinstance(hooks, dict):
        hooks = {}
        current["hooks"] = hooks

    for event_name, command in HOOK_COMMANDS.items():
        ensure_hook_entry(hooks, event_name, command)

    save_json(hooks_path, current)
    return hooks_path


def copy_scripts(target_project: Path) -> tuple[Path, Path]:
    target_hook_script = target_project / ".cursor" / "hooks" / "chat_timestamp_logger.py"
    target_report_script = target_project / "scripts" / "daily_report.py"

    target_hook_script.parent.mkdir(parents=True, exist_ok=True)
    target_report_script.parent.mkdir(parents=True, exist_ok=True)

    shutil.copy2(SOURCE_HOOK_SCRIPT, target_hook_script)
    shutil.copy2(SOURCE_REPORT_SCRIPT, target_report_script)
    target_hook_script.chmod(0o755)
    target_report_script.chmod(0o755)

    return target_hook_script, target_report_script


def ensure_dirs(target_project: Path) -> None:
    (target_project / "logs" / "chat_events").mkdir(parents=True, exist_ok=True)
    (target_project / "reports").mkdir(parents=True, exist_ok=True)


def validate_sources() -> None:
    missing = [str(p) for p in (SOURCE_HOOK_SCRIPT, SOURCE_REPORT_SCRIPT) if not p.exists()]
    if missing:
        raise FileNotFoundError("Missing source files: " + ", ".join(missing))


def main() -> int:
    parser = argparse.ArgumentParser(description="Install Cursor chat logging and daily report scripts into a project.")
    parser.add_argument("--target", default=".", help="Target project path")
    args = parser.parse_args()

    validate_sources()
    target_project = Path(args.target).resolve()
    if not target_project.exists():
        raise FileNotFoundError(f"Target project not found: {target_project}")

    ensure_dirs(target_project)
    hooks_path = install_hooks_json(target_project)
    hook_script, report_script = copy_scripts(target_project)

    print("setup=ok")
    print(f"target={target_project}")
    print(f"hooks_json={hooks_path}")
    print(f"hook_script={hook_script}")
    print(f"report_script={report_script}")
    print("next_step=Restart Cursor if hooks do not reload automatically.")
    print("run_report=python3 scripts/daily_report.py --date YYYY-MM-DD")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
