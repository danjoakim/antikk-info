// Bildeanalyse i nettleseren: Gemini via REST, eller demoeksempler uten nøkkel.
// Instruks, skjema og demoeksempler lastes fra data/vision_contract.json, som eksporteres
// fra Python-versjonen. Skjemaet har ingen felt for årstall eller pris.

const API = "https://generativelanguage.googleapis.com/v1beta";
export const DEFAULT_MODEL = "gemini-3.8-flash";
const ESCAPEMENTS = new Set(["cylinder", "lever", "verge", "unknown"]);

export class VisionError extends Error {}

// --- Validering av svaret (samme regler som core.to_facts i Python) ------------------

const str = (v) => (typeof v === "string" && v.trim() ? v : null);
const strList = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()) : []);

const pick = (v, allowed, fallback = "unknown") => (allowed.includes(v) ? v : fallback);
const LOCATIONS = ["dial", "outer_lid_outside", "outer_lid_inside", "cuvette_outside", "cuvette_inside", "movement", "case_rim",
  "front", "back", "base", "inside", "lid", "side", "handle", "label", "unknown"];
const CATEGORIES = ["pocket_watch", "wristwatch", "clock", "silver_metal", "porcelain_ceramics", "glass", "jewelry",
  "furniture", "art", "textile", "toy", "electronics", "book_paper", "lighting", "other"];
const METHODS = ["stamped", "engraved", "scratched", "unknown"];
const MARK_TYPES = ["fineness", "hallmark_symbol", "maker_mark", "factory_mark", "signature", "label", "inscription",
  "owner_engraving", "repair_mark", "other"];

export function toFacts(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new VisionError("Bildeanalysen ga ikke noe strukturert svar. Prøv igjen.");
  }
  const escapement = raw.escapement ?? "unknown";
  if (!ESCAPEMENTS.has(escapement)) throw new VisionError("Bildeanalysen ga et ugyldig svar. Prøv igjen.");
  const confidence = {};
  for (const [k, v] of Object.entries(raw.confidence ?? {})) {
    if (typeof v === "number" && v >= 0 && v <= 1) confidence[k] = v;
  }
  const list = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : []);
  return {
    category: pick(raw.category, CATEGORIES, "other"), object_type: str(raw.object_type), title: str(raw.title), creator: str(raw.creator), description: str(raw.description),
    materials: strList(raw.materials), style_cues: strList(raw.style_cues),
    photos: list(raw.photos).filter((p) => Number.isInteger(p.index)).map((p) => ({ index: p.index, shows: pick(p.shows, LOCATIONS) })),
    dial_text: str(raw.dial_text), brand_signed: str(raw.brand_signed),
    numbers: list(raw.numbers).filter((n) => str(n.value)).map((n) => ({
      value: String(n.value).trim(), location: pick(n.location, LOCATIONS), method: pick(n.method, METHODS), prefix: str(n.prefix),
    })),
    marks: list(raw.marks).filter((m) => str(m.text)).map((m) => ({
      text: String(m.text).trim(), location: pick(m.location, LOCATIONS), type: pick(m.type, MARK_TYPES, "other"),
    })),
    escapement, escapement_evidence: str(raw.escapement_evidence),
    winding: pick(raw.winding, ["key", "stem", "unknown"]), winding_evidence: str(raw.winding_evidence),
    movement_layout: pick(raw.movement_layout, ["bar", "three_quarter_plate", "full_plate", "unknown"]),
    jewels: Number.isInteger(raw.jewels) ? raw.jewels : null,
    confidence, unreadable: strList(raw.unreadable), retake_hints: strList(raw.retake_hints),
  };
}

// --- Gemini --------------------------------------------------------------------

async function toBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Reserve for modeller/API-versjoner uten full JSON Schema: OpenAPI-delmengden Gemini også godtar. */
export function toOpenApiSchema(node) {
  if (Array.isArray(node)) return node.map(toOpenApiSchema);
  if (!node || typeof node !== "object") return node;
  const out = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === "additionalProperties") continue;
    if (key === "type" && Array.isArray(value)) {
      out.type = value.find((t) => t !== "null");
      if (value.includes("null")) out.nullable = true;
    } else if (key === "properties") {
      out.properties = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toOpenApiSchema(v)]));
    } else {
      out[key] = toOpenApiSchema(value);
    }
  }
  return out;
}

/** Gemini 3 tenker før svaret; «low» gir kortest ventetid. Avlesning av bilder trenger lite resonnering. */
export function thinkingLevelFor(model) {
  return /^gemini-3/i.test(model ?? "") ? "low" : null;
}

export async function buildRequest(images, contract, { legacySchema = false, thinkingLevel = null } = {}) {
  const parts = [];
  for (const [i, img] of images.entries()) {
    const label = contract.role_labels[img.role] ?? img.role ?? "";
    parts.push({ text: label ? `Bilde ${i + 1}: ${label}` : `Bilde ${i + 1}` });
    parts.push({ inline_data: { mime_type: img.blob.type || "image/jpeg", data: await toBase64(img.blob) } });
  }
  parts.push({ text: contract.user_instruction });
  const generationConfig = { responseMimeType: "application/json", temperature: 0 };
  if (legacySchema) generationConfig.responseSchema = toOpenApiSchema(contract.schema);
  else generationConfig.responseJsonSchema = contract.schema;
  if (thinkingLevel) generationConfig.thinkingConfig = { thinkingLevel };
  return {
    systemInstruction: { parts: [{ text: contract.system_prompt }] },
    contents: [{ role: "user", parts }],
    generationConfig,
  };
}

function errorFor(status, message, model) {
  if (status === 400 && /api key/i.test(message)) return "API-nøkkelen er ugyldig. Sjekk den i innstillingene.";
  if (status === 403) return "Google avviste nøkkelen. Sjekk at API-begrensningen tillater Generative Language API " +
    "og at nettstedsbegrensningen gjelder denne adressen.";
  if (status === 404) return `Modellen «${model}» finnes ikke eller er utgått. Bytt modell i innstillingene.`;
  if (status === 429) return "Kvoten for bildeanalysen er brukt opp, eller det sendes for fort. Vent litt og prøv igjen.";
  if (status >= 500) return "Bildeanalysen har problemer akkurat nå. Prøv igjen om litt.";
  return `Bildeanalysen feilet (HTTP ${status}).`;
}

async function post(url, key, body, signal) {
  let res;
  try {
    res = await fetch(url, {
      method: "POST", signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
    });
  } catch (err) {
    if (err.name === "AbortError") throw new VisionError("Det tok for lang tid. Sjekk nettet og prøv igjen.");
    throw new VisionError("Fikk ikke kontakt med bildeanalysen. Sjekk nettforbindelsen.");
  }
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data, message: data?.error?.message ?? "" };
}

export function parseGemini(data) {
  if (data?.promptFeedback?.blockReason) throw new VisionError("Bildeanalysen avviste bildene.");
  const candidate = data?.candidates?.[0];
  const text = (candidate?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
  if (!text) {
    if (candidate?.finishReason === "MAX_TOKENS") throw new VisionError("Svaret ble kuttet. Prøv igjen.");
    throw new VisionError("Bildeanalysen ga ikke noe svar. Prøv igjen.");
  }
  try {
    return toFacts(JSON.parse(text.replace(/^```(json)?\s*|\s*```$/g, "")));
  } catch (err) {
    if (err instanceof VisionError) throw err;
    throw new VisionError("Bildeanalysen ga et ugyldig svar. Prøv igjen.");
  }
}

export async function analyzeWithGemini(images, contract, { key, model = DEFAULT_MODEL, signal } = {}) {
  if (!key) throw new VisionError("Legg inn en Gemini-nøkkel i innstillingene, eller bruk demomodus.");
  const url = `${API}/models/${encodeURIComponent(model)}:generateContent`;
  let thinkingLevel = thinkingLevelFor(model);
  let result = await post(url, key, await buildRequest(images, contract, { thinkingLevel }), signal);
  // Godtar ikke modellen tenkenivået, prøver vi igjen uten.
  if (result.status === 400 && thinkingLevel && /thinking/i.test(result.message)) {
    thinkingLevel = null;
    result = await post(url, key, await buildRequest(images, contract), signal);
  }
  // Godtas ikke full JSON Schema, prøver vi én gang med OpenAPI-varianten.
  if (result.status === 400 && /response_?json_?schema|responseJsonSchema|unknown name|schema/i.test(result.message)) {
    result = await post(url, key, await buildRequest(images, contract, { legacySchema: true, thinkingLevel }), signal);
  }
  if (!result.ok) throw new VisionError(errorFor(result.status, result.message, model));
  return parseGemini(result.data);
}

/** Sjekker nøkkel og modell uten å sende bilder. */
export async function testKey(key, model = DEFAULT_MODEL) {
  try {
    const res = await fetch(`${API}/models/${encodeURIComponent(model)}`, { headers: { "x-goog-api-key": key } });
    if (res.ok) return { ok: true, message: `Nøkkelen virker, og modellen «${model}» er tilgjengelig.` };
    const data = await res.json().catch(() => ({}));
    return { ok: false, message: errorFor(res.status, data?.error?.message ?? "", model) };
  } catch {
    return { ok: false, message: "Fikk ikke kontakt med Google. Sjekk nettforbindelsen." };
  }
}

export function mockFacts(contract, scenario) {
  const all = contract.mock_scenarios;
  return structuredClone(all[scenario] ?? all.monard_key_wind);
}
