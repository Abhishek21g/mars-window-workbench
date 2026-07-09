from __future__ import annotations

from mars_window.models import FleetProfile, GateFinding, MissionManifest, SimResult, TransferWindow
from mars_window.planner import parse_iso


def simulate_mission(
    manifest: MissionManifest,
    window: TransferWindow,
    fleet: FleetProfile,
) -> SimResult:
    # Labeled mock physics — order-of-magnitude public-envelope only
    propellant_needed_t = 1200.0 + manifest.cargo_mass_kg / 800.0 + manifest.crew_count * 15.0
    leo_propellant_t = fleet.tanker_count * fleet.tanker_t_per_launch
    depot_fill_days = fleet.tanker_count * fleet.days_per_tanker_launch

    landed_mass_kg = manifest.cargo_mass_kg + manifest.crew_count * 95.0 + 42000.0
    tmi_margin_mps = fleet.min_tmi_margin_mps + (leo_propellant_t - propellant_needed_t) / 200.0

    daily_consumable_kg = manifest.crew_count * 2.8
    isru = manifest.isru_water_kg_per_day
    net_daily = daily_consumable_kg - isru
    consumable_store_kg = manifest.crew_count * 50.0
    if net_daily <= 0:
        consumable_margin_days = manifest.life_support_days * 2
    else:
        consumable_margin_days = consumable_store_kg / net_daily

    solar_kw_effective = manifest.surface_power_kw * 0.65
    habitat_draw_kw = manifest.crew_count * 1.2 + 2.0
    if habitat_draw_kw <= 0:
        surface_power_margin_days = manifest.min_surface_days
    else:
        battery_kwh = manifest.crew_count * 40.0
        daily_deficit = max(habitat_draw_kw - solar_kw_effective, 0.0)
        surface_power_margin_days = (
            battery_kwh / (daily_deficit * 24)
            if daily_deficit > 0
            else manifest.min_surface_days * 2
        )

    return SimResult(
        leo_propellant_t=leo_propellant_t,
        depot_fill_days=depot_fill_days,
        landed_mass_kg=landed_mass_kg,
        tmi_margin_mps=tmi_margin_mps,
        surface_power_margin_days=surface_power_margin_days,
        consumable_margin_days=consumable_margin_days,
        return_propellant_ok=manifest.return_propellant_fraction
        >= fleet.min_return_propellant_fraction,
    )


def evaluate_manifest_gates(
    manifest: MissionManifest, fleet: FleetProfile
) -> list[GateFinding]:
    findings: list[GateFinding] = []

    if manifest.cargo_mass_kg > fleet.payload_mass_cap_kg:
        findings.append(
            GateFinding(
                gate_id="M01",
                category="manifest",
                severity="FAIL",
                action="NO-GO",
                message="Cargo mass exceeds Starship payload cap",
                observed=manifest.cargo_mass_kg,
                threshold=fleet.payload_mass_cap_kg,
            )
        )

    if manifest.cargo_volume_m3 > fleet.payload_volume_cap_m3:
        findings.append(
            GateFinding(
                gate_id="M02",
                category="manifest",
                severity="FAIL",
                action="NO-GO",
                message="Cargo volume exceeds fairing envelope",
                observed=manifest.cargo_volume_m3,
                threshold=fleet.payload_volume_cap_m3,
            )
        )

    if manifest.crew_count > fleet.crew_cap:
        findings.append(
            GateFinding(
                gate_id="M03",
                category="manifest",
                severity="FAIL",
                action="NO-GO",
                message="Crew count exceeds Mars crew cap",
                observed=manifest.crew_count,
                threshold=fleet.crew_cap,
            )
        )

    if manifest.return_propellant_fraction < fleet.min_return_propellant_fraction:
        findings.append(
            GateFinding(
                gate_id="M04",
                category="manifest",
                severity="FAIL",
                action="NO-GO",
                message="Return propellant reserve below minimum",
                observed=manifest.return_propellant_fraction,
                threshold=fleet.min_return_propellant_fraction,
            )
        )

    if manifest.life_support_days < manifest.min_surface_days:
        findings.append(
            GateFinding(
                gate_id="M05",
                category="manifest",
                severity="FAIL",
                action="HOLD",
                message="Declared life support shorter than minimum surface stay",
                observed=manifest.life_support_days,
                threshold=manifest.min_surface_days,
            )
        )

    return findings


def evaluate_window_gates(
    window: TransferWindow, manifest: MissionManifest
) -> list[GateFinding]:
    findings: list[GateFinding] = []
    dep = parse_iso(window.departure_utc)
    open_t = parse_iso(window.window_open_utc)
    close_t = parse_iso(window.window_close_utc)

    if not (open_t <= dep <= close_t):
        findings.append(
            GateFinding(
                gate_id="W01",
                category="window",
                severity="FAIL",
                action="NO-GO",
                message="Departure outside Earth-Mars transfer window",
                observed=window.departure_utc,
                threshold=f"{window.window_open_utc}..{window.window_close_utc}",
            )
        )

    if window.transfer_days < 120 or window.transfer_days > 280:
        findings.append(
            GateFinding(
                gate_id="W02",
                category="window",
                severity="WARN",
                action="HOLD",
                message="Transfer duration outside typical Hohmann envelope",
                observed=window.transfer_days,
                threshold="120..280 days",
            )
        )

    if manifest.min_surface_days > window.next_window_days * 0.5:
        findings.append(
            GateFinding(
                gate_id="W03",
                category="window",
                severity="WARN",
                action="HOLD",
                message="Surface stay risks missing next synodic return window",
                observed=manifest.min_surface_days,
                threshold=window.next_window_days * 0.5,
            )
        )

    return findings


def evaluate_fleet_gates(
    fleet: FleetProfile, sim: SimResult, manifest: MissionManifest
) -> list[GateFinding]:
    findings: list[GateFinding] = []

    propellant_needed_t = 1200.0 + manifest.cargo_mass_kg / 800.0 + manifest.crew_count * 15.0
    if sim.leo_propellant_t < propellant_needed_t:
        findings.append(
            GateFinding(
                gate_id="F01",
                category="fleet",
                severity="FAIL",
                action="NO-GO",
                message="Tanker chain cannot close LEO propellant budget",
                observed=sim.leo_propellant_t,
                threshold=propellant_needed_t,
            )
        )

    if sim.depot_fill_days > 45:
        findings.append(
            GateFinding(
                gate_id="F02",
                category="fleet",
                severity="WARN",
                action="HOLD",
                message="LEO depot fill timeline exceeds pre-window margin",
                observed=sim.depot_fill_days,
                threshold=45.0,
            )
        )

    if fleet.starship_count < 2:
        findings.append(
            GateFinding(
                gate_id="F03",
                category="fleet",
                severity="FAIL",
                action="NO-GO",
                message="Fleet needs at least one cargo + one tanker Starship",
                observed=fleet.starship_count,
                threshold=2,
            )
        )

    return findings


def evaluate_physics_gates(
    manifest: MissionManifest,
    fleet: FleetProfile,
    window: TransferWindow,
    sim: SimResult,
) -> list[GateFinding]:
    findings: list[GateFinding] = []

    if sim.tmi_margin_mps < fleet.min_tmi_margin_mps:
        findings.append(
            GateFinding(
                gate_id="P01",
                category="physics",
                severity="FAIL",
                action="NO-GO",
                message="TMI delta-v margin below commit threshold",
                observed=round(sim.tmi_margin_mps, 2),
                threshold=fleet.min_tmi_margin_mps,
            )
        )

    if sim.landed_mass_kg > fleet.edl_mass_cap_kg:
        findings.append(
            GateFinding(
                gate_id="P02",
                category="physics",
                severity="FAIL",
                action="NO-GO",
                message="Landed mass exceeds EDL structural cap",
                observed=sim.landed_mass_kg,
                threshold=fleet.edl_mass_cap_kg,
            )
        )

    if sim.surface_power_margin_days < manifest.min_surface_days:
        findings.append(
            GateFinding(
                gate_id="P03",
                category="physics",
                severity="FAIL",
                action="HOLD",
                message="Surface power budget cannot cover minimum stay",
                observed=round(sim.surface_power_margin_days, 1),
                threshold=manifest.min_surface_days,
            )
        )

    if sim.consumable_margin_days < manifest.min_surface_days:
        findings.append(
            GateFinding(
                gate_id="P04",
                category="physics",
                severity="FAIL",
                action="HOLD",
                message="Life-support consumables cannot cover minimum stay",
                observed=round(sim.consumable_margin_days, 1),
                threshold=manifest.min_surface_days,
            )
        )

    if window.tmi_delta_v_mps > 6500:
        findings.append(
            GateFinding(
                gate_id="P05",
                category="physics",
                severity="WARN",
                action="HOLD",
                message="TMI delta-v unusually high for this window class",
                observed=window.tmi_delta_v_mps,
                threshold=6500.0,
            )
        )

    return findings


def rollup_decision(findings: list[GateFinding]) -> tuple[str, list[GateFinding]]:
    rollup: list[GateFinding] = []
    has_nogo = any(f.action == "NO-GO" for f in findings)
    has_hold = any(f.action == "HOLD" for f in findings)
    has_fail = any(f.severity == "FAIL" for f in findings)

    blocking = {"M01", "M02", "M03", "M04", "F01", "F03", "P01", "P02"}
    critical_fail = any(
        f.gate_id in blocking and f.severity == "FAIL" for f in findings
    )
    if has_nogo or critical_fail:
        decision = "NO-GO"
        rollup.append(
            GateFinding(
                gate_id="R01",
                category="rollup",
                severity="FAIL",
                action="NO-GO",
                message="Window commit NO-GO — blocking gate fired",
            )
        )
    elif has_hold or has_fail:
        decision = "HOLD"
        rollup.append(
            GateFinding(
                gate_id="R02",
                category="rollup",
                severity="WARN",
                action="HOLD",
                message="Window commit HOLD — margins require human review",
            )
        )
    else:
        decision = "GO"
        rollup.append(
            GateFinding(
                gate_id="R03",
                category="rollup",
                severity="PASS",
                action="GO",
                message="Window commit GO — all gates pass",
            )
        )

    return decision, rollup


def doctor_receipt(receipt: dict) -> dict:
    findings = receipt.get("findings", [])
    failed = sum(1 for f in findings if f.get("severity") == "FAIL")
    warned = sum(1 for f in findings if f.get("severity") == "WARN")
    return {
        "run_id": receipt.get("run_id"),
        "mission_id": receipt.get("mission_id"),
        "window_id": receipt.get("window_id"),
        "decision": receipt.get("decision"),
        "failed": failed,
        "warned": warned,
        "total": len(findings),
        "findings": findings,
    }
