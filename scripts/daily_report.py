#!/usr/bin/env python3
import argparse
import json
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from statistics import median
from typing import Iterable


DEFAULT_INPUT_FILE = Path("logs/chat_events.jsonl")
DEFAULT_INPUT_DIR = Path("logs/chat_events")
DEFAULT_OUTPUT_DIR = Path("reports")


@dataclass
class Event:
    session_key: str
    request_at: datetime | None
    response_end_at: datetime | None
    latency_ms: int | None
    prompt_preview: str
    response_preview: str


def parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def parse_event(line: str) -> Event | None:
    try:
        payload = json.loads(line)
    except json.JSONDecodeError:
        return None
    if not isinstance(payload, dict):
        return None
    return Event(
        session_key=str(payload.get("session_key") or "unknown"),
        request_at=parse_dt(payload.get("request_at")),
        response_end_at=parse_dt(payload.get("response_end_at")),
        latency_ms=payload.get("latency_ms") if isinstance(payload.get("latency_ms"), int) else None,
        prompt_preview=str(payload.get("prompt_preview") or ""),
        response_preview=str(payload.get("response_preview") or ""),
    )


def iter_events(path: Path) -> Iterable[Event]:
    if not path.exists():
        return []
    events: list[Event] = []
    with path.open("r", encoding="utf-8") as fp:
        for line in fp:
            line = line.strip()
            if not line:
                continue
            event = parse_event(line)
            if event:
                events.append(event)
    return events


def resolve_input_path(day: date, override: str | None) -> Path:
    if override:
        return Path(override)
    daily_path = DEFAULT_INPUT_DIR / f"{day.isoformat()}.jsonl"
    if daily_path.exists():
        return daily_path
    return DEFAULT_INPUT_FILE


def event_date(event: Event) -> date | None:
    base = event.request_at or event.response_end_at
    return base.date() if base else None


def fmt_dt(value: datetime | None) -> str:
    return value.strftime("%Y-%m-%d %H:%M:%S") if value else "-"


def fmt_minutes(total_seconds: float) -> str:
    minutes = int(total_seconds // 60)
    seconds = int(total_seconds % 60)
    return f"{minutes}m {seconds}s"


def fmt_duration_ms(value: int | None) -> str:
    if value is None:
        return "-"
    total_seconds = value // 1000
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    seconds = total_seconds % 60
    if hours > 0:
        return f"{hours}時間{minutes}分{seconds}秒"
    if minutes > 0:
        return f"{minutes}分{seconds}秒"
    return f"{seconds}秒"


def build_report(day: date, events: list[Event], gap_minutes: int) -> str:
    events.sort(key=lambda e: (e.request_at or e.response_end_at or datetime.min))
    turn_count = len(events)
    prompt_count = sum(1 for e in events if e.request_at is not None)
    response_count = sum(1 for e in events if e.response_end_at is not None)
    sessions = sorted({e.session_key for e in events})

    starts = [e.request_at or e.response_end_at for e in events if (e.request_at or e.response_end_at) is not None]
    ends = [e.response_end_at or e.request_at for e in events if (e.response_end_at or e.request_at) is not None]
    day_start = min(starts) if starts else None
    day_end = max(ends) if ends else None

    latencies = [e.latency_ms for e in events if e.latency_ms is not None]
    avg_latency = int(sum(latencies) / len(latencies)) if latencies else None
    med_latency = int(median(latencies)) if latencies else None
    p95_latency = sorted(latencies)[max(0, int(len(latencies) * 0.95) - 1)] if latencies else None

    threshold = gap_minutes * 60
    idle_sections: list[str] = []
    with_request = [e for e in events if e.request_at and e.response_end_at]
    with_request.sort(key=lambda e: e.request_at or datetime.min)
    for prev, nxt in zip(with_request, with_request[1:]):
        if not prev.response_end_at or not nxt.request_at:
            continue
        gap = (nxt.request_at - prev.response_end_at).total_seconds()
        if gap >= threshold:
            idle_sections.append(
                f"- {prev.response_end_at.strftime('%H:%M:%S')} - {nxt.request_at.strftime('%H:%M:%S')} ({fmt_minutes(gap)})"
            )

    lines: list[str] = []
    lines.append(f"# 日次会話レポート ({day.isoformat()})")
    lines.append("")
    lines.append("## サマリー")
    lines.append(f"- 開始時刻: {fmt_dt(day_start)}")
    lines.append(f"- 終了時刻: {fmt_dt(day_end)}")
    lines.append(f"- 会話ターン数: {turn_count}")
    lines.append(f"- ユーザー入力取得数: {prompt_count}")
    lines.append(f"- AI応答取得数: {response_count}")
    lines.append(f"- セッション数: {len(sessions)}")
    lines.append(f"- 空白時間しきい値: {gap_minutes}分")
    lines.append("")
    lines.append("## 応答時間")
    lines.append(f"- 件数: {len(latencies)}")
    lines.append(f"- 平均: {fmt_duration_ms(avg_latency)}")
    lines.append(f"- 中央値: {fmt_duration_ms(med_latency)}")
    lines.append(f"- P95: {fmt_duration_ms(p95_latency)}")
    lines.append("")
    lines.append("## 空白時間")
    if idle_sections:
        lines.extend(idle_sections)
    else:
        lines.append("- なし")
    lines.append("")
    lines.append("## タイムライン")
    if not events:
        lines.append("- イベントなし")
    else:
        prev_response_end: datetime | None = None
        for idx, event in enumerate(events, start=1):
            gap_label = "-"
            if prev_response_end and event.request_at:
                gap_seconds = (event.request_at - prev_response_end).total_seconds()
                if gap_seconds >= 0:
                    gap_label = fmt_minutes(gap_seconds)
            lines.append(
                f"- {idx}. 前回会話から={gap_label} | 要求={fmt_dt(event.request_at)} | 応答={fmt_dt(event.response_end_at)} | "
                f"応答時間={fmt_duration_ms(event.latency_ms)}"
            )
            if event.prompt_preview:
                lines.append(f"  - 入力: {event.prompt_preview}")
            if event.response_preview:
                lines.append(f"  - 応答: {event.response_preview}")
            if event.response_end_at:
                prev_response_end = event.response_end_at
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate daily chat report from chat_events logs")
    parser.add_argument("--date", default=date.today().isoformat(), help="Target date (YYYY-MM-DD)")
    parser.add_argument("--input", default=None, help="Input JSONL path (optional)")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR), help="Output directory")
    parser.add_argument("--gap-minutes", type=int, default=30, help="Idle gap threshold in minutes")
    args = parser.parse_args()

    day = date.fromisoformat(args.date)
    input_path = resolve_input_path(day, args.input)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"daily_{day.isoformat()}.md"

    all_events = list(iter_events(input_path))
    day_events = [event for event in all_events if event_date(event) == day]
    report = build_report(day, day_events, args.gap_minutes)
    output_path.write_text(report, encoding="utf-8")

    print(f"input_path={input_path}")
    print(f"report_path={output_path}")
    print(f"events_total={len(all_events)}")
    print(f"events_for_day={len(day_events)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
