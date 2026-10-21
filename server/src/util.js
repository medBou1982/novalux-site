import crypto from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const httpError = (status, message, details) => new HttpError(status, message, details);

/** Enveloppe un handler async pour transmettre les erreurs à Express 4. */
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function slugify(text) {
  return String(text)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'element';
}

export const randomKey = (bytes = 16) => crypto.randomBytes(bytes).toString('hex');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validation minimale des champs requis. `spec` = { champ: 'libellé' } ou { champ: ['libellé', 'email'] }.
 * Renvoie un objet nettoyé (chaînes trimées) ou lève une erreur 400 avec la liste des champs fautifs.
 */
export function requireFields(body, spec) {
  const out = {};
  const errors = {};
  for (const [key, def] of Object.entries(spec)) {
    const [label, kind] = Array.isArray(def) ? def : [def];
    const value = typeof body?.[key] === 'string' ? body[key].trim() : '';
    if (!value) errors[key] = `${label} est obligatoire.`;
    else if (kind === 'email' && !EMAIL_RE.test(value)) errors[key] = 'Adresse e-mail invalide.';
    else if (kind === 'phone' && value.replace(/\D/g, '').length < 8) errors[key] = 'Numéro de téléphone invalide (8 chiffres min.).';
    out[key] = kind === 'email' ? value.toLowerCase() : value;
  }
  if (Object.keys(errors).length) throw httpError(400, 'Certains champs sont à corriger.', errors);
  return out;
}

export const str = (v, max = 5000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
export const int = (v, fallback = 0) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
};
export const bool = (v) => v === true || v === 'true' || v === 1 || v === '1';

export function pagination(query, defaultSize = 20) {
  const page = Math.max(1, int(query.page, 1));
  const size = Math.min(100, Math.max(1, int(query.size, defaultSize)));
  return { page, size, offset: (page - 1) * size };
}
