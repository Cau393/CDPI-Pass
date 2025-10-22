import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

export default function VerifyEmailPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const verifyEmail = async () => {
      // Get token from URL query parameter using window.location
      const urlParams = new URLSearchParams(window.location.search);
      const token = urlParams.get("token");
      
      if (!token) {
        setStatus("error");
        setMessage("Token de verificação não encontrado");
        return;
      }

      try {
        const response = await apiRequest("GET", `/api/users/auth/verify-code?token=${token}`);
        const data = await response.json();
        
        setStatus("success");
        setMessage(data.message || "Email verificado com sucesso!");
        
        // Clear any cached user data to force fresh fetch after verification
        queryClient.invalidateQueries({ queryKey: ["/api/users/auth/me"] });
        
        toast({
          title: "Email verificado!",
          description: "Sua conta foi ativada. Redirecionando para login...",
        });
        
        // Redirect to login after 3 seconds
        setTimeout(() => {
          setLocation("/login");
        }, 3000);
      } catch (error) {
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "Erro ao verificar email");
        
        toast({
          title: "Erro na verificação",
          description: "Não foi possível verificar seu email. Tente novamente.",
          variant: "destructive",
        });
      }
    };

    verifyEmail();
  }, [toast, setLocation]);

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">
            Verificação de Email
          </CardTitle>
        </CardHeader>
        
        <CardContent>
          <div className="text-center">
            {status === "loading" && (
              <div className="space-y-4">
                <Loader2 className="h-12 w-12 mx-auto text-primary animate-spin" />
                <p className="text-gray-600">Verificando seu email...</p>
              </div>
            )}
            
            {status === "success" && (
              <div className="space-y-4">
                <CheckCircle className="h-12 w-12 mx-auto text-green-500" />
                <h3 className="text-lg font-semibold text-green-700">
                  {message}
                </h3>
                <p className="text-gray-600">
                  Você será redirecionado para a página de login em alguns segundos...
                </p>
                <Button
                  onClick={() => setLocation("/login")}
                  className="w-full bg-primary hover:bg-secondary"
                  data-testid="button-go-to-login"
                >
                  Ir para Login
                </Button>
              </div>
            )}
            
            {status === "error" && (
              <div className="space-y-4">
                <XCircle className="h-12 w-12 mx-auto text-red-500" />
                <h3 className="text-lg font-semibold text-red-700">
                  Erro na Verificação
                </h3>
                <p className="text-gray-600">{message}</p>
                <div className="space-y-2">
                  <Button
                    onClick={() => setLocation("/register")}
                    className="w-full bg-gray-600 hover:bg-gray-700"
                    data-testid="button-register"
                  >
                    Criar Nova Conta
                  </Button>
                  <Button
                    onClick={() => setLocation("/")}
                    variant="outline"
                    className="w-full"
                    data-testid="button-home"
                  >
                    Voltar ao Início
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}