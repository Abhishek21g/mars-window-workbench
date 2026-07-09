function badgeClass(d) {
  if (d === "GO") return "GO";
  if (d === "NO-GO") return "NO-GO";
  return "HOLD";
}

function renderReceipt(r) {
  const d = r.decision || "—";
  document.getElementById("verdict").textContent = d;
  document.getElementById("verdict").className = `verdict ${d}`;
  const hb = document.getElementById("heroBadge");
  if (hb) { hb.textContent = d; hb.className = `badge ${badgeClass(d)}`; }
  document.getElementById("scenarioLabel").textContent =
    `${r.mission_id} · window ${r.window_id} · run ${r.run_id}`;
  const c = r.summary?.gate_counts || {};
  document.getElementById("counts").innerHTML = `
    <div><dt>Failed</dt><dd>${c.FAIL || 0}</dd></div>
    <div><dt>Warned</dt><dd>${c.WARN || 0}</dd></div>
    <div><dt>Passed</dt><dd>${c.PASS || 0}</dd></div>`;
  const sim = r.simulation || {};
  document.getElementById("simKv").innerHTML = Object.entries(sim)
    .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
  const tmi = document.getElementById("heroTmi");
  if (tmi && sim.tmi_margin_mps != null) tmi.textContent = `${sim.tmi_margin_mps} m/s`;
  document.getElementById("findings").innerHTML = (r.findings || [])
    .map((f) => `<div class="finding ${f.severity}"><strong>[${f.gate_id}]</strong> ${f.severity} → ${f.action}: ${f.message}</div>`)
    .join("") || "<p>No findings</p>";
}

async function loadSample() {
  const res = await fetch("./sample-receipt.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load sample (${res.status})`);
  return res.json();
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("loadSample")?.addEventListener("click", () =>
    loadSample().then(renderReceipt).catch((e) => alert(e.message)));
  document.getElementById("fileInput")?.addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try { renderReceipt(JSON.parse(await f.text())); } catch { alert("Invalid JSON"); }
  });
  loadSample().then(renderReceipt).catch(() => {});
});
