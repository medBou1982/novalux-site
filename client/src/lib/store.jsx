// État partagé de la boutique : panier, demande de devis, compte client.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, tokens } from './api.js';

const CART_KEY = 'nv_cart';
const QUOTE_KEY = 'nv_quote';

function load(key) {
  try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* stockage indisponible */ }
}

const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  const [cart, setCart] = useState(() => load(CART_KEY));
  const [quote, setQuote] = useState(() => load(QUOTE_KEY));
  const [settings, setSettings] = useState({ shipping: { flat_fee: 7000, free_threshold: 150000 }, contact: {} });
  const [account, setAccount] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => save(CART_KEY, cart), [cart]);
  useEffect(() => save(QUOTE_KEY, quote), [quote]);
  useEffect(() => { api.get('/settings').then(setSettings).catch(() => {}); }, []);

  const refreshAccount = useCallback(async () => {
    if (!tokens.customer()) { setAccount(null); return null; }
    try {
      const me = await api.get('/account/me');
      setAccount(me);
      return me;
    } catch {
      tokens.setCustomer(null);
      setAccount(null);
      return null;
    }
  }, []);
  useEffect(() => { refreshAccount(); }, [refreshAccount]);

  const notify = useCallback((message) => {
    setToast({ message, id: Date.now() });
  }, []);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const value = useMemo(() => {
    const addToCart = (line, qty = 1) => {
      setCart((c) => {
        const existing = c.find((x) => x.variant_id === line.variant_id);
        const max = line.stock ?? 999;
        if (existing) return c.map((x) => (x.variant_id === line.variant_id ? { ...x, ...line, quantity: Math.min(max, x.quantity + qty) } : x));
        return [...c, { ...line, quantity: Math.min(max, qty) }];
      });
      notify(`${line.product_name} ajouté au panier.`);
    };
    const setQty = (variantId, qty) => setCart((c) => c.map((x) => (x.variant_id === variantId ? { ...x, quantity: Math.max(1, qty) } : x)));
    const removeFromCart = (variantId) => setCart((c) => c.filter((x) => x.variant_id !== variantId));
    const clearCart = () => setCart([]);

    const addToQuote = (line) => {
      setQuote((q) => {
        const key = `${line.product_id}-${line.variant_id || 0}`;
        if (q.some((x) => `${x.product_id}-${x.variant_id || 0}` === key)) {
          return q.map((x) => (`${x.product_id}-${x.variant_id || 0}` === key ? { ...x, quantity: line.quantity || x.quantity } : x));
        }
        return [...q, line];
      });
      notify(`${line.product_name} ajouté à votre demande de devis.`);
    };
    const updateQuoteLine = (index, patch) => setQuote((q) => q.map((x, i) => (i === index ? { ...x, ...patch } : x)));
    const removeFromQuote = (index) => setQuote((q) => q.filter((_, i) => i !== index));
    const clearQuote = () => setQuote([]);

    const subtotal = cart.reduce((s, l) => s + l.price * l.quantity, 0);
    const { flat_fee, free_threshold } = settings.shipping;
    const shipping = cart.length === 0 || (free_threshold > 0 && subtotal >= free_threshold) ? 0 : flat_fee;

    const login = async (token) => { tokens.setCustomer(token); return refreshAccount(); };
    const logout = () => { tokens.setCustomer(null); setAccount(null); };

    return {
      cart, cartCount: cart.reduce((s, l) => s + l.quantity, 0), subtotal, shipping, total: subtotal + shipping,
      addToCart, setQty, removeFromCart, clearCart,
      quote, addToQuote, updateQuoteLine, removeFromQuote, clearQuote,
      settings, account, refreshAccount, login, logout, toast, notify,
    };
  }, [cart, quote, settings, account, toast, notify, refreshAccount]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export const useStore = () => useContext(StoreContext);
