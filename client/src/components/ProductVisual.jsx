// Visuel par défaut quand un produit n'a pas de photo : un pot de peinture
// teinté avec la couleur sélectionnée.
export default function ProductVisual({ image, color, name, quoteOnly, className = '' }) {
  if (image) {
    return (
      <div className={`visual ${className}`}>
        <img src={image} alt={name} loading="lazy" />
      </div>
    );
  }
  const fill = /^#[0-9a-f]{6}$/i.test(color || '') ? color : quoteOnly ? '#5A6275' : '#1F3A93';
  return (
    <div className={`visual visual--drawn ${className}`} style={{ '--paint': fill }}>
      <svg viewBox="0 0 120 120" role="img" aria-label={name}>
        {quoteOnly ? (
          // Fût industriel
          <g>
            <rect x="32" y="22" width="56" height="80" rx="6" fill="var(--paint)" />
            <rect x="32" y="22" width="56" height="80" rx="6" fill="url(#shade)" />
            <rect x="29" y="40" width="62" height="5" rx="2.5" fill="rgba(0,0,0,.18)" />
            <rect x="29" y="78" width="62" height="5" rx="2.5" fill="rgba(0,0,0,.18)" />
            <rect x="44" y="16" width="14" height="8" rx="2" fill="#2A3350" />
          </g>
        ) : (
          // Pot de peinture
          <g>
            <rect x="26" y="38" width="68" height="62" rx="8" fill="var(--paint)" />
            <rect x="26" y="38" width="68" height="62" rx="8" fill="url(#shade)" />
            <rect x="22" y="28" width="76" height="14" rx="5" fill="#E9ECF2" stroke="#C9CFDA" />
            <rect x="34" y="58" width="52" height="22" rx="3" fill="#FFFFFF" opacity=".92" />
            <rect x="40" y="65" width="28" height="3" rx="1.5" fill="#1F3A93" />
            <rect x="40" y="71" width="18" height="3" rx="1.5" fill="#B9C0CD" />
          </g>
        )}
        <defs>
          <linearGradient id="shade" x1="0" x2="1">
            <stop offset="0" stopColor="#fff" stopOpacity=".18" />
            <stop offset=".55" stopColor="#fff" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity=".16" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}
