from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from mars_window.errors import MarsWindowError
from mars_window.planner import build_plan, load_fleet, load_manifest, load_window, write_plan
from mars_window.report import render_markdown
from mars_window.simulator import execute_run_from_plan, write_run_artifacts


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return args.handler(args)
    except MarsWindowError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="mars-window",
        description="Mars Window Commit Workbench — plan, run, doctor, report window GO/NO-GO.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    plan_p = sub.add_parser("plan", help="Build run plan from manifest + window + fleet.")
    plan_p.add_argument("--manifest", type=Path, required=True)
    plan_p.add_argument("--window", type=Path, required=True)
    plan_p.add_argument("--fleet", type=Path, required=True)
    plan_p.add_argument("--out-dir", type=Path, default=Path(".mars-window"))
    plan_p.add_argument("--json", action="store_true")
    plan_p.set_defaults(handler=_cmd_plan)

    run_p = sub.add_parser("run", help="Simulate window commit and emit receipt.")
    run_p.add_argument("--manifest", type=Path, default=None)
    run_p.add_argument("--window", type=Path, default=None)
    run_p.add_argument("--fleet", type=Path, default=None)
    run_p.add_argument("--plan", type=Path, default=None)
    run_p.add_argument("--out-dir", type=Path, default=None)
    run_p.add_argument("--json", action="store_true")
    run_p.set_defaults(handler=_cmd_run)

    doc_p = sub.add_parser("doctor", help="Summarize receipt findings.")
    doc_p.add_argument("--receipt", type=Path, required=True)
    doc_p.add_argument("--json", action="store_true")
    doc_p.set_defaults(handler=_cmd_doctor)

    rep_p = sub.add_parser("report", help="Render Markdown or JSON report.")
    rep_p.add_argument("--receipt", type=Path, required=True)
    rep_p.add_argument("--json", action="store_true")
    rep_p.add_argument("--out", type=Path, default=None)
    rep_p.set_defaults(handler=_cmd_report)

    return parser


def _cmd_plan(args: argparse.Namespace) -> int:
    manifest = load_manifest(args.manifest)
    window = load_window(args.window)
    fleet = load_fleet(args.fleet)
    plan = build_plan(
        manifest, window, fleet,
        manifest_path=args.manifest, window_path=args.window, fleet_path=args.fleet,
    )
    path = write_plan(plan, args.out_dir)
    print(json.dumps(plan, indent=2))
    print(f"\nplan: {path}", file=sys.stderr)
    return 0


def _cmd_run(args: argparse.Namespace) -> int:
    if args.plan:
        run_data = execute_run_from_plan(args.plan)
    else:
        if not all([args.manifest, args.window, args.fleet]):
            print("error: provide --plan or --manifest --window --fleet", file=sys.stderr)
            return 1
        from mars_window.simulator import execute_run
        manifest = load_manifest(args.manifest)
        window = load_window(args.window)
        fleet = load_fleet(args.fleet)
        run_data = execute_run(manifest, window, fleet)

    run_id = run_data["receipt"]["run_id"]
    out_dir = args.out_dir or Path("out/receipts") / run_id
    receipt_path = write_run_artifacts(run_data, out_dir)
    (out_dir / "report.md").write_text(render_markdown(run_data["receipt"]) + "\n")
    print(json.dumps(run_data["receipt"], indent=2))
    print(f"\nreceipt: {receipt_path}", file=sys.stderr)
    return 0 if run_data["receipt"]["decision"] == "GO" else 2


def _cmd_doctor(args: argparse.Namespace) -> int:
    from mars_window.doctor import doctor_receipt
    path = args.receipt
    if path.is_dir():
        path = path / "receipt.json"
    payload = doctor_receipt(json.loads(path.read_text()))
    if args.json:
        print(json.dumps(payload, indent=2))
    else:
        print(f"decision: {payload['decision']}")
        print(
            f"gates: {payload['total']} total, "
            f"{payload['failed']} failed, {payload['warned']} warned"
        )
        for f in payload["findings"]:
            print(
                f"  [{f.get('gate_id')}] {f.get('severity')} → "
                f"{f.get('action')}: {f.get('message')}"
            )
    return 2 if payload["failed"] else 0


def _cmd_report(args: argparse.Namespace) -> int:
    path = args.receipt
    if path.is_dir():
        path = path / "receipt.json"
    receipt = json.loads(path.read_text())
    if args.json:
        print(json.dumps(receipt, indent=2))
        return 0
    md = render_markdown(receipt)
    if args.out:
        args.out.write_text(md + "\n")
        print(f"report: {args.out}", file=sys.stderr)
    else:
        print(md)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
