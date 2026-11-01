// Bildesøk med Google Cloud Vision («Web Detection»), som Google Lens:
// finner sider på nettet med samme eller lignende bilde, og Googles beste gjetning på hva det er.
// Resultatet brukes som spor for nettsøket. Priser hentes fortsatt bare fra sider med kilde.

const API = "https://vision.googleapis.com/v1/images:annotate";
const SENDABLE = /^image\/(jpeg|png|webp|gif|bmp)$/i;

const strip = (s) => String(s ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

function host(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return null; }
}

/** Gjør Vision-svaret om til det appen trenger. Ren funksjon, testes uten nett. */
export function parseWebDetection(data) {
  const res = data?.responses?.[0] ?? {};
  if (res.error) return { ok: false, reason: "error", message: res.error.message ?? "Bildesøket feilet." };
  const wd = res.webDetection ?? {};
  const guess = (wd.bestGuessLabels ?? []).map((l) => strip(l.label)).filter(Boolean);
  const entities = (wd.webEntities ?? [])
    .filter((e) => e.description && (e.score ?? 0) >= 0.3)
    .map((e) => ({ name: strip(e.description), score: e.score ?? 0 }))
    .slice(0, 8);
  const similar = [...new Set((wd.visuallySimilarImages ?? []).map((i) => i.url).filter((u) => /^https?:\/\//.test(u ?? "")))].slice(0, 12);
  const seen = new Set();
  const pages = [];
  for (const p of wd.pagesWithMatchingImages ?? []) {
    const h = host(p.url);
    if (!h || seen.has(p.url)) continue;
    seen.add(p.url);
    pages.push({ url: p.url, title: strip(p.pageTitle) || h, site: h, full: (p.fullMatchingImages ?? []).length > 0 });
  }
  pages.sort((a, b) => Number(b.full) - Number(a.full));
  return { ok: true, guess, entities, pages: pages.slice(0, 10), similar };
}

/** Feilmelding fra Google → kort forklaring på norsk. */
export function lensError(status, body) {
  const err = body?.error ?? {};
  const reasons = (err.details ?? []).map((d) => d.reason).filter(Boolean).join(" ");
  const text = `${err.status ?? ""} ${reasons} ${err.message ?? ""}`;
  if (/SERVICE_DISABLED|has not been used|is disabled/i.test(text)) {
    return { ok: false, reason: "disabled", message: "Cloud Vision API er ikke slått på i Google Cloud-prosjektet til nøkkelen." };
  }
  if (/API_KEY_SERVICE_BLOCKED|are blocked/i.test(text)) {
    return { ok: false, reason: "blocked", message: "Nøkkelen har ikke lov til å bruke Cloud Vision API. Legg den til under API-begrensninger for nøkkelen." };
  }
  if (/BILLING/i.test(text)) {
    return { ok: false, reason: "billing", message: "Cloud Vision krever at fakturering er slått på i prosjektet." };
  }
  if (status === 429) return { ok: false, reason: "quota", message: "For mange bildesøk akkurat nå. Prøv igjen litt senere." };
  return { ok: false, reason: "error", message: err.message ? `Bildesøket feilet: ${err.message}` : `Bildesøket feilet (${status}).` };
}

async function toBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function buildLensRequest(base64) {
  return {
    requests: [{
      image: { content: base64 },
      features: [{ type: "WEB_DETECTION", maxResults: 15 }],
      imageContext: { webDetectionParams: { includeGeoResults: true }, languageHints: ["no", "en"] },
    }],
  };
}

/** Søker med bildet. Kaster aldri: svarer { ok:false, reason, message } ved feil. */
export async function webDetect(blob, key, { signal } = {}) {
  if (!blob || !SENDABLE.test(blob.type || "image/jpeg")) {
    return { ok: false, reason: "format", message: "Bildeformatet kan ikke brukes i bildesøket." };
  }
  try {
    const res = await fetch(API, {
      method: "POST", signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(buildLensRequest(await toBase64(blob))),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return lensError(res.status, body);
    return parseWebDetection(body);
  } catch (err) {
    if (err.name === "AbortError") return { ok: false, reason: "aborted", message: "Avbrutt." };
    return { ok: false, reason: "network", message: "Fikk ikke kontakt med bildesøket." };
  }
}

/** Kort engelsk tekst til nettsøket: hva bildesøket fant. */
export function lensLeads(lens) {
  if (!lens?.ok) return "";
  const lines = [];
  if (lens.guess.length) lines.push(`Google image search best guess: ${lens.guess.join("; ")}`);
  if (lens.entities.length) lines.push(`Related entities: ${lens.entities.map((e) => e.name).join(", ")}`);
  if (lens.pages.length) {
    lines.push(`Pages showing the same or a very similar photo:\n${lens.pages.slice(0, 8)
      .map((p) => `- ${p.title} (${p.url})`).join("\n")}`);
  }
  return lines.join("\n");
}

export const lensDomains = (lens) => (lens?.ok ? lens.pages.map((p) => p.site) : []);
