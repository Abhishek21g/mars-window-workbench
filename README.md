# Mars Window Commit Workbench

Validate a **Starship fleet + Mars cargo manifest** against an **Earth–Mars transfer window** before committing — mass, propellant, life-support, and return margins as auditable **GO / HOLD / NO-GO** receipts.

**Not affiliated with SpaceX.** Synthetic physics envelopes only — inspired by public multiplanetary mission statements.

## Quick start

```bash
pip install -e '.[dev]'

mars-window plan \
  --manifest scenarios/artemis-pathfinder.yaml \
  --window windows/2028-short.yaml \
  --fleet fleets/six-tanker-chain.yaml

mars-window run \
  --manifest scenarios/cargo-only-demo.yaml \
  --window windows/2028-short.yaml \
  --fleet fleets/six-tanker-chain.yaml

mars-window doctor --receipt out/receipts/<run-id>/receipt.json --json
mars-window report --receipt out/receipts/<run-id>/receipt.json
```

## Gates

| Category | IDs | Examples |
|----------|-----|----------|
| Manifest | M01–M05 | Payload mass/volume, crew cap, return propellant |
| Window | W01–W03 | Departure in window, transfer envelope, synodic risk |
| Fleet | F01–F03 | Tanker chain closes LEO fill, depot timeline, starship count |
| Physics | P01–P05 | TMI margin, EDL mass, surface power, consumables |
| Rollup | R01–R03 | GO / HOLD / NO-GO |

## Site

https://enaguthi.com/mars-window/site/

## Tests

```bash
pytest -q
```

MIT License
