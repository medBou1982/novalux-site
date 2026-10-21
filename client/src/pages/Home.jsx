import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useFetch } from '../lib/useFetch.js';
import { textOn } from '../lib/format.js';
import ProductCard from '../components/ProductCard.jsx';

export default function Home() {
  const acrylic = useFetch(() => api.get('/products/peinture-acrylique').catch(() => null), []);
  const featured = useFetch(() => api.get('/products?featured=1&size=8'), []);
  const news = useFetch(() => api.get('/products?new=1&size=8&tri=recent'), []);
  const categories = useFetch(() => api.get('/categories'), []);

  // Le nuancier : une pastille par teinte (première contenance trouvée)
  const chips = [];
  const seen = new Set();
  for (const v of acrylic.data?.variants || []) {
    if (v.color_hex && !seen.has(v.option2)) { seen.add(v.option2); chips.push(v); }
  }

  const ranges = (categories.data || []).filter((c) => !c.parent_id);
  const lines = (categories.data || []).filter((c) => c.parent_id);

  return (
    <>
      <section className="hero">
        <div className="wrap hero__text">
          <h1>{chips.length || 28} teintes d’acrylique, et tout ce qu’il faut pour peindre.</h1>
          <p>Novalux fabrique à Sfax des peintures pour l’atelier, la classe et l’industrie. Choisissez une couleur pour la commander.</p>
        </div>
        <ol className="fan" aria-label="Nuancier de la peinture acrylique">
          {chips.map((v, i) => {
            const [name, ref] = splitColor(v.option2);
            return (
              <li key={v.option2} style={{ '--c': v.color_hex, '--t': textOn(v.color_hex), '--i': i }}>
                <Link to={`/produit/peinture-acrylique?teinte=${encodeURIComponent(v.option2)}`}>
                  <span className="fan__ref">{ref}</span>
                  <span className="fan__name">{name}</span>
                </Link>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="wrap section">
        <div className="section__head">
          <h2>Les gammes</h2>
        </div>
        <div className="ranges">
          {ranges.map((r) => (
            <Link key={r.id} to={`/gamme/${r.slug}`} className={`range range--${r.slug}`}>
              <h3>{r.name}</h3>
              <p>{r.description}</p>
              <span className="range__meta">{r.product_count} produits</span>
            </Link>
          ))}
        </div>
        {lines.length > 0 && (
          <ul className="chips-nav">
            {lines.map((c) => <li key={c.id}><Link to={`/gamme/${c.slug}`}>{c.name}</Link></li>)}
          </ul>
        )}
      </section>

      <ProductStrip title="Les incontournables" items={featured.data?.items} to="/gamme/beaux-arts" />
      <ProductStrip title="Les nouveautés" items={news.data?.items} to="/nouveautes" />

      <section className="wrap section quote-band">
        <div>
          <h2>Un besoin industriel ou un gros volume ?</h2>
          <p>Encres flexo Novaflex, pâtes colorantes Novafoam, teintes sur mesure : notre équipe vous répond avec une offre chiffrée.</p>
        </div>
        <Link to="/devis" className="btn btn--light">Demander un devis</Link>
      </section>
    </>
  );
}

function ProductStrip({ title, items, to }) {
  if (!items?.length) return null;
  return (
    <section className="wrap section">
      <div className="section__head">
        <h2>{title}</h2>
        <Link to={to} className="link">Tout voir</Link>
      </div>
      <div className="grid">
        {items.slice(0, 4).map((p) => <ProductCard key={p.id} product={p} />)}
      </div>
    </section>
  );
}

/** « Bleu roi 04 » -> ['Bleu roi', '04'] */
export function splitColor(label = '') {
  const m = label.match(/^(.*?)\s+(\d{2,3})$/);
  return m ? [m[1], m[2]] : [label, ''];
}
