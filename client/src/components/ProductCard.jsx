import { Link } from 'react-router-dom';
import ProductVisual from './ProductVisual.jsx';
import { priceRange } from '../lib/format.js';

export default function ProductCard({ product }) {
  const swatches = product.swatches || [];
  const shown = swatches.slice(0, 10);
  // Pour le visuel, on préfère une teinte franche au blanc ou au beige clair
  const lum = (h) => { const n = parseInt(h.slice(1), 16); return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; };
  const tint = swatches.find((h) => /^#[0-9a-f]{6}$/i.test(h) && lum(h) < 0.75) || swatches[0];
  return (
    <article className="pcard">
      <Link to={`/produit/${product.slug}`} className="pcard__link">
        <ProductVisual image={product.image_url} color={tint} name={product.name} quoteOnly={product.quote_only} />
        <div className="pcard__body">
          <p className="pcard__cat">{product.category_name}</p>
          <h3 className="pcard__name">{product.name}</h3>
          {shown.length > 1 && (
            <div className="pcard__swatches" aria-label={`${swatches.length} teintes`}>
              {shown.map((hex) => <span key={hex} style={{ background: hex }} />)}
              {swatches.length > shown.length && <em>+{swatches.length - shown.length}</em>}
            </div>
          )}
          <p className="pcard__price">
            {product.quote_only ? 'Prix sur devis' : priceRange(product.min_price, product.max_price)}
            {!product.quote_only && product.in_stock === false && <span className="tag tag--muted">Rupture</span>}
            {product.is_new && <span className="tag">Nouveau</span>}
          </p>
        </div>
      </Link>
    </article>
  );
}
