import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";
import { useLocation } from "wouter";

export function useAuth() {
  const [, setLocation] = useLocation();

  const { data: user, isLoading, error } = useQuery<User>({
    queryKey: ["/api/users/auth/me"],
    retry: (failureCount, error: any) => {
      // Check for both 401 and 403 status codes in the error message
      if (error.message.includes("401") || error.message.includes("403")) {
        // If the token is invalid, clear it from storage and redirect to login
        localStorage.removeItem("token");
        setLocation("/login");
        return false; // Stop retrying the request
      }
      // For any other error, retry up to 3 times
      return failureCount < 3;
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