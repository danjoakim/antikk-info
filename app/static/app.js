"use strict";

// --- Oppsett -----------------------------------------------------------------

const MAX_EDGE = 2000;      // px, lengste side etter komprimering
const JPEG_QUALITY = 0.85;
const REQUEST_TIMEOUT = 90_000;

const STEPS = [
  {
    key: "dial", title: "Urskiven",
    tips: ["Fotografer rett forfra.", "Få med hele skiven og eventuell tekst.", "Unngå blits; vipp litt bort fra lyset hvis glasset reflekterer."],
  },
  {
    key: "movement", title: "Urverket", closeup: "movement_closeup",
    tips: ["Åpne baklokket forsiktig.", "Gå nært: serienummeret er lite.", "Skrått lys får graveringene fram.", "Legg gjerne til et nærbilde av nummeret."],
  },
  {
    key: "caseback", title: "Innsiden av lokket", closeup: "caseback_closeup",
    tips: ["Se etter stempler som 0.800, Argentan eller Métal.", "Få med kassenummeret.", "Små symboler (f.eks. en bjørn eller en fugl) er sølvstempler."],
  },
];

const PLACEHOLDER_SVG = `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
  <circle cx="32" cy="36" r="20"/><path d="M32 8v8M27 10h10M32 36V24M32 36l8 5"/></svg>`;

const state = {
  meta: null,
  step: 0,
  photos: {},       // rolle → { blob, url, size }
  analysis: null,
  confirmed: null,
};

const $ = (sel, root = document) => root.querySelector(sel);
const nok = new Intl.NumberFormat("nb-NO");
const kr = (n) => `${nok.format(n)} kr`;

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function show(screen) {
  document.querySelectorAll(".screen").forEach((s) => { s.hidden = s.id !== `screen-${screen}`; });
  window.scrollTo({ top: 0 });
}

// --- API -----------------------------------------------------------------------

async function api(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const res = await fetch(path, { ...options, signal: controller.signal });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof body.detail === "string" ? body.detail : `Serverfeil (${res.status}).`);
    return body;
  } catch (err) {
    if (err.name === "AbortError") throw new Error("Det tok for lang tid. Sjekk nettet og prøv igjen.");
    if (err instanceof TypeError) throw new Error("Fikk ikke kontakt med serveren. Sjekk nettet og prøv igjen.");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// --- Bildebehandling i nettleseren -------------------------------------------------

async function decodeImage(file) {
  // createImageBitmap med imageOrientation retter opp EXIF-rotasjon.
  if ("createImageBitmap" in window) {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch { /* prøv neste */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();   // moderne nettlesere bruker EXIF-orientering på <img> som standard
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function compress(file) {
  let source;
  try {
    source = await decodeImage(file);
  } catch {
    throw new Error("Kunne ikke lese bildet. Ta bildet på nytt, eller velg et JPEG-bilde.");
  }
  const w = source.width, h = source.height;
  const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
  source.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  if (!blob) throw new Error("Kunne ikke komprimere bildet.");
  return { blob, url: URL.createObjectURL(blob), size: blob.size };
}

function setPhoto(role, photo) {
  if (state.photos[role]) URL.revokeObjectURL(state.photos[role].url);
  if (photo) state.photos[role] = photo; else delete state.photos[role];
}

// --- Bildesteg -----------------------------------------------------------------

function renderStep() {
  const step = STEPS[state.step];
  $("#step-count").textContent = `Steg ${state.step + 1} av ${STEPS.length}`;
  $("#step-title").textContent = step.title;
  $("#step-tips").innerHTML = step.tips.map((t) => `<li>${esc(t)}</li>`).join("");
  document.querySelectorAll(".progress span").forEach((el, i) => el.classList.toggle("done", i <= state.step));

  const main = state.photos[step.key];
  renderSlot($("#photo-main"), main, step.title);
  const closeup = step.closeup && state.photos[step.closeup];
  $("#photo-closeup").hidden = !closeup;
  if (closeup) renderSlot($("#photo-closeup"), closeup, "Nærbilde");

  $("#capture-buttons").hidden = !!main;
  $("#next-buttons").hidden = !main;
  $("#closeup-btn").hidden = !step.closeup;
  $("#closeup-btn span").textContent = closeup ? "Nytt nærbilde" : "+ Nærbilde";
  $("[data-action=next]").textContent = state.step === STEPS.length - 1 ? "Analyser" : "Neste";
  $("#skip-btn").textContent = main ? "Ta på nytt" : "Hopp over dette bildet";
  $("#skip-btn").dataset.action = main ? "retake-step" : "skip";
  $("#capture-error").hidden = true;
}

function renderSlot(el, photo, label) {
  el.innerHTML = photo
    ? `<img src="${photo.url}" alt="${esc(label)}"><span class="size">${Math.max(1, Math.round(photo.size / 1024))} kB</span>`
    : PLACEHOLDER_SVG;
}

async function onPhotoPicked(input) {
  const file = input.files?.[0];
  input.value = "";       // samme fil kan velges igjen
  if (!file) return;
  const step = STEPS[state.step];
  const role = input.dataset.input === "closeup" ? step.closeup : step.key;
  try {
    setPhoto(role, await compress(file));
    renderStep();
  } catch (err) {
    const box = $("#capture-error");
    box.textContent = err.message;
    box.hidden = false;
  }
}

function nextStep() {
  if (state.step < STEPS.length - 1) {
    state.step += 1;
    renderStep();
  } else {
    analyze();
  }
}

function goToStep(index) {
  state.step = index;
  renderStep();
  show("capture");
}

// --- Analyse og bekreftelse ------------------------------------------------------

async function analyze() {
  if (!Object.keys(state.photos).length) {
    goToStep(0);
    const box = $("#capture-error");
    box.textContent = "Ta minst ett bilde før analysen.";
    box.hidden = false;
    return;
  }
  showLoading("Leser bildene …");
  const form = new FormData();
  for (const [role, photo] of Object.entries(state.photos)) form.append(role, photo.blob, `${role}.jpg`);
  const scenario = $("#mock-scenario").value;
  if (state.meta?.mode === "mock" && scenario) form.append("mock_scenario", scenario);

  try {
    state.analysis = await api("/api/analyze", { method: "POST", body: form });
    renderConfirm();
    show("confirm");
  } catch (err) {
    showLoadingError(err.message, analyze);
  }
}

function showLoading(text) {
  const screen = $("#screen-loading");
  screen.innerHTML = `<div class="spinner" aria-hidden="true"></div><p>${esc(text)}</p>`;
  show("loading");
}

function showLoadingError(message, retry) {
  const screen = $("#screen-loading");
  screen.innerHTML = `<p class="error" role="alert">${esc(message)}</p>
    <div class="actions" style="width:100%"><button class="btn btn-primary" id="retry-btn">Prøv igjen</button>
    <button class="link" id="back-btn">Tilbake</button></div>`;
  $("#retry-btn").onclick = retry;
  $("#back-btn").onclick = () => (state.analysis ? show("confirm") : goToStep(STEPS.length - 1));
}

const FIELD_TO_STEP = { movement_serial: 1, escapement: 1, case_number: 2, case_stamps: 2, dial_text: 0, brand_signed: 0 };

function renderConfirm() {
  const { facts, normalized } = state.analysis;
  const form = $("#confirm-form");

  form.brand.value = normalized.brand ? capitalize(normalized.brand) : (facts.brand_signed ?? "");
  form.movement_serial.value = formatSerial(normalized.movement_serial ?? facts.movement_serial);
  form.case_number.value = formatSerial(normalized.case_number ?? facts.case_number);
  form.escapement.innerHTML = state.meta.escapements.map((e) => `<option value="${e.code}">${esc(e.label)}</option>`).join("");
  form.escapement.value = normalized.escapement;
  form.material.innerHTML = `<option value="">Ukjent</option>` +
    state.meta.materials.map((m) => `<option value="${m.code}">${esc(m.label)}</option>`).join("");
  form.material.value = normalized.material ?? "";

  $("#escapement-evidence").textContent = facts.escapement_evidence ?? "";
  $("#stamps").innerHTML = facts.case_stamps.length
    ? facts.case_stamps.map((s) => `<span class="stamp">${esc(s)}</span>`).join("")
    : `<small>Ingen stempler lest.</small>`;

  document.querySelectorAll("[data-conf]").forEach((chip) => {
    const field = chip.dataset.conf;
    const c = facts.confidence[field];
    chip.className = "chip";
    if (facts.unreadable.includes(field)) { chip.textContent = "Ikke lesbart"; chip.classList.add("low"); }
    else if (c == null) chip.textContent = "";
    else if (c >= 0.85) { chip.textContent = "Sikker"; chip.classList.add("high"); }
    else if (c >= 0.6) { chip.textContent = "Sjekk"; chip.classList.add("mid"); }
    else { chip.textContent = "Usikker"; chip.classList.add("low"); }
  });

  const notices = [];
  if (normalized.warnings.length) {
    notices.push(`<div class="notice notice-warn">${normalized.warnings.map((w) => `<p>${esc(w)}</p>`).join("")}</div>`);
  }
  if (facts.retake_hints.length) {
    const step = facts.unreadable.map((f) => FIELD_TO_STEP[f]).find((s) => s != null) ?? 1;
    notices.push(`<div class="notice notice-hint">${facts.retake_hints.map((h) => `<p>${esc(h)}</p>`).join("")}
      <button class="link" type="button" data-goto-step="${step}">Ta «${esc(STEPS[step].title.toLowerCase())}» på nytt</button></div>`);
  }
  $("#confirm-notices").innerHTML = notices.join("");
}

async function lookup(event) {
  event.preventDefault();
  const form = $("#confirm-form");
  state.confirmed = {
    brand: form.brand.value.trim() || null,
    movement_serial: form.movement_serial.value.trim() || null,
    case_number: form.case_number.value.trim() || null,
    escapement: form.escapement.value,
    material: form.material.value || null,
    case_stamps: state.analysis.facts.case_stamps,
  };
  showLoading("Slår opp i tabellene …");
  try {
    const result = await api("/api/lookup", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(state.confirmed),
    });
    renderResult(result);
    show("result");
  } catch (err) {
    showLoadingError(err.message, () => lookup(event));
  }
}

// --- Resultat ------------------------------------------------------------------

function renderResult({ dating, valuation, valuation_message }) {
  const demo = `<span class="badge badge-demo">Demodata</span>`;

  if (dating.status === "dated") {
    const numberLabel = dating.number_used === "movement" ? "verksnummer" : "kassenummer";
    $("#dating-card").innerHTML = `
      <h2>Produksjonsår ${dating.is_demo ? demo : ""}</h2>
      <p class="big">ca. ${esc(dating.estimate)}</p>
      <p class="meta">${dating.year_from === dating.year_to ? "±1 år" : `Tabellintervall ${dating.year_from}–${dating.year_to}`}
        · etter ${numberLabel} <span class="nowrap">${esc(formatSerial(dating.serial))}</span></p>
      <p>${esc(dating.method)}</p>
      <p class="meta">${esc(dating.message)}</p>
      <p class="meta">Kilde: ${esc(dating.source)}</p>`;
  } else {
    $("#dating-card").innerHTML = `<h2>Produksjonsår</h2><p class="big">Ikke datert</p><p>${esc(dating.message)}</p>`;
  }

  if (!valuation) {
    $("#value-card").innerHTML = `<h2>Markedsverdi</h2><p>${esc(valuation_message)}</p>`;
    return;
  }
  const span = valuation.max - valuation.min;
  const pos = span > 0 ? ((valuation.median - valuation.min) / span) * 100 : 50;
  const sales = valuation.comparables.map((s) => `
    <li><span>${esc(s.sale_date)} · ${esc(s.condition ?? "ukjent tilstand")}<br>
      <span class="meta">${s.source_url ? `<a href="${esc(s.source_url)}" target="_blank" rel="noopener">${esc(s.auction_house)}</a>` : esc(s.auction_house)}</span></span>
      <span class="price">${kr(s.price_nok)}</span></li>`).join("");

  $("#value-card").innerHTML = `
    <h2>Markedsverdi, realiserte salg ${valuation.is_demo ? demo : ""}</h2>
    <div class="range" role="img" aria-label="Fra ${kr(valuation.min)} til ${kr(valuation.max)}, median ${kr(valuation.median)}">
      <div class="range-track"><span class="range-marker" style="left:${pos}%"></span></div>
      <div class="range-labels">
        <div><strong>${kr(valuation.min)}</strong>min</div>
        <div class="mid"><strong>${kr(valuation.median)}</strong>median</div>
        <div class="end"><strong>${kr(valuation.max)}</strong>maks</div>
      </div>
    </div>
    <p class="meta">${valuation.n_sales} salg, ${esc(valuation.period)} · ${esc(valuation.match_label)}</p>
    <ul class="caveats">${valuation.caveats.map((c) => `<li class="${c.startsWith("DEMODATA") ? "demo" : ""}">${esc(c)}</li>`).join("")}</ul>
    <details><summary>Se salgene (${valuation.comparables.length})</summary><ul class="sales">${sales}</ul></details>`;
}

// --- Hjelpere ------------------------------------------------------------------

function formatSerial(value) {
  if (value == null || value === "") return "";
  const digits = String(value).replace(/\D/g, "");
  if (!digits) return String(value);
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function restart() {
  Object.keys(state.photos).forEach((role) => setPhoto(role, null));
  state.analysis = state.confirmed = null;
  state.step = 0;
  show("intro");
}

// --- Hendelser -----------------------------------------------------------------

document.addEventListener("change", (e) => {
  if (e.target.matches("input[type=file][data-input]")) onPhotoPicked(e.target);
});

document.addEventListener("click", (e) => {
  const goto = e.target.closest("[data-goto-step]");
  if (goto) return goToStep(Number(goto.dataset.gotoStep));
  const action = e.target.closest("[data-action]")?.dataset.action;
  if (!action) return;
  const step = STEPS[state.step];
  ({
    start: () => goToStep(0),
    next: nextStep,
    skip: nextStep,
    back: () => (state.step === 0 ? show("intro") : goToStep(state.step - 1)),
    "retake-step": () => { setPhoto(step.key, null); if (step.closeup) setPhoto(step.closeup, null); renderStep(); },
    retake: () => goToStep(0),
    edit: () => show("confirm"),
    restart,
  })[action]?.();
});

$("#confirm-form").addEventListener("submit", lookup);

async function init() {
  try {
    state.meta = await api("/api/meta");
  } catch (err) {
    showLoadingError(`Kunne ikke starte: ${err.message}`, () => location.reload());
    return;
  }
  if (state.meta.mode === "live") {
    const info = $("#provider-info");
    info.textContent = `Bildeanalyse: ${state.meta.provider}${state.meta.model ? ` (${state.meta.model})` : ""}`;
    info.hidden = false;
  }
  if (state.meta.mode === "mock") {
    $("#mode-badge").hidden = false;
    $("#mock-panel").hidden = false;
    const labels = { omega_silver: "Omega i sølv med ankergang", cylinder_metal: "Usignert sylinderur i metall", unreadable: "Uleselige bilder" };
    $("#mock-scenario").innerHTML = state.meta.mock_scenarios
      .map((s) => `<option value="${s}">${esc(labels[s] ?? s)}</option>`).join("");
  }
  show("intro");
}

init();
