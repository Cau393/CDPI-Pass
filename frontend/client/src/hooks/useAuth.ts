// frontend/client/src/hooks/useAuth.ts
import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";
import { useLocation } from "wouter";

export function useAuth() {
  const [, setLocation] = useLocation();
  const { data: user, isLoading, error } = useQuery<User>({
    queryKey: ["/api/auth/me"],
    retry: (failureCount, error: any) => {
      if (error.message.includes("401")) {
        // If unauthorized, clear the token and redirect to login
        localStorage.removeItem("token");
        setLocation("/login");
        return false; // Don't retry the request
      }
      return failureCount < 3; // Retry other errors up to 3 times
    },
    enabled: !!localStorage.getItem("token"),
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user && !!localStorage.getItem("token"),
    error,
  };
}