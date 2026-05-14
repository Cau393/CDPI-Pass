import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import EventSelector from "@/components/admin/EventSelector";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { CommunicateRecipientMode, Event } from "@shared/schema";

type RecipientCounts = {
  participants: number;
  unredeemed: number;
  participantsAndUnredeemed: number;
};

const MODES: {
  value: CommunicateRecipientMode;
  label: string;
  countKey: keyof RecipientCounts;
}[] = [
  {
    value: "participants",
    label: "Enviar para Participantes",
    countKey: "participants",
  },
  {
    value: "participants_and_unredeemed",
    label: "Enviar para Participantes + Cortesias Não Resgatadas",
    countKey: "participantsAndUnredeemed",
  },
  {
    value: "unredeemed_only",
    label: "Enviar para Cortesias Não Resgatadas Apenas",
    countKey: "unredeemed",
  },
];

export default function AdminCommunicateMassSendPage() {
  const { toast } = useToast();
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [recipientMode, setRecipientMode] =
    useState<CommunicateRecipientMode>("participants");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);

  const {
    data: counts,
    isLoading: countsLoading,
    isError: countsError,
  } = useQuery<RecipientCounts>({
    queryKey: ["/api/admin/events", selectedEvent?.id, "communicate-recipient-counts"],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/admin/events/${selectedEvent!.id}/communicate-recipient-counts`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { message?: string; error?: string }).message ??
            (body as { error?: string }).error ??
            `Erro ${res.status}`,
        );
      }
      return res.json() as Promise<RecipientCounts>;
    },
    enabled: !!selectedEvent?.id,
  });

  useEffect(() => {
    setAttachmentFile(null);
  }, [selectedEvent?.id]);

  const sendMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      if (!selectedEvent?.id) throw new Error("no event");
      const res = await apiRequest(
        "POST",
        `/api/admin/events/${selectedEvent.id}/communicate-send`,
        formData,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { message?: string; error?: string }).message ??
            (body as { error?: string }).error ??
            `Erro ${res.status}`,
        );
      }
      return res;
    },
    onSuccess: () => {
      setAttachmentFile(null);
      toast({
        title: "Comunicados enfileirados",
        description: "Os e-mails serão enviados em breve.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao enfileirar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const modeConfig = MODES.find((m) => m.value === recipientMode);
  const selectedCount =
    counts && modeConfig != null ? counts[modeConfig.countKey] : null;

  const handleSend = () => {
    if (!selectedEvent) return;
    const formData = new FormData();
    formData.append("recipientMode", recipientMode);
    if (attachmentFile) {
      formData.append("attachment", attachmentFile);
    }
    sendMutation.mutate(formData);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8">
        <p className="text-sm text-muted-foreground">Admin / Env.em massa</p>
        <h1 className="text-3xl font-bold">Envio em massa — Comunicado</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Enviar comunicado</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Evento</Label>
            <EventSelector
              value={selectedEvent?.id ?? null}
              onSelect={setSelectedEvent}
            />
          </div>

          {selectedEvent && (
            <>
              <div className="space-y-3">
                <Label>Destinatários</Label>
                {countsLoading && (
                  <div className="space-y-2">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                )}
                {countsError && (
                  <p className="text-sm text-destructive">
                    Não foi possível carregar as contagens de destinatários.
                  </p>
                )}
                {!countsLoading && !countsError && counts && (
                  <RadioGroup
                    value={recipientMode}
                    onValueChange={(v) =>
                      setRecipientMode(v as CommunicateRecipientMode)
                    }
                    className="space-y-3"
                  >
                    {MODES.map((m) => (
                      <div
                        key={m.value}
                        className="flex items-start space-x-3 rounded-lg border p-3"
                      >
                        <RadioGroupItem
                          value={m.value}
                          id={`mode-${m.value}`}
                          className="mt-1"
                        />
                        <Label
                          htmlFor={`mode-${m.value}`}
                          className="flex flex-1 cursor-pointer flex-col gap-0.5 font-normal leading-snug"
                        >
                          <span className="font-medium">{m.label}</span>
                          <span className="text-sm text-muted-foreground tabular-nums">
                            {counts[m.countKey]} destinatário
                            {counts[m.countKey] === 1 ? "" : "s"}
                          </span>
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="communicate-attachment">Anexo (opcional)</Label>
                <Input
                  id="communicate-attachment"
                  type="file"
                  onChange={(e) =>
                    setAttachmentFile(e.target.files?.[0] ?? null)
                  }
                />
              </div>

              <Button
                type="button"
                disabled={
                  sendMutation.isPending ||
                  countsLoading ||
                  countsError ||
                  selectedCount === 0
                }
                onClick={handleSend}
              >
                {sendMutation.isPending ? "Enviando..." : "Enviar"}
              </Button>
              {selectedCount === 0 && !countsLoading && counts && (
                <p className="text-sm text-muted-foreground">
                  Não há destinatários para o modo selecionado.
                </p>
              )}
            </>
          )}

          {!selectedEvent && (
            <p className="text-center text-sm text-muted-foreground">
              Selecione um evento para configurar o envio.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
