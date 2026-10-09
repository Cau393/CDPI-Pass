import { useState, useEffect, type FormEvent, type ReactNode } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { courtesyRedemptionSchema, onlineCourtesyRedemptionSchema } from "@shared/schema";
import { isOnlineEvent } from "@shared/eventModality";
import { COURTESY_FILLED_LEGACY_IDS, type RegistrationField } from "@shared/eventRegistrationForm";
import { RegistrationFields } from "@/components/RegistrationFields";
import { parseApiErrorMessage } from "@/lib/eventForm";
import { registrationAnswerErrors, registrationAnswersPayload } from "@/lib/eventRegistration";
import { PhoneInputE164 } from "@/components/nps/PhoneInputE164";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Ticket, CheckCircle, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { COURTESY_CODE_PARAM_REGEX } from "@/lib/authRedirect";
import { COURTESY_CODE_INVALID_COPY } from "@/lib/eventCta";
import ContactChannels from "@/components/ContactChannels";
import SiteFooter from "@/components/SiteFooter";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

type RedemptionFormData = z.infer<typeof courtesyRedemptionSchema>;

function CourtesyShell({
  children,
  centered = false,
}: {
  children: ReactNode;
  centered?: boolean;
}) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div
        className={
          centered
            ? "flex-1 flex items-center justify-center"
            : "flex-1 py-12"
        }
      >
        {children}
      </div>
      <SiteFooter />
    </div>
  );
}

export default function CourtesyRedeemPage() {
  const [, setLocation] = useLocation();
  const searchParams = useSearch();
  const code = new URLSearchParams(searchParams).get("code");
  const [isSuccess, setIsSuccess] = useState(false);
  const [inputCode, setInputCode] = useState("");
  const [isResolvingCode, setIsResolvingCode] = useState(false);
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const { toast } = useToast();

  // Fetch courtesy link details
  const { data: linkData, isLoading: linkLoading, error: linkError } = useQuery({
    queryKey: ["/api/courtesy-links", code],
    queryFn: async () => {
      if (!code) return null;
      const response = await fetch(`/api/courtesy-links/${code}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Link inválido");
      }
      return response.json();
    },
    enabled: !!code && !authLoading,
  });

  // Online courtesy asks no document, birth date or address (ADR-016).
  const isOnline = isOnlineEvent(linkData?.event ?? {});
  // Cargo and company legacy questions are the attendee's own form fields above (the server fills them).
  const questions = ((linkData?.event?.registrationForm ?? []) as RegistrationField[]).filter(
    (field) => !field.archived && !COURTESY_FILLED_LEGACY_IDS.includes(field.id),
  );
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [answerErrors, setAnswerErrors] = useState<Record<string, string>>({});

  const form = useForm<RedemptionFormData>({
    resolver: (isOnline
      ? zodResolver(onlineCourtesyRedemptionSchema)
      : zodResolver(courtesyRedemptionSchema)) as Resolver<RedemptionFormData>,
    defaultValues: {
      name: "",
      email: "",
      emailConfirm: "",
      isForeigner: false,
      cpf: "",
      foreignDocument: "",
      partnerCompany: "",
      occupation: "",
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
      if (user.isForeigner) {
        form.setValue("isForeigner", true);
        if (user.foreignDocument) form.setValue("foreignDocument", user.foreignDocument);
      } else if (user.cpf) {
        form.setValue("cpf", user.cpf);
      }
      if (user.phone) form.setValue("phone", user.phone);
      if (user.address) form.setValue("address", user.address);
      if (user.birthDate) {
        const date = new Date(user.birthDate);
        const formattedDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        form.setValue("birthDate", formattedDate);
      }
    }
  }, [user, form]);

  // One-time migration: old flow used localStorage("courtesyCode")
  useEffect(() => {
    if (authLoading || !isAuthenticated || code) return;
    const storedCode = localStorage.getItem("courtesyCode");
    if (!storedCode) return;
    localStorage.removeItem("courtesyCode");
    if (COURTESY_CODE_PARAM_REGEX.test(storedCode)) {
      setLocation(`/cortesia?code=${encodeURIComponent(storedCode)}`);
    }
  }, [authLoading, isAuthenticated, code, setLocation]);


  useEffect(() => {
    if (authLoading || isAuthenticated || !code || !linkData?.event?.id) return;
    const eventId = linkData.event.id as string;
    const param = linkData.overridePrice ? "promo" : "cortesia";
    setLocation(`/event/${eventId}?${param}=${encodeURIComponent(code)}`);
  }, [authLoading, isAuthenticated, code, linkData, setLocation]);

  // Redeem courtesy mutation
  const redeemMutation = useMutation({
    mutationFn: async (
      data: RedemptionFormData & { code: string; answers: Record<string, string> },
    ) => {
      return await apiRequest("POST", "/api/courtesy/redeem", data);
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
        description: parseApiErrorMessage(error),
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

  const onSubmit = (data: RedemptionFormData) => {
    if (!code) {
      toast({
        title: "Código inválido",
        description: "Código de cortesia não encontrado",
        variant: "destructive",
      });
      return;
    }

    redeemMutation.mutate({
      ...data,
      code,
      answers: registrationAnswersPayload(questions, answers),
    });
  };

  const handleRedeemSubmit = (e: FormEvent<HTMLFormElement>) => {
    // Validate the answers alongside the form so every error shows at once.
    const nextAnswerErrors = registrationAnswerErrors(questions, answers);
    setAnswerErrors(nextAnswerErrors);
    void form.handleSubmit((data) => {
      if (Object.keys(nextAnswerErrors).length > 0) return;
      onSubmit(data);
    })(e);
  };

  if (authLoading) {
    return (
      <CourtesyShell centered>
        <p className="text-gray-500">Verificando autenticação...</p>
      </CourtesyShell>
    );
  }

  const continueWithCode = async () => {
    const trimmed = inputCode.trim();
    if (!trimmed) {
      toast({
        title: "Código inválido",
        description: "Por favor, insira um código válido",
        variant: "destructive",
      });
      return;
    }

    setIsResolvingCode(true);
    try {
      const response = await fetch(
        `/api/courtesy-links/${encodeURIComponent(trimmed)}`,
      );
      if (!response.ok) {
        setLocation(`/cortesia?code=${encodeURIComponent(trimmed)}`);
        return;
      }
      const data = await response.json();
      const eventId = data?.event?.id as string | undefined;
      if (!eventId) {
        setLocation(`/cortesia?code=${encodeURIComponent(trimmed)}`);
        return;
      }
      const param = data.overridePrice ? "promo" : "cortesia";
      setLocation(`/event/${eventId}?${param}=${encodeURIComponent(trimmed)}`);
    } catch {
      setLocation(`/cortesia?code=${encodeURIComponent(trimmed)}`);
    } finally {
      setIsResolvingCode(false);
    }
  };

  if (!code) {
    return (
      <CourtesyShell>
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
                    void continueWithCode();
                  }}
                  disabled={!inputCode.trim() || isResolvingCode}
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
      </CourtesyShell>
    );
  }

  if (linkLoading) {
    return (
      <CourtesyShell centered>
        <p className="text-gray-500">Verificando código de cortesia...</p>
      </CourtesyShell>
    );
  }

  if (linkError || !linkData || (!isAuthenticated && !linkData.event?.id)) {
    return (
      <CourtesyShell>
        <div className="max-w-lg mx-auto px-4">
          <Card>
            <CardHeader className="text-center">
              <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <CardTitle>Código inválido</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-center text-gray-600 mb-4">
                {linkError?.message || COURTESY_CODE_INVALID_COPY}
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
      </CourtesyShell>
    );
  }

  if (!isAuthenticated) {
    return (
      <CourtesyShell centered>
        <p className="text-gray-500">Abrindo a página do evento...</p>
      </CourtesyShell>
    );
  }

  if (isSuccess) {
    return (
      <CourtesyShell>
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
      </CourtesyShell>
    );
  }

  return (
    <CourtesyShell>
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
                  {user?.isAdmin && (
                  <p className="text-center text-sm text-gray-600">
                    {linkData.remainingTickets} ingresso(s) disponível(is)
                  </p>
                )}
              </div>
            )}
          </CardHeader>
          
          <CardContent>
            <Form {...form}>
              <form onSubmit={handleRedeemSubmit} className="space-y-4">
                {isOnline ? null : (
                <FormField
                  control={form.control}
                  name="isForeigner"
                  render={({ field }) => (
                    <FormItem className="flex items-center space-x-2 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value === true}
                          onCheckedChange={(checked) => {
                            const next = checked === true;
                            field.onChange(next);
                            if (next) form.setValue("cpf", "");
                            else form.setValue("foreignDocument", "");
                          }}
                          data-testid="checkbox-foreigner"
                        />
                      </FormControl>
                      <FormLabel className="font-normal">Sou estrangeiro e não possuo CPF</FormLabel>
                    </FormItem>
                  )}
                />
                )}
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

                  {isOnline ? null : form.watch("isForeigner") === true ? (
                  <FormField
                    control={form.control}
                    name="foreignDocument"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Passaporte ou documento estrangeiro *</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            value={field.value ?? ""}
                            onChange={(e) =>
                              field.onChange(
                                e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 32),
                              )
                            }
                            maxLength={32}
                            data-testid="input-foreign-document"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  ) : (
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
                  )}

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
                          <PhoneInputE164
                            value={field.value}
                            onChange={field.onChange}
                            aria-invalid={Boolean(form.formState.errors.phone)}
                            data-testid="input-phone"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {isOnline ? null : (
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
                  )}

                  <FormField
                    control={form.control}
                    name="partnerCompany"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Empresa que atua *</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-partner-company" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="occupation"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cargo que Ocupa *</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-occupation" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {isOnline ? null : (
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
                  )}
                </div>

                <RegistrationFields
                  fields={questions}
                  values={answers}
                  errors={answerErrors}
                  onChange={(fieldId, value) =>
                    setAnswers((prev) => ({ ...prev, [fieldId]: value }))
                  }
                />

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
          <p className="mb-2">Dúvidas? Fale conosco:</p>
          <ContactChannels variant="inline" />
        </div>
      </div>
    </CourtesyShell>
  );
}