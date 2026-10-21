import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { StoreProvider } from './lib/store.jsx';
import Layout from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import Catalog from './pages/Catalog.jsx';
import Product from './pages/Product.jsx';
import Cart from './pages/Cart.jsx';
import Checkout from './pages/Checkout.jsx';
import OrderStatus, { PaymentSimulation } from './pages/OrderStatus.jsx';
import Quote from './pages/Quote.jsx';
import Account, { Login } from './pages/Account.jsx';
import { About, Contact, News, NotFound, Post, Terms } from './pages/Content.jsx';
import { Loading } from './components/ui.jsx';
import './styles/base.css';
import './styles/shop.css';

// L'admin est chargé à part : les visiteurs de la boutique ne le téléchargent pas.
const AdminApp = lazy(() => import('./admin/AdminApp.jsx'));

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/admin/*" element={<Suspense fallback={<Loading />}><AdminApp /></Suspense>} />
        <Route element={<StoreProvider><Layout /></StoreProvider>}>
          <Route index element={<Home />} />
          <Route path="gamme/:slug" element={<Catalog mode="category" />} />
          <Route path="nouveautes" element={<Catalog mode="new" />} />
          <Route path="recherche" element={<Catalog mode="search" />} />
          <Route path="produit/:slug" element={<Product />} />
          <Route path="panier" element={<Cart />} />
          <Route path="commande" element={<Checkout />} />
          <Route path="commande/:number" element={<OrderStatus />} />
          <Route path="paiement/simulation" element={<PaymentSimulation />} />
          <Route path="devis" element={<Quote />} />
          <Route path="connexion" element={<Login />} />
          <Route path="compte" element={<Account />} />
          <Route path="actualites" element={<News />} />
          <Route path="actualites/:slug" element={<Post />} />
          <Route path="a-propos" element={<About />} />
          <Route path="contact" element={<Contact />} />
          <Route path="conditions-generales" element={<Terms />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
