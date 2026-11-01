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
  if (screen !== "loading") stopLoading();
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
  $("#save-photos-btn").hidden = n === 0;
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
      addPhoto({ ...(await compress(file)), original: file });
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

// --- Venteskjerm ---------------------------------------------------------------

// Viktoriansk/steampunk lommeur: tannhjul i messing og kobber bak, romertall og Breguet-visere,
// et åpent vindu der uroen svinger, og en messinglupe som glir over skiven.
function gearPath(cx, cy, r, teeth, depth) {
  const pts = [];
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2, s = (Math.PI * 2) / teeth;
    for (const [da, rr] of [[0, r - depth], [s * 0.18, r], [s * 0.5, r], [s * 0.68, r - depth]]) {
      pts.push(`${(cx + rr * Math.cos(a + da)).toFixed(1)},${(cy + rr * Math.sin(a + da)).toFixed(1)}`);
    }
  }
  return `M${pts.join("L")}Z`;
}

function gear(cls, cx, cy, r, teeth, spokes) {
  const spokeLines = Array.from({ length: spokes }, (_, i) => {
    const a = (i / spokes) * Math.PI * 2;
    return `<line x1="${cx}" y1="${cy}" x2="${(cx + (r - 9) * Math.cos(a)).toFixed(1)}" y2="${(cy + (r - 9) * Math.sin(a)).toFixed(1)}"/>`;
  }).join("");
  return `<g class="sp-gear ${cls}" style="transform-origin:${cx}px ${cy}px">
    <path class="sp-gear-body" d="${gearPath(cx, cy, r, teeth, 5)}"/>
    <circle class="sp-gear-cut" cx="${cx}" cy="${cy}" r="${r - 9}"/>
    <g class="sp-gear-spokes">${spokeLines}</g>
    <circle class="sp-gear-hub" cx="${cx}" cy="${cy}" r="4.5"/></g>`;
}

const ROMAN = ["XII", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI"];
const numerals = ROMAN.map((n, i) => {
  const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
  return `<text x="${(100 + 29 * Math.cos(a)).toFixed(1)}" y="${(104 + 29 * Math.sin(a) + 3).toFixed(1)}">${n}</text>`;
}).join("");
const minuteTicks = Array.from({ length: 60 }, (_, i) =>
  `<line x1="100" y1="${i % 5 ? 66.5 : 65.5}" x2="100" y2="68.5" transform="rotate(${i * 6} 100 104)"/>`).join("");

const LOADER_SVG = `<svg class="loader" viewBox="0 0 200 200" aria-hidden="true">
  <defs>
    <linearGradient id="sp-brass" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" class="sp-s1"/><stop offset=".5" class="sp-s2"/><stop offset="1" class="sp-s3"/>
    </linearGradient>
    <linearGradient id="sp-copper" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" class="sp-c1"/><stop offset="1" class="sp-c2"/>
    </linearGradient>
    <radialGradient id="sp-dial" cx=".4" cy=".35" r=".75">
      <stop offset="0" class="sp-d1"/><stop offset="1" class="sp-d2"/>
    </radialGradient>
  </defs>
  ${gear("sp-g1", 48, 132, 34, 16, 5)}
  ${gear("sp-g2 sp-copperish", 154, 70, 24, 11, 4)}
  ${gear("sp-g3", 160, 150, 16, 8, 3)}
  <g class="sp-watch">
    <circle class="sp-bow" cx="100" cy="30" r="13"/>
    <rect class="sp-crown" x="93" y="42" width="14" height="12" rx="3"/>
    <line class="sp-knurl-line" x1="96" y1="44" x2="96" y2="52"/><line class="sp-knurl-line" x1="100" y1="44" x2="100" y2="52"/><line class="sp-knurl-line" x1="104" y1="44" x2="104" y2="52"/>
    <rect class="sp-pendant" x="96" y="53" width="8" height="5" rx="1.5"/>
    <circle class="sp-case" cx="100" cy="104" r="50"/>
    <circle class="sp-knurl" cx="100" cy="104" r="46.5"/>
    <circle class="sp-dial" cx="100" cy="104" r="42"/>
    <circle class="sp-chapter" cx="100" cy="104" r="37.5"/>
    <g class="sp-ticks">${minuteTicks}</g>
    <g class="sp-numerals">${numerals}</g>
    <circle class="sp-window-rim" cx="100" cy="119" r="9.5"/>
    <circle class="sp-window" cx="100" cy="119" r="8.2"/>
    <path class="sp-hairspring" d="M100 119 m0 -1.2 a1.2 1.2 0 1 1 -1.2 1.2 a2.4 2.4 0 1 1 2.4 2.4 a3.6 3.6 0 1 1 -3.6 -3.6 a4.8 4.8 0 1 1 4.8 4.8"/>
    <g class="sp-balance" style="transform-origin:100px 119px">
      <circle class="sp-balance-rim" cx="100" cy="119" r="6.2"/>
      <line x1="93.8" y1="119" x2="106.2" y2="119"/><line x1="100" y1="112.8" x2="100" y2="125.2"/>
      <circle class="sp-screw" cx="93.8" cy="119" r="1.1"/><circle class="sp-screw" cx="106.2" cy="119" r="1.1"/>
    </g>
    <g class="sp-hand sp-hour" transform="rotate(-50 100 104)">
      <line x1="100" y1="108" x2="100" y2="86"/><circle cx="100" cy="83" r="3.2"/>
    </g>
    <g class="sp-hand sp-minute" style="transform-origin:100px 104px">
      <line x1="100" y1="109" x2="100" y2="74"/><circle cx="100" cy="77" r="2.4"/><path d="M100 70 L101.6 74 L98.4 74 Z"/>
    </g>
    <circle class="sp-pin" cx="100" cy="104" r="2.6"/>
  </g>
  <g class="sp-lens">
    <line class="sp-handle" x1="13" y1="13" x2="31" y2="31"/>
    <circle class="sp-handle-ring" cx="17" cy="17" r="3"/><circle class="sp-handle-ring" cx="27" cy="27" r="3"/>
    <circle class="sp-lens-rim" cx="0" cy="0" r="17"/>
    <circle class="sp-lens-glass" cx="0" cy="0" r="13.5"/>
    <path class="sp-lens-shine" d="M-8 -6 A10 10 0 0 1 2 -10"/>
  </g>
</svg>`;

const LOADING_STEPS = {
  analyze: ["Studerer bildene …", "Finner ut hva hvert bilde viser …", "Leter etter nummer og stempler …",
            "Tyder gravering og tekst …", "Undersøker gang og oppstrekk …"],
  lookup: ["Blar i protokollene …", "Finner sammenlignbare salg …"],
};
let loadingTimer = null;

function stopLoading() {
  clearInterval(loadingTimer);
  loadingTimer = null;
}

function showLoading(kind = "analyze") {
  stopLoading();
  const steps = LOADING_STEPS[kind] ?? LOADING_STEPS.analyze;
  const screen = $("#screen-loading");
  screen.innerHTML = `${LOADER_SVG}<p class="loading-text" aria-live="polite">${esc(steps[0])}</p>`;
  show("loading");
  let i = 0;
  const text = $(".loading-text", screen);
  loadingTimer = setInterval(() => {
    i = Math.min(i + 1, steps.length - 1);   // blir stående på siste tekst
    text.classList.add("fade");
    setTimeout(() => { text.textContent = steps[i]; text.classList.remove("fade"); }, 250);
    if (i === steps.length - 1) stopLoading();
  }, 2600);
}

// --- Lagre bildene på telefonen --------------------------------------------------------
// Bilder tatt med kameraknappen havner ikke i Bilder-appen. Her kan de deles eller lagres.

function photoFiles() {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  return state.photos.map((p, i) => {
    const src = p.original ?? p.blob;
    const ext = /heic|heif/i.test(src.type) ? "heic" : /png/i.test(src.type) ? "png" : "jpg";
    return new File([src], `informantikk-${stamp}-${i + 1}.${ext}`, { type: src.type || "image/jpeg" });
  });
}

async function savePhotos() {
  const box = $("#capture-error");
  const files = photoFiles();
  if (!files.length) return;
  try {
    if (navigator.canShare?.({ files })) {
      await navigator.share({ files, title: "Bilder fra InformAntikk" });  // iPhone: velg «Arkiver bilder»
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
  showLoading("analyze");
  const form = new FormData();
  state.photos.forEach((photo, i) => form.append("photos", photo.blob, `bilde-${i + 1}.jpg`));
  const scenario = $("#mock-scenario").value;
  if (state.meta?.mode === "mock" && scenario) form.append("mock_scenario", scenario);

  const started = performance.now();
  try {
    state.analysis = await api("/api/analyze", { method: "POST", body: form });
    Object.assign(state.analysis, { seconds: (performance.now() - started) / 1000, photos: state.photos.length,
      bytes: state.photos.reduce((sum, p) => sum + p.blob.size, 0) });
    renderConfirm();
    show("confirm");
  } catch (err) {
    showLoadingError(err.message, analyze);
  }
}

function showLoadingError(message, retry) {
  stopLoading();
  const screen = $("#screen-loading");
  screen.innerHTML = `<p class="error" role="alert">${esc(message)}</p>
    <div class="actions" style="width:100%"><button class="btn btn-primary" id="retry-btn">Prøv igjen</button>
    <button class="link" id="back-btn">Tilbake</button></div>`;
  $("#retry-btn").onclick = retry;
  $("#back-btn").onclick = () => (state.analysis ? show("confirm") : openCapture());
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
  showLoading("lookup");
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

function renderSaleSearches(links) {
  const card = $("#sales-card");
  card.hidden = !links?.length;
  if (!links?.length) { card.innerHTML = ""; return; }
  card.innerHTML = `
    <h2>Se hva lignende er solgt for</h2>
    <p class="meta">Ferdige søk etter solgte eksemplarer. Prisene der er ikke kontrollert av InformAntikk – sammenlign bilder og tilstand.</p>
    <ul class="sale-links">${links.map((l) => `
      <li><a class="sale-link" href="${esc(l.url)}" target="_blank" rel="noopener">
        <span class="sale-site">${esc(l.label)}</span>
        <span class="meta">${esc(l.note)} · «${esc(l.query)}»</span></a></li>`).join("")}
    </ul>`;
}

function renderResult({ dating, valuation, valuation_message, maker, sale_searches }) {
  renderMaker(maker);
  renderSaleSearches(sale_searches);
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

function renderMaker(maker) {
  const card = $("#maker-card");
  const name = state.confirmed?.brand;
  const retailer = state.analysis?.normalized?.retailer;
  card.hidden = !maker && !name;
  if (!maker) {
    if (!name) { card.innerHTML = ""; return; }
    card.innerHTML = `<h2>Om navnet</h2><p class="maker-name">${esc(name)}</p>
      <p class="meta wiki-status">Navnet står ikke i listen vår. Slår opp i Wikipedia …</p>`;
    lookupWikipedia(name).then((hit) => {
      if ($("#maker-card") !== card || state.confirmed?.brand !== name) return;
      $(".wiki-status", card).outerHTML = hit
        ? `<p>${esc(hit.extract)}</p>
           <p class="meta">Hentet automatisk fra <a href="${esc(hit.url)}" target="_blank" rel="noopener">Wikipedia: ${esc(hit.title)}</a>
           (CC BY-SA). Sjekk at det er riktig merke.</p>`
        : `<p class="meta">Vi fant ingenting om «${esc(name)}». Det kan være et lite forhandler- eller handelsnavn.
           <a href="https://www.mikrolisk.de/" target="_blank" rel="noopener">Mikrolisk</a> har et stort register over urmerker.</p>`;
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

const WATCH_WORDS = {
  no: /\b(ur(maker\w*|verk\w*|fabrikk\w*|merke\w*|produsent\w*)?|klokke\w*|lommeur\w*|armbåndsur\w*)\b/i,
  en: /\b(watch\w*|horolog\w*|clock\w*|chronomet\w*)\b/i,
};
const CITY_WORDS = /\b(gen[eèé]ve|geneva|genf|le locle|la chaux-de-fonds|biel|bienne|suisse|switzerland|swiss|made)\b/gi;

async function lookupWikipedia(name) {
  const words = name.toLowerCase().replace(CITY_WORDS, " ").split(/[^\p{L}]+/u).filter((w) => w.length >= 4);
  if (!words.length) return null;
  for (const lang of ["no", "en"]) {
    const term = `${name.replace(CITY_WORDS, " ")} ${lang === "no" ? "ur" : "watch"}`;
    const url = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1` +
      `&generator=search&gsrlimit=4&gsrsearch=${encodeURIComponent(term)}` +
      "&prop=extracts|info&exintro=1&explaintext=1&exsentences=3&inprop=url";
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const pages = Object.values((await res.json()).query?.pages ?? {}).sort((a, b) => a.index - b.index);
      const hit = pages.find((p) => p.extract && WATCH_WORDS[lang].test(p.extract) &&
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
    "save-photos": savePhotos,
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
