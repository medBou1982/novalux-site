import { Link } from 'react-router-dom';
import { useStore } from '../lib/store.jsx';
import { money } from '../lib/format.js';
import { QtyInput, Swatch } from '../components/ui.jsx';

export function ShippingNote() {
  const { subtotal, settings } = useStore();
  const { free_threshold } = settings.shipping;
  if (!free_threshold) return null;
  const left = free_threshold - subtotal;
  const pct = Math.min(100, Math.round((subtotal / free_threshold) * 100));
  return (
    <div className="ship-note">
      <p>{left > 0 ? <>Plus que <b>{money(left)}</b> pour la livraison offerte.</> : 'Livraison offerte.'}</p>
      <div className="ship-note__bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

export function Summary({ children }) {
  const { subtotal, shipping, total } = useStore();
  return (
    <aside className="summary">
      <h2>Récapitulatif</h2>
      <dl>
        <div><dt>Sous-total</dt><dd>{money(subtotal)}</dd></div>
        <div><dt>Livraison</dt><dd>{shipping ? money(shipping) : 'Offerte'}</dd></div>
        <div className="summary__total"><dt>Total TTC</dt><dd>{money(total)}</dd></div>
      </dl>
      <ShippingNote />
      {children}
    </aside>
  );
}

export default function Cart() {
  const { cart, setQty, removeFromCart } = useStore();

  if (!cart.length) {
    return (
      <div className="wrap section empty">
        <h1>Votre panier est vide</h1>
        <p>Parcourez le nuancier et ajoutez vos couleurs.</p>
        <Link to="/gamme/beaux-arts" className="btn">Voir les beaux-arts</Link>
      </div>
    );
  }

  return (
    <div className="wrap section">
      <header className="page-head"><h1>Panier</h1></header>
      <div className="checkout">
        <ul className="lines">
          {cart.map((l) => (
            <li key={l.variant_id} className="line">
              <span className="line__chip" style={{ background: l.color_hex || 'var(--wash)' }}>
                {l.image_url && <img src={l.image_url} alt="" />}
              </span>
              <div className="line__main">
                <Link to={`/produit/${l.product_slug}`} className="line__name">{l.product_name}</Link>
                <p className="line__meta"><Swatch hex={l.color_hex} size={12} /> {l.label} · Réf. {l.sku}</p>
                <button type="button" className="link link--danger" onClick={() => removeFromCart(l.variant_id)}>Retirer</button>
              </div>
              <QtyInput value={l.quantity} onChange={(n) => setQty(l.variant_id, n)} max={l.stock || 999} />
              <p className="line__price">{money(l.price * l.quantity)}<small>{money(l.price)} l’unité</small></p>
            </li>
          ))}
        </ul>
        <Summary>
          <Link to="/commande" className="btn btn--big btn--block">Passer la commande</Link>
          <Link to="/gamme/beaux-arts" className="link">Continuer mes achats</Link>
        </Summary>
      </div>
    </div>
  );
}
