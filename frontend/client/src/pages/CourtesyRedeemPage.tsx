import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Ticket, CheckCircle, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const redemptionSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  email: z.string().email("Email inválido"),
  emailConfirm: z.string().email("Email inválido"),
  cpf: z.string().regex(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/, "CPF deve estar no formato 000.000.000-00"),
  partnerCompany: z.string().min(2, "Empresa parceira é obrigatória"),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve estar no formato AAAA-MM-DD"),
  address: z.string().min(10, "Endereço deve ter pelo menos 10 caracteres"),
  phone: z.string().regex(/^\(\d{2}\)\s\d{4,5}-\d{4}$/, "Telefone deve estar no formato (00) 00000-0000"),
}).refine((data) => data.email === data.emailConfirm, {
  message: "Os emails não coincidem",
  path: ["emailConfirm"],
});

type RedemptionFormData = z.infer<typeof redemptionSchema>;

export default function CourtesyRedeemPage() {
  const [, setLocation] = useLocation();
  const searchParams = useSearch();
  const code = new URLSearchParams(searchParams).get("code");
  const [isSuccess, setIsSuccess] = useState(false);
  const [inputCode, setInputCode] = useState("");
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const { toast } = useToast();

  const form = useForm<RedemptionFormData>({
    resolver: zodResolver(redemptionSchema),
    defaultValues: {
      name: "",
      email: "",
      emailConfirm: "",
      cpf: "",
      partnerCompany: "",
      birthDate: "",
      address: "",
      phone: "",
    },
  });

  // Pre-fill form with user data if available
  useEffect(() => {
    if (user) {
      form.setValue("email", user.email);
      form.setValue("emailConfirm", user.email);
      if (user.name) form.setValue("name", user.name);
      if (user.cpf) form.setValue("cpf", user.cpf);
      if (user.phone) form.setValue("phone", user.phone);
      if (user.address) form.setValue("address", user.address);
      if (user.birthDate) {
        const date = new Date(user.birthDate);
        const formattedDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        form.setValue("birthDate", formattedDate);
      }
    }
  }, [user, form]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated && code) {
      toast({
        title: "Login necessário",
        description: "Faça login para resgatar sua cortesia",
        variant: "destructive",
      });
      // Store the courtesy code in localStorage to return after login
      localStorage.setItem("courtesyCode", code);
      setLocation("/login");
    }
  }, [authLoading, isAuthenticated, code, setLocation, toast]);

  // Check for stored courtesy code after login
  useEffect(() => {
    if (isAuthenticated && !code) {
      const storedCode = localStorage.getItem("courtesyCode");
      if (storedCode) {
        localStorage.removeItem("courtesyCode");
        setLocation(`/cortesia?code=${storedCode}`);
      }
    }
  }, [isAuthenticated, code, setLocation]);

  // Fetch courtesy link details
  const { data: linkData, isLoading: linkLoading, error: linkError } = useQuery({
    queryKey: ["/api/orders/courtesy/links/", code],
    queryFn: async () => {
      if (!code) return null;
      const response = await apiRequest("GET", `/api/orders/courtesy/links/${code}/`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Link inválido");
      }
      return response.json();
    },
    enabled: !!code && isAuthenticated,
  });

  // Redeem courtesy mutation
  const redeemMutation = useMutation({
    mutationFn: async (data: RedemptionFormData & { code: string }) => {
      return await apiRequest("POST", "/api/orders/courtesy/redeem/", data);
    },
    onSuccess: () => {
      setIsSuccess(true);
      toast({
        title: "Cortesia resgatada com sucesso!",
        description: "Seu ingresso foi enviado para o email cadastrado.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao resgatar cortesia",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const formatCPF = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 3) return numbers;
    if (numbers.length <= 6) return `${numbers.slice(0, 3)}.${numbers.slice(3)}`;
    if (numbers.length <= 9) return `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(6)}`;
    return `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(6, 9)}-${numbers.slice(9, 11)}`;
  };

  const formatPhone = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 2) return numbers;
    if (numbers.length <= 6) return `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`;
    if (numbers.length <= 10) return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 6)}-${numbers.slice(6)}`;
    return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7, 11)}`;
  };

  const onSubmit = (data: RedemptionFormData) => {
    if (!code) {
      toast({
        title: "Código inválido",
        description: "Código de cortesia não encontrado",
        variant: "destructive",
      });
      return;
    }

    redeemMutation.mutate({ ...data, code });
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Verificando autenticação...</p>
      </div>
    );
  }

  if (!isAuthenticated && code) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Redirecionando para login...</p>
      </div>
    );
  }

  if (!code) {
    return (
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-lg mx-auto px-4">
          <Card>
            <CardHeader className="text-center">
              <Ticket className="h-12 w-12 text-primary mx-auto mb-4" />
              <CardTitle>Resgate de Cortesia</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-center text-gray-600 mb-6">
                Insira o código de cortesia recebido:
              </p>
              <div className="space-y-4">
                <Input
                  type="text"
                  placeholder="Digite o código (ex: CDPI12345ABC)"
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                  className="text-center font-mono text-lg"
                  data-testid="input-courtesy-code"
                />
                <Button
                  className="w-full"
                  onClick={() => {
                    if (inputCode.trim()) {
                      setLocation(`/cortesia?code=${inputCode.trim()}`);
                    } else {
                      toast({
                        title: "Código inválido",
                        description: "Por favor, insira um código válido",
                        variant: "destructive",
                      });
                    }
                  }}
                  disabled={!inputCode.trim()}
                  data-testid="button-submit-code"
                >
                  Continuar
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setLocation("/")}
                  data-testid="button-home"
                >
                  Voltar ao início
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (linkLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Verificando código de cortesia...</p>
      </div>
    );
  }

  if (linkError || !linkData) {
    return (
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-lg mx-auto px-4">
          <Card>
            <CardHeader className="text-center">
              <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <CardTitle>Código inválido</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-center text-gray-600 mb-4">
                {linkError?.message || "Este código de cortesia não é válido ou já foi utilizado."}
              </p>
              <Button
                className="w-full"
                onClick={() => setLocation("/")}
                data-testid="button-home-error"
              >
                Voltar ao início
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-lg mx-auto px-4">
          <Card>
            <CardHeader className="text-center">
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <CardTitle>Cortesia Resgatada!</CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-gray-600 mb-4">
                Seu ingresso foi enviado para o e-mail cadastrado.
              </p>
              <p className="text-sm text-gray-500 mb-6">
                Você pode acessar seus ingressos na página de perfil.
              </p>
              <div className="space-y-2">
                <Button
                  className="w-full"
                  onClick={() => setLocation("/profile")}
                  data-testid="button-profile"
                >
                  Ver Meus Ingressos
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setLocation("/")}
                  data-testid="button-home-success"
                >
                  Voltar ao Início
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-2xl mx-auto px-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-center mb-4">
              <Ticket className="h-12 w-12 text-primary" />
            </div>
            <CardTitle className="text-center text-2xl">Resgate de Cortesia</CardTitle>
            {linkData && (
              <div className="mt-4 p-4 bg-primary/10 rounded-lg">
                <p className="text-center font-semibold text-lg">{linkData.event?.title}</p>
                  {user.is_staff && (
                  <p className="text-center text-sm text-gray-600">
                    {linkData.remainingTickets} ingresso(s) disponível(is)
                  </p>
                )}
              </div>
            )}
          </CardHeader>
          
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome Completo *</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="cpf"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>CPF *</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            onChange={(e) => field.onChange(formatCPF(e.target.value))}
                            maxLength={14}
                            data-testid="input-cpf"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>E-mail *</FormLabel>
                        <FormControl>
                          <Input {...field} type="email" data-testid="input-email" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="emailConfirm"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirmar E-mail *</FormLabel>
                        <FormControl>
                          <Input {...field} type="email" data-testid="input-email-confirm" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Telefone *</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            onChange={(e) => field.onChange(formatPhone(e.target.value))}
                            maxLength={15}
                            data-testid="input-phone"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="birthDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Data de Nascimento *</FormLabel>
                        <FormControl>
                          <Input {...field} type="date" data-testid="input-birth-date" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="partnerCompany"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Empresa Parceira *</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-partner-company" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Endereço Residencial *</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-address" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="pt-4">
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={redeemMutation.isPending}
                    data-testid="button-redeem"
                  >
                    {redeemMutation.isPending ? "Resgatando..." : "Resgatar Cortesia"}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>

        <div className="mt-6 text-center text-sm text-gray-600">
          <p>Dúvidas? Entre em contato pelo telefone: <strong>+55 (62) 99860-6833</strong></p>
        </div>
      </div>
    </div>
  );
}