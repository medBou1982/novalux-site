import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { adminApi } from '../lib/api.js';
import { useFetch } from '../lib/useFetch.js';
import { toDinars, toMillimes } from '../lib/format.js';
import { ErrorBox, Field, Loading } from '../components/ui.jsx';
import { PageHead } from './AdminApp.jsx';

const EMPTY = {
  name: '', slug: '', category_id: '', description: '', quote_only: false, is_active: true, is_featured: false, is_new: false,
  option1_name: 'Contenance', option2_name: 'Couleur', variants: [], images: [],
};

let tmpId = 0;
const toRow = (v) => ({
  key: v.id ? `v${v.id}` : `n${++tmpId}`, id: v.id, sku: v.sku || '', option1: v.option1 || '', option2: v.option2 || '',
  color_hex: v.color_hex || '', price: v.price != null ? toDinars(v.price) : '', compare_price: v.compare_price ? toDinars(v.compare_price) : '',
  stock: v.stock ?? 0, is_active: v.is_active ?? true,
});

export default function ProductEdit() {
  const { id } = useParams();
  const isNew = !id;
  const { data, error, loading } = useFetch(() => (isNew ? Promise.resolve(EMPTY) : adminApi.get(`/products/${id}`)), [id]);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  return <Editor key={id || 'new'} initial={data} isNew={isNew} />;
}

function Editor({ initial, isNew }) {
  const navigate = useNavigate();
  const cats = useFetch(() => adminApi.get('/categories'), []);
  const [p, setP] = useState(() => ({ ...initial, category_id: initial.category_id || '' }));
  const [rows, setRows] = useState(() => initial.variants.map(toRow));
  const [images, setImages] = useState(initial.images || []);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('');
  const [showGen, setShowGen] = useState(isNew);
  const dirty = useRef(false);

  useEffect(() => {
    const warn = (e) => { if (dirty.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const set = (k) => (e) => { dirty.current = true; setP((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })); };
  const setRow = (key, patch) => { dirty.current = true; setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x))); };
  const removeRow = (key) => { dirty.current = true; setRows((r) => r.filter((x) => x.key !== key)); };
  const addRow = () => setRows((r) => [...r, toRow({ option1: filter || '' })]);

  const groups = useMemo(() => [...new Set(rows.map((r) => r.option1).filter(Boolean))], [rows]);
  const visible = filter ? rows.filter((r) => r.option1 === filter) : rows;

  const save = async (e) => {
    e?.preventDefault();
    setSaving(true);
    setErrors({});
    setMessage(null);
    const body = {
      ...p,
      category_id: p.category_id || null,
      variants: rows.map((r) => ({
        id: r.id, sku: r.sku, option1: r.option1, option2: r.option2, color_hex: r.color_hex,
        price: toMillimes(r.price), compare_price: r.compare_price ? toMillimes(r.compare_price) : null,
        stock: Number(r.stock) || 0, is_active: r.is_active,
      })),
    };
    try {
      const res = isNew ? await adminApi.post('/products', body) : await adminApi.put(`/products/${p.id}`, body);
      dirty.current = false;
      if (isNew) { navigate(`/admin/produits/${res.id}`, { replace: true }); return; }
      const fresh = await adminApi.get(`/products/${p.id}`);
      setP({ ...fresh, category_id: fresh.category_id || '' });
      setRows(fresh.variants.map(toRow));
      setMessage({ ok: true, text: 'Produit enregistré.' });
    } catch (err) {
      setErrors(err.details || {});
      setMessage({ ok: false, text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Supprimer définitivement « ${p.name} » et ses ${rows.length} variantes ? Les commandes passées restent consultables.`)) return;
    await adminApi.del(`/products/${p.id}`);
    dirty.current = false;
    navigate('/admin/produits', { replace: true });
  };

  const rowError = (i, field) => errors[`variants.${rows.indexOf(visible[i])}.${field}`];

  return (
    <form onSubmit={save} noValidate>
      <PageHead title={isNew ? 'Nouveau produit' : p.name} back={{ to: '/admin/produits', label: 'Produits' }}>
        {!isNew && p.is_active && <a href={`/produit/${p.slug}`} target="_blank" rel="noreferrer" className="btn btn--ghost">Voir en boutique</a>}
        <button type="submit" className="btn" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
      </PageHead>
      {message && <p className={message.ok ? 'notice' : 'alert'} role="status">{message.text}</p>}

      <div className="cols cols--edit">
        <section className="card">
          <h2>Informations</h2>
          <Field label="Nom" value={p.name} onChange={set('name')} error={errors.name} />
          <Field label="Adresse de la page" value={p.slug} onChange={set('slug')} hint={`/produit/${p.slug || 'générée-depuis-le-nom'}`} />
          <Field label="Gamme" as="select" value={p.category_id} onChange={set('category_id')}>
            <option value="">Sans gamme</option>
            {cats.data?.map((c) => <option key={c.id} value={c.id}>{c.parent_id ? '— ' : ''}{c.name}</option>)}
          </Field>
          <Field label="Description" as="textarea" rows="7" value={p.description} onChange={set('description')} hint="Laissez une ligne vide entre deux paragraphes." />
        </section>

        <div className="stack">
          <section className="card">
            <h2>Publication</h2>
            <label className="check"><input type="checkbox" checked={p.is_active} onChange={set('is_active')} /> En ligne dans la boutique</label>
            <label className="check"><input type="checkbox" checked={p.quote_only} onChange={set('quote_only')} /> Vendu sur devis uniquement (pas de prix ni de panier)</label>
            <label className="check"><input type="checkbox" checked={p.is_featured} onChange={set('is_featured')} /> Dans « Les incontournables »</label>
            <label className="check"><input type="checkbox" checked={p.is_new} onChange={set('is_new')} /> Dans « Les nouveautés »</label>
          </section>

          <section className="card">
            <h2>Photos</h2>
            {isNew ? <p className="muted">Enregistrez le produit pour ajouter des photos. Sans photo, la boutique affiche un pot teinté avec la couleur choisie.</p>
              : <Images productId={p.id} images={images} setImages={setImages} />}
          </section>
        </div>
      </div>

      <section className="card">
        <div className="card__head">
          <h2>Variantes <small className="muted">({rows.length})</small></h2>
          <div className="row">
            <button type="button" className="btn btn--ghost btn--small" onClick={() => setShowGen((s) => !s)}>Générer des variantes</button>
            <button type="button" className="btn btn--ghost btn--small" onClick={addRow}>Ajouter une ligne</button>
          </div>
        </div>
        <div className="form__grid form__grid--3">
          <Field label="Nom de l’option 1" value={p.option1_name} onChange={set('option1_name')} placeholder="ex. Contenance" />
          <Field label="Nom de l’option 2" value={p.option2_name} onChange={set('option2_name')} placeholder="ex. Couleur" />
        </div>

        {showGen && <Generator existing={rows} onAdd={(newRows) => { dirty.current = true; setRows((r) => [...r, ...newRows]); setShowGen(false); }} />}

        {groups.length > 1 && (
          <div className="tabs">
            <button type="button" aria-selected={!filter} onClick={() => setFilter('')}>Toutes <b>{rows.length}</b></button>
            {groups.map((g) => (
              <button key={g} type="button" aria-selected={filter === g} onClick={() => setFilter(g)}>{g} <b>{rows.filter((r) => r.option1 === g).length}</b></button>
            ))}
          </div>
        )}
        {filter && !p.quote_only && <BulkPrice rows={visible} onApply={(price) => visible.forEach((r) => setRow(r.key, { price }))} label={filter} />}

        {rows.length === 0 ? (
          <p className="muted">{p.quote_only ? 'Optionnel pour un produit sur devis : ajoutez des variantes si le client doit choisir une teinte ou un conditionnement.' : 'Ajoutez au moins une variante pour vendre ce produit.'}</p>
        ) : (
          <div className="table-scroll">
            <table className="table table--edit">
              <thead>
                <tr>
                  <th>Référence</th><th>{p.option1_name || 'Option 1'}</th><th>{p.option2_name || 'Option 2'}</th><th>Pastille</th>
                  {!p.quote_only && <><th>Prix (DT)</th><th>Prix barré</th><th>Stock</th></>}
                  <th>Active</th><th aria-label="Supprimer" />
                </tr>
              </thead>
              <tbody>
                {visible.map((r, i) => (
                  <tr key={r.key} className={r.is_active ? '' : 'is-off'}>
                    <td><input value={r.sku} onChange={(e) => setRow(r.key, { sku: e.target.value })} aria-label="Référence" aria-invalid={!!rowError(i, 'sku')} title={rowError(i, 'sku')} className="w-sku" /></td>
                    <td><input value={r.option1} onChange={(e) => setRow(r.key, { option1: e.target.value })} aria-label={p.option1_name} /></td>
                    <td><input value={r.option2} onChange={(e) => setRow(r.key, { option2: e.target.value })} aria-label={p.option2_name} /></td>
                    <td>
                      <span className="color-pick">
                        <input type="color" value={r.color_hex || '#ffffff'} onChange={(e) => setRow(r.key, { color_hex: e.target.value.toUpperCase() })} aria-label="Couleur de la pastille" />
                        <input value={r.color_hex} onChange={(e) => setRow(r.key, { color_hex: e.target.value })} placeholder="aucune" aria-label="Code couleur" aria-invalid={!!rowError(i, 'color_hex')} className="w-hex" />
                      </span>
                    </td>
                    {!p.quote_only && (
                      <>
                        <td><input inputMode="decimal" value={r.price} onChange={(e) => setRow(r.key, { price: e.target.value })} aria-label="Prix" aria-invalid={!!rowError(i, 'price')} className="w-num" /></td>
                        <td><input inputMode="decimal" value={r.compare_price} onChange={(e) => setRow(r.key, { compare_price: e.target.value })} aria-label="Prix barré" className="w-num" /></td>
                        <td><input type="number" value={r.stock} onChange={(e) => setRow(r.key, { stock: e.target.value })} aria-label="Stock" className={`w-num ${Number(r.stock) <= 5 ? 'is-low' : ''}`} /></td>
                      </>
                    )}
                    <td><input type="checkbox" checked={r.is_active} onChange={(e) => setRow(r.key, { is_active: e.target.checked })} aria-label="Variante active" /></td>
                    <td><button type="button" className="icon-btn" onClick={() => removeRow(r.key)} aria-label={`Supprimer ${r.sku || 'la ligne'}`}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="row row--between">
        {!isNew ? <button type="button" className="btn btn--danger" onClick={remove}>Supprimer le produit</button> : <span />}
        <button type="submit" className="btn" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
      </div>
    </form>
  );
}

/** Génère les combinaisons option1 × option2 en une fois (ex. 4 contenances × 28 couleurs). */
function Generator({ existing, onAdd }) {
  const [o1, setO1] = useState('');
  const [o2, setO2] = useState('');
  const [prefix, setPrefix] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('0');
  const list = (s) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  const a = list(o1).length ? list(o1) : [''];
  const b = list(o2).length ? list(o2) : [''];
  const count = list(o1).length || list(o2).length ? a.length * b.length : 0;

  const generate = () => {
    const taken = new Set(existing.map((r) => r.sku.toLowerCase()));
    const out = [];
    a.forEach((x, i) => b.forEach((y, j) => {
      let sku = [prefix || 'REF', i + 1, String(j + 1).padStart(2, '0')].join('-');
      while (taken.has(sku.toLowerCase())) sku += 'b';
      taken.add(sku.toLowerCase());
      out.push(toRow({ sku, option1: x, option2: y, price: toMillimes(price || 0), stock: Number(stock) || 0 }));
    }));
    onAdd(out);
  };

  return (
    <div className="generator">
      <p className="muted">Séparez les valeurs par des virgules. Les références sont créées automatiquement, vous pourrez les modifier ensuite.</p>
      <div className="form__grid">
        <Field label="Valeurs de l’option 1" value={o1} onChange={(e) => setO1(e.target.value)} placeholder="60 g, 125 g, 500 g, 1 kg" />
        <Field label="Valeurs de l’option 2" value={o2} onChange={(e) => setO2(e.target.value)} placeholder="Blanc 01, Jaune primaire 02, Magenta 03" />
        <Field label="Préfixe de référence" value={prefix} onChange={(e) => setPrefix(e.target.value.toUpperCase())} placeholder="ex. ACR" />
        <div className="form__grid">
          <Field label="Prix (DT)" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" />
          <Field label="Stock" type="number" value={stock} onChange={(e) => setStock(e.target.value)} />
        </div>
      </div>
      <button type="button" className="btn btn--small" disabled={!count} onClick={generate}>
        {count ? `Créer ${count} variante${count > 1 ? 's' : ''}` : 'Créer les variantes'}
      </button>
    </div>
  );
}

function BulkPrice({ rows, onApply, label }) {
  const [price, setPrice] = useState('');
  return (
    <div className="bulk">
      <span>Prix pour les {rows.length} variantes « {label} » :</span>
      <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="ex. 14,000" aria-label="Prix commun" />
      <button type="button" className="btn btn--ghost btn--small" disabled={!price} onClick={() => onApply(price)}>Appliquer</button>
    </div>
  );
}

function Images({ productId, images, setImages }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const upload = async (files) => {
    if (!files.length) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    [...files].forEach((f) => form.append('images', f));
    try {
      const added = await adminApi.upload(`/products/${productId}/images`, form);
      setImages((imgs) => [...imgs, ...added]);
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  const remove = async (img) => {
    await adminApi.del(`/images/${img.id}`);
    setImages((imgs) => imgs.filter((x) => x.id !== img.id));
  };
  const move = async (index, dir) => {
    const next = [...images];
    [next[index], next[index + dir]] = [next[index + dir], next[index]];
    setImages(next);
    await adminApi.put(`/products/${productId}/images/order`, { ids: next.map((x) => x.id) });
  };

  return (
    <>
      <ul className="img-list">
        {images.map((img, i) => (
          <li key={img.id}>
            <img src={img.url} alt="" />
            {i === 0 && <span className="img-list__main">Principale</span>}
            <div className="img-list__tools">
              <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Avancer">‹</button>
              <button type="button" disabled={i === images.length - 1} onClick={() => move(i, 1)} aria-label="Reculer">›</button>
              <button type="button" onClick={() => remove(img)} aria-label="Supprimer la photo">×</button>
            </div>
          </li>
        ))}
      </ul>
      <label className="btn btn--ghost btn--small upload">
        {busy ? 'Envoi…' : 'Ajouter des photos'}
        <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple onChange={(e) => { upload(e.target.files); e.target.value = ''; }} disabled={busy} />
      </label>
      <ErrorBox error={error} />
    </>
  );
}

