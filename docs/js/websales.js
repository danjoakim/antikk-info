// Nettsøk etter solgte eksemplarer og bakgrunn, med Gemini og Google-søk.
// Prinsipp: appen viser bare salg og fakta som har en kilde fra et nettsted Google faktisk
// returnerte i søket. Pris og årstall gjettes aldri; alt merkes «ikke kontrollert».

import { VisionError } from "./vision.js";

const API = "https://generativelanguage.googleapis.com/v1beta";
const MIN_FOR_RANGE = 3;

const ITEM_LABELS = { pocket_watch: "pocket watch" };
const MATERIAL_EN = {
  gold_18k: "18k gold", gold_14k: "14k gold", gold_filled: "gold filled", silver_935: "silver 0.935",
  silver_925: "silver 0.925", silver_900: "silver 0.900", silver_875: "silver 0.875", silver_800: "silver 0.800",
  steel: "steel", base_metal: "base metal",
};
const ESCAPEMENT_EN = { cylinder: "cylinder escapement", lever: "lever escapement", verge: "verge escapement" };
const WINDING_EN = { key: "key wind", stem: "keyless (stem wind)" };

/** Kort engelsk beskrivelse av tingen, bygget bare av bekreftede fakta. */
export function describeItem(facts, { brandName = null, itemType = "pocket_watch", period = null } = {}) {
  const parts = [ITEM_LABELS[itemType] ?? itemType];
  if (brandName) parts.unshift(brandName);
  else parts.unshift("unsigned");
  const details = [MATERIAL_EN[facts.material], ESCAPEMENT_EN[facts.escapement], WINDING_EN[facts.winding]].filter(Boolean);
  if (period) details.push(`approx. ${period}`);
  if (facts.movement_serial) details.push(`movement no. ${facts.movement_serial}`);
  if (facts.case_number) details.push(`case no. ${facts.case_number}`);
  const marks = (facts.case_stamps ?? []).slice(0, 6);
  if (marks.length) details.push(`marks: ${marks.join("; ")}`);
  return `${parts.join(" ")}${details.length ? ` (${details.join(", ")})` : ""}`;
}

const SYSTEM = `You research the market for antiques and collectibles. Use Google Search.
Rules:
- Only report sales where the page states a price actually achieved (hammer price, sold price, or "sold for"). Skip estimates, asking prices and unsold lots.
- Prefer the same maker, type, material and era. Mark how similar each sale is.
- Copy price, currency, date and URL exactly from the page. Never invent or estimate a price, date or URL.
- Background facts must be about the maker, model or marks, each with the page it came from. Write them in Norwegian (bokmål), at most two sentences each. Do not state a production year for this specific item.
- Reply with JSON only, no other text.`;

export function buildWebSalesRequest(description, { thinkingLevel = null } = {}) {
  const prompt = `Item: ${description}

Find up to 8 realized sales of comparable items and up to 4 background facts.
Return exactly this JSON shape:
{"sales":[{"title":"","price":0,"currency":"ISO 4217","price_basis":"hammer|incl_premium|unknown","date":"YYYY-MM-DD or YYYY","seller":"auction house or marketplace","url":"","similarity":"same_model|same_maker|similar"}],
 "background":[{"text":"","url":""}]}
If nothing reliable is found, return empty lists.`;
  const generationConfig = { temperature: 0 };
  if (thinkingLevel) generationConfig.thinkingConfig = { thinkingLevel };
  return {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
    generationConfig,
  };
}

function host(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return null; }
}

/** Domener Google faktisk returnerte. Kildelenkene er ofte omdirigeringer, så tittelen (domenet) brukes også. */
export function groundedDomains(metadata) {
  const out = new Set();
  for (const chunk of metadata?.groundingChunks ?? []) {
    const web = chunk.web ?? {};
    const h = host(web.uri);
    if (h && !h.endsWith("vertexaisearch.cloud.google.com")) out.add(h);
    const t = (web.title ?? "").toLowerCase().trim().replace(/^www\./, "");
    if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(t)) out.add(t);
  }
  return out;
}

function verified(url, domains) {
  const h = host(url);
  if (!h) return false;
  for (const d of domains) if (h === d || h.endsWith(`.${d}`) || d.endsWith(`.${h}`)) return true;
  return false;
}

function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const round = (nok) => (nok >= 10000 ? Math.round(nok / 500) * 500 : nok >= 1000 ? Math.round(nok / 50) * 50 : Math.round(nok / 10) * 10);

/** Tolker svaret: beholder bare salg og fakta med kilde fra et domene Google returnerte. */
export function parseWebSales(data, fx) {
  const candidate = data?.candidates?.[0];
  const text = (candidate?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("");
  const meta = candidate?.groundingMetadata ?? {};
  const domains = groundedDomains(meta);
  const parsed = extractJson(text) ?? { sales: [], background: [] };
  const rates = fx?.rates ?? {};
  let dropped = 0;

  const sales = [];
  for (const s of Array.isArray(parsed.sales) ? parsed.sales : []) {
    const price = Number(s?.price);
    if (!s?.url || !(price > 0) || !verified(s.url, domains)) { dropped += 1; continue; }
    const currency = String(s.currency ?? "").toUpperCase();
    const rate = rates[currency];
    sales.push({
      title: String(s.title ?? "").slice(0, 160), price, currency,
      nok: rate ? round(price * rate) : null,
      basis: ["hammer", "incl_premium"].includes(s.price_basis) ? s.price_basis : "unknown",
      date: String(s.date ?? ""), seller: String(s.seller ?? host(s.url)), url: s.url,
      similarity: ["same_model", "same_maker", "similar"].includes(s.similarity) ? s.similarity : "similar",
    });
  }
  const order = { same_model: 0, same_maker: 1, similar: 2 };
  sales.sort((a, b) => order[a.similarity] - order[b.similarity] || (b.date > a.date ? 1 : -1));

  const background = [];
  for (const b of Array.isArray(parsed.background) ? parsed.background : []) {
    if (!b?.text || !b?.url || !verified(b.url, domains)) { dropped += 1; continue; }
    background.push({ text: String(b.text).slice(0, 400), url: b.url, source: host(b.url) });
  }

  const priced = sales.filter((s) => s.nok);
  const range = priced.length >= MIN_FOR_RANGE
    ? { min: Math.min(...priced.map((s) => s.nok)), median: round(median(priced.map((s) => s.nok))),
        max: Math.max(...priced.map((s) => s.nok)), n: priced.length }
    : null;

  return { sales, background, range, dropped, queries: meta.webSearchQueries ?? [],
           entryPoint: meta.searchEntryPoint?.renderedContent ?? null };
}

export async function searchWebSales(description, fx, { key, model, signal } = {}) {
  const url = `${API}/models/${encodeURIComponent(model)}:generateContent`;
  const send = async (body) => {
    let res;
    try {
      res = await fetch(url, { method: "POST", signal, headers: { "Content-Type": "application/json", "x-goog-api-key": key },
                               body: JSON.stringify(body) });
    } catch (err) {
      throw new VisionError(err.name === "AbortError" ? "Nettsøket tok for lang tid." : "Fikk ikke kontakt med nettsøket.");
    }
    return { res, data: await res.json().catch(() => ({})) };
  };
  const level = /^gemini-3/i.test(model ?? "") ? "low" : null;
  let { res, data } = await send(buildWebSalesRequest(description, { thinkingLevel: level }));
  if (res.status === 400 && level && /thinking/i.test(data?.error?.message ?? "")) {
    ({ res, data } = await send(buildWebSalesRequest(description)));
  }
  if (!res.ok) {
    const msg = data?.error?.message ?? "";
    if (res.status === 429) throw new VisionError("Kvoten for nettsøk er brukt opp. Prøv igjen senere.");
    if (/search|grounding|tool/i.test(msg)) throw new VisionError("Nettsøk er ikke tilgjengelig for denne nøkkelen eller modellen.");
    throw new VisionError(`Nettsøket feilet (HTTP ${res.status}).`);
  }
  return parseWebSales(data, fx);
}
