from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from mars_window.doctor import (
    doctor_receipt,
    evaluate_fleet_gates,
    evaluate_manifest_gates,
    evaluate_physics_gates,
    evaluate_window_gates,
    rollup_decision,
    simulate_mission,
)
from mars_window.models import Receipt
from mars_window.planner import load_fleet, load_manifest, load_plan, load_window


def execute_run_from_plan(plan_path: Path) -> dict[str, Any]:
    plan = load_plan(plan_path)
    manifest = load_manifest(Path(plan["sources"]["manifest"]))
    window = load_window(Path(plan["sources"]["window"]))
    fleet = load_fleet(Path(plan["sources"]["fleet"]))
    return execute_run(manifest, window, fleet)


def execute_run(manifest, window, fleet) -> dict[str, Any]:
    sim = simulate_mission(manifest, window, fleet)
    findings = []
    findings.extend(evaluate_manifest_gates(manifest, fleet))
    findings.extend(evaluate_window_gates(window, manifest))
    findings.extend(evaluate_fleet_gates(fleet, sim, manifest))
    findings.extend(evaluate_physics_gates(manifest, fleet, window, sim))
    decision, rollup = rollup_decision(findings)
    findings.extend(rollup)

    run_id = uuid4().hex[:12]
    receipt = Receipt(
        run_id=run_id,
        mission_id=manifest.mission_id,
        window_id=window.window_id,
        decision=decision,  # type: ignore[arg-type]
        findings=findings,
        manifest={
            "crew_count": manifest.crew_count,
            "cargo_mass_kg": manifest.cargo_mass_kg,
            "life_support_days": manifest.life_support_days,
        },
        window={
            "departure_utc": window.departure_utc,
            "transfer_days": window.transfer_days,
            "tmi_delta_v_mps": window.tmi_delta_v_mps,
        },
        fleet={
            "starship_count": fleet.starship_count,
            "tanker_count": fleet.tanker_count,
        },
        simulation={
            "leo_propellant_t": sim.leo_propellant_t,
            "depot_fill_days": sim.depot_fill_days,
            "landed_mass_kg": sim.landed_mass_kg,
            "tmi_margin_mps": round(sim.tmi_margin_mps, 2),
            "surface_power_margin_days": round(sim.surface_power_margin_days, 1),
            "consumable_margin_days": round(sim.consumable_margin_days, 1),
        },
        summary={
            "generated_at": datetime.now(UTC).isoformat(),
            "fleet_id": fleet.fleet_id,
            "gate_counts": _count(findings),
        },
    )
    return {"receipt": receipt.to_dict(), "mission_id": manifest.mission_id}


def _count(findings: list[Any]) -> dict[str, int]:
    counts = {"PASS": 0, "WARN": 0, "FAIL": 0}
    for f in findings:
        sev = f.severity if hasattr(f, "severity") else f.get("severity")
        if sev in counts:
            counts[sev] += 1
    return counts


def write_run_artifacts(run_data: dict[str, Any], out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    receipt_path = out_dir / "receipt.json"
    receipt_path.write_text(json.dumps(run_data["receipt"], indent=2) + "\n")
    summary = {
        "run_id": run_data["receipt"]["run_id"],
        "mission_id": run_data["mission_id"],
        "decision": run_data["receipt"]["decision"],
        "summary": run_data["receipt"]["summary"],
    }
    (out_dir / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    return receipt_path


__all__ = ["execute_run", "execute_run_from_plan", "write_run_artifacts", "doctor_receipt"]
