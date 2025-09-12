import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation, useSearch } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ResetPasswordPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const token = new URLSearchParams(search).get("token");
  const { register, handleSubmit, watch } = useForm();

  const mutation = useMutation({
      mutationFn: (data: any) => apiRequest("POST", "/api/auth/reset-password", { ...data, token }),
      onSuccess: () => {
          toast({ title: "Senha redefinida com sucesso!" });
          setLocation("/login");
      },
      onError: (error: Error) => {
          toast({ title: "Erro", description: error.message, variant: "destructive" });
      },
  });

  const onSubmit = (data: any) => {
    if (data.newPassword !== data.confirmPassword) {
      return toast({ title: "Erro", description: "As senhas não coincidem.", variant: "destructive" });
    }
    mutation.mutate(data);
  };

  if (!token) {
    return <div>Token inválido ou ausente.</div>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Crie uma Nova Senha</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label htmlFor="newPassword">Nova Senha</Label>
              <Input id="newPassword" type="password" {...register("newPassword", { required: true, minLength: 6 })} />
            </div>
            <div>
              <Label htmlFor="confirmPassword">Confirmar Nova Senha</Label>
              <Input id="confirmPassword" type="password" {...register("confirmPassword", { required: true })} />
            </div>
            <Button type="submit" className="w-full" disabled={mutation.isPending}>
              {mutation.isPending ? "Redefinindo..." : "Redefinir Senha"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}