import React, { createContext, useContext, useEffect, useState } from 'react';
import { setItemAsync, getItemAsync, deleteItemAsync } from '../lib/storage';
import { apiClient } from '../lib/api';

type User = {
  id: string;
  email: string;
  name?: string;
  image?: string;
};

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for existing session token
    async function loadSession() {
      try {
        const token = await getItemAsync('authjs.session-token');
        if (token) {
          // Typically we would ping `/api/auth/session` here, 
          // but NextAuth is largely cookie-based on the web front. 
          // You may need a dedicated `/api/mobile/me` to fetch user via token.
          // For now, we stub this out loosely.
          const res = await apiClient.get('/api/auth/session');
          if (res.data?.user) {
            setUser(res.data.user);
          } else {
             await deleteItemAsync('authjs.session-token');
          }
        }
      } catch (error) {
        console.error('Session load error', error);
      } finally {
        setIsLoading(false);
      }
    }
    loadSession();
  }, []);

  const login = async (email: string, password: string) => {
    // Note: NextAuth uses a specific POST format to /api/auth/callback/credentials 
    // This often requires CSRF tokens which adds complexity to apps.
    // Recommended: Build a custom Next.js handler like POST /api/mobile/login 
    // that validates via prisma + bcrypt and returns { user, token }.
    const fakeToken = "temp-fake-token";
    await setItemAsync('authjs.session-token', fakeToken);
    
    // Stub login for prototyping UI
    setUser({ id: '1', email }); 
  };

  const logout = async () => {
    await deleteItemAsync('authjs.session-token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
