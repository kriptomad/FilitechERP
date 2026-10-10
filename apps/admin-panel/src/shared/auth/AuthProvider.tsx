'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { apiAdmin } from '../api/apiAdmin';

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface AuthContextType {
  user: AdminUser | null;
  loading: boolean;
  login: (email: string, password: string, totpCode?: string) => Promise<void>;
  logout: () => Promise<void>;
  verifyTwoFactor: (code: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingTwoFactor, setPendingTwoFactor] = useState(false);

  useEffect(() => {
    checkSession();
  }, []);

  async function checkSession() {
    try {
      const data = await apiAdmin<{ user: AdminUser }>('/platform-admin/auth/me');
      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  async function login(email: string, password: string, totpCode?: string) {
    const data = await apiAdmin<{ 
      requiresTwoFactor?: boolean; 
      twoFactorToken?: string;
      user?: AdminUser;
    }>('/platform-admin/auth/login', { email, password, totpCode });
    
    if (data.requiresTwoFactor && data.twoFactorToken) {
      setPendingTwoFactor(true);
      return;
    }
    
    if (data.user) {
      setUser(data.user);
      setPendingTwoFactor(false);
    }
  }

  async function verifyTwoFactor(code: string) {
    // O token de desafio seria armazenado no estado/login anterior
    // Simplificado: reenvia login com o código
    const email = (document.querySelector('input[type="email"]') as HTMLInputElement)?.value;
    const password = (document.querySelector('input[type="password"]') as HTMLInputElement)?.value;
    await login(email!, password!, code);
  }

  async function logout() {
    await apiAdmin('/platform-admin/auth/logout', { method: 'POST' });
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, verifyTwoFactor }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return context;
}