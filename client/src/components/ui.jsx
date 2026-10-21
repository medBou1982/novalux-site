// Petits composants partagés par la boutique et l'admin.
import { useId } from 'react';

export function Field({ label, error, hint, as = 'input', children, className = '', ...props }) {
  const id = useId();
  const Tag = as;
  return (
    <div className={`field ${error ? 'field--error' : ''} ${className}`}>
      <label htmlFor={id}>{label}</label>
      <Tag id={id} aria-invalid={!!error} aria-describedby={error || hint ? `${id}-msg` : undefined} {...props}>{children}</Tag>
      {(error || hint) && <p id={`${id}-msg`} className="field__msg">{error || hint}</p>}
    </div>
  );
}

export function Loading({ label = 'Chargement…' }) {
  return <p className="state state--loading" role="status">{label}</p>;
}

export function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="state state--error" role="alert">
      <p>{error.message || String(error)}</p>
      {onRetry && <button type="button" className="btn btn--ghost" onClick={onRetry}>Réessayer</button>}
    </div>
  );
}

export function QtyInput({ value, onChange, max = 999, label = 'Quantité' }) {
  return (
    <div className="qty" role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(Math.max(1, value - 1))} disabled={value <= 1} aria-label="Diminuer">−</button>
      <input
        type="number" inputMode="numeric" min="1" max={max} value={value}
        onChange={(e) => onChange(Math.min(max, Math.max(1, Number.parseInt(e.target.value, 10) || 1)))}
        aria-label={label}
      />
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="Augmenter">+</button>
    </div>
  );
}

export function Swatch({ hex, size = 18 }) {
  if (!hex) return null;
  return <span className="swatch" style={{ background: hex, width: size, height: size }} aria-hidden="true" />;
}
