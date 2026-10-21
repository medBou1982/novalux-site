import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { adminApi } from '../lib/api.js';
import { useFetch } from '../lib/useFetch.js';
import { date } from '../lib/format.js';
import { ErrorBox, Field, Loading } from '../components/ui.jsx';
import { PageHead } from './AdminApp.jsx';

export default function Posts() {
  const { data, error, loading, reload } = useFetch(() => adminApi.get('/posts'), []);
  return (
    <>
      <PageHead title="Actualités">
        <Link to="/admin/actualites/nouveau" className="btn">Écrire une actualité</Link>
      </PageHead>
      {loading && !data && <Loading />}
      <ErrorBox error={error} onRetry={reload} />
      {data && (
        <div className="card card--flush">
          {data.length === 0 ? <p className="empty-row">Aucune actualité. Annoncez un nouveau produit ou un salon.</p> : (
            <table className="table">
              <thead><tr><th>Titre</th><th>Statut</th><th>Date</th></tr></thead>
              <tbody>
                {data.map((p) => (
                  <tr key={p.id}>
                    <td><Link to={`/admin/actualites/${p.id}`} className="link">{p.title}</Link><small className="sub clip">{p.excerpt}</small></td>
                    <td><span className={`badge ${p.published ? 'badge--livree' : ''}`}>{p.published ? 'Publiée' : 'Brouillon'}</span></td>
                    <td>{date(p.published_at || p.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  );
}

export function PostEdit() {
  const { id } = useParams();
  const { data, error, loading } = useFetch(
    () => (id ? adminApi.get(`/posts/${id}`) : Promise.resolve({ title: '', slug: '', excerpt: '', content: '', image_url: '', published: false })),
    [id],
  );
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  return <PostForm key={id || 'new'} initial={data} />;
}

function PostForm({ initial }) {
  const navigate = useNavigate();
  const [p, setP] = useState(initial);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null);
  const [uploading, setUploading] = useState(false);
  const set = (k) => (e) => setP((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setErrors({});
    try {
      const saved = p.id ? await adminApi.put(`/posts/${p.id}`, p) : await adminApi.post('/posts', p);
      if (!p.id) { navigate(`/admin/actualites/${saved.id}`, { replace: true }); return; }
      setP(saved);
      setMessage({ ok: true, text: saved.published ? 'Actualité publiée.' : 'Brouillon enregistré.' });
    } catch (err) {
      setErrors(err.details || {});
      setMessage({ ok: false, text: err.message });
    }
  };
  const remove = async () => {
    if (!window.confirm(`Supprimer « ${p.title} » ?`)) return;
    await adminApi.del(`/posts/${p.id}`);
    navigate('/admin/actualites', { replace: true });
  };
  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    const form = new FormData();
    form.append('image', file);
    try { const { url } = await adminApi.upload('/uploads', form); setP((x) => ({ ...x, image_url: url })); }
    catch (err) { setMessage({ ok: false, text: err.message }); }
    finally { setUploading(false); }
  };

  return (
    <form onSubmit={save} noValidate>
      <PageHead title={p.id ? p.title || 'Actualité' : 'Nouvelle actualité'} back={{ to: '/admin/actualites', label: 'Actualités' }}>
        {p.id && p.published && <a href={`/actualites/${p.slug}`} target="_blank" rel="noreferrer" className="btn btn--ghost">Voir</a>}
        <button type="submit" className="btn">{p.published ? 'Enregistrer et publier' : 'Enregistrer le brouillon'}</button>
      </PageHead>
      {message && <p className={message.ok ? 'notice' : 'alert'} role="status">{message.text}</p>}
      <div className="cols cols--edit">
        <section className="card">
          <Field label="Titre" value={p.title} onChange={set('title')} error={errors.title} />
          <Field label="Résumé" as="textarea" rows="2" value={p.excerpt} onChange={set('excerpt')} hint="Affiché dans la liste des actualités." />
          <Field label="Texte" as="textarea" rows="14" value={p.content} onChange={set('content')} hint="Laissez une ligne vide entre deux paragraphes." />
        </section>
        <div className="stack">
          <section className="card">
            <h2>Publication</h2>
            <label className="check"><input type="checkbox" checked={p.published} onChange={set('published')} /> Publiée sur le site</label>
            <Field label="Adresse" value={p.slug} onChange={set('slug')} hint="Générée depuis le titre si vide." />
          </section>
          <section className="card">
            <h2>Image</h2>
            {p.image_url && <img src={p.image_url} alt="" className="post-img" />}
            <div className="row">
              <label className="btn btn--ghost btn--small upload">
                {uploading ? 'Envoi…' : p.image_url ? 'Remplacer' : 'Ajouter une image'}
                <input type="file" accept="image/*" onChange={(e) => upload(e.target.files[0])} />
              </label>
              {p.image_url && <button type="button" className="link link--danger" onClick={() => setP((x) => ({ ...x, image_url: '' }))}>Retirer</button>}
            </div>
          </section>
          {p.id && <button type="button" className="link link--danger" onClick={remove}>Supprimer l’actualité</button>}
        </div>
      </div>
    </form>
  );
}
