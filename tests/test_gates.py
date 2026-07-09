from __future__ import annotations

from pathlib import Path

from mars_window.doctor import (
    evaluate_fleet_gates,
    evaluate_manifest_gates,
    evaluate_physics_gates,
    evaluate_window_gates,
    rollup_decision,
    simulate_mission,
)
from mars_window.models import FleetProfile, MissionManifest, SimResult, TransferWindow
from mars_window.planner import build_plan, load_fleet, load_manifest, load_window
from mars_window.simulator import execute_run

ROOT = Path(__file__).resolve().parents[1]


def _manifest(**kw) -> MissionManifest:
    base = dict(
        mission_id="t",
        crew_count=4,
        cargo_mass_kg=80000,
        cargo_volume_m3=700,
        life_support_days=500,
        surface_power_kw=12,
        isru_water_kg_per_day=8,
        return_propellant_fraction=0.18,
        min_surface_days=400,
    )
    base.update(kw)
    return MissionManifest(**base)


def _window(**kw) -> TransferWindow:
    base = dict(
        window_id="w",
        departure_utc="2028-11-15T12:00:00Z",
        window_open_utc="2028-10-01T00:00:00Z",
        window_close_utc="2028-12-20T00:00:00Z",
        transfer_days=210,
        tmi_delta_v_mps=3800,
        next_window_days=780,
    )
    base.update(kw)
    return TransferWindow(**base)


def _fleet(**kw) -> FleetProfile:
    base = dict(
        fleet_id="f",
        starship_count=6,
        tanker_count=14,
        leo_depot_capacity_t=2200,
        payload_mass_cap_kg=100000,
        payload_volume_cap_m3=1100,
        crew_cap=6,
        edl_mass_cap_kg=140000,
        min_tmi_margin_mps=120,
        min_return_propellant_fraction=0.15,
        tanker_t_per_launch=150,
        days_per_tanker_launch=3.5,
    )
    base.update(kw)
    return FleetProfile(**base)


def test_m01_cargo_mass():
    f = evaluate_manifest_gates(_manifest(cargo_mass_kg=120000), _fleet())
    assert any(x.gate_id == "M01" for x in f)


def test_m02_volume():
    f = evaluate_manifest_gates(_manifest(cargo_volume_m3=2000), _fleet())
    assert any(x.gate_id == "M02" for x in f)


def test_m03_crew_cap():
    f = evaluate_manifest_gates(_manifest(crew_count=10), _fleet(crew_cap=6))
    assert any(x.gate_id == "M03" for x in f)


def test_m04_return_prop():
    f = evaluate_manifest_gates(_manifest(return_propellant_fraction=0.05), _fleet())
    assert any(x.gate_id == "M04" for x in f)


def test_m05_life_support():
    f = evaluate_manifest_gates(_manifest(life_support_days=100, min_surface_days=400), _fleet())
    assert any(x.gate_id == "M05" for x in f)


def test_w01_outside_window():
    f = evaluate_window_gates(_window(departure_utc="2029-03-01T12:00:00Z"), _manifest())
    assert any(x.gate_id == "W01" for x in f)


def test_w02_transfer_envelope():
    f = evaluate_window_gates(_window(transfer_days=90), _manifest())
    assert any(x.gate_id == "W02" for x in f)


def test_w03_synodic_risk():
    f = evaluate_window_gates(_window(next_window_days=400), _manifest(min_surface_days=300))
    assert any(x.gate_id == "W03" for x in f)


def test_f01_tanker_shortfall():
    sim = simulate_mission(_manifest(), _window(), _fleet(tanker_count=1))
    f = evaluate_fleet_gates(_fleet(tanker_count=1), sim, _manifest())
    assert any(x.gate_id == "F01" for x in f)


def test_f02_depot_slow():
    sim = SimResult(
        leo_propellant_t=2000, depot_fill_days=60, landed_mass_kg=100000,
        tmi_margin_mps=200, surface_power_margin_days=500, consumable_margin_days=500,
        return_propellant_ok=True,
    )
    f = evaluate_fleet_gates(_fleet(), sim, _manifest())
    assert any(x.gate_id == "F02" for x in f)


def test_f03_starship_count():
    sim = simulate_mission(_manifest(), _window(), _fleet(starship_count=1))
    f = evaluate_fleet_gates(_fleet(starship_count=1), sim, _manifest())
    assert any(x.gate_id == "F03" for x in f)


def test_p01_tmi_margin():
    sim = SimResult(
        leo_propellant_t=500, depot_fill_days=10, landed_mass_kg=100000,
        tmi_margin_mps=50, surface_power_margin_days=500, consumable_margin_days=500,
        return_propellant_ok=True,
    )
    f = evaluate_physics_gates(_manifest(), _fleet(), _window(), sim)
    assert any(x.gate_id == "P01" for x in f)


def test_p02_edl_mass():
    sim = SimResult(
        leo_propellant_t=2000, depot_fill_days=10, landed_mass_kg=200000,
        tmi_margin_mps=200, surface_power_margin_days=500, consumable_margin_days=500,
        return_propellant_ok=True,
    )
    f = evaluate_physics_gates(_manifest(), _fleet(edl_mass_cap_kg=100000), _window(), sim)
    assert any(x.gate_id == "P02" for x in f)


def test_p03_power():
    sim = SimResult(
        leo_propellant_t=2000, depot_fill_days=10, landed_mass_kg=100000,
        tmi_margin_mps=200, surface_power_margin_days=50, consumable_margin_days=500,
        return_propellant_ok=True,
    )
    f = evaluate_physics_gates(_manifest(min_surface_days=400), _fleet(), _window(), sim)
    assert any(x.gate_id == "P03" for x in f)


def test_p04_consumables():
    sim = SimResult(
        leo_propellant_t=2000, depot_fill_days=10, landed_mass_kg=100000,
        tmi_margin_mps=200, surface_power_margin_days=500, consumable_margin_days=30,
        return_propellant_ok=True,
    )
    f = evaluate_physics_gates(_manifest(min_surface_days=400), _fleet(), _window(), sim)
    assert any(x.gate_id == "P04" for x in f)


def test_p05_high_tmi():
    f = evaluate_physics_gates(
        _manifest(), _fleet(), _window(tmi_delta_v_mps=7000),
        simulate_mission(_manifest(), _window(tmi_delta_v_mps=7000), _fleet()),
    )
    assert any(x.gate_id == "P05" for x in f)


def test_r01_nogo():
    fake = type("F", (), {"gate_id": "M01", "severity": "FAIL", "action": "NO-GO"})()
    d, r = rollup_decision([fake])
    assert d == "NO-GO" and any(x.gate_id == "R01" for x in r)


def test_r02_hold():
    fake = type("F", (), {"gate_id": "W02", "severity": "WARN", "action": "HOLD"})()
    d, r = rollup_decision([fake])
    assert d == "HOLD" and any(x.gate_id == "R02" for x in r)


def test_r03_go():
    d, r = rollup_decision([])
    assert d == "GO" and any(x.gate_id == "R03" for x in r)


def test_load_scenario_files():
    m = load_manifest(ROOT / "scenarios/artemis-pathfinder.yaml")
    w = load_window(ROOT / "windows/2028-short.yaml")
    fl = load_fleet(ROOT / "fleets/six-tanker-chain.yaml")
    assert m.mission_id == "artemis-pathfinder"
    assert w.window_id == "2028-short-class"
    assert fl.tanker_count == 14


def test_build_plan():
    m = load_manifest(ROOT / "scenarios/cargo-only-demo.yaml")
    w = load_window(ROOT / "windows/2028-short.yaml")
    fl = load_fleet(ROOT / "fleets/six-tanker-chain.yaml")
    plan = build_plan(
        m, w, fl,
        manifest_path=Path("m.yaml"),
        window_path=Path("w.yaml"),
        fleet_path=Path("f.yaml"),
    )
    assert plan["mission_id"] == "cargo-only-demo"


def test_overweight_integration_nogo():
    run = execute_run(
        load_manifest(ROOT / "scenarios/overweight-fail.yaml"),
        load_window(ROOT / "windows/2028-short.yaml"),
        load_fleet(ROOT / "fleets/six-tanker-chain.yaml"),
    )
    assert run["receipt"]["decision"] == "NO-GO"


def test_missed_window_nogo():
    run = execute_run(
        load_manifest(ROOT / "scenarios/cargo-only-demo.yaml"),
        load_window(ROOT / "windows/missed-window.yaml"),
        load_fleet(ROOT / "fleets/six-tanker-chain.yaml"),
    )
    assert run["receipt"]["decision"] == "NO-GO"


def test_cargo_only_runs():
    run = execute_run(
        load_manifest(ROOT / "scenarios/cargo-only-demo.yaml"),
        load_window(ROOT / "windows/2028-short.yaml"),
        load_fleet(ROOT / "fleets/six-tanker-chain.yaml"),
    )
    assert run["receipt"]["decision"] in {"GO", "HOLD", "NO-GO"}
    assert run["receipt"]["simulation"]["leo_propellant_t"] > 0
