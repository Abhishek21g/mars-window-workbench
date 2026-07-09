from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Literal

Severity = Literal["PASS", "WARN", "FAIL"]
Action = Literal["GO", "HOLD", "NO-GO"]
Decision = Literal["GO", "HOLD", "NO-GO"]


@dataclass
class GateFinding:
    gate_id: str
    category: Literal["manifest", "window", "fleet", "physics", "rollup"]
    severity: Severity
    action: Action
    message: str
    observed: float | str | bool | None = None
    threshold: float | str | bool | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class MissionManifest:
    mission_id: str
    crew_count: int
    cargo_mass_kg: float
    cargo_volume_m3: float
    life_support_days: float
    surface_power_kw: float
    isru_water_kg_per_day: float
    return_propellant_fraction: float
    min_surface_days: float


@dataclass
class TransferWindow:
    window_id: str
    departure_utc: str
    window_open_utc: str
    window_close_utc: str
    transfer_days: float
    tmi_delta_v_mps: float
    next_window_days: float


@dataclass
class FleetProfile:
    fleet_id: str
    starship_count: int
    tanker_count: int
    leo_depot_capacity_t: float
    payload_mass_cap_kg: float
    payload_volume_cap_m3: float
    crew_cap: int
    edl_mass_cap_kg: float
    min_tmi_margin_mps: float
    min_return_propellant_fraction: float
    tanker_t_per_launch: float
    days_per_tanker_launch: float


@dataclass
class SimResult:
    leo_propellant_t: float
    depot_fill_days: float
    landed_mass_kg: float
    tmi_margin_mps: float
    surface_power_margin_days: float
    consumable_margin_days: float
    return_propellant_ok: bool


@dataclass
class Receipt:
    run_id: str
    mission_id: str
    window_id: str
    decision: Decision
    findings: list[GateFinding] = field(default_factory=list)
    manifest: dict[str, Any] | None = None
    window: dict[str, Any] | None = None
    fleet: dict[str, Any] | None = None
    simulation: dict[str, Any] | None = None
    summary: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "run_id": self.run_id,
            "mission_id": self.mission_id,
            "window_id": self.window_id,
            "decision": self.decision,
            "findings": [f.to_dict() for f in self.findings],
            "manifest": self.manifest,
            "window": self.window,
            "fleet": self.fleet,
            "simulation": self.simulation,
            "summary": self.summary,
        }
