'use client';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import Cookies from 'js-cookie';
import { post, get } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore session on mount
  useEffect(() => {
    const token = Cookies.get('es_access_token');
    if (token) {
      get('/auth/me')
        .then(data => setUser(data.user))
        .catch(() => { Cookies.remove('es_access_token'); Cookies.remove('es_refresh_token'); })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (email, password, totpCode) => {
    const data = await post('/auth/login', { email, password, totpCode });
    if (data.requires2fa) return { requires2fa: true };
    Cookies.set('es_access_token', data.accessToken, { secure: true, sameSite: 'strict' });
    Cookies.set('es_refresh_token', data.refreshToken, { secure: true, sameSite: 'strict', expires: 7 });
    setUser(data.user);
    return { success: true };
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = Cookies.get('es_refresh_token');
    try { await post('/auth/logout', { refreshToken }); } catch {}
    Cookies.remove('es_access_token');
    Cookies.remove('es_refresh_token');
    setUser(null);
    window.location.href = '/portal/login';
  }, []);

  // Role helpers
  const hasRole    = (...roles) => roles.includes(user?.role);
  const isAdmin    = () => hasRole('super_admin');
  const isFinance  = () => hasRole('super_admin', 'finance');
  const isPlanner  = () => hasRole('super_admin', 'fleet_manager', 'planner');

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasRole, isAdmin, isFinance, isPlanner }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
