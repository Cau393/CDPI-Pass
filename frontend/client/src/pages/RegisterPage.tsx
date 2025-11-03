import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { insertUserSchema, type InsertUser } from "@shared/schema";
import { z } from "zod";
import { useState } from "react";

const registerFormSchema = insertUserSchema.extend({
  birthDate: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/, "Data deve estar no formato dd/mm/aaaa"),
  emailConfirm: z.string().email("Email inválido"),
  passwordConfirm: z.string().min(6, "Confirmação de senha é obrigatória"),
  acceptTerms: z.boolean().refine(val => val === true, "Você deve aceitar os termos"),
}).refine((data) => data.email === data.emailConfirm, {
  message: "Os e-mails não coincidem",
  path: ["emailConfirm"],
}).refine((data) => data.password === data.passwordConfirm, {
  message: "As senhas não coincidem",
  path: ["passwordConfirm"],
});

type RegisterFormData = z.infer<typeof registerFormSchema>;

export default function RegisterPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [verificationLink, setVerificationLink] = useState<string | null>(null);

  const form = useForm<RegisterFormData>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: {
      name: "",
      cpf: "",
      birthDate: "",
      email: "",
      emailConfirm: "",
      phone: "",
      address: "",
      password: "",
      passwordConfirm: "",
      acceptTerms: false,
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: RegisterFormData) => {
    const {
      emailConfirm,
      passwordConfirm,
      acceptTerms,
      birthDate,
      ...rest
    } = data;

    const [day, month, year] = birthDate.split("/");
    const formattedBirthDate = `${day}/${month}/${year}`;

    const normalizeCpf = (value: string) => {
      return value
        .normalize("NFKC") // normalize Unicode composition
        .replace(/\s+/g, "") // remove spaces (including non-breaking)
        .replace(/[–—]/g, "-") // replace weird dashes
        .replace(/[^\d.-]/g, "") // remove anything that isn't digit, dot, or hyphen
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    };

    // Create a new object with snake_case keys
    const registerData = {
      ...rest,
      cpf: normalizeCpf(rest.cpf),
      birth_date: formattedBirthDate,
      password_confirm: passwordConfirm,
    };
    console.log("DEBUG formatted registerData:", JSON.stringify(registerData, null, 2));

      // Send birthDate as string in dd/mm/yyyy format - server will convert it
      const response = await apiRequest("POST", "/api/users/auth/register/", registerData);
      return response.json();
    },
    onSuccess: (data) => {
  if (data.email) {
    toast({
      title: "Conta criada com sucesso!",
      description: "Enviamos um código para o seu e-mail.",
    });
    // Redirect to the verification page, passing the email as a URL parameter
    setLocation(`/verify-email?email=${data.email}`);
    }
  },
    onError: (error: Error) => {
      toast({
        title: "Erro no cadastro",
        description: error.message || "Tente novamente",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: RegisterFormData) => {
    registerMutation.mutate(data);
  };

  // Auto-format CPF
  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    value = value.replace(/(\d{3})(\d)/, '$1.$2');
    value = value.replace(/(\d{3})(\d)/, '$1.$2');
    value = value.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    form.setValue("cpf", value);
  };

  // Auto-format phone
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    value = value.replace(/(\d{2})(\d)/, '($1) $2');
    value = value.replace(/(\d{4,5})(\d{4})$/, '$1-$2');
    form.setValue("phone", value);
  };

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="text-5xl mb-6">💊</div>
          <CardTitle className="text-3xl font-bold text-gray-900">
            Criar conta
          </CardTitle>
          <p className="mt-2 text-gray-600">
            Cadastre-se para participar dos eventos CDPI
          </p>
        </CardHeader>
        
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-4">
              <div>
                <Label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                  Nome Completo
                </Label>
                <Input
                  id="name"
                  type="text"
                  {...form.register("name")}
                  className="w-full"
                  data-testid="input-name"
                />
                {form.formState.errors.name && (
                  <p className="text-red-600 text-sm mt-1" data-testid="text-name-error">
                    {form.formState.errors.name.message}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="cpf" className="block text-sm font-medium text-gray-700 mb-2">
                  CPF
                </Label>
                <Input
                  id="cpf"
                  type="text"
                  placeholder="000.000.000-00"
                  {...form.register("cpf")}
                  onChange={handleCpfChange}
                  maxLength={14}
                  className="w-full"
                  data-testid="input-cpf"
                />
                {form.formState.errors.cpf && (
                  <p className="text-red-600 text-sm mt-1" data-testid="text-cpf-error">
                    {form.formState.errors.cpf.message}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="birthDate" className="block text-sm font-medium text-gray-700 mb-2">
                  Data de Nascimento
                </Label>
                <Input
                  id="birthDate"
                  type="text"
                  placeholder="dd/mm/aaaa"
                  {...form.register("birthDate")}
                  onChange={(e) => {
                    let value = e.target.value.replace(/\D/g, '');
                    value = value.replace(/(\d{2})(\d)/, '$1/$2');
                    value = value.replace(/(\d{2})(\d)/, '$1/$2');
                    form.setValue("birthDate", value);
                  }}
                  maxLength={10}
                  className="w-full"
                  data-testid="input-birth-date"
                />
                {form.formState.errors.birthDate && (
                  <p className="text-red-600 text-sm mt-1" data-testid="text-birth-date-error">
                    {form.formState.errors.birthDate.message}
                  </p>
                )}
              </div>

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
                <Label htmlFor="emailConfirm" className="block text-sm font-medium text-gray-700 mb-2">
                  Confirmar E-mail
                </Label>
                <Input
                  id="emailConfirm"
                  type="email"
                  {...form.register("emailConfirm")}
                  className="w-full"
                  data-testid="input-email-confirm"
                />
                {form.formState.errors.emailConfirm && (
                  <p className="text-red-600 text-sm mt-1" data-testid="text-email-confirm-error">
                    {form.formState.errors.emailConfirm.message}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                  Telefone
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="(11) 99999-9999"
                  {...form.register("phone")}
                  onChange={handlePhoneChange}
                  maxLength={15}
                  className="w-full"
                  data-testid="input-phone"
                />
                {form.formState.errors.phone && (
                  <p className="text-red-600 text-sm mt-1" data-testid="text-phone-error">
                    {form.formState.errors.phone.message}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-2">
                  Endereço Completo
                </Label>
                <Textarea
                  id="address"
                  {...form.register("address")}
                  rows={3}
                  className="w-full"
                  data-testid="input-address"
                />
                {form.formState.errors.address && (
                  <p className="text-red-600 text-sm mt-1" data-testid="text-address-error">
                    {form.formState.errors.address.message}
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

              <div>
                <Label htmlFor="passwordConfirm" className="block text-sm font-medium text-gray-700 mb-2">
                  Confirmar Senha
                </Label>
                <Input
                  id="passwordConfirm"
                  type="password"
                  {...form.register("passwordConfirm")}
                  className="w-full"
                  data-testid="input-password-confirm"
                />
                {form.formState.errors.passwordConfirm && (
                  <p className="text-red-600 text-sm mt-1" data-testid="text-password-confirm-error">
                    {form.formState.errors.passwordConfirm.message}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="acceptTerms"
                checked={acceptTerms}
                onCheckedChange={(checked) => {
                  setAcceptTerms(checked as boolean);
                  form.setValue("acceptTerms", checked as boolean);
                }}
                data-testid="checkbox-terms"
              />
              <Label htmlFor="acceptTerms" className="text-sm text-gray-600">
                Concordo com os{" "}
                <a href="#" className="text-primary hover:text-secondary">
                  Termos de Uso
                </a>{" "}
                e{" "}
                <a href="#" className="text-primary hover:text-secondary">
                  Política de Privacidade
                </a>
              </Label>
            </div>
            {form.formState.errors.acceptTerms && (
              <p className="text-red-600 text-sm" data-testid="text-terms-error">
                {form.formState.errors.acceptTerms.message}
              </p>
            )}

            <Button
              type="submit"
              className="w-full bg-primary hover:bg-secondary"
              disabled={registerMutation.isPending}
              data-testid="button-register"
            >
              {registerMutation.isPending ? "Criando conta..." : "Criar Conta"}
            </Button>
            
            <div className="text-center">
              <span className="text-gray-600">Já tem conta? </span>
              <a 
                href="/login" 
                className="text-primary hover:text-secondary font-medium"
                data-testid="link-login"
              >
                Entrar
              </a>
            </div>
          </form>

        </CardContent>
      </Card>
    </div>
  );
}
