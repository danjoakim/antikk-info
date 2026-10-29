// Nettversjonen: alt kjører i nettleseren. Oppslag skjer mot JSON-filene i data/,
// bildeanalysen mot Gemini med brukerens egen nøkkel (eller demoeksempler).

import { dateItem } from "./dating.js";
import { ESCAPEMENT_LABELS, LAYOUT_LABELS, LOCATION_LABELS, MATERIAL_LABELS, normalize, WINDING_LABELS } from "./normalize.js";
import { clearSettings, isLive, loadSettings, saveSettings } from "./settings.js";
import { suggestPhotos } from "./suggest.js";
import { valueItem } from "./valuation.js";
import { analyzeWithGemini, mockFacts, testKey, VisionError } from "./vision.js";

// --- Oppsett -----------------------------------------------------------------

const MAX_EDGE = 2000;      // px, lengste side etter komprimering
const JPEG_QUALITY = 0.85;
const MAX_ORIGINAL_BYTES = 7 * 1024 * 1024; // Gemini tillater 20 MB per forespørsel totalt
const REQUEST_TIMEOUT = 90_000;
const MIN_SALES = 5;

const MAX_PHOTOS = 8;

const PLACEHOLDER_SVG = `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
  <circle cx="32" cy="36" r="20"/><path d="M32 8v8M27 10h10M32 36V24M32 36l8 5"/></svg>`;

const state = {
  meta: null,       // { materials, escapements, mock_scenarios }
  data: null,       // oppslagstabeller og vision-kontrakt
  settings: loadSettings(),
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

// --- Data ----------------------------------------------------------------------

async function loadJson(name) {
  const res = await fetch(`data/${name}.json`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Kunne ikke laste ${name} (${res.status}).`);
  return res.json();
}

async function loadData() {
  const [serial_ranges, hallmarks, auction_results, period_rules, contract] = await Promise.all(
    ["serial_ranges", "hallmarks", "auction_results", "period_rules", "vision_contract"].map(loadJson));
  return { serial_ranges, hallmarks, auction_results, period_rules, contract };
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
    // iPhone-bilder kan være HEIC. Gemini leser HEIC direkte, så originalen sendes når nettleseren ikke kan vise den.
    if (/heic|heif/i.test(file.type) || /\.hei[cf]$/i.test(file.name ?? "")) {
      const blob = file.type ? file : new Blob([file], { type: "image/heic" });
      if (blob.size > MAX_ORIGINAL_BYTES) throw new Error("Bildet er for stort. Velg «Mest kompatibel» under Kamera › Formater, eller ta et nytt bilde.");
      return { blob, url: null, size: blob.size, note: "HEIC – vises ikke her, men sendes til analysen" };
    }
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
  const live = isLive(state.settings);
  showLoading(live ? "Gemini leser bildene …" : "Leser bildene (demo) …");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const images = state.photos.map((p) => ({ role: "photo", blob: p.blob }));
    const facts = live
      ? await analyzeWithGemini(images, state.data.contract,
        { key: state.settings.key, model: state.settings.model, signal: controller.signal })
      : mockFacts(state.data.contract, $("#mock-scenario").value);
    const normalized = normalize(state.data.hallmarks, facts, "vision");
    const suggestions = suggestPhotos(state.data.serial_ranges, facts, normalized);
    state.analysis = { mode: live ? "live" : "mock", facts, normalized, suggestions };
    renderConfirm();
    show("confirm");
  } catch (err) {
    showLoadingError(err instanceof VisionError ? err.message : `Noe gikk galt: ${err.message}`, analyze);
  } finally {
    clearTimeout(timer);
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

function lookup(event) {
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
  const { serial_ranges, hallmarks, auction_results, period_rules } = state.data;
  const facts = normalize(hallmarks, state.confirmed, "confirmed");
  const valuation = valueItem(auction_results, facts, { minSales: MIN_SALES });
  const who = facts.brand ? `«${facts.brand}»` : "usignerte ur";
  renderResult({
    dating: dateItem(serial_ranges, facts, period_rules), valuation,
    valuation_message: valuation ? null : `Ingen sammenlignbare salg i databasen for ${who} ennå.`,
  });
  show("result");
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
    settings: openSettings,
    "close-settings": () => show(returnTo),
    "test-key": onTestKey,
    "clear-key": onClearKey,
    restart,
  })[action]?.();
});

$("#confirm-form").addEventListener("submit", lookup);

// --- Innstillinger --------------------------------------------------------------

let returnTo = "intro";

function openSettings() {
  const visible = document.querySelector(".screen:not([hidden])")?.id?.replace("screen-", "");
  if (visible && visible !== "settings") returnTo = visible;
  const form = $("#settings-form");
  form.key.value = state.settings.key;
  form.model.value = state.settings.model;
  form.demo.checked = state.settings.demo;
  setStatus(null);
  show("settings");
}

function setStatus(message, ok = true) {
  const box = $("#settings-status");
  box.hidden = !message;
  box.textContent = message ?? "";
  box.className = `status ${ok ? "ok" : "bad"}`;
}

function readSettingsForm() {
  const form = $("#settings-form");
  const key = form.key.value.trim();
  return { key, model: form.model.value.trim() || state.settings.model, demo: form.demo.checked };
}

function onSaveSettings(event) {
  event.preventDefault();
  state.settings = readSettingsForm();
  const stored = saveSettings(state.settings);
  applyMode();
  setStatus(stored ? (isLive(state.settings) ? "Lagret. Bildeanalysen bruker Gemini." : "Lagret. Demomodus er på.")
    : "Kunne ikke lagre i denne nettleseren (privat vindu?). Innstillingen gjelder til siden lukkes.", stored);
}

async function onTestKey() {
  const { key, model } = readSettingsForm();
  if (!key) return setStatus("Lim inn en nøkkel først.", false);
  setStatus("Tester …");
  const result = await testKey(key, model);
  setStatus(result.message, result.ok);
}

function onClearKey() {
  clearSettings();
  state.settings = loadSettings();
  openSettings();
  applyMode();
  setStatus("Nøkkelen er slettet fra denne nettleseren.");
}

function applyMode() {
  const live = isLive(state.settings);
  $("#mode-badge").hidden = live;
  $("#mock-panel").hidden = live;
  const info = $("#provider-info");
  info.hidden = !live;
  info.textContent = live ? `Bildeanalyse: Google Gemini (${state.settings.model})` : "";
}

const MOCK_LABELS = { monard_key_wind: "Ekte ur: G. Monard, nøkkeloppstrekk", omega_silver: "Omega i sølv med ankergang", cylinder_metal: "Usignert sylinderur i metall", unreadable: "Uleselige bilder" };

async function init() {
  try {
    state.data = await loadData();
  } catch (err) {
    showLoadingError(`Kunne ikke starte: ${err.message}`, () => location.reload());
    return;
  }
  state.meta = {
    materials: Object.entries(MATERIAL_LABELS).map(([code, label]) => ({ code, label })),
    escapements: Object.entries(ESCAPEMENT_LABELS).map(([code, label]) => ({ code, label })),
    windings: Object.entries(WINDING_LABELS).map(([code, label]) => ({ code, label })),
    layouts: Object.entries(LAYOUT_LABELS).map(([code, label]) => ({ code, label })),
    locations: LOCATION_LABELS,
  };
  $("#mock-scenario").innerHTML = Object.keys(state.data.contract.mock_scenarios)
    .map((s) => `<option value="${s}">${esc(MOCK_LABELS[s] ?? s)}</option>`).join("");
  applyMode();
  show("intro");
}

$("#settings-form").addEventListener("submit", onSaveSettings);

init();
