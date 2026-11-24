export const ENGINE_VERSION = 1;
export function validateSet(set) {
  if (set.engine !== ENGINE_VERSION) throw new Error(`Versione engine ${set.engine ?? 'assente'} non supportata (richiesta ${ENGINE_VERSION})`);
  if (!Array.isArray(set.slides) || !set.slides.length || !Array.isArray(set.elements) || !set.platforms || !Object.keys(set.platforms).length || !Array.isArray(set.locales) || !set.locales.length) throw new Error('Set incompleto');
  const ids = new Set();
  for (const el of set.elements) {
    if (typeof el.id !== 'string' || !el.id || ids.has(el.id)) throw new Error('ID elemento mancante o duplicato');
    ids.add(el.id);
    for (const v of [el, ...Object.values(el.over ?? {})]) for (const key of ['x','y','w','h','rot','z']) if (key in v && !Number.isFinite(v[key])) throw new Error(`Coordinata ${key} non valida: ${el.id}`);
    if (!Number.isFinite(el.x) || !Number.isFinite(el.y)) throw new Error(`Coordinate mancanti: ${el.id}`);
    if (!(el.w > 0)) throw new Error(`Larghezza non valida: ${el.id}`);
  }
  for (const p of Object.values(set.platforms)) if (!Number.isInteger(p.w) || !Number.isInteger(p.h) || p.w < 1 || p.h < 1 || p.w > 10000 || p.h > 10000) throw new Error('Dimensioni piattaforma non valide');
  return set;
}
