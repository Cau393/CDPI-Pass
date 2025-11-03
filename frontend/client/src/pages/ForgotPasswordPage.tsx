import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPage() {
  const { toast } = useToast();
  const { register, handleSubmit } = useForm<{ email: string }>();

  const mutation = useMutation({
    mutationFn: (data: { email: string }) => apiRequest("POST", "/api/auth/forgot-password/", data),
    onSuccess: () => {
      toast({
        title: "Verifique seu e-mail",
        description: "Se sua conta existir, enviaremos um link para redefinir sua senha.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: { email: string }) => {
    mutation.mutate(data);
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Redefinir Senha</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" {...register("email", { required: true })} />
            </div>
            <Button type="submit" className="w-full" disabled={mutation.isPending}>
              {mutation.isPending ? "Enviando..." : "Enviar Link de Redefinição"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}