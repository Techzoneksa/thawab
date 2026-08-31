"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const API = "/api/auth";
const SESSION_KEY = "session_token";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  branchId: string | null;
  status: string;
  avatar: string | null;
  lastLogin: string | null;
  mustChangePassword?: boolean;
  permissions?: string[];
}

/** Client-side permission check (mirrors the server's hasPermission). */
export function userCan(user: CurrentUser | null, permission: string): boolean {
  const perms = user?.permissions ?? [];
  const [mod, action] = permission.split(".");
  return (
    perms.includes("*") ||
    perms.includes(permission) ||
    perms.includes(`${mod}.*`) ||
    (!!action && perms.includes(`*.${action}`))
  );
}

interface AuthContextType {
  user: CurrentUser | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  isLoading: true,
  login: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(SESSION_KEY);
  });

  const { data: user, isLoading } = useQuery({
    queryKey: ["currentUser"],
    queryFn: async (): Promise<CurrentUser | null> => {
      if (!token) return null;
      const res = await fetch(API, {
        headers: { "x-session-token": token },
      });
      const data = await res.json();
      return data.user;
    },
    enabled: !!token,
  });

  const login = async (email: string, password: string) => {
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.message || data.error || "فشل تسجيل الدخول");
    localStorage.setItem(SESSION_KEY, data.token);
    setToken(data.token);
    queryClient.setQueryData(["currentUser"], data.user);
  };

  const logout = async () => {
    if (token) {
      await fetch(API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-token": token,
        },
        body: JSON.stringify({ action: "logout" }),
      });
    }
    localStorage.removeItem(SESSION_KEY);
    setToken(null);
    queryClient.setQueryData(["currentUser"], null);
  };

  return (
    <AuthContext.Provider value={{ user: user || null, token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export function useCurrentUser() {
  const { user, isLoading } = useAuth();
  return { user, isLoading };
}

/** Returns a `can(permission)` checker bound to the current user. */
export function useCan() {
  const { user } = useAuth();
  return (permission: string) => userCan(user, permission);
}
