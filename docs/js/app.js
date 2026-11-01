// Nettversjonen: alt kjører i nettleseren. Oppslag skjer mot JSON-filene i data/,
// bildeanalysen mot Gemini med brukerens egen nøkkel (eller demoeksempler).

import { dateItem } from "./dating.js";
import { CATEGORY_LABELS, ESCAPEMENT_LABELS, isWatch, LAYOUT_LABELS, LOCATION_LABELS, makerInfo, MATERIAL_LABELS, noSalesMessage, normalize, setMakers, WINDING_LABELS } from "./normalize.js";
import { clearSettings, isLive, loadSettings, saveSettings } from "./settings.js";
import { suggestPhotos } from "./suggest.js";
import { describeItem, searchWebSales } from "./websales.js";
import { describeObserved, identifyItem, mockIdentity } from "./identify.js";
import { valueItem } from "./valuation.js";
import { analyzeWithGemini, mockFacts, testKey, VisionError } from "./vision.js";

// --- Oppsett -----------------------------------------------------------------

const MAX_EDGE = 2000;      // px, lengste side etter komprimering
const JPEG_QUALITY = 0.85;
const MAX_ORIGINAL_BYTES = 7 * 1024 * 1024; // Gemini tillater 20 MB per forespørsel totalt
const REQUEST_TIMEOUT = 90_000;
const MIN_SALES = 5;

const MAX_PHOTOS = 8;
// Kategorier der tittel og forfatter/kunstner betyr mest.
const WORK_CATEGORIES = new Set(["book_paper", "art", "electronics"]);

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
  if (screen !== "loading") stopLoading();
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
  const [serial_ranges, hallmarks, auction_results, period_rules, makers, contract, sale_search, fx] = await Promise.all(
    ["serial_ranges", "hallmarks", "auction_results", "period_rules", "makers", "vision_contract", "sale_search", "fx_nok"].map(loadJson));
  return { serial_ranges, hallmarks, auction_results, period_rules, makers, contract, sale_search, fx };
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
  const n = state.photos.length;
  grid.innerHTML = state.photos.map((p, i) => `
    <figure class="thumb">
      ${p.url ? `<img src="${p.url}" alt="Bilde ${i + 1}">` : `${PLACEHOLDER_SVG}<span class="thumb-note">${esc(p.note)}</span>`}
      ${photoLabel(i) ? `<figcaption>${esc(capitalize(photoLabel(i)))}</figcaption>` : ""}
      <button class="thumb-remove" data-remove="${i}" aria-label="Fjern bilde ${i + 1}">×</button>
    </figure>`).join("") +
    (n < MAX_PHOTOS ? `<label class="add-tile">
      <input type="file" accept="image/*" capture="environment" data-input="camera" hidden>
      <span class="plus" aria-hidden="true">+</span><span class="add-label">${n ? "ett til" : "ta bilde"}</span></label>` : "");
  $("#photo-count").textContent = `${n} av ${MAX_PHOTOS} bilder`;
  $("#analyze-btn").disabled = n === 0;
  $("#save-photos-btn").hidden = n === 0;
  const suggestions = state.analysis?.suggestions ?? [];
  $("#suggest-box").innerHTML = suggestions.length
    ? `<p><b>Dette vil hjelpe mest:</b></p>${suggestions.map((s) => `<p>${esc(capitalize(s.label))}: ${esc(s.reason)}</p>`).join("")}`
    : n === 0
      ? `<p>Ta et bilde av <b>hele funnet</b> først.</p>`
      : `<p>Fint! Har du et bilde av <b>undersiden</b> også? Der sitter stempelet ofte.</p>`;
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
      addPhoto({ ...(await compress(file)), original: file });
    } catch (err) {
      box.textContent = err.message;
      box.hidden = false;
    }
  }
  if ($("#screen-capture").hidden) openCapture();
  else renderPhotos();
}

function openCapture() {
  renderPhotos();
  show("capture");
}

// --- Venteskjerm ---------------------------------------------------------------

// Skjæra vipper i kassa mens en liten sjekkliste krysses av.
const LOADING_STEPS = ["Ser hva det er", "Leser merker og tall", "Sjekker stempler og etiketter", "Finner ut nøyaktig hva det er"];
let loadingTimer = null;
let loadingAbort = null;

function stopLoading() {
  clearInterval(loadingTimer);
  loadingTimer = null;
}

function showLoading() {
  stopLoading();
  const screen = $("#screen-loading");
  const thumbs = state.photos.slice(0, 4).map((p) =>
    `<span${p.url ? ` style="background-image:url('${p.url}')"` : ""}></span>`).join("");
  screen.innerHTML = `
    <div class="wait-photos" aria-hidden="true">${thumbs}</div>
    <div class="bubble bubble-think" aria-live="polite">Hmm, la meg se<span class="dot">.</span><span class="dot">.</span><span class="dot">.</span></div>
    <div class="mascot mascot-wait" data-skjaere="Skjæra med monokkel studerer bildene"></div>
    <ul class="checklist">${LOADING_STEPS.map((t, i) => `<li class="${i === 0 ? "now" : ""}">${esc(t)}</li>`).join("")}</ul>
    <div class="actions"><button class="link link-center" id="cancel-btn">avbryt</button></div>`;
  fillMascots(screen);
  $("#cancel-btn").onclick = () => { loadingAbort?.abort(); stopLoading(); openCapture(); };
  show("loading");
  const items = [...screen.querySelectorAll(".checklist li")];
  let i = 0;
  loadingTimer = setInterval(() => {
    if (i >= items.length - 2) return stopLoading();   // nest siste punkt står til bildeanalysen er ferdig
    items[i].className = "done";
    i += 1;
    items[i].className = "now";
  }, 2600);
}

/** Bildeanalysen er ferdig: kryss av alt unntatt siste punkt (identifiseringen). */
function loadingIdentify() {
  stopLoading();
  const items = [...document.querySelectorAll("#screen-loading .checklist li")];
  items.forEach((li, n) => { li.className = n < items.length - 1 ? "done" : "now"; });
}

/** Setter inn skjæra i kassa der det står data-skjaere="alt-tekst". */
function fillMascots(root = document) {
  root.querySelectorAll("[data-skjaere]").forEach((slot) => {
    if (slot.firstChild) return;
    const node = $("#skjaere-tpl").content.firstElementChild.cloneNode(true);
    $("img", node).alt = slot.dataset.skjaere;
    slot.append(node);
  });
}

// --- Lagre bildene på telefonen --------------------------------------------------------
// Bilder tatt med kameraknappen havner ikke i Bilder-appen. Her kan de deles eller lagres.

function photoFiles() {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  return state.photos.map((p, i) => {
    const src = p.original ?? p.blob;
    const ext = /heic|heif/i.test(src.type) ? "heic" : /png/i.test(src.type) ? "png" : "jpg";
    return new File([src], `funn-${stamp}-${i + 1}.${ext}`, { type: src.type || "image/jpeg" });
  });
}

async function savePhotos() {
  const box = $("#capture-error");
  const files = photoFiles();
  if (!files.length) return;
  try {
    if (navigator.canShare?.({ files })) {
      await navigator.share({ files, title: "Bilder fra Funn" });  // iPhone: velg «Arkiver bilder»
      return;
    }
  } catch (err) {
    if (err.name === "AbortError") return;  // brukeren lukket delingsarket
  }
  for (const f of files) {   // reserve: last ned filene
    const a = document.createElement("a");
    a.href = URL.createObjectURL(f);
    a.download = f.name;
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  box.hidden = true;
}

// --- Analyse og bekreftelse ------------------------------------------------------

async function analyze() {
  if (!state.photos.length) return openCapture();
  const live = isLive(state.settings);
  showLoading();
  const controller = loadingAbort = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  const started = performance.now();
  try {
    const images = state.photos.map((p) => ({ role: "photo", blob: p.blob }));
    const facts = live
      ? await analyzeWithGemini(images, state.data.contract,
        { key: state.settings.key, model: state.settings.model, signal: controller.signal })
      : mockFacts(state.data.contract, $("#mock-scenario").value);
    const normalized = normalize(state.data.hallmarks, facts, "vision");
    const suggestions = suggestPhotos(state.data.serial_ranges, facts, normalized);
    if (controller.signal.aborted) return;
    // Steg 2: finn ut nøyaktig hva det er, med kilder. Feiler det, går appen videre uten forslag.
    loadingIdentify();
    const identity = live
      ? await identifyItem(describeObserved(facts, normalized),
          { key: state.settings.key, model: state.settings.model, signal: controller.signal })
          .catch((err) => ({ candidates: [], decided: false, error: err.message }))
      : mockIdentity($("#mock-scenario").value);
    state.analysis = { mode: live ? "live" : "mock", facts, normalized, suggestions, identity,
      chosen: identity.decided ? identity.candidates[0] : null,
      seconds: live ? (performance.now() - started) / 1000 : null, photos: images.length,
      bytes: images.reduce((sum, i) => sum + i.blob.size, 0) };
    if (controller.signal.aborted) return;
    renderConfirm();
    show("confirm");
  } catch (err) {
    if (controller.signal.aborted && $("#screen-loading").hidden) return;   // brukeren avbrøt
    showLoadingError(err instanceof VisionError ? err.message : `Noe gikk galt: ${err.message}`, analyze);
  } finally {
    clearTimeout(timer);
  }
}

function showLoadingError(message, retry) {
  stopLoading();
  const screen = $("#screen-loading");
  screen.innerHTML = `
    <div class="bubble bubble-think" role="alert">${esc(message)}</div>
    <div class="mascot mascot-wait" style="animation:none" data-skjaere="Skjæra"></div>
    <div class="actions"><button class="btn btn-primary" id="retry-btn">PRØV IGJEN</button>
    <button class="link link-center" id="back-btn">tilbake</button></div>`;
  fillMascots(screen);
  show("loading");
  $("#retry-btn").onclick = retry;
  $("#back-btn").onclick = () => (state.analysis ? show("confirm") : state.photos.length ? openCapture() : show("intro"));
}

function formatAnalysisTime(a) {
  if (!a?.seconds) return "";
  const mb = (a.bytes / 1e6).toLocaleString("nb-NO", { maximumFractionDigits: 1 });
  return `Analysen tok ${Math.round(a.seconds)} s · ${a.photos} ${a.photos === 1 ? "bilde" : "bilder"} · ${mb} MB sendt`;
}

function renderConfirm() {
  const { facts, normalized } = state.analysis;
  $("#analysis-time").textContent = formatAnalysisTime(state.analysis);
  const form = $("#confirm-form");
  const options = (list) => list.map((e) => `<option value="${e.code}">${esc(e.label)}</option>`).join("");

  form.category.innerHTML = options(state.meta.categories);
  form.category.value = normalized.category ?? "other";
  form.object_type.value = normalized.object_type ?? "";
  form.elements.work_title.value = normalized.title ?? "";
  form.elements.creator.value = normalized.creator ?? "";
  $("#object-description").textContent = normalized.description ?? "";
  form.materials.value = (normalized.materials ?? []).join(", ");
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
  renderIdentity();
  if (state.analysis.chosen) applyCandidate(state.analysis.chosen);
  toggleWatchFields();

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

// --- Identifisering: «Dette ser ut til å være» / «Er det en av disse?» -----------------

function renderIdentity() {
  const box = $("#identity-box");
  const { identity, chosen } = state.analysis;
  const list = identity?.candidates ?? [];
  box.hidden = !list.length;
  if (!list.length) { box.innerHTML = ""; return; }
  const card = (c, i) => `
    <li><button type="button" class="id-card${chosen === c ? " picked" : ""}" data-pick="${i}" aria-pressed="${chosen === c}">
      <span class="id-name">${esc(c.name)}${c.demo ? ` <span class="badge badge-demo">eksempel</span>` : ""}</span>
      ${c.why ? `<span class="id-why">${esc(c.why)}</span>` : ""}
      ${!identity.decided && c.check ? `<span class="id-check">Sjekk: ${esc(c.check)}</span>` : ""}
    </button>
    <a class="id-source" href="${esc(c.url)}" target="_blank" rel="noopener">kilde: ${esc(c.site)}</a></li>`;
  box.innerHTML = identity.decided
    ? `<h2 class="box-label">Dette ser ut til å være</h2><ul class="id-cards">${card(list[0], 0)}</ul>`
    : `<h2 class="box-label">Er det en av disse?</h2><ul class="id-cards">${list.map(card).join("")}</ul>
       <button type="button" class="link" data-pick="none">${chosen ? "Ingen av disse" : "Ingen av disse – bruk det som ble lest"}</button>`;
}

/** Fyller ut feltene med det valgte forslaget. Brukeren kan fortsatt rette. */
function applyCandidate(c) {
  const form = $("#confirm-form");
  if (c.what) form.object_type.value = c.what;
  if (c.maker) form.brand.value = c.maker;
  if (c.title) form.elements.work_title.value = c.title;
  if (c.creator) form.elements.creator.value = c.creator;
  toggleWatchFields();
}

function pickCandidate(which) {
  const a = state.analysis;
  if (which === "none") {
    a.chosen = null;
    const n = a.normalized;   // tilbake til det som ble lest
    const form = $("#confirm-form");
    form.object_type.value = n.object_type ?? "";
    form.brand.value = n.brand_display ?? "";
    form.elements.work_title.value = n.title ?? "";
    form.elements.creator.value = n.creator ?? "";
  } else {
    a.chosen = a.identity.candidates[Number(which)];
    applyCandidate(a.chosen);
  }
  renderIdentity();
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
  for (const num of normalized.other_numbers ?? []) rows.push(`<li><strong class="num-value">${esc(num)}</strong></li>`);
  const MARK_NAMES = { factory_mark: "Fabrikkmerke", signature: "Signatur", label: "Etikett", maker_mark: "Makermerke",
                       fineness: "Stempel", hallmark_symbol: "Kontrollmerke" };
  if (!isWatch(normalized.category)) {
    for (const m of facts.marks.filter((x) => MARK_NAMES[x.type])) {
      rows.push(`<li>${MARK_NAMES[m.type]}: «${esc(m.text)}» <small>${esc(place(m.location))}</small></li>`);
    }
  } else {
    for (const m of facts.marks.filter((x) => ["factory_mark", "signature", "label"].includes(x.type))) {
      rows.push(`<li>${MARK_NAMES[m.type]}: «${esc(m.text)}»</li>`);
    }
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
  const category = form.category.value || "other";
  const watch = isWatch(category);
  state.confirmed = {
    item_type: category,
    object_type: form.object_type.value.trim() || null,
    identified: state.analysis.chosen?.name ?? null,
    identified_url: state.analysis.chosen?.demo ? null : state.analysis.chosen?.url ?? null,
    identified_site: state.analysis.chosen?.site ?? null,
    title: form.elements.work_title.value.trim() || null,
    creator: form.elements.creator.value.trim() || null,
    materials: form.materials.value.split(",").map((m) => m.trim()).filter(Boolean),
    brand: form.brand.value.trim() || null,
    movement_serial: watch ? form.movement_serial.value.trim() || null : null,
    case_number: watch ? form.case_number.value.trim() || null : null,
    escapement: watch ? form.escapement.value : "unknown",
    winding: watch ? form.winding.value : "unknown",
    movement_layout: watch ? form.movement_layout.value : "unknown",
    material: form.material.value || null,
    case_stamps: state.analysis.normalized.case_stamps,
  };
  const { serial_ranges, hallmarks, auction_results, period_rules } = state.data;
  const facts = normalize(hallmarks, state.confirmed, "confirmed");
  // Egne salg bare for riktig kategori, og aldri de oppdiktede demosalgene ved ekte bruk.
  const ownSales = isLive(state.settings) ? auction_results.filter((r) => !r.is_demo) : auction_results;
  const valuation = valueItem(ownSales, facts, { itemType: facts.category, minSales: MIN_SALES });
  const maker = makerInfo(facts.brand);
  const dating = dateItem(serial_ranges, facts, period_rules);
  renderResult({
    dating, valuation, maker,
    valuation_message: valuation ? null : noSalesMessage(facts),
  });
  // Uten egne salg er nettsøket priskortet; et tomt «Markedsverdi»-kort skjules ved ekte bruk.
  $("#value-card").hidden = !valuation && isLive(state.settings);
  startWebSales(facts, maker, dating);
  show("result");
}


// --- Nettsøk etter solgte eksemplarer (Gemini + Google-søk) -----------------------

let webSearchController = null;

const SIMILARITY_LABELS = { same_model: "Samme modell", same_maker: "Samme merke", similar: "Lignende" };
const BASIS_LABELS = { hammer: "tilslag", incl_premium: "inkl. salær", unknown: "" };

async function startWebSales(facts, maker, dating) {
  const card = $("#web-card");
  webSearchController?.abort();
  if (!isLive(state.settings)) { card.hidden = true; return; }
  card.hidden = false;
  card.innerHTML = `<h2>Priser funnet på nettet</h2><p class="meta web-wait">Søker etter priser og bakgrunn …</p>`;
  setSummary({ waiting: true });
  const seen = state.analysis;
  const printed = (seen?.facts?.marks ?? []).filter((m) => ["inscription", "label"].includes(m.type)).map((m) => m.text);
  const description = describeItem({ ...facts, observed: seen?.normalized?.description, printed,
    identified: state.confirmed?.identified,
    other_numbers: seen?.normalized?.other_numbers ?? [] }, {
    brandName: maker?.display_name ?? facts.brand_display ?? null, itemType: facts.category,
    period: dating.status === "dated" ? `${dating.estimate}` : dating.period?.display?.replace(/^ca\. /, "") || null,
  });
  const controller = webSearchController = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  const started = performance.now();
  try {
    const result = await searchWebSales(description, state.data.fx,
      { key: state.settings.key, model: state.settings.model, signal: controller.signal });
    if (controller !== webSearchController) return;
    renderWebSales(result, (performance.now() - started) / 1000);
    setSummary({ web: result });
  } catch (err) {
    if (controller !== webSearchController) return;
    card.innerHTML = `<h2>Priser funnet på nettet</h2><p class="meta">${esc(err.message ?? "Nettsøket feilet.")}</p>`;
    setSummary({ error: err.message ?? "Nettsøket feilet." });
  } finally {
    clearTimeout(timer);
  }
}

function renderWebSales({ sales, background, range, listedRange, dropped, stats, entryPoint }, seconds) {
  const card = $("#web-card");
  const rangeHtml = (r, label) => `<p class="web-range-label">${label}</p>
    <p class="big">${r.min.toLocaleString("nb-NO")}–${kr(r.max)}</p>
    <p class="meta">Median ${kr(r.median)} · ${r.n} priser, omregnet til kroner</p>`;
  let summary = "";
  if (range) summary += rangeHtml(range, "Solgt for");
  if (listedRange) summary += rangeHtml(listedRange, "Til salgs for (utsalgspris)");
  if (!summary) {
    summary = sales.length
      ? `<p class="meta">For få priser til et intervall (minst 3 av samme slag). Se enkeltprisene under.</p>`
      : `<p>Fant ingen priser med sikker kilde denne gangen.</p>
         <p class="meta">Google ga ${stats?.sources ?? 0} kilder; søket foreslo ${stats?.proposed ?? 0} priser${stats?.noPrice ? `, ${stats.noPrice} uten lesbar pris` : ""}${stats?.unverified ? `, ${stats.unverified} fra nettsteder som ikke var blant kildene` : ""}${stats && !stats.json ? "; svaret hadde ikke riktig format" : ""}.</p>`;
  }
  const list = sales.map((s) => `
    <li><span class="web-sale-title">${esc(s.title)}</span>
      <span class="web-sale-price">${s.kind === "listed" ? "Til salgs: " : "Solgt: "}${esc(s.price.toLocaleString("nb-NO"))} ${esc(s.currency)}${s.nok && s.currency !== "NOK" ? ` · ca. ${kr(s.nok)}` : ""}</span>
      <span class="meta">${esc(SIMILARITY_LABELS[s.similarity])}${BASIS_LABELS[s.basis] ? ` · ${BASIS_LABELS[s.basis]}` : ""}${s.date ? ` · ${esc(s.date)}` : ""} ·
        <a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.seller)}</a></span></li>`).join("");
  const facts = background.map((b) => `<li>${esc(b.text)} <span class="meta">(<a href="${esc(b.url)}" target="_blank" rel="noopener">${esc(b.source)}</a>)</span></li>`).join("");
  card.innerHTML = `
    <h2>Priser funnet på nettet</h2>
    ${summary}
    ${list ? `<ul class="web-sales">${list}</ul>` : ""}
    ${facts ? `<h3>Bakgrunn</h3><ul class="web-facts">${facts}</ul>` : ""}
    <p class="meta web-note">Hentet med Google-søk på ${Math.round(seconds)} s. Ikke kontrollert av Funn – åpne lenken og sjekk at det ligner.
      ${dropped ? `${dropped} treff uten bekreftet kilde eller pris ble utelatt.` : ""}</p>
    <div class="web-suggestions"></div>`;
  if (entryPoint) {
    // Googles søkeforslag skal vises når søkeresultater brukes; isolert i en egen ramme.
    const frame = document.createElement("iframe");
    frame.title = "Google-søkeforslag";
    frame.setAttribute("sandbox", "allow-popups allow-popups-to-escape-sandbox");
    frame.srcdoc = `<base target="_blank">${entryPoint}`;
    $(".web-suggestions", card).append(frame);
  }
}

// --- Resultat ------------------------------------------------------------------

// --- Toppen av resultatet: bildet, navnet, prislappen og det skjæra sier --------------

function renderResultHead(valuation) {
  const c = state.confirmed;
  $("#result-title").textContent = c.title ? `«${c.title}»` : c.identified ? c.identified : capitalize(c.object_type || CATEGORY_LABELS[c.item_type] || "Funnet");
  const idLine = $("#result-identity");
  idLine.hidden = !c.identified;
  const source = c.identified_url
    ? `<a href="${esc(c.identified_url)}" target="_blank" rel="noopener">${esc(c.identified_site)}</a>` : "eksempel";
  idLine.innerHTML = !c.identified ? ""
    : c.title ? `Identifisert som «${esc(c.identified)}» – kilde: ${source}`   // overskriften er boktittelen
    : `Navnet er hentet fra ${source}`;
  $("#result-sub").textContent = [c.creator, c.title ? c.object_type : null, c.brand, ...(c.materials ?? [])].filter(Boolean).join(" · ");
  const photo = state.photos.find((p) => p.url);
  const box = $("#result-photo");
  box.hidden = !photo;
  box.style.backgroundImage = photo ? `url('${photo.url}')` : "";
  state.ownValuation = valuation;
  setSummary(isLive(state.settings) ? { waiting: true } : {});
}

const span = (r) => `${nok.format(r.min)}–${kr(r.max)}`;

/** Prislappen og snakkeboblen. Viser «Fant ingenting» når verken nettsøket eller egne salg ga priser. */
function setSummary({ waiting = false, web = null, error = null } = {}) {
  const own = state.ownValuation;
  const sticker = $("#price-sticker");
  const bubble = $("#result-bubble");
  let none = false;
  let range = null;
  let html = "";
  if (waiting) {
    html = `<p>Leter etter priser med kilde …</p>`;
  } else if (error) {
    html = `<p>Nettsøket stoppet: ${esc(error)}</p>`;
  } else {
    const parts = [];
    if (web?.listedRange) parts.push(`folk vil ha <b>${span(web.listedRange)}</b> for slike`);
    if (web?.range) parts.push(`de har gått for <b>${span(web.range)}</b>`);
    range = web?.range ?? web?.listedRange ?? null;
    if (parts.length) html = `<p>Fant ${web.sales.length} priser! ${capitalize(parts.join(", og "))}.</p>`;
    else if (web?.sales?.length) html = `<p>Fant ${web.sales.length} ${web.sales.length === 1 ? "pris" : "priser"}, men for få til et intervall. Se dem under.</p>`;
    else if (web?.background?.length) html = `<p>Fant ingen priser med kilde denne gangen, men litt om bakgrunnen under.</p>`;
    if (own) {
      range ??= own;
      html += `<p>${own.is_demo ? "I demotabellen" : "I tabellen vår"} er ${own.n_sales} lignende solgt for <b>${span(own)}</b>.</p>`;
    }
    none = !html;
    if (none) {
      const st = web?.stats;
      $("#none-detail").textContent = st
        ? `Google ga ${st.sources ?? 0} kilder; søket foreslo ${st.proposed ?? 0} priser${st.noPrice ? `, ${st.noPrice} uten lesbar pris` : ""}${st.unverified ? `, ${st.unverified} fra nettsteder som ikke var blant kildene` : ""}${st.json === false ? "; svaret hadde ikke riktig format" : ""}.`
        : "";
    }
  }
  bubble.innerHTML = html;
  sticker.classList.toggle("empty", !range);
  sticker.innerHTML = range ? `<span>${nok.format(range.min)}–<br>${nok.format(range.max)} kr</span>` : `<span>${waiting ? "…" : "?"}</span>`;
  $("#result-found").hidden = none;
  $("#result-none").hidden = !none;
  $("#none-add").hidden = !none;
}

function renderResult({ dating, valuation, valuation_message, maker }) {
  renderMaker(maker);
  renderResultHead(valuation);
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
  } else if (dating.status === "no_tables") {
    $("#dating-card").innerHTML = "";   // ingen tabeller for denne kategorien; nettsøket står for bakgrunnen
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

function renderMaker(maker) {
  const card = $("#maker-card");
  const c = state.confirmed ?? {};
  const name = c.creator && WORK_CATEGORIES.has(c.item_type) ? c.creator : c.brand;
  if (name !== c.brand) maker = null;   // forfatteren/kunstneren står ikke i produsentlisten
  const retailer = state.analysis?.normalized?.retailer;
  card.hidden = !maker && !name;
  if (!maker) {
    if (!name) { card.innerHTML = ""; return; }
    const person = name === c.creator;
    const heading = !person ? "Om navnet" : c.item_type === "book_paper" ? "Om forfatteren" : c.item_type === "art" ? "Om kunstneren" : "Om opphavet";
    card.innerHTML = `<h2>${heading}</h2><p class="maker-name">${esc(name)}</p>
      <p class="meta wiki-status">${person ? "" : "Navnet står ikke i listen vår. "}Slår opp i Wikipedia …</p>`;
    const category = state.confirmed?.item_type ?? "pocket_watch";
    lookupWikipedia(name, category).then((hit) => {
      if ($("#maker-card") !== card || state.confirmed !== c) return;
      $(".wiki-status", card).outerHTML = hit
        ? `<p>${esc(hit.extract)}</p>
           <p class="meta">Hentet automatisk fra <a href="${esc(hit.url)}" target="_blank" rel="noopener">Wikipedia: ${esc(hit.title)}</a>
           (CC BY-SA). Sjekk at det er riktig ${person ? "person" : "merke"}.</p>`
        : isWatch(category)
          ? `<p class="meta">Vi fant ingenting om «${esc(name)}». Det kan være et lite forhandler- eller handelsnavn.
             <a href="https://www.mikrolisk.de/" target="_blank" rel="noopener">Mikrolisk</a> har et stort register over urmerker.</p>`
          : `<p class="meta">Wikipedia har ingen artikkel om «${esc(name)}».</p>`;
    });
    return;
  }
  const facts = [maker.place, maker.country !== maker.place ? maker.country : null].filter(Boolean).join(", ");
  const sources = (maker.sources ?? []).map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a></li>`).join("");
  card.innerHTML = `
    <h2>Om navnet ${maker.is_verified ? "" : `<span class="badge badge-demo">Ikke verifisert</span>`}</h2>
    <p class="maker-name">${esc(maker.display_name)}</p>
    <p class="meta">${esc(facts)}${maker.founded ? ` · grunnlagt ${esc(maker.founded)}` : ""}${maker.tier_label ? `<br>${esc(maker.tier_label)}` : ""}</p>
    ${retailer ? `<p class="meta">Solgt av: ${esc(retailer)}</p>` : ""}
    <p>${esc(maker.summary)}</p>
    ${maker.advice ? `<div class="notice notice-warn"><p>${esc(maker.advice)}</p></div>` : ""}
    ${maker.interpretation ? `<p class="meta"><strong>Tolkning:</strong> ${esc(maker.interpretation)}</p>` : ""}
    ${maker.number_note ? `<p class="meta"><strong>Nummeret:</strong> ${esc(maker.number_note)}</p>` : ""}
    ${sources ? `<details><summary>Kilder (${maker.sources.length})</summary><ul class="sources">${sources}</ul></details>` : ""}`;
}

// --- Wikipedia: kort omtale av navn som ikke står i listen ----------------------------

// Ord som må stå i artikkelen for at treffet skal godtas, og ord som legges til i søket, per kategori.
const WIKI_CONTEXT = {
  watch: { no: /\b(ur(maker\w*|verk\w*|fabrikk\w*|merke\w*|produsent\w*)?|klokke\w*|lommeur\w*|armbåndsur\w*)\b/i,
           en: /\b(watch\w*|horolog\w*|clock\w*|chronomet\w*)\b/i, term: { no: "ur", en: "watch" } },
  porcelain_ceramics: { no: /(porselen|keramikk|fajanse|steintøy|stentøy)/i, en: /(porcelain|ceramic|pottery|faience|stoneware)/i,
                        term: { no: "porselen", en: "porcelain" } },
  silver_metal: { no: /(sølv|gullsmed|sølvsmed|tinn|metallvare)/i, en: /(silver|goldsmith|pewter|metalware)/i, term: { no: "sølv", en: "silver" } },
  glass: { no: /glass/i, en: /glass/i, term: { no: "glassverk", en: "glassworks" } },
  furniture: { no: /(møbel|snekker|design)/i, en: /(furniture|cabinet|design)/i, term: { no: "møbler", en: "furniture" } },
  art: { no: /(kunstner|maler|grafiker|billedhugger|kunst)/i, en: /(artist|painter|printmaker|sculptor)/i, term: { no: "kunstner", en: "artist" } },
  book_paper: { no: /(forfatter|skribent|lyriker|dikter|roman|tegneserie|illustratør|forlag)/i, en: /(author|writer|novelist|poet|cartoonist|illustrator|publisher)/i,
                term: { no: "forfatter", en: "author" } },
  other: { no: /(produsent|fabrikk|firma|selskap|designer|bedrift)/i, en: /(company|manufacturer|designer|factory|maker)/i,
           term: { no: "", en: "" } },
};
const wikiContext = (category) => (isWatch(category) || category === "clock" ? WIKI_CONTEXT.watch : WIKI_CONTEXT[category] ?? WIKI_CONTEXT.other);
const CITY_WORDS = /\b(gen[eèé]ve|geneva|genf|le locle|la chaux-de-fonds|biel|bienne|suisse|switzerland|swiss|made)\b/gi;

async function lookupWikipedia(name, category = "pocket_watch") {
  const ctx = wikiContext(category);
  const words = name.toLowerCase().replace(CITY_WORDS, " ").split(/[^\p{L}]+/u).filter((w) => w.length >= 4);
  if (!words.length) return null;
  for (const lang of ["no", "en"]) {
    const term = `${name.replace(CITY_WORDS, " ")} ${ctx.term[lang]}`.trim();
    const url = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1` +
      `&generator=search&gsrlimit=4&gsrsearch=${encodeURIComponent(term)}` +
      "&prop=extracts|info&exintro=1&explaintext=1&exsentences=3&inprop=url";
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const pages = Object.values((await res.json()).query?.pages ?? {}).sort((a, b) => a.index - b.index);
      const hit = pages.find((p) => p.extract && ctx[lang].test(p.extract) &&
        words.some((w) => p.title.toLowerCase().includes(w)));
      if (hit) return { title: hit.title, extract: hit.extract, url: hit.fullurl, lang };
    } catch { /* uten nett: prøv neste språk, og gi opp stille */ }
  }
  return null;
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
  state.analysis = state.confirmed = state.ownValuation = null;
  webSearchController?.abort();
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
  const pick = e.target.closest("[data-pick]");
  if (pick) return pickCandidate(pick.dataset.pick);
  const remove = e.target.closest("[data-remove]");
  if (remove) { removePhoto(Number(remove.dataset.remove)); return renderPhotos(); }
  const action = e.target.closest("[data-action]")?.dataset.action;
  if (!action) return;
  ({
    start: openCapture,
    analyze,
    "add-photo": openCapture,
    "save-photos": savePhotos,
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
$("#f-category").addEventListener("change", toggleWatchFields);

/** Urfeltene vises bare for ur; edelt metall vises når det er relevant. */
function toggleWatchFields() {
  const form = $("#confirm-form");
  const category = form.category.value;
  $("#watch-fields").hidden = !isWatch(category);
  $("#work-fields").hidden = !(WORK_CATEGORIES.has(category) || form.elements.work_title.value || form.elements.creator.value);
  $("#material-field").hidden = !(isWatch(category) || ["silver_metal", "jewelry"].includes(category) || form.material.value);
}

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

}

const MOCK_LABELS = { monard_key_wind: "Ekte ur: G. Monard, nøkkeloppstrekk", omega_silver: "Omega i sølv med ankergang", cylinder_metal: "Usignert sylinderur i metall", unreadable: "Uleselige bilder", porcelain_demo: "Porselen: kaffekanne (eksempel)", silver_spoon_demo: "Sølv: spiseskje 830 (eksempel)" };

async function init() {
  try {
    state.data = await loadData();
  } catch (err) {
    showLoadingError(`Kunne ikke starte: ${err.message}`, () => location.reload());
    return;
  }
  setMakers(state.data.makers);
  state.meta = {
    materials: Object.entries(MATERIAL_LABELS).map(([code, label]) => ({ code, label })),
    escapements: Object.entries(ESCAPEMENT_LABELS).map(([code, label]) => ({ code, label })),
    windings: Object.entries(WINDING_LABELS).map(([code, label]) => ({ code, label })),
    layouts: Object.entries(LAYOUT_LABELS).map(([code, label]) => ({ code, label })),
    locations: LOCATION_LABELS,
    categories: Object.entries(CATEGORY_LABELS).map(([code, label]) => ({ code, label })),
  };
  $("#mock-scenario").innerHTML = Object.keys(state.data.contract.mock_scenarios)
    .map((s) => `<option value="${s}">${esc(MOCK_LABELS[s] ?? s)}</option>`).join("");
  fillMascots();
  applyMode();
  show("intro");
}

$("#settings-form").addEventListener("submit", onSaveSettings);

init();
