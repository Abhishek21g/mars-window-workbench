from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any

import yaml

from mars_window.errors import ManifestError, ScenarioError
from mars_window.models import FleetProfile, MissionManifest, TransferWindow


def parse_iso(ts: str) -> datetime:
    if ts.endswith("Z"):
        ts = ts[:-1] + "+00:00"
    return datetime.fromisoformat(ts)


def load_manifest(path: Path) -> MissionManifest:
    raw = yaml.safe_load(path.read_text())
    if not isinstance(raw, dict):
        raise ScenarioError(f"manifest must be a mapping: {path}")
    return MissionManifest(
        mission_id=raw["mission_id"],
        crew_count=int(raw["crew_count"]),
        cargo_mass_kg=float(raw["cargo_mass_kg"]),
        cargo_volume_m3=float(raw["cargo_volume_m3"]),
        life_support_days=float(raw["life_support_days"]),
        surface_power_kw=float(raw["surface_power_kw"]),
        isru_water_kg_per_day=float(raw.get("isru_water_kg_per_day", 0.0)),
        return_propellant_fraction=float(raw["return_propellant_fraction"]),
        min_surface_days=float(raw["min_surface_days"]),
    )


def load_window(path: Path) -> TransferWindow:
    raw = yaml.safe_load(path.read_text())
    if not isinstance(raw, dict):
        raise ScenarioError(f"window must be a mapping: {path}")
    return TransferWindow(
        window_id=raw["window_id"],
        departure_utc=raw["departure_utc"],
        window_open_utc=raw["window_open_utc"],
        window_close_utc=raw["window_close_utc"],
        transfer_days=float(raw["transfer_days"]),
        tmi_delta_v_mps=float(raw["tmi_delta_v_mps"]),
        next_window_days=float(raw["next_window_days"]),
    )


def load_fleet(path: Path) -> FleetProfile:
    raw = yaml.safe_load(path.read_text())
    if not isinstance(raw, dict):
        raise ScenarioError(f"fleet must be a mapping: {path}")
    return FleetProfile(
        fleet_id=raw["fleet_id"],
        starship_count=int(raw["starship_count"]),
        tanker_count=int(raw["tanker_count"]),
        leo_depot_capacity_t=float(raw["leo_depot_capacity_t"]),
        payload_mass_cap_kg=float(raw["payload_mass_cap_kg"]),
        payload_volume_cap_m3=float(raw["payload_volume_cap_m3"]),
        crew_cap=int(raw["crew_cap"]),
        edl_mass_cap_kg=float(raw["edl_mass_cap_kg"]),
        min_tmi_margin_mps=float(raw["min_tmi_margin_mps"]),
        min_return_propellant_fraction=float(raw["min_return_propellant_fraction"]),
        tanker_t_per_launch=float(raw["tanker_t_per_launch"]),
        days_per_tanker_launch=float(raw["days_per_tanker_launch"]),
    )


def build_plan(
    manifest: MissionManifest,
    window: TransferWindow,
    fleet: FleetProfile,
    *,
    manifest_path: Path,
    window_path: Path,
    fleet_path: Path,
) -> dict[str, Any]:
    return {
        "mission_id": manifest.mission_id,
        "window_id": window.window_id,
        "fleet_id": fleet.fleet_id,
        "sources": {
            "manifest": str(manifest_path),
            "window": str(window_path),
            "fleet": str(fleet_path),
        },
        "manifest": {
            "crew_count": manifest.crew_count,
            "cargo_mass_kg": manifest.cargo_mass_kg,
            "cargo_volume_m3": manifest.cargo_volume_m3,
            "life_support_days": manifest.life_support_days,
            "min_surface_days": manifest.min_surface_days,
            "return_propellant_fraction": manifest.return_propellant_fraction,
        },
        "window": {
            "departure_utc": window.departure_utc,
            "transfer_days": window.transfer_days,
            "tmi_delta_v_mps": window.tmi_delta_v_mps,
        },
        "fleet": {
            "starship_count": fleet.starship_count,
            "tanker_count": fleet.tanker_count,
            "leo_depot_capacity_t": fleet.leo_depot_capacity_t,
        },
    }


def write_plan(plan: dict[str, Any], out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / "manifest.json"
    path.write_text(json.dumps(plan, indent=2) + "\n")
    return path


def load_plan(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise ManifestError(f"plan not found: {path}")
    return json.loads(path.read_text())
