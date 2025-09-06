import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

interface AdminRouteProps {
  children: React.ReactNode;
}

export default function AdminRoute({ children }: AdminRouteProps) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        toast({
          title: "Acesso negado",
          description: "Você precisa fazer login para acessar esta página",
          variant: "destructive",
        });
        setLocation("/login");
      } else if (!user?.isAdmin) {
        toast({
          title: "Acesso negado",
          description: "Apenas administradores podem acessar esta página",
          variant: "destructive",
        });
        setLocation("/");
      }
    }
  }, [isAuthenticated, isLoading, user, setLocation, toast]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAuthenticated || !user?.isAdmin) {
    return null;
  }

  return <>{children}</>;
}