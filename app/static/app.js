"use strict";

// --- Oppsett -----------------------------------------------------------------

const MAX_EDGE = 2000;      // px, lengste side etter komprimering
const JPEG_QUALITY = 0.85;
const REQUEST_TIMEOUT = 90_000;

const MAX_PHOTOS = 8;

const PLACEHOLDER_SVG = `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
  <circle cx="32" cy="36" r="20"/><path d="M32 8v8M27 10h10M32 36V24M32 36l8 5"/></svg>`;

const state = {
  meta: null,
  photos: [],       // [{ blob, url, size, note? }] i den rekkefølgen de ble lagt inn
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

function addPhoto(photo) {
  state.photos.push(photo);
}

function removePhoto(index) {
  const [photo] = state.photos.splice(index, 1);
  if (photo?.url) URL.revokeObjectURL(photo.url);
  state.analysis = null; // bildene er endret; ny analyse trengs
}

// --- Bilder --------------------------------------------------------------------

/** Hva modellen mente hvert bilde viste ved forrige analyse. */
function photoLabel(i) {
  const shows = state.analysis?.facts.photos?.find((p) => p.index === i + 1)?.shows;
  return shows && shows !== "unknown" ? place(shows) : "";
}

function renderPhotos() {
  const grid = $("#photo-grid");
  grid.innerHTML = state.photos.map((p, i) => `
    <figure class="thumb">
      ${p.url ? `<img src="${p.url}" alt="Bilde ${i + 1}">` : `${PLACEHOLDER_SVG}<span class="thumb-note">${esc(p.note)}</span>`}
      <figcaption>${esc(capitalize(photoLabel(i) || `Bilde ${i + 1}`))}</figcaption>
      <button class="thumb-remove" data-remove="${i}" aria-label="Fjern bilde ${i + 1}">×</button>
    </figure>`).join("") +
    (state.photos.length ? "" : `<div class="photo-empty">${PLACEHOLDER_SVG}<p>Ingen bilder ennå</p></div>`);
  const n = state.photos.length;
  const btn = $("#analyze-btn");
  btn.disabled = n === 0;
  btn.textContent = n ? `Analyser ${n} ${n === 1 ? "bilde" : "bilder"}` : "Analyser";
  const box = $("#suggest-box");
  const suggestions = state.analysis?.suggestions ?? [];
  box.hidden = !suggestions.length;
  box.innerHTML = suggestions.length
    ? `<p><strong>Dette vil hjelpe mest:</strong></p>${suggestions.map((s) => `<p>${esc(capitalize(s.label))}: ${esc(s.reason)}</p>`).join("")}`
    : "";
}

async function onPhotoPicked(input) {
  const files = [...(input.files ?? [])];
  input.value = "";       // samme fil kan velges igjen
  if (!files.length) return;
  const box = $("#capture-error");
  box.hidden = true;
  const room = MAX_PHOTOS - state.photos.length;
  if (files.length > room) {
    box.textContent = `Appen tar høyst ${MAX_PHOTOS} bilder. ${room ? `Bare de ${room} første ble lagt til.` : "Fjern et bilde først."}`;
    box.hidden = false;
  }
  for (const file of files.slice(0, Math.max(0, room))) {
    try {
      addPhoto(await compress(file));
    } catch (err) {
      box.textContent = err.message;
      box.hidden = false;
    }
  }
  renderPhotos();
}

function openCapture() {
  renderPhotos();
  $("#capture-error").hidden = true;
  show("capture");
}

// --- Analyse og bekreftelse ------------------------------------------------------

async function analyze() {
  if (!state.photos.length) return openCapture();
  showLoading("Leser bildene …");
  const form = new FormData();
  state.photos.forEach((photo, i) => form.append("photos", photo.blob, `bilde-${i + 1}.jpg`));
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
  $("#back-btn").onclick = () => (state.analysis ? show("confirm") : openCapture());
}

function renderConfirm() {
  const { facts, normalized } = state.analysis;
  const form = $("#confirm-form");
  const options = (list) => list.map((e) => `<option value="${e.code}">${esc(e.label)}</option>`).join("");

  form.brand.value = normalized.brand_display ?? "";
  form.movement_serial.value = formatSerial(normalized.movement_serial);
  form.case_number.value = formatSerial(normalized.case_number);
  form.escapement.innerHTML = options(state.meta.escapements);
  form.escapement.value = normalized.escapement;
  form.winding.innerHTML = options(state.meta.windings);
  form.winding.value = normalized.winding;
  form.movement_layout.innerHTML = options(state.meta.layouts);
  form.movement_layout.value = normalized.movement_layout;
  form.material.innerHTML = `<option value="">Ukjent</option>` + options(state.meta.materials);
  form.material.value = normalized.material ?? "";

  $("#escapement-evidence").textContent = facts.escapement_evidence ?? "";
  $("#winding-evidence").textContent = facts.winding_evidence ?? "";
  const fineness = facts.marks.filter((m) => ["fineness", "hallmark_symbol", "maker_mark"].includes(m.type));
  $("#stamps").innerHTML = fineness.length
    ? fineness.map((m) => `<span class="stamp">${esc(m.text)} <small>${esc(place(m.location))}</small></span>`).join("")
    : `<small>Ingen stempler lest.</small>`;
  renderFound(normalized, facts);

  document.querySelectorAll("[data-conf]").forEach((chip) => {
    const c = facts.confidence[chip.dataset.conf];
    chip.className = "chip";
    if (c == null) chip.textContent = "";
    else if (c >= 0.85) { chip.textContent = "Sikker"; chip.classList.add("high"); }
    else if (c >= 0.6) { chip.textContent = "Sjekk"; chip.classList.add("mid"); }
    else { chip.textContent = "Usikker"; chip.classList.add("low"); }
  });

  const notices = [];
  if (normalized.warnings.length) {
    notices.push(`<div class="notice notice-warn">${normalized.warnings.map((w) => `<p>${esc(w)}</p>`).join("")}</div>`);
  }
  const suggestions = state.analysis.suggestions ?? [];
  if (suggestions.length) {
    notices.push(`<div class="notice notice-hint"><p><strong>Ett bilde til kan hjelpe</strong></p>
      ${suggestions.map((s) => `<p>${esc(capitalize(s.label))}: ${esc(s.reason)}</p>`).join("")}
      <button class="link" type="button" data-action="add-photo">Legg til bilde</button></div>`);
  } else if (facts.retake_hints.length) {
    notices.push(`<div class="notice notice-hint">${facts.retake_hints.map((h) => `<p>${esc(h)}</p>`).join("")}
      <button class="link" type="button" data-action="add-photo">Legg til eller bytt bilder</button></div>`);
  }
  $("#confirm-notices").innerHTML = notices.join("");
}

function place(location) {
  return state.meta.locations?.[location] ?? location;
}

/** Oversikt over nummer og merker appen fant, og hva den har sett bort fra. */
function renderFound(normalized, facts) {
  const rows = [];
  for (const g of normalized.number_groups) {
    const role = g.role === "movement" ? "verksnummer" : "kassenummer";
    const match = g.role === "case" && g.locations.length > 1 ? ` <span class="chip high">Samme nummer ${g.locations.length} steder</span>` : "";
    rows.push(`<li><strong class="num-value">${esc(formatSerial(g.value))}</strong> ${role}${match}
      <br><small>${g.locations.map((l) => esc(place(l))).join(" · ")}</small></li>`);
  }
  const inscriptions = facts.marks.filter((m) => m.type === "inscription");
  if (inscriptions.length) {
    rows.push(`<li>Tekst: ${inscriptions.map((m) => `«${esc(m.text)}»`).join(", ")}</li>`);
  }
  const ignored = [
    ...normalized.repair_marks.map((r) => `Reparasjonsmerke: ${r}`),
    ...normalized.owner_engravings.map((r) => `Eiergravering: ${r}`),
  ];
  $("#found").innerHTML = rows.length || ignored.length
    ? `<ul class="found-list">${rows.join("")}</ul>` +
      (ignored.length ? `<details class="found-ignored"><summary>Brukes ikke i vurderingen (${ignored.length})</summary>
        <ul>${ignored.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></details>` : "")
    : `<p class="meta">Fant ingen nummer eller tekst.</p>`;
}

async function lookup(event) {
  event.preventDefault();
  const form = $("#confirm-form");
  state.confirmed = {
    brand: form.brand.value.trim() || null,
    movement_serial: form.movement_serial.value.trim() || null,
    case_number: form.case_number.value.trim() || null,
    escapement: form.escapement.value,
    winding: form.winding.value,
    movement_layout: form.movement_layout.value,
    material: form.material.value || null,
    case_stamps: state.analysis.normalized.case_stamps,
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
  } else if (dating.period) {
    const p = dating.period;
    $("#dating-card").innerHTML = `
      <h2>Grov periode ${p.is_demo ? demo : ""}</h2>
      <p class="big">${esc(p.display)}</p>
      <p class="meta">Ut fra ${esc(p.basis.join(", "))}. Ikke en datering etter serienummer.</p>
      <p class="meta">${esc(dating.message)}</p>`;
  } else {
    $("#dating-card").innerHTML = `<h2>Produksjonsår</h2><p class="big">Ikke datert</p><p>${esc(dating.message)}</p>
      <p class="meta">Oppgi oppstrekk og gangtype for å få en grov periode.</p>`;
  }
  const n = state.analysis?.normalized;
  const match = n?.number_groups.find((g) => g.role === "case" && g.locations.length > 1);
  if (match) {
    $("#dating-card").insertAdjacentHTML("beforeend", `<p class="meta good">Nummeret ${esc(formatSerial(match.value))} står på
      ${match.locations.map((l) => esc(place(l))).join(", ")}. Lokkene hører trolig sammen.</p>`);
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
  while (state.photos.length) removePhoto(0);
  state.analysis = state.confirmed = null;
  show("intro");
}

// --- Veiledning ------------------------------------------------------------------

let guideReturn = "intro";

function openGuide(anchor) {
  const visible = document.querySelector(".screen:not([hidden])")?.id?.replace("screen-", "");
  if (visible && visible !== "guide") guideReturn = visible;
  show("guide");
  if (anchor) document.getElementById(anchor)?.scrollIntoView({ block: "start" });
}

// --- Hendelser -----------------------------------------------------------------

document.addEventListener("change", (e) => {
  if (e.target.matches("input[type=file][data-input]")) onPhotoPicked(e.target);
});

document.addEventListener("click", (e) => {
  const remove = e.target.closest("[data-remove]");
  if (remove) { removePhoto(Number(remove.dataset.remove)); return renderPhotos(); }
  const action = e.target.closest("[data-action]")?.dataset.action;
  if (!action) return;
  ({
    start: openCapture,
    analyze,
    "add-photo": openCapture,
    back: () => show("intro"),
    retake: openCapture,
    edit: () => show("confirm"),
    guide: () => openGuide(),
    "close-guide": () => show(guideReturn),
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
    const labels = { monard_key_wind: "Ekte ur: G. Monard, nøkkeloppstrekk", omega_silver: "Omega i sølv med ankergang", cylinder_metal: "Usignert sylinderur i metall", unreadable: "Uleselige bilder" };
    $("#mock-scenario").innerHTML = state.meta.mock_scenarios
      .map((s) => `<option value="${s}">${esc(labels[s] ?? s)}</option>`).join("");
  }
  show("intro");
}

init();
