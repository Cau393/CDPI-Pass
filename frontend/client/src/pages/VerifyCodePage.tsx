import { useState, useEffect, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getValidatedNextPath } from "@/lib/authRedirect";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function VerifyCodePage() {
    const [, setLocation] = useLocation();
    const search = useSearch();
    const email = useMemo(() => new URLSearchParams(search).get("email") || "", [search]);
    const nextRaw = useMemo(() => new URLSearchParams(search).get("next"), [search]);
    const [code, setCode] = useState("");
    const { toast } = useToast();
    const [cooldown, setCooldown] = useState(30);

    useEffect(() => {
        const timer = cooldown > 0 && setInterval(() => setCooldown(cooldown - 1), 1000);
            return () => {
                if (timer) clearInterval(timer);
            };
    }, [cooldown]);

    const verifyMutation = useMutation({
        mutationFn: async () => {
            const res = await apiRequest("POST", "/api/auth/verify-code", { email, code });
            return res.json() as Promise<{ token: string }>;
        },
        onSuccess: (data: { token?: string }) => {
            if (!data?.token) {
                toast({ title: "Erro", description: "Resposta inválida do servidor.", variant: "destructive" });
                return;
            }
            localStorage.setItem("token", data.token);
            queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
            toast({ title: "E-mail verificado com sucesso!" });
            setLocation(getValidatedNextPath(nextRaw));
        },
        onError: (error: Error) => toast({ title: "Erro", description: error.message, variant: "destructive" }),
    });

    const resendMutation = useMutation({
        mutationFn: () => apiRequest("POST", "/api/auth/resend-code", { email }),
        onSuccess: () => {
            toast({ title: "Um novo código foi enviado." });
            setCooldown(30);
        },
        onError: (error: Error) => toast({ title: "Erro", description: error.message, variant: "destructive" }),
    });

    if (!email) return <div>E-mail não encontrado. Por favor, registre-se novamente.</div>;

    return (
        <div className="min-h-screen flex items-center justify-center">
            <Card className="w-full max-w-md">
                <CardHeader><CardTitle>Verifique seu E-mail</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    <p>Enviamos um código de 6 dígitos para <strong>{email}</strong>. Por favor, insira-o abaixo.</p>
                    <div>
                        <Label htmlFor="code">Código de Verificação</Label>
                        <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} />
                    </div>
                    <Button onClick={() => verifyMutation.mutate()} className="w-full" disabled={verifyMutation.isPending}>
                        {verifyMutation.isPending ? "Verificando..." : "Verificar"}
                    </Button>
                    <Button variant="outline" className="w-full" onClick={() => resendMutation.mutate()} disabled={cooldown > 0 || resendMutation.isPending}>
                        {cooldown > 0 ? `Reenviar em ${cooldown}s` : "Reenviar Código"}
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}