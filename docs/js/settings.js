// Innstillinger lagres bare i denne nettleseren (localStorage). Nøkkelen sendes kun til Google.

import { DEFAULT_MODEL } from "./vision.js";

const STORE = "lommeur.settings.v1";

export function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) ?? "{}");
    return { key: saved.key ?? "", model: saved.model || DEFAULT_MODEL, demo: saved.demo === true, lens: saved.lens !== false, visionKey: saved.visionKey ?? "" };
  } catch {
    return { key: "", model: DEFAULT_MODEL, demo: false, lens: true, visionKey: "" };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORE, JSON.stringify(settings));
    return true;
  } catch {
    return false; // f.eks. privat nettleservindu
  }
}

export function clearSettings() {
  try { localStorage.removeItem(STORE); } catch { /* ingenting å slette */ }
}

// Uten nøkkel er det alltid demo; med nøkkel kan demo slås på manuelt.
/** Nøkkelen bildesøket bruker: egen nøkkel hvis den finnes, ellers Gemini-nøkkelen. */
export const lensKey = (s) => s.visionKey || s.key;

export const isLive = (s) => !s.demo && !!s.key;
