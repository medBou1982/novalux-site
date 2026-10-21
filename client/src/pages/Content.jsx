import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useFetch } from '../lib/useFetch.js';
import { useStore } from '../lib/store.jsx';
import { date } from '../lib/format.js';
import { ErrorBox, Loading } from '../components/ui.jsx';
import Quote from './Quote.jsx';

const paragraphs = (text = '') => text.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>);

export function News() {
  const { data, error, loading } = useFetch(() => api.get('/posts'), []);
  return (
    <div className="wrap section narrow">
      <header className="page-head"><h1>Actualités</h1></header>
      {loading && <Loading />}
      <ErrorBox error={error} />
      {data?.length === 0 && <p className="muted">Aucune actualité publiée pour le moment.</p>}
      <ul className="posts">
        {data?.map((p) => (
          <li key={p.id}>
            <Link to={`/actualites/${p.slug}`} className="post-card">
              {p.image_url && <img src={p.image_url} alt="" loading="lazy" />}
              <div>
                <time dateTime={p.published_at}>{date(p.published_at)}</time>
                <h2>{p.title}</h2>
                <p>{p.excerpt}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Post() {
  const { slug } = useParams();
  const { data: p, error, loading } = useFetch(() => api.get(`/posts/${slug}`), [slug]);
  if (loading) return <div className="wrap section"><Loading /></div>;
  if (error) return <div className="wrap section"><ErrorBox error={error} /></div>;
  return (
    <article className="wrap section narrow prose">
      <nav className="crumbs"><Link to="/actualites">Actualités</Link></nav>
      <h1>{p.title}</h1>
      <time dateTime={p.published_at}>{date(p.published_at)}</time>
      {p.image_url && <img src={p.image_url} alt="" className="prose__img" />}
      {paragraphs(p.content)}
    </article>
  );
}

export function About() {
  return (
    <article className="wrap section narrow prose">
      <h1>À propos de Novalux</h1>
      <p className="lead">Novalux est un fabricant tunisien de peintures et de colorants, installé dans la zone industrielle d’Oued Chaabouni à Sfax.</p>
      <p>Nous formulons des peintures pour les beaux-arts et les loisirs créatifs : acrylique, peinture sur tissu, sur verre et à l’huile, ainsi que des effets décoratifs comme la gutta nacrée et les paillettes.</p>
      <p>Pour l’industrie, nous produisons les encres flexographiques à l’eau Novaflex et les pâtes colorantes Novafoam pour la mousse polyuréthane. Ces produits sont formulés selon vos teintes et vos volumes : <Link to="/devis" className="link">demandez un devis</Link>.</p>
      <p>Nos produits sont disponibles dans cette boutique en ligne et chez les revendeurs spécialisés en Tunisie.</p>
    </article>
  );
}

export function Contact() {
  const { settings } = useStore();
  const c = settings.contact || {};
  return (
    <Quote contactMode aside={(
      <dl className="contact-card">
        {c.phone && <div><dt>Téléphone</dt><dd><a href={`tel:${c.phone.replace(/\s/g, '')}`}>{c.phone}</a></dd></div>}
        {c.email && <div><dt>E-mail</dt><dd><a href={`mailto:${c.email}`}>{c.email}</a></dd></div>}
        {c.address && <div><dt>Adresse</dt><dd>{c.address}</dd></div>}
      </dl>
    )} />
  );
}

export function Terms() {
  const { settings } = useStore();
  const s = settings.shipping;
  return (
    <article className="wrap section narrow prose">
      <h1>Conditions générales de vente</h1>
      <p className="muted">Modèle à faire valider par votre conseil juridique avant la mise en ligne.</p>
      <h2>Prix</h2>
      <p>Les prix sont indiqués en dinars tunisiens, toutes taxes comprises. Les produits de la gamme industrielle sont vendus sur devis.</p>
      <h2>Commande et paiement</h2>
      <p>La commande est enregistrée dès sa validation. Le paiement s’effectue à la livraison, en espèces, ou en ligne via la plateforme sécurisée Konnect (carte bancaire, e-DINAR, portefeuille). Une commande payée en ligne n’est traitée qu’après confirmation du paiement.</p>
      <h2>Livraison</h2>
      <p>Livraison partout en Tunisie. Frais de port : {(s.flat_fee / 1000).toFixed(3)} DT, offerts à partir de {(s.free_threshold / 1000).toFixed(3)} DT d’achat. Délai indicatif : 2 à 5 jours ouvrés.</p>
      <h2>Retours</h2>
      <p>Les produits non ouverts peuvent être retournés sous 7 jours après réception. Les teintes préparées sur mesure ne sont ni reprises ni échangées.</p>
    </article>
  );
}

export function NotFound() {
  return (
    <div className="wrap section narrow empty">
      <h1>Cette page n’existe pas</h1>
      <p>Le lien est peut-être ancien. Retrouvez nos produits depuis l’accueil.</p>
      <Link to="/" className="btn">Aller à l’accueil</Link>
    </div>
  );
}
