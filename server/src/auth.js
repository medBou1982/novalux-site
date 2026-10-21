import jwt from 'jsonwebtoken';
import { httpError } from './util.js';

const SECRET = process.env.JWT_SECRET || 'dev-secret-a-changer';
if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET doit être défini en production.');
}

export const signToken = (payload, expiresIn = '7d') => jwt.sign(payload, SECRET, { expiresIn });

function readToken(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(header.slice(7), SECRET);
  } catch {
    return null;
  }
}

/** Ajoute req.customer si un jeton client valide est présent (sans l'exiger). */
export function optionalCustomer(req, _res, next) {
  const t = readToken(req);
  if (t?.role === 'customer') req.customer = { id: t.sub, email: t.email };
  next();
}

export function requireCustomer(req, _res, next) {
  const t = readToken(req);
  if (t?.role !== 'customer') return next(httpError(401, 'Connectez-vous pour accéder à votre compte.'));
  req.customer = { id: t.sub, email: t.email };
  next();
}

export function requireAdmin(req, _res, next) {
  const t = readToken(req);
  if (t?.role !== 'admin') return next(httpError(401, 'Session admin expirée. Reconnectez-vous.'));
  req.admin = { id: t.sub, email: t.email };
  next();
}
