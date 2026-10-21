import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API = process.env.VITE_API_PROXY || 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    strictPort: true, // erreur claire si le port est déjà pris, au lieu d'en choisir un autre
    proxy: { '/api': API, '/uploads': API },
  },
});
