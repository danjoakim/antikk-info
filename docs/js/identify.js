// Identifisering: finner ut nøyaktig hva tingen er (produsent, modell, dekor, tittel, utgave),
// med Gemini og Google-søk, før prisene letes fram. Bare forslag med kilde Google faktisk fant.
// Ett svar når bildet avgjør det; to–tre kort med «sjekk» bare når det som synes, passer på flere.

import { callGrounded, describeItem, extractJson, groundedDomains, sourceTitles, verified } from "./websales.js";

const MAX_CANDIDATES = 3;

const SYSTEM = `You identify second-hand and antique items for people at flea markets and charity shops in Norway. Use Google Search.
The input is what was read and seen in the user's photos.
Goal: the exact identity – maker or brand, model, pattern or decor name, series, title and author/artist, edition – as precisely as your sources allow.
Rules:
- Always run Google Search before answering, also for well-known items: names must be checked against current sources. Every name and fact must come from a page in your search results, never from memory.
- Only name an identity you found on a web page in your search results, and give that page's URL. Never invent a model, pattern, decor or edition name.
- If the visible text, logo, marks or shape already settle the identity, return exactly ONE candidate and "decided": true. Never offer alternatives that the photo already rules out (if the input shows a PS5 controller, do not offer a PS4 controller; if the title is printed, do not offer other titles).
- Return 2–3 candidates with "decided": false ONLY when the visible evidence genuinely fits more than one identity. Then give each a "check": one short instruction in Norwegian (bokmål) telling the user what to look at on the item to tell them apart – a mark, a number, a detail – never something already in the input.
- "why": one sentence in Norwegian about which visible features match the source.
- "what": the item type in Norwegian, e.g. "kaffekanne", "lommeur", "bok", "spillkontroller".
- Never state a production year for this specific item and never estimate value.
- If nothing can be identified from sources, return an empty list.
- Reply with JSON only.`;

/** Beskrivelse av det som ble lest og sett, før brukeren har bekreftet noe. */
export function describeObserved(facts, normalized) {
  const printed = (facts.marks ?? []).map((m) => m.text).filter(Boolean);
  const base = describeItem({
    ...normalized, observed: normalized.description, printed,
    other_numbers: normalized.other_numbers ?? [],
    case_stamps: [],
  }, { brandName: normalized.brand_display ?? null, itemType: normalized.category ?? "other" });
  const style = (facts.style_cues ?? []).length ? `\nStyle features (Norwegian): ${facts.style_cues.join(", ")}` : "";
  const dial = facts.dial_text ? `\nDial text: ${facts.dial_text}` : "";
  return `${base}${dial}${style}`;
}

export function buildIdentifyRequest(description, { thinkingLevel = null } = {}) {
  const prompt = `Read and seen in the photos: ${description}

Identify the item. Return exactly this JSON shape:
{"decided":true,"candidates":[{"name":"precise name, e.g. maker + model/pattern/title","what":"","maker":"","title":"","creator":"","why":"","check":"","url":""}]}`;
  const generationConfig = { temperature: 0 };
  if (thinkingLevel) generationConfig.thinkingConfig = { thinkingLevel };
  return {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
    generationConfig,
  };
}

const clean = (v, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "") || null;

function host(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return null; }
}

/** Tolker svaret: beholder bare forslag med kilde Google returnerte. */
export function parseIdentify(data) {
  const candidate = data?.candidates?.[0];
  const text = (candidate?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("");
  const meta = candidate?.groundingMetadata ?? {};
  const domains = groundedDomains(meta);
  const titles = sourceTitles(meta);
  const json = extractJson(text) ?? {};
  const stats = { sources: (meta.groundingChunks ?? []).length, proposed: 0, unverified: 0 };
  const out = [];
  for (const c of Array.isArray(json.candidates) ? json.candidates : []) {
    stats.proposed += 1;
    const name = clean(c?.name, 160);
    if (!name) continue;
    if (!c?.url || !verified(c.url, domains, titles)) { stats.unverified += 1; continue; }
    if (out.some((o) => o.name.toLowerCase() === name.toLowerCase())) continue;
    out.push({
      name, what: clean(c.what, 60), maker: clean(c.maker, 80), title: clean(c.title, 160), creator: clean(c.creator, 80),
      why: clean(c.why, 300), check: clean(c.check, 200), url: c.url, site: host(c.url),
    });
  }
  // Ett forslag igjen, eller modellen sier at bildet avgjør det: bare ett svar, uten valg.
  const decided = out.length === 1 || (json.decided === true && out.length > 0);
  const candidates = decided ? out.slice(0, 1).map((c) => ({ ...c, check: null })) : out.slice(0, MAX_CANDIDATES);
  return { candidates, decided: decided && candidates.length === 1, stats };
}

export async function identifyItem(description, { key, model, signal } = {}) {
  const data = await callGrounded((thinkingLevel) => buildIdentifyRequest(description, { thinkingLevel }),
    { key, model, signal, label: "Identifiseringen" });
  return parseIdentify(data);
}

/** Demomodus: faste eksempler som viser hvordan kortene ser ut. Merket som eksempler. */
const DEMO = {
  omega_silver: { decided: true, candidates: [
    { name: "Omega lommeur i sølv (eksempel)", what: "lommeur", maker: "Omega", why: "Eksempel: navnet Omega står på urskiven og i lokket.",
      url: "https://example.com/omega", site: "eksempel", demo: true }] },
  porcelain_demo: { decided: false, candidates: [
    { name: "Porsgrund kaffekanne, dekor A (eksempel)", what: "kaffekanne", maker: "Porsgrund", why: "Eksempel: formen og bunnstempelet passer.",
      check: "Se etter dekornummeret ved siden av stempelet under bunnen.", url: "https://example.com/a", site: "eksempel", demo: true },
    { name: "Porsgrund kaffekanne, dekor B (eksempel)", what: "kaffekanne", maker: "Porsgrund", why: "Eksempel: samme form, annen dekor.",
      check: "Dekor B har gullkant på lokket.", url: "https://example.com/b", site: "eksempel", demo: true }] },
};

export function mockIdentity(scenario) {
  const d = DEMO[scenario];
  return d ? structuredClone(d) : { decided: false, candidates: [] };
}
