import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { parseApiErrorMessage } from "@/lib/eventForm";

type PatchCourtesyLinkResponse = {
  link: {
    isActive: boolean | null;
  };
};

export type CourtesyLinkActiveToggleButtonProps = {
  eventId: string;
  linkId: string;
  isActive: boolean;
  disabled?: boolean;
  onSuccess?: (nextIsActive: boolean) => void;
  className?: string;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
};

export function CourtesyLinkActiveToggleButton({
  eventId,
  linkId,
  isActive,
  disabled,
  onSuccess,
  className,
  size = "sm",
  variant,
}: CourtesyLinkActiveToggleButtonProps) {
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: async (): Promise<PatchCourtesyLinkResponse> => {
      const next = !isActive;
      const res = await apiRequest(
        "PATCH",
        `/api/admin/events/${eventId}/courtesy-links/${linkId}`,
        {
        isActive: next,
      });
      return res.json() as Promise<PatchCourtesyLinkResponse>;
    },
    onSuccess: (data) => {
      const next = data.link.isActive ?? false;
      onSuccess?.(next);
      toast({
        title: next ? "Cortesia ativada" : "Cortesia desativada",
        description: next
          ? "O link voltou a aceitar resgates."
          : "O link não aceita novos resgates.",
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Erro ao atualizar status",
        description: parseApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const effectiveVariant =
    variant ?? (isActive ? "outline" : "default");

  return (
    <Button
      type="button"
      size={size}
      variant={effectiveVariant}
      disabled={disabled || mutation.isPending}
      className={className}
      onClick={(e) => {
        e.stopPropagation();
        mutation.mutate();
      }}
    >
      {mutation.isPending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" aria-hidden />
          Salvando...
        </>
      ) : isActive ? (
        "Desativar"
      ) : (
        "Ativar"
      )}
    </Button>
  );
}
