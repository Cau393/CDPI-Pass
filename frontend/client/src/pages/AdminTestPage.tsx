import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

export default function AdminTestPage() {
  const [userId, setUserId] = useState("");
  const { user } = useAuth();
  const { toast } = useToast();

  const handleMakeAdmin = async () => {
    if (!userId) {
      toast({
        title: "Erro",
        description: "Por favor, insira o ID do usuário",
        variant: "destructive",
      });
      return;
    }

    try {
      const response: any = await apiRequest("POST", `/api/make-admin/${userId}`);
      toast({
        title: "Sucesso!",
        description: `Usuário ${response.user.name} agora é administrador`,
      });
      setUserId("");
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao tornar usuário administrador",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Teste de Administrador</CardTitle>
          <CardDescription>
            Use esta página para tornar um usuário administrador (apenas desenvolvimento)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-blue-50 rounded-lg">
            <p className="text-sm font-medium">Seu ID de usuário:</p>
            <code className="text-xs bg-white px-2 py-1 rounded mt-1 block">
              {user?.id}
            </code>
            <p className="text-xs text-gray-600 mt-2">
              Status: {user?.is_staff ? "✅ Administrador" : "❌ Usuário normal"}
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Tornar usuário admin (insira o ID):
            </label>
            <div className="flex gap-2">
              <Input
                placeholder="ID do usuário"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                data-testid="input-user-id"
              />
              <Button onClick={handleMakeAdmin} data-testid="button-make-admin">
                Tornar Admin
              </Button>
            </div>
          </div>

          <div className="text-xs text-gray-500 space-y-1 pt-4 border-t">
            <p>⚠️ Esta página está disponível apenas em desenvolvimento</p>
            <p>Para testar: copie seu ID acima e cole no campo para se tornar admin</p>
            <p>Depois faça logout e login novamente para ver as funcionalidades de admin</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}