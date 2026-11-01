// Nettsøk etter solgte eksemplarer og bakgrunn, med Gemini og Google-søk.
// Prinsipp: appen viser bare salg og fakta som har en kilde fra et nettsted Google faktisk
// returnerte i søket. Pris og årstall gjettes aldri; alt merkes «ikke kontrollert».

import { VisionError } from "./vision.js";

const API = "https://generativelanguage.googleapis.com/v1beta";
const MIN_FOR_RANGE = 3;

const ITEM_LABELS = {
  pocket_watch: "pocket watch", wristwatch: "wristwatch", clock: "clock", silver_metal: "silver or metal object",
  porcelain_ceramics: "porcelain or ceramic object", glass: "glass object", jewelry: "jewellery", furniture: "furniture",
  art: "artwork", textile: "textile", toy: "toy", electronics: "electronics, game or media item", book_paper: "book or paper item", lighting: "lamp", other: "object",
};
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
  if (facts.object_type) parts.push(`– «${facts.object_type}» (Norwegian name)`);
  if (brandName) parts.unshift(brandName);
  else parts.unshift("unsigned");
  const details = [MATERIAL_EN[facts.material], ESCAPEMENT_EN[facts.escapement], WINDING_EN[facts.winding]].filter(Boolean);
  if (facts.materials?.length) details.push(`materials (Norwegian): ${facts.materials.join(", ")}`);
  if (facts.observed) details.push(`seen (Norwegian): ${facts.observed}`);
  if (period) details.push(`approx. ${period}`);
  if (facts.movement_serial) details.push(`movement no. ${facts.movement_serial}`);
  if (facts.case_number) details.push(`case no. ${facts.case_number}`);
  const marks = (facts.case_stamps ?? []).slice(0, 6);
  if (marks.length) details.push(`marks: ${marks.join("; ")}`);
  return `${parts.join(" ")}${details.length ? ` (${details.join(", ")})` : ""}`;
}

const SYSTEM = `You help people at flea markets, antique shops and charity shops in Norway find out what an item is and what it sells for. Use Google Search.
Rules:
- Find prices for the same item or the closest comparable items, second-hand or antique.
- Two kinds of prices: "sold" = a price actually achieved (auction hammer price, "sold for", completed sale); "listed" = an asking price in a current or recent ad or shop listing. Never report estimates.
- Search Norwegian and Nordic sources first (finn.no, tise.com, auctionet.com, blomqvist.no, gwpa.no, lauritz.com, tradera.com), then international ones (ebay.com, catawiki.com, worthpoint.com, auction houses).
- Prefer the same maker, model, type, material and era. Mark how similar each one is.
- Copy price, currency, date and URL exactly from the page. Never invent or estimate a price, date or URL.
- Background facts must be about the maker, model, pattern or marks, each with the page it came from. Write them in Norwegian (bokmål), at most two sentences each. You may give the years a mark, stamp, pattern or model was in use when the page says so, but never state a production year for this specific item yourself.
- Reply with JSON only, no other text.`;

export function buildWebSalesRequest(description, { thinkingLevel = null } = {}) {
  const prompt = `Item: ${description}

Find up to 10 prices (sold and listed) for comparable items and up to 4 background facts.
Return exactly this JSON shape (price as a plain number):
{"sales":[{"title":"","kind":"sold|listed","price":0,"currency":"ISO 4217","price_basis":"hammer|incl_premium|unknown","date":"YYYY-MM-DD or YYYY","seller":"site, shop or auction house","url":"","similarity":"same_model|same_maker|similar"}],
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

/** Kildene Google faktisk returnerte. Lenkene er ofte omdirigeringer, så tittelen brukes også. */
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

const sourceTitles = (metadata) => (metadata?.groundingChunks ?? []).map((c) => (c.web?.title ?? "").toLowerCase());

/** Nettstedet må være blant kildene: samme domene, eller navnet (f.eks. «finn», «ebay») i en kildetittel. */
function verified(url, domains, titles = []) {
  const h = host(url);
  if (!h) return false;
  for (const d of domains) if (h === d || h.endsWith(`.${d}`) || d.endsWith(`.${h}`)) return true;
  const labels = h.split(".");
  const name = labels.length >= 2 ? labels[labels.length - 2] : labels[0];
  return name.length >= 3 && titles.some((t) => t.includes(name));
}

/** «kr 1 200», «1.200,-», «1,200.50» → tall. */
export function parsePrice(value) {
  if (typeof value === "number") return value;
  let t = String(value ?? "").replace(/[^\d.,]/g, "").replace(/^[.,]+|[.,]+$/g, "");
  if (!t) return NaN;
  if (/^\d{1,3}([.,\s]\d{3})+$/.test(t)) t = t.replace(/[.,]/g, "");        // tusenskille
  else if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");   // desimalkomma
  else t = t.replace(/,/g, "");
  return Number(t);
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
  const titles = sourceTitles(meta);
  const stats = { sources: (meta.groundingChunks ?? []).length, proposed: 0, noPrice: 0, unverified: 0, json: false };
  const json = extractJson(text);
  stats.json = !!json;
  const parsed = json ?? { sales: [], background: [] };
  const rates = fx?.rates ?? {};
  let dropped = 0;

  const sales = [];
  for (const s of Array.isArray(parsed.sales) ? parsed.sales : []) {
    stats.proposed += 1;
    const price = parsePrice(s?.price);
    if (!(price > 0)) { stats.noPrice += 1; dropped += 1; continue; }
    if (!s?.url || !verified(s.url, domains, titles)) { stats.unverified += 1; dropped += 1; continue; }
    const currency = String(s.currency ?? "").toUpperCase();
    const rate = rates[currency];
    sales.push({
      title: String(s.title ?? "").slice(0, 160), price, currency, kind: s.kind === "listed" ? "listed" : "sold",
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
    if (!b?.text || !b?.url || !verified(b.url, domains, titles)) { dropped += 1; continue; }
    background.push({ text: String(b.text).slice(0, 400), url: b.url, source: host(b.url) });
  }

  const rangeOf = (list) => {
    const priced = list.filter((s) => s.nok);
    return priced.length >= MIN_FOR_RANGE
      ? { min: Math.min(...priced.map((s) => s.nok)), median: round(median(priced.map((s) => s.nok))),
          max: Math.max(...priced.map((s) => s.nok)), n: priced.length }
      : null;
  };
  const range = rangeOf(sales.filter((s) => s.kind === "sold"));
  const listedRange = rangeOf(sales.filter((s) => s.kind === "listed"));

  return { sales, background, range, listedRange, dropped, stats, queries: meta.webSearchQueries ?? [],
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
