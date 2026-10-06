import { e as escapeXml, O as escapeAttr } from "./pagemeta.js";
const alterOf = (acc) => acc === "#" || acc === "♯" ? 1 : acc === "b" || acc === "♭" ? -1 : 0;
function harmonyXml(chord, offset = 0) {
  const m = /^([A-G])([#♯b♭]?)(.*)$/.exec(chord.trim());
  if (!m) {
    return `<direction placement="above"><direction-type><words>${escapeXml(chord)}</words></direction-type></direction>`;
  }
  const alter = alterOf(m[2]);
  let rest = m[3] ?? "";
  let bass = "";
  const slash = rest.indexOf("/");
  if (slash >= 0) {
    bass = rest.slice(slash + 1);
    rest = rest.slice(0, slash);
  }
  const kind = kindOf(rest);
  let xml = `<harmony><root><root-step>${m[1]}</root-step>` + (alter !== 0 ? `<root-alter>${alter}</root-alter>` : "") + `</root><kind text="${escapeAttr(rest)}">${kind}</kind>`;
  const b = /^([A-G])([#♯b♭]?)/.exec(bass);
  if (b) {
    const ba = alterOf(b[2]);
    xml += `<bass><bass-step>${b[1]}</bass-step>` + (ba !== 0 ? `<bass-alter>${ba}</bass-alter>` : "") + `</bass>`;
  }
  if (offset > 0) xml += `<offset>${Math.round(offset)}</offset>`;
  return xml + `</harmony>`;
}
function kindOf(suffix) {
  const s = suffix.toLowerCase();
  if (s === "") return "major";
  if (/^m(?!aj)/.test(s)) return s.includes("7") ? "minor-seventh" : "minor";
  if (s.startsWith("maj7")) return "major-seventh";
  if (s.startsWith("dim")) return "diminished";
  if (s.startsWith("aug") || s === "+") return "augmented";
  if (s.startsWith("sus")) return "suspended-fourth";
  if (s === "7") return "dominant";
  if (s === "6") return "major-sixth";
  if (s === "9") return "dominant-ninth";
  return "other";
}
export {
  harmonyXml as h
};
