import { SCENARIOS, GATE_GROUPS, ALL_GATES, STATS } from "./data.js?v=4";
import { redrawAll } from "./charts.js?v=4";

const T0 = new Date("2028-11-15T12:00:00Z");
const PROP_MAX = 2100;
const TRANSFER_DAYS = 210;
const ARC_LEN = 400;

let activeScenario = SCENARIOS[0];
let receipt = null;
let simRunning = false;

const TIMELINE_STEPS = [
  { id: "plan", label: "Plan" },
  { id: "depot", label: "LEO fill" },
  { id: "tmi", label: "TMI burn" },
  { id: "cruise", label: "Cruise" },
  { id: "surface", label: "Surface" },
  { id: "gates", label: "Gates" },
  { id: "verdict", label: "Verdict" },
];

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
  const stars = Array.from({ length: 220 }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: Math.random() * 1.2 + 0.15,
    a: Math.random() * 0.45 + 0.1,
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
    const isLight = document.documentElement.dataset.theme === "light";
    for (const s of stars) {
      const flicker = 0.45 + 0.55 * Math.sin(t * 1.5 + s.tw);
      ctx.fillStyle = isLight
        ? `rgba(80, 60, 40, ${s.a * flicker * 0.4})`
        : `rgba(255, 240, 220, ${s.a * flicker})`;
      ctx.beginPath();
      ctx.arc(s.x * canvas.width, s.y * canvas.height, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    requestAnimationFrame(draw);
  }
  draw();
}

function initViews() {
  document.querySelectorAll(".pill[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = btn.dataset.view;
      document.querySelectorAll(".pill").forEach((p) => p.classList.toggle("active", p === btn));
      document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${view}`));
      if (view === "dashboard") redrawAll(SCENARIOS, activeScenario, GATE_GROUPS);
    });
  });
}

function initTheme() {
  const saved = localStorage.getItem("mw-theme") || "dark";
  document.documentElement.dataset.theme = saved;
  document.getElementById("themeToggle")?.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("mw-theme", next);
    redrawAll(SCENARIOS, activeScenario, GATE_GROUPS);
  });
}

function initStats() {
  document.getElementById("statWindows").textContent = STATS.windows;
  document.getElementById("statScenarios").textContent = STATS.scenarios;
  document.getElementById("statGates").textContent = STATS.gates;
  document.getElementById("statRuns").textContent = STATS.runs.toLocaleString();
}

function buildScenarioTabs() {
  const tabs = document.getElementById("scenarioTabs");
  tabs.innerHTML = SCENARIOS.map(
    (s, i) => `<button type="button" class="seg-btn${i === 0 ? " active" : ""}" data-id="${s.id}">${s.title.split(" ")[0]}</button>`
  ).join("");
  tabs.querySelectorAll(".seg-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      tabs.querySelectorAll(".seg-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      selectScenario(btn.dataset.id);
      btn.blur();
    });
  });
}

function buildLibrary() {
  const list = document.getElementById("libraryList");
  list.innerHTML = SCENARIOS.map(
    (s) => `
    <div class="lib-row" data-id="${s.id}">
      <div>
        <div class="lib-title">${s.title}</div>
        <div class="lib-meta">${s.files} · <span class="decision-${s.decision}">${s.decision}</span></div>
        <p class="lib-blurb">${s.blurb}</p>
      </div>
      <a href="#" class="lib-open" data-open="${s.id}">Open <span>↗</span></a>
    </div>`
  ).join("");

  list.querySelectorAll("[data-open]").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      selectScenario(a.dataset.open);
      document.querySelector('.pill[data-view="live"]').click();
      setTimeout(runSimulation, 400);
    });
  });
}

function selectScenario(id) {
  activeScenario = SCENARIOS.find((s) => s.id === id) || SCENARIOS[0];
  document.getElementById("filterHint").textContent =
    `${activeScenario.title} · 2028 short-class · six-ship tanker chain`;
  document.getElementById("lineFoot").textContent =
    `${activeScenario.tankers} tanker launches · ${activeScenario.leoPropellantT} t loaded`;
  document.getElementById("liveScenarioLabel").textContent =
    `${activeScenario.title} · 2028 short-class`;
  syncLiveFromScenario();
  redrawAll(SCENARIOS, activeScenario, GATE_GROUPS);
}

function syncLiveFromScenario() {
  const s = activeScenario;
  setGauge("propGauge", (s.leoPropellantT / PROP_MAX) * 100);
  document.getElementById("propPct").textContent =
    `${Math.round((s.leoPropellantT / PROP_MAX) * 100)}%`;
  setGauge("tmiGauge", (s.tmiMargin / 200) * 100);
  document.getElementById("tmiVal").textContent = s.tmiMargin.toFixed(1);
  document.getElementById("propCaption").textContent = `${s.tankers} tanker launches complete`;
  renderVerdict(s.decision, false);
  document.getElementById("scenarioLabel").textContent = `${s.title} · precomputed`;
  initGateGridFromMap(s.gateMap);
  moveShip(1);
}

function initGateGrid() {
  const grid = document.getElementById("gateGrid");
  grid.innerHTML = ALL_GATES.filter((g) => !g.startsWith("R")).map(
    (g) => `<div class="gate-chip" data-gate="${g}">${g}</div>`
  ).join("");
}

function initGateGridFromMap(map) {
  document.querySelectorAll(".gate-chip").forEach((chip) => {
    const sev = map[chip.dataset.gate] || "PASS";
    chip.className = `gate-chip active ${sev}`;
  });
  document.getElementById("gateProgress").textContent =
    `${ALL_GATES.filter((g) => !g.startsWith("R")).length} / 18`;
}

function initTimeline() {
  document.getElementById("timeline").innerHTML = TIMELINE_STEPS.map(
    (s) => `<div class="tl-step" data-step="${s.id}"><div class="tl-dot"></div><div class="tl-label">${s.label}</div></div>`
  ).join("");
}

function setGauge(id, pct) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.strokeDashoffset = String(327 - (327 * Math.min(100, pct)) / 100);
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

function markTimeline(stepId) {
  document.querySelector(`.tl-step[data-step="${stepId}"]`)?.classList.add("done");
}

function renderVerdict(d, animate) {
  const v = document.getElementById("verdict");
  const ring = document.getElementById("verdictRing");
  const hb = document.getElementById("heroBadge");
  v.textContent = d;
  v.className = `verdict ${d}${animate ? " verdict-reveal" : ""}`;
  ring.className = `verdict-ring ${d}`;
  if (hb) {
    hb.textContent = d;
    hb.className = `verdict-pill badge ${badgeClass(d)}`;
  }
}

function scenarioToReceipt(s) {
  const findings = Object.entries(s.gateMap)
    .filter(([, sev]) => sev !== "PASS")
    .map(([gate_id, sev]) => ({
      gate_id,
      severity: sev,
      action: sev === "FAIL" ? (s.decision === "NO-GO" ? "NO-GO" : "HOLD") : "HOLD",
      message: `${gate_id} ${sev}`,
    }));
  findings.push({
    gate_id: s.decision === "GO" ? "R03" : s.decision === "NO-GO" ? "R01" : "R02",
    severity: s.decision === "GO" ? "PASS" : "WARN",
    action: s.decision,
    message: `Window commit ${s.decision}`,
  });
  return {
    run_id: "demo",
    mission_id: s.id,
    window_id: "2028-short-class",
    decision: s.decision,
    findings,
    simulation: {
      leo_propellant_t: s.leoPropellantT,
      tmi_margin_mps: s.tmiMargin,
      landed_mass_kg: 127380,
      depot_fill_days: 49,
      surface_power_margin_days: 960,
      consumable_margin_days: s.decision === "GO" ? 500 : 62.5,
    },
    summary: {
      gate_counts: {
        FAIL: Object.values(s.gateMap).filter((x) => x === "FAIL").length,
        WARN: Object.values(s.gateMap).filter((x) => x === "WARN").length,
        PASS: Object.values(s.gateMap).filter((x) => x === "PASS").length,
      },
    },
  };
}

async function runSimulation() {
  if (simRunning) return;
  simRunning = true;
  const btn = document.getElementById("runSim");
  if (btn) btn.disabled = true;

  const s = activeScenario;
  receipt = scenarioToReceipt(s);

  document.querySelectorAll(".tl-step").forEach((el) => el.classList.remove("done"));
  document.querySelectorAll(".gate-chip").forEach((el) => {
    el.className = "gate-chip";
  });
  renderVerdict("...", false);
  setGauge("propGauge", 0);
  setGauge("tmiGauge", 0);
  document.getElementById("propPct").textContent = "0%";
  document.getElementById("tmiVal").textContent = "0";
  moveShip(0);

  markTimeline("plan");
  setHud("PLANNING", "0 / 210 d", "0 / 2100 t");
  await sleep(500);

  markTimeline("depot");
  setHud("LEO DEPOT FILL", "0 / 210 d", "0 / 2100 t");
  const curve = s.fillCurve;
  for (let i = 1; i < curve.length; i++) {
    const pct = (curve[i] / PROP_MAX) * 100;
    setGauge("propGauge", pct);
    document.getElementById("propPct").textContent = `${Math.round(pct)}%`;
    setHud("LEO DEPOT FILL", "0 / 210 d", `${Math.round(curve[i])} / 2100 t`);
    document.getElementById("propCaption").textContent =
      `Tanker ${i} of ${s.tankers} · ${Math.round(curve[i])} t`;
    await sleep(45);
  }

  markTimeline("tmi");
  setHud("TMI BURN", "0 / 210 d", `${s.leoPropellantT} / 2100 t`);
  for (let v = 0; v <= s.tmiMargin; v += 5) {
    setGauge("tmiGauge", (v / 200) * 100);
    document.getElementById("tmiVal").textContent = v.toFixed(1);
    await sleep(20);
  }

  markTimeline("cruise");
  for (let i = 1; i <= 40; i++) {
    const day = Math.round((TRANSFER_DAYS * i) / 40);
    moveShip(i / 40);
    setHud("TRANSFER", `${day} / ${TRANSFER_DAYS} d`, `${s.leoPropellantT} / 2100 t`);
    await sleep(30);
  }

  markTimeline("surface");
  setHud("SURFACE OPS", `${TRANSFER_DAYS} / ${TRANSFER_DAYS} d`, "LANDED");
  await sleep(600);

  markTimeline("gates");
  setHud("GATE SWEEP", "...", "...");
  const chips = document.querySelectorAll(".gate-chip");
  let i = 0;
  for (const chip of chips) {
    const id = chip.dataset.gate;
    const sev = s.gateMap[id] || "PASS";
    chip.classList.add("active", sev);
    document.getElementById("gateProgress").textContent = `${i + 1} / 18`;
    i++;
    await sleep(90);
  }

  markTimeline("verdict");
  setHud(s.decision, "WINDOW COMMIT", s.decision);
  renderVerdict(s.decision, true);

  const c = receipt.summary.gate_counts;
  const passed = 18 - c.FAIL - c.WARN;
  document.getElementById("counts").innerHTML = `
    <div><dt>Failed</dt><dd>${c.FAIL}</dd></div>
    <div><dt>Warned</dt><dd>${c.WARN}</dd></div>
    <div><dt>Passed</dt><dd>${passed}</dd></div>`;
  document.getElementById("scenarioLabel").textContent =
    `${s.title} · run complete`;

  simRunning = false;
  if (btn) btn.disabled = false;
}

function setHud(phase, transfer, prop) {
  const p = document.getElementById("hudPhase");
  const t = document.getElementById("hudTransfer");
  const pr = document.getElementById("hudProp");
  if (p) p.textContent = phase;
  if (t) t.textContent = transfer;
  if (pr) pr.textContent = prop;
}

function updateCountdown() {
  const el = document.getElementById("countdownDays");
  if (!el) return;
  const diff = Math.max(0, Math.ceil((T0 - new Date()) / 86400000));
  el.textContent = `${diff > 900 ? 847 : diff} d`;
}

document.addEventListener("DOMContentLoaded", () => {
  initStarfield();
  initViews();
  document.getElementById("brandHome")?.addEventListener("click", (e) => {
    e.preventDefault();
    document.querySelector('.pill[data-view="dashboard"]')?.click();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  initTheme();
  initStats();
  buildScenarioTabs();
  buildLibrary();
  initGateGrid();
  initTimeline();
  updateCountdown();
  selectScenario(SCENARIOS[0].id);

  document.getElementById("runSim")?.addEventListener("click", runSimulation);

  document.getElementById("fileInput")?.addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      receipt = JSON.parse(await f.text());
      const match = SCENARIOS.find((s) => s.id === receipt.mission_id);
      if (match) selectScenario(match.id);
      renderVerdict(receipt.decision, true);
    } catch {
      alert("Invalid receipt JSON");
    }
  });

  window.addEventListener("resize", () => {
    redrawAll(SCENARIOS, activeScenario, GATE_GROUPS);
  });
});
