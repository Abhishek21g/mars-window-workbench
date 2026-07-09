from __future__ import annotations

from typing import Any


def render_markdown(receipt: dict[str, Any]) -> str:
    lines = [
        "# Mars Window Commit Receipt",
        "",
        f"**Run ID:** `{receipt.get('run_id')}`",
        f"**Mission:** `{receipt.get('mission_id')}`",
        f"**Window:** `{receipt.get('window_id')}`",
        f"**Decision:** **{receipt.get('decision')}**",
        "",
        "## Simulation",
        "",
    ]
    sim = receipt.get("simulation") or {}
    for key, val in sim.items():
        lines.append(f"- {key}: {val}")
    lines.extend(["", "## Gate findings", ""])
    for f in receipt.get("findings", []):
        lines.append(
            f"- `[{f.get('gate_id')}]` **{f.get('severity')}** → "
            f"{f.get('action')}: {f.get('message')}"
        )
    lines.extend([
        "",
        "_Synthetic demo. Public physics envelopes only. Not affiliated with SpaceX._",
        "",
    ])
    return "\n".join(lines)
