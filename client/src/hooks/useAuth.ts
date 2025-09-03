import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";

export function useAuth() {
  const { data: user, isLoading, error } = useQuery<User>({
    queryKey: ["/api/auth/me"],
    retry: false,
    enabled: !!localStorage.getItem("token"),
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user && !!localStorage.getItem("token"),
    error,
  };
}
