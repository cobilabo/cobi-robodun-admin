import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  login as authLogin,
  logout as authLogout,
  onAuthStateChange,
  type User,
} from '../firebase/auth';
import { isCloudMode, isFirebaseConfigured } from '../lib/mode';

type AuthContextType = {
  currentUser: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  requiresAuth: boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const requiresAuth = isCloudMode();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(requiresAuth);

  useEffect(() => {
    if (!requiresAuth) {
      setLoading(false);
      return;
    }
    if (!isFirebaseConfigured()) {
      setLoading(false);
      return;
    }
    return onAuthStateChange((user) => {
      setCurrentUser(user);
      setLoading(false);
    });
  }, [requiresAuth]);

  const value: AuthContextType = {
    currentUser,
    loading,
    requiresAuth,
    login: async (email, password) => {
      setLoading(true);
      try {
        await authLogin(email, password);
      } finally {
        setLoading(false);
      }
    },
    logout: async () => {
      setLoading(true);
      try {
        await authLogout();
      } finally {
        setLoading(false);
      }
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
