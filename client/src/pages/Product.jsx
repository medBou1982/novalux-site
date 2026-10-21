import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useFetch } from '../lib/useFetch.js';
import { money, variantLabel } from '../lib/format.js';
import { useStore } from '../lib/store.jsx';
import ProductVisual from '../components/ProductVisual.jsx';
import ProductCard from '../components/ProductCard.jsx';
import { ErrorBox, Loading, QtyInput } from '../components/ui.jsx';

const unique = (arr) => [...new Set(arr.filter(Boolean))];

export default function Product() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const { data: p, error, loading, reload } = useFetch(() => api.get(`/products/${slug}`), [slug]);

  if (loading && !p) return <div className="wrap section"><Loading /></div>;
  if (error) return <div className="wrap section"><ErrorBox error={error} onRetry={error.status ? undefined : reload} /></div>;
  return <ProductView key={p.id} p={p} initialTint={params.get('teinte')} />;
}

function ProductView({ p, initialTint }) {
  const { addToCart, addToQuote } = useStore();
  const variants = p.variants;
  const sizes = unique(variants.map((v) => v.option1));
  const tints = unique(variants.map((v) => v.option2));

  const initial = variants.find((v) => v.option2 === initialTint && v.stock > 0)
    || variants.find((v) => v.option2 === initialTint)
    || variants.find((v) => v.stock > 0) || variants[0];
  const [o1, setO1] = useState(initial?.option1 || '');
  const [o2, setO2] = useState(initial?.option2 || '');
  const [qty, setQty] = useState(1);
  const [quoteQty, setQuoteQty] = useState('');
  const [image, setImage] = useState(0);

  const variant = useMemo(() => variants.find((v) => v.option1 === o1 && v.option2 === o2)
    || variants.find((v) => v.option1 === o1) || null, [variants, o1, o2]);
  useEffect(() => { if (variant && variant.option2 !== o2) setO2(variant.option2); }, [variant, o2]);
  useEffect(() => { setQty(1); }, [variant?.id]);

  const tintHex = (t) => variants.find((v) => v.option2 === t && v.color_hex)?.color_hex;
  const tintAvailable = (t) => variants.some((v) => v.option1 === o1 && v.option2 === t);
  const tintInStock = (t) => variants.some((v) => v.option1 === o1 && v.option2 === t && v.stock > 0);
  const hasSwatches = tints.some((t) => tintHex(t));

  const stock = variant?.stock ?? 0;
  const stockText = stock <= 0 ? 'En rupture de stock' : stock <= 5 ? `Plus que ${stock} en stock` : 'En stock, expédié sous 48 h';

  const add = () => {
    if (!variant) return;
    addToCart({
      variant_id: variant.id, product_id: p.id, product_slug: p.slug, product_name: p.name, label: variantLabel(variant),
      sku: variant.sku, price: variant.price, color_hex: variant.color_hex, image_url: p.images[0]?.url, stock: variant.stock,
    }, qty);
  };

  const addQuote = () => addToQuote({
    product_id: p.id, product_name: p.name, product_slug: p.slug,
    variant_id: variant?.id || null, label: variant ? variantLabel(variant) : '', quantity: quoteQty || '',
  });

  return (
    <div className="wrap section">
      <nav className="crumbs" aria-label="Fil d’Ariane">
        <Link to="/">Accueil</Link>
        {p.parent_category_slug && <> / <Link to={`/gamme/${p.parent_category_slug}`}>{p.parent_category_name}</Link></>}
        {p.category_slug && <> / <Link to={`/gamme/${p.category_slug}`}>{p.category_name}</Link></>}
      </nav>

      <div className="product">
        <div className="product__media">
          <ProductVisual image={p.images[image]?.url} color={variant?.color_hex} name={p.name} quoteOnly={p.quote_only} className="visual--large" />
          {p.images.length > 1 && (
            <div className="thumbs">
              {p.images.map((img, i) => (
                <button key={img.id} type="button" onClick={() => setImage(i)} aria-pressed={i === image} aria-label={`Photo ${i + 1}`}>
                  <img src={img.url} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="product__info">
          <h1>{p.name}</h1>
          {variant && <p className="product__sku">Réf. {variant.sku}</p>}

          {!p.quote_only && variant && (
            <p className="product__price">
              {money(variant.price)}
              {variant.compare_price > variant.price && <s>{money(variant.compare_price)}</s>}
            </p>
          )}
          {p.quote_only && <p className="product__price product__price--quote">Prix sur devis, selon volume et teinte</p>}

          {sizes.length > 0 && (
            <fieldset className="opt">
              <legend>{p.option1_name || 'Option'}</legend>
              <div className="opt__buttons">
                {sizes.map((s) => (
                  <button key={s} type="button" aria-pressed={s === o1} onClick={() => setO1(s)}>{s}</button>
                ))}
              </div>
            </fieldset>
          )}

          {tints.length > 0 && (
            <fieldset className="opt">
              <legend>{p.option2_name || 'Teinte'} : <b>{o2}</b></legend>
              {hasSwatches ? (
                <div className="tints">
                  {tints.map((t) => (
                    <button
                      key={t} type="button" title={t} aria-label={t} aria-pressed={t === o2}
                      disabled={!tintAvailable(t)}
                      className={tintInStock(t) ? '' : 'tint--out'}
                      style={{ '--c': tintHex(t) || '#ccc' }}
                      onClick={() => setO2(t)}
                    />
                  ))}
                </div>
              ) : (
                <div className="opt__buttons">
                  {tints.map((t) => <button key={t} type="button" aria-pressed={t === o2} onClick={() => setO2(t)} disabled={!tintAvailable(t)}>{t}</button>)}
                </div>
              )}
            </fieldset>
          )}

          {!p.quote_only ? (
            <div className="buy">
              <p className={`stock ${stock <= 0 ? 'stock--out' : stock <= 5 ? 'stock--low' : ''}`}>{stockText}</p>
              <div className="buy__row">
                <QtyInput value={qty} onChange={setQty} max={Math.max(1, stock)} />
                <button type="button" className="btn btn--big" onClick={add} disabled={!variant || stock <= 0}>Ajouter au panier</button>
              </div>
              <p className="buy__alt">Grosse quantité ? <button type="button" className="link" onClick={addQuote}>Ajouter à une demande de devis</button></p>
            </div>
          ) : (
            <div className="buy">
              <label className="field">
                <span>Quantité souhaitée</span>
                <input value={quoteQty} onChange={(e) => setQuoteQty(e.target.value)} placeholder="ex. 200 kg, 4 fûts" />
              </label>
              <div className="buy__row">
                <button type="button" className="btn btn--big" onClick={addQuote}>Ajouter à ma demande de devis</button>
              </div>
              <p className="buy__alt"><Link to="/devis" className="link">Voir ma demande de devis</Link></p>
            </div>
          )}

          <div className="product__desc">
            {p.description.split(/\n{2,}/).map((para, i) => <p key={i}>{para}</p>)}
          </div>
        </div>
      </div>

      {p.related.length > 0 && (
        <section className="section">
          <div className="section__head"><h2>Dans la même gamme</h2></div>
          <div className="grid">{p.related.map((r) => <ProductCard key={r.id} product={r} />)}</div>
        </section>
      )}
    </div>
  );
}
