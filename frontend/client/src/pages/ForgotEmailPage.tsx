import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { parseApiErrorMessage } from "@/lib/eventForm";
import { useToast } from "@/hooks/use-toast";
import { DocumentFields } from "@/components/DocumentFields";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { refineAccountDocument } from "@shared/schema";

const lookupSchema = z
  .object({
    isForeigner: z.boolean(),
    cpf: z.string(),
    foreignDocument: z.string(),
  })
  .superRefine(refineAccountDocument);

type LookupForm = z.infer<typeof lookupSchema>;
type LookupResult = { found: true; maskedEmail: string } | { found: false };

export default function ForgotEmailPage() {
  const { toast } = useToast();
  const [result, setResult] = useState<LookupResult | null>(null);
  const [foreignSearch, setForeignSearch] = useState(false);

  const form = useForm<LookupForm>({
    resolver: zodResolver(lookupSchema),
    defaultValues: { isForeigner: false, cpf: "", foreignDocument: "" },
  });

  const mutation = useMutation({
    mutationFn: async (data: LookupForm): Promise<LookupResult> => {
      const payload = data.isForeigner
        ? { isForeigner: true, foreignDocument: data.foreignDocument }
        : { isForeigner: false, cpf: data.cpf };
      const res = await apiRequest("POST", "/api/auth/lookup-email", payload);
      return res.json();
    },
    onSuccess: (data, variables) => {
      setForeignSearch(variables.isForeigner);
      setResult(data);
    },
    onError: (error: Error) => {
      // authLimiter answers 429 in plain English text; the route's own limiter in JSON.
      const description = error.message.startsWith("429:")
        ? "Muitas tentativas. Tente novamente em 15 minutos."
        : parseApiErrorMessage(error);
      toast({ title: "Erro", description, variant: "destructive" });
    },
  });

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Esqueci meu e-mail</CardTitle>
          <p className="text-sm text-gray-600">
            Informe o documento usado no cadastro e mostramos o e-mail da sua conta, com parte dos
            caracteres ocultos.
          </p>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={form.handleSubmit((data) => {
              setResult(null);
              mutation.mutate(data);
            })}
            className="space-y-4"
            noValidate
          >
            <DocumentFields form={form} />
            <Button type="submit" className="h-11 w-full" disabled={mutation.isPending}>
              {mutation.isPending ? "Buscando..." : "Buscar e-mail"}
            </Button>
          </form>

          {result?.found === true && (
            <div className="mt-6 space-y-3" role="status" data-testid="lookup-found">
              <p className="text-sm text-gray-700">Sua conta usa este e-mail:</p>
              <p className="break-all text-lg font-semibold">{result.maskedEmail}</p>
              <div className="flex flex-col gap-2 text-sm sm:flex-row sm:gap-4">
                <a href="/login" className="text-primary hover:text-secondary">
                  Entrar
                </a>
                <a href="/forgot-password" className="text-primary hover:text-secondary">
                  Redefinir senha
                </a>
              </div>
            </div>
          )}

          {result?.found === false && (
            <div className="mt-6 space-y-3" role="status" data-testid="lookup-not-found">
              <p className="text-sm font-medium text-gray-900">
                {foreignSearch
                  ? "Não encontramos uma conta com este passaporte."
                  : "Não encontramos uma conta com este CPF."}
              </p>
              <p className="text-sm text-gray-600">
                Contas criadas recentemente podem ainda não ter o documento cadastrado: ele é
                informado na primeira inscrição presencial ou paga. Se for o caso, tente o e-mail
                que você costuma usar.
              </p>
              <a href="/register" className="inline-block text-sm text-primary hover:text-secondary">
                Criar conta
              </a>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
