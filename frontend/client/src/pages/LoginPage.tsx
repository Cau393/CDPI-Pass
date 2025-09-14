import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { loginSchema, type LoginRequest } from "@shared/schema";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [rememberMe, setRememberMe] = useState(false);

  const form = useForm<LoginRequest>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const loginMutation = useMutation({
    mutationFn: async (data: LoginRequest) => {
      const response = await apiRequest("POST", "/api/auth/login", data);
      return response.json();
    },
    onSuccess: (data) => {
  localStorage.setItem("token", data.token);
  queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });

  if (data.user.emailVerified) {
    toast({ title: "Login realizado com sucesso!" });
    setLocation("/");
  } else {
    toast({ title: "Verificação necessária", description: "Por favor, verifique seu e-mail." });
    setLocation(`/verify-email?email=${data.user.email}`);
    }
  },
    onError: (error: Error) => {
      toast({
        title: "Erro no login",
        description: error.message || "Verifique suas credenciais",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: LoginRequest) => {
    loginMutation.mutate(data);
  };

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="text-5xl mb-6">💊</div>
          <CardTitle className="text-3xl font-bold text-gray-900">
            Entrar na sua conta
          </CardTitle>
          <p className="mt-2 text-gray-600">
            Acesse seus ingressos e histórico de eventos
          </p>
        </CardHeader>
        
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-4">
              <div>
                <Label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  E-mail
                </Label>
                <Input
                  id="email"
                  type="email"
                  {...form.register("email")}
                  className="w-full"
                  data-testid="input-email"
                />
                {form.formState.errors.email && (
                  <p className="text-red-600 text-sm mt-1" data-testid="text-email-error">
                    {form.formState.errors.email.message}
                  </p>
                )}
              </div>
              
              <div>
                <Label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                  Senha
                </Label>
                <Input
                  id="password"
                  type="password"
                  {...form.register("password")}
                  className="w-full"
                  data-testid="input-password"
                />
                {form.formState.errors.password && (
                  <p className="text-red-600 text-sm mt-1" data-testid="text-password-error">
                    {form.formState.errors.password.message}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="remember"
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                  data-testid="checkbox-remember"
                />
                <Label htmlFor="remember" className="text-sm text-gray-600">
                  Lembrar de mim
                </Label>
              </div>
              <a href="/forgot-password" className="text-sm text-primary hover:text-secondary">
                Esqueceu a senha?
              </a>
            </div>

            <Button
              type="submit"
              className="w-full bg-primary hover:bg-secondary"
              disabled={loginMutation.isPending}
              data-testid="button-login"
            >
              {loginMutation.isPending ? "Entrando..." : "Entrar"}
            </Button>
            
            <div className="text-center">
              <span className="text-gray-600">Não tem conta? </span>
              <a 
                href="/register" 
                className="text-primary hover:text-secondary font-medium"
                data-testid="link-register"
              >
                Cadastre-se
              </a>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
