const ALL_GATES = [
  "M01", "M02", "M03", "M04", "M05",
  "W01", "W02", "W03",
  "F01", "F02", "F03",
  "P01", "P02", "P03", "P04", "P05",
  "R01", "R02", "R03",
];

const TIMELINE_STEPS = [
  { id: "plan", label: "Plan" },
  { id: "depot", label: "LEO fill" },
  { id: "tmi", label: "TMI burn" },
  { id: "cruise", label: "Cruise" },
  { id: "surface", label: "Surface" },
  { id: "gates", label: "Gates" },
  { id: "verdict", label: "Verdict" },
];

const T0 = new Date("2028-11-15T12:00:00Z");
const PROP_MAX = 2100;
const TMI_TARGET = 123.67;
const TMI_MIN = 120;
const TRANSFER_DAYS = 210;
const ARC_LEN = 400;

let receipt = null;
let simRunning = false;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function badgeClass(d) {
  if (d === "GO") return "GO";
  if (d === "NO-GO") return "NO-GO";
  if (d === "HOLD") return "HOLD";
  return "STANDBY";
}

function initStarfield() {
  const canvas = document.getElementById("starfield");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const stars = Array.from({ length: 180 }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: Math.random() * 1.4 + 0.2,
    a: Math.random() * 0.5 + 0.2,
    tw: Math.random() * Math.PI * 2,
  }));

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener("resize", resize);

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const t = Date.now() / 1000;
    for (const s of stars) {
      const flicker = 0.5 + 0.5 * Math.sin(t * 2 + s.tw);
      ctx.fillStyle = `rgba(255, 240, 220, ${s.a * flicker})`;
      ctx.beginPath();
      ctx.arc(s.x * canvas.width, s.y * canvas.height, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    requestAnimationFrame(draw);
  }
  draw();
}

function updateCountdown() {
  const el = document.getElementById("countdownDays");
  if (!el) return;
  const now = new Date();
  const diff = Math.max(0, Math.ceil((T0 - now) / 86400000));
  el.textContent = diff > 900 ? "847" : String(diff);
}

function setGauge(id, pct) {
  const circle = document.getElementById(id);
  if (!circle) return;
  const offset = 327 - (327 * Math.min(100, Math.max(0, pct))) / 100;
  circle.style.strokeDashoffset = String(offset);
}

function setHud(phase, transfer, prop) {
  const p = document.getElementById("hudPhase");
  const t = document.getElementById("hudTransfer");
  const pr = document.getElementById("hudProp");
  if (p) p.textContent = phase;
  if (t) t.textContent = transfer;
  if (pr) pr.textContent = prop;
}

function moveShip(progress) {
  const ship = document.getElementById("starshipIcon");
  const arc = document.getElementById("transferArc");
  if (!ship || !arc) return;
  const p = Math.min(1, Math.max(0, progress));
  const x = 92 + (318 - 92) * p;
  const y = 140 - 100 * Math.sin(p * Math.PI);
  ship.setAttribute("transform", `translate(${x}, ${y}) rotate(${-30 + 60 * p})`);
  arc.style.strokeDashoffset = String(ARC_LEN * (1 - p));
}

function initGateGrid() {
  const grid = document.getElementById("gateGrid");
  if (!grid) return;
  grid.innerHTML = ALL_GATES.map(
    (g) => `<div class="gate-chip" data-gate="${g}">${g}</div>`
  ).join("");
}

function initTimeline() {
  const tl = document.getElementById("timeline");
  if (!tl) return;
  tl.innerHTML = TIMELINE_STEPS.map(
    (s) => `<div class="tl-step" data-step="${s.id}"><div class="tl-dot"></div><div class="tl-label">${s.label}</div></div>`
  ).join("");
}

function markTimeline(stepId, state = "done") {
  const el = document.querySelector(`.tl-step[data-step="${stepId}"]`);
  if (!el) return;
  el.classList.add(state);
  if (state === "fail") el.classList.add("fail");
}

function gateSeverityMap(r) {
  const map = {};
  for (const g of ALL_GATES) map[g] = "PASS";
  for (const f of r.findings || []) {
    if (f.gate_id && f.gate_id.startsWith("R")) continue;
    map[f.gate_id] = f.severity === "FAIL" ? "FAIL" : f.severity === "WARN" ? "WARN" : "PASS";
  }
  const rollup = (r.findings || []).find((f) => f.gate_id?.startsWith("R"));
  if (rollup) map[rollup.gate_id] = rollup.severity === "FAIL" ? "FAIL" : "WARN";
  return map;
}

function renderFinalState(r, animate = false) {
  const d = r.decision || "...";
  const verdict = document.getElementById("verdict");
  const ring = document.getElementById("verdictRing");
  verdict.textContent = d;
  verdict.className = `verdict ${d} ${animate ? "verdict-reveal" : ""}`;
  ring.className = `verdict-ring ${d}`;

  const hb = document.getElementById("heroBadge");
  if (hb) {
    hb.textContent = d;
    hb.className = `verdict-pill badge ${badgeClass(d)}`;
  }

  document.getElementById("scenarioLabel").textContent =
    `${r.mission_id} · ${r.window_id} · run ${r.run_id}`;

  const c = r.summary?.gate_counts || {};
  const passed = ALL_GATES.length - (c.FAIL || 0) - (c.WARN || 0);
  document.getElementById("counts").innerHTML = `
    <div><dt>Failed</dt><dd>${c.FAIL || 0}</dd></div>
    <div><dt>Warned</dt><dd>${c.WARN || 0}</dd></div>
    <div><dt>Passed</dt><dd>${passed}</dd></div>`;

  const sim = r.simulation || {};
  document.getElementById("propCaption").textContent =
    `${sim.leo_propellant_t || 0} t loaded · ${sim.depot_fill_days || 0} days`;
  document.getElementById("tmiCaption").textContent =
    sim.tmi_margin_mps >= TMI_MIN ? "Above 120 m/s threshold" : "Below threshold";
  document.getElementById("tmiVal").textContent = sim.tmi_margin_mps?.toFixed(1) || "0";
  setGauge("propGauge", ((sim.leo_propellant_t || 0) / PROP_MAX) * 100);
  document.getElementById("propPct").textContent =
    `${Math.round(((sim.leo_propellant_t || 0) / PROP_MAX) * 100)}%`;
  setGauge("tmiGauge", Math.min(100, ((sim.tmi_margin_mps || 0) / 200) * 100));
}

async function animateGateSweep(r) {
  const map = gateSeverityMap(r);
  const chips = document.querySelectorAll(".gate-chip");
  let i = 0;
  for (const chip of chips) {
    const id = chip.dataset.gate;
    const sev = map[id] || "PASS";
    chip.classList.add("active", sev);
    document.getElementById("gateProgress").textContent = `${i + 1} / ${ALL_GATES.length}`;
    if (sev === "FAIL") chip.style.animationDelay = "0s";
    i++;
    await sleep(120);
  }
}

async function runSimulation() {
  if (simRunning) return;
  simRunning = true;
  const btns = [document.getElementById("runSim"), document.getElementById("runSim2")];
  btns.forEach((b) => { if (b) b.disabled = true; });

  if (!receipt) {
    try {
      receipt = await loadSample();
    } catch (e) {
      alert(e.message);
      simRunning = false;
      btns.forEach((b) => { if (b) b.disabled = false; });
      return;
    }
  }

  document.querySelectorAll(".tl-step").forEach((el) => el.classList.remove("done", "fail"));
  document.querySelectorAll(".gate-chip").forEach((el) => {
    el.className = "gate-chip";
  });
  document.getElementById("gateProgress").textContent = `0 / ${ALL_GATES.length}`;
  document.getElementById("verdict").textContent = "...";
  document.getElementById("verdictRing").className = "verdict-ring";
  setGauge("propGauge", 0);
  setGauge("tmiGauge", 0);
  document.getElementById("propPct").textContent = "0%";
  document.getElementById("tmiVal").textContent = "0";
  moveShip(0);

  const sim = receipt.simulation;

  markTimeline("plan");
  setHud("PLANNING", "0 / 210 d", "0 / 2100 t");
  await sleep(600);

  markTimeline("depot");
  setHud("LEO DEPOT FILL", "0 / 210 d", "0 / 2100 t");
  const fillSteps = 40;
  for (let i = 1; i <= fillSteps; i++) {
    const t = (sim.leo_propellant_t * i) / fillSteps;
    const pct = (t / PROP_MAX) * 100;
    setGauge("propGauge", pct);
    document.getElementById("propPct").textContent = `${Math.round(pct)}%`;
    setHud("LEO DEPOT FILL", "0 / 210 d", `${Math.round(t)} / 2100 t`);
    document.getElementById("propCaption").textContent = `Tanker ${Math.ceil(i / 3)} of 14 launching...`;
    await sleep(40);
  }

  markTimeline("tmi");
  setHud("TMI BURN", "0 / 210 d", `${sim.leo_propellant_t} / 2100 t`);
  for (let v = 0; v <= TMI_TARGET; v += 4) {
    setGauge("tmiGauge", (v / 200) * 100);
    document.getElementById("tmiVal").textContent = v.toFixed(1);
    await sleep(25);
  }
  document.getElementById("tmiCaption").textContent = "Trans-Mars injection nominal";

  markTimeline("cruise");
  setHud("TRANSFER", "0 / 210 d", `${sim.leo_propellant_t} / 2100 t`);
  const cruiseSteps = 50;
  for (let i = 1; i <= cruiseSteps; i++) {
    const day = Math.round((TRANSFER_DAYS * i) / cruiseSteps);
    moveShip(i / cruiseSteps);
    setHud("TRANSFER", `${day} / ${TRANSFER_DAYS} d`, `${sim.leo_propellant_t} / 2100 t`);
    await sleep(35);
  }

  markTimeline("surface");
  setHud("SURFACE OPS", `${TRANSFER_DAYS} / ${TRANSFER_DAYS} d`, "LANDED");
  document.getElementById("propCaption").textContent =
    `Landed mass ${Math.round(sim.landed_mass_kg / 1000)}t · checking margins`;
  await sleep(800);

  markTimeline("gates");
  setHud("GATE SWEEP", "COMMIT CHECK", "...");
  await animateGateSweep(receipt);

  const hasFail = (receipt.findings || []).some((f) => f.severity === "FAIL");
  markTimeline("verdict", hasFail ? "fail" : "done");
  setHud(receipt.decision, "WINDOW COMMIT", receipt.decision);
  renderFinalState(receipt, true);

  simRunning = false;
  btns.forEach((b) => { if (b) b.disabled = false; });
}

async function loadSample() {
  const res = await fetch("./sample-receipt.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load sample (${res.status})`);
  return res.json();
}

document.addEventListener("DOMContentLoaded", () => {
  initStarfield();
  initGateGrid();
  initTimeline();
  updateCountdown();

  document.getElementById("runSim")?.addEventListener("click", runSimulation);
  document.getElementById("runSim2")?.addEventListener("click", runSimulation);

  document.getElementById("fileInput")?.addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      receipt = JSON.parse(await f.text());
      await runSimulation();
    } catch {
      alert("Invalid receipt JSON");
    }
  });

  loadSample().then((r) => {
    receipt = r;
    renderFinalState(r, false);
    const map = gateSeverityMap(r);
    document.querySelectorAll(".gate-chip").forEach((chip) => {
      const sev = map[chip.dataset.gate] || "PASS";
      chip.classList.add("active", sev);
    });
    document.getElementById("gateProgress").textContent = `${ALL_GATES.length} / ${ALL_GATES.length}`;
    moveShip(1);
    setGauge("propGauge", ((r.simulation?.leo_propellant_t || 0) / PROP_MAX) * 100);
    document.getElementById("propPct").textContent =
      `${Math.round(((r.simulation?.leo_propellant_t || 0) / PROP_MAX) * 100)}%`;
    setGauge("tmiGauge", ((r.simulation?.tmi_margin_mps || 0) / 200) * 100);
    document.getElementById("tmiVal").textContent = r.simulation?.tmi_margin_mps?.toFixed(1) || "0";
    setHud("STANDBY", `${TRANSFER_DAYS} / ${TRANSFER_DAYS} d`, `${r.simulation?.leo_propellant_t || 0} / 2100 t`);
    TIMELINE_STEPS.forEach((s) => markTimeline(s.id));
  }).catch(() => {});
});
