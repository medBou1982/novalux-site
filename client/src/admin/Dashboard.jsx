import { useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../lib/api.js';
import { useFetch } from '../lib/useFetch.js';
import { ORDER_STATUS, QUOTE_STATUS, dateTime, money } from '../lib/format.js';
import { ErrorBox, Loading, Swatch } from '../components/ui.jsx';
import { PageHead } from './AdminApp.jsx';

export default function Dashboard() {
  const { data: d, error, loading, reload } = useFetch(() => adminApi.get('/dashboard'), []);
  if (loading && !d) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  return (
    <>
      <PageHead title="Tableau de bord" />
      <div className="kpis">
        <Kpi label="Chiffre d’affaires, 30 jours" value={money(d.revenue_30d)} />
        <Kpi label="Commandes, 30 jours" value={d.orders_30d} />
        <Kpi label="À confirmer" value={d.to_process} to="/admin/commandes?statut=nouvelle" />
        <Kpi label="À expédier" value={d.to_ship} to="/admin/commandes?statut=confirmee" />
      </div>

      <section className="card">
        <h2>Ventes par jour, 30 derniers jours</h2>
        <RevenueChart days={d.daily} />
      </section>

      <div className="cols">
        <section className="card">
          <div className="card__head"><h2>Dernières commandes</h2><Link to="/admin/commandes" className="link">Toutes</Link></div>
          {d.recent_orders.length === 0 ? <p className="muted">Aucune commande pour l’instant.</p> : (
            <table className="table">
              <tbody>
                {d.recent_orders.map((o) => (
                  <tr key={o.id}>
                    <td><Link to={`/admin/commandes/${o.id}`} className="link">{o.number}</Link><small className="sub">{dateTime(o.created_at)}</small></td>
                    <td>{o.first_name} {o.last_name}</td>
                    <td><span className={`badge badge--${o.status}`}>{ORDER_STATUS[o.status]}</span></td>
                    <td className="num">{money(o.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <div className="stack">
          <section className="card">
            <div className="card__head"><h2>Devis à traiter</h2><Link to="/admin/devis" className="link">Tous</Link></div>
            {d.open_quotes.length === 0 ? <p className="muted">Aucune demande en attente.</p> : (
              <ul className="mini-list">
                {d.open_quotes.map((q) => (
                  <li key={q.id}>
                    <Link to={`/admin/devis/${q.id}`} className="link">{q.number}</Link>
                    <span>{q.company || `${q.first_name} ${q.last_name}`}</span>
                    <span className={`badge badge--${q.status}`}>{QUOTE_STATUS[q.status]}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <div className="card__head">
              <h2>Stock faible <small className="muted">({d.low_stock_total})</small></h2>
              <Link to="/admin/produits?statut=actif" className="link">Produits</Link>
            </div>
            {d.low_stock.length === 0 ? <p className="muted">Toutes les variantes ont plus de 5 unités.</p> : (
              <ul className="mini-list">
                {d.low_stock.map((v) => (
                  <li key={v.id}>
                    <Link to={`/admin/produits/${v.product_id}`} className="link"><Swatch hex={v.color_hex} size={12} /> {v.product_name}</Link>
                    <span className="muted">{[v.option1, v.option2].filter(Boolean).join(' · ')}</span>
                    <b className={v.stock <= 0 ? 'text-danger' : 'text-warn'}>{v.stock <= 0 ? 'Rupture' : `${v.stock} restants`}</b>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

function Kpi({ label, value, to }) {
  const inner = <><span className="kpi__value">{value}</span><span className="kpi__label">{label}</span></>;
  return to ? <Link to={to} className="kpi kpi--link">{inner}</Link> : <div className="kpi">{inner}</div>;
}

/** Histogramme d'une seule série (CA par jour), avec info-bulle au survol. */
function RevenueChart({ days }) {
  const [hover, setHover] = useState(null);
  const W = 720; const H = 220; const padL = 56; const padB = 26; const padT = 12;
  const max = Math.max(...days.map((d) => d.revenue), 1000);
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const plotW = W - padL; const plotH = H - padB - padT;
  const bw = plotW / days.length;
  const y = (v) => padT + plotH - (v / top) * plotH;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const label = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

  if (!days.some((d) => d.revenue > 0)) return <p className="muted">Pas encore de ventes sur la période.</p>;

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Chiffre d’affaires par jour sur 30 jours">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W} y1={y(t)} y2={y(t)} className="chart__grid" />
            <text x={padL - 8} y={y(t) + 4} textAnchor="end" className="chart__axis">{Math.round(t / 1000)}</text>
          </g>
        ))}
        <text x={0} y={padT - 2} className="chart__axis">DT</text>
        {days.map((d, i) => {
          const h = y(0) - y(d.revenue);
          const x = padL + i * bw + 1;
          const w = Math.max(1, bw - 2);
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={padL + i * bw} y={padT} width={bw} height={plotH} fill="transparent" />
              {d.revenue > 0 && (
                <path className={`chart__bar ${hover === i ? 'is-on' : ''}`}
                  d={`M${x},${y(0)} V${y(0) - h + Math.min(4, h)} q0,-${Math.min(4, h)} ${Math.min(4, w / 2)},-${Math.min(4, h)} H${x + w - Math.min(4, w / 2)} q${Math.min(4, w / 2)},0 ${Math.min(4, w / 2)},${Math.min(4, h)} V${y(0)} Z`} />
              )}
              {(i % 5 === 0 || i === days.length - 1) && (
                <text x={padL + i * bw + bw / 2} y={H - 6} textAnchor="middle" className="chart__axis">{label(d.day)}</text>
              )}
            </g>
          );
        })}
        <line x1={padL} x2={W} y1={y(0)} y2={y(0)} className="chart__base" />
      </svg>
      {hover !== null && (
        <div className="chart__tip" style={{ left: `${((padL + hover * bw + bw / 2) / W) * 100}%` }}>
          <b>{label(days[hover].day)}</b>
          <span>{money(days[hover].revenue)}</span>
          <span>{days[hover].orders} commande{days[hover].orders > 1 ? 's' : ''}</span>
        </div>
      )}
    </div>
  );
}

function niceStep(max) {
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw);
}
