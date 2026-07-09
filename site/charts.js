const COLORS = {
  pass: { light: "#1f8a5c", dark: "#3ecf8e" },
  warn: { light: "#b8860b", dark: "#f5b942" },
  fail: { light: "#c0392b", dark: "#ff6b6b" },
  bar: { light: "#c1440e", dark: "#e85d3a" },
  line: { light: "#1a5fb4", dark: "#4d9fff" },
  muted: { light: "#6b7280", dark: "#8fa3bf" },
  grid: { light: "rgba(0,0,0,0.06)", dark: "rgba(255,255,255,0.06)" },
  text: { light: "#111", dark: "#e8edf5" },
};

function theme() {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function c(key) {
  return COLORS[key][theme()];
}

function setupCanvas(canvas, height = 280) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  const w = Math.max(Math.floor(rect.width), 1);
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = "100%";
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h: height };
}

export function drawClosureBars(canvas, scenarios) {
  const { ctx, w, h } = setupCanvas(canvas, 300);
  const pad = { l: 48, r: 16, t: 24, b: 72 };
  const sorted = [...scenarios].sort((a, b) => b.closureScore - a.closureScore);
  const n = sorted.length;
  const gap = 12;
  const barW = (w - pad.l - pad.r - gap * (n - 1)) / n;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = c("text");
  ctx.font = "600 13px Inter, sans-serif";
  ctx.fillText("Window closure score", pad.l, 18);

  for (let i = 0; i <= 4; i++) {
    const y = pad.t + ((h - pad.t - pad.b) * i) / 4;
    ctx.strokeStyle = c("grid");
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(w - pad.r, y);
    ctx.stroke();
    ctx.fillStyle = c("muted");
    ctx.font = "10px 'IBM Plex Mono', monospace";
    ctx.fillText(String(100 - i * 25), 8, y + 4);
  }

  sorted.forEach((s, i) => {
    const x = pad.l + i * (barW + gap);
    const bh = ((h - pad.t - pad.b) * s.closureScore) / 100;
    const y = h - pad.b - bh;
    const grad = ctx.createLinearGradient(x, y, x, h - pad.b);
    grad.addColorStop(0, c("bar"));
    grad.addColorStop(1, theme() === "dark" ? "#5a1808" : "#f4a582");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x, y, barW, bh, 6);
    ctx.fill();
    ctx.fillStyle = c("text");
    ctx.font = "bold 11px 'IBM Plex Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillText(`${s.closureScore}`, x + barW / 2, y - 6);
    ctx.fillStyle = c("muted");
    ctx.font = "9px Inter, sans-serif";
    const label = s.title.split(" ")[0];
    ctx.save();
    ctx.translate(x + barW / 2, h - pad.b + 14);
    ctx.rotate(-0.45);
    ctx.fillText(label, 0, 0);
    ctx.restore();
  });
  ctx.textAlign = "left";
}

export function drawFillLine(canvas, scenario) {
  const { ctx, w, h } = setupCanvas(canvas, 260);
  const pad = { l: 44, r: 16, t: 24, b: 40 };
  const data = scenario.fillCurve;
  const max = Math.max(...data, 2100);

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = c("text");
  ctx.font = "600 13px Inter, sans-serif";
  ctx.fillText(`LEO depot fill · ${scenario.title}`, pad.l, 18);

  for (let i = 0; i <= 4; i++) {
    const y = pad.t + ((h - pad.t - pad.b) * i) / 4;
    ctx.strokeStyle = c("grid");
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(w - pad.r, y);
    ctx.stroke();
  }

  ctx.beginPath();
  data.forEach((v, i) => {
    const x = pad.l + (i / (data.length - 1)) * (w - pad.l - pad.r);
    const y = h - pad.b - (v / max) * (h - pad.t - pad.b);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = c("line");
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.lineTo(w - pad.r, h - pad.b);
  ctx.lineTo(pad.l, h - pad.b);
  ctx.closePath();
  const fill = ctx.createLinearGradient(0, pad.t, 0, h - pad.b);
  fill.addColorStop(0, theme() === "dark" ? "rgba(77,159,255,0.25)" : "rgba(26,95,180,0.15)");
  fill.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = fill;
  ctx.fill();

  ctx.fillStyle = c("muted");
  ctx.font = "10px 'IBM Plex Mono', monospace";
  ctx.fillText("tanker launches →", pad.l, h - 12);
  ctx.textAlign = "right";
  ctx.fillText(`${scenario.leoPropellantT} t`, w - pad.r, h - 12);
  ctx.textAlign = "left";
}

function severityColor(sev) {
  if (sev === "FAIL") return c("fail");
  if (sev === "WARN") return c("warn");
  return c("pass");
}

function cellSeverity(scenario, group) {
  const levels = group.gates.map((g) => scenario.gateMap[g] || "PASS");
  if (levels.includes("FAIL")) return "FAIL";
  if (levels.includes("WARN")) return "WARN";
  return "PASS";
}

function cellPct(sev) {
  if (sev === "FAIL") return 85;
  if (sev === "WARN") return 45;
  return 8;
}

export function drawHeatmap(canvas, scenarios, groups) {
  const { ctx, w, h } = setupCanvas(canvas, 320);
  const pad = { l: 130, r: 16, t: 36, b: 56 };
  const cellH = (h - pad.t - pad.b) / scenarios.length;
  const cellW = (w - pad.l - pad.r) / groups.length;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = c("text");
  ctx.font = "600 13px Inter, sans-serif";
  ctx.fillText("Gate stress heatmap", pad.l, 18);
  ctx.fillStyle = c("muted");
  ctx.font="11px Inter,sans-serif";
  ctx.fillText("Greener = pass · Redder = fail", pad.l, 32);

  groups.forEach((g, ci) => {
    const x = pad.l + ci * cellW + cellW / 2;
    ctx.save();
    ctx.translate(x, pad.t - 8);
    ctx.fillStyle = c("muted");
    ctx.font = "10px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(g.label, 0, 0);
    ctx.restore();
  });

  scenarios.forEach((s, ri) => {
    const y = pad.t + ri * cellH;
    ctx.fillStyle = c("text");
    ctx.font = "11px Inter, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(s.title.slice(0, 18), pad.l - 10, y + cellH / 2 + 4);

    groups.forEach((g, ci) => {
      const sev = cellSeverity(s, g);
      const pct = cellPct(sev);
      const x = pad.l + ci * cellW + 4;
      const cw = cellW - 8;
      const ch = cellH - 6;
      const intensity = pct / 100;
      const base = severityColor(sev);
      ctx.fillStyle = base + (theme() === "dark" ? "55" : "33");
      ctx.beginPath();
      ctx.roundRect(x, y + 3, cw, ch, 6);
      ctx.fill();
      ctx.fillStyle = c("text");
      ctx.font = "bold 10px 'IBM Plex Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText(sev === "PASS" ? "OK" : sev.slice(0, 4), x + cw / 2, y + cellH / 2 + 4);
    });
  });
  ctx.textAlign = "left";
}

export function drawRankedList(container, scenarios) {
  const ranked = [...scenarios]
    .map((s) => ({
      ...s,
      risk: 100 - s.closureScore,
    }))
    .sort((a, b) => b.risk - a.risk);

  container.innerHTML = ranked
    .map(
      (s, i) => `
    <div class="rank-row">
      <span class="rank-num">${i + 1}</span>
      <div class="rank-body">
        <div class="rank-top">
          <span class="rank-title">${s.title}</span>
          <span class="rank-pct">${s.risk}%</span>
        </div>
        <div class="rank-bar"><span style="width:${s.risk}%"></span></div>
      </div>
    </div>`
    )
    .join("");
}

export function redrawAll(scenarios, activeScenario, groups) {
  const bar = document.getElementById("chartBars");
  const line = document.getElementById("chartLine");
  const heat = document.getElementById("chartHeat");
  const rank = document.getElementById("rankedList");
  if (bar) drawClosureBars(bar, scenarios);
  if (line) drawFillLine(line, activeScenario);
  if (heat) drawHeatmap(heat, scenarios, groups);
  if (rank) drawRankedList(rank, scenarios);
}
