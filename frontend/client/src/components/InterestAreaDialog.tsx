import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  BUYER_INTEREST_AREA_LABEL,
  InterestAreaSelect,
} from "@/components/InterestAreaSelect";

export function InterestAreaDialog({
  open,
  options,
  confirmLabel,
  pending = false,
  error,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  options: readonly string[];
  confirmLabel: string;
  pending?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: (interestArea: string) => void;
}) {
  const [value, setValue] = useState("");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{BUYER_INTEREST_AREA_LABEL}</DialogTitle>
        </DialogHeader>
        <InterestAreaSelect
          options={options}
          value={value}
          onChange={(next) => setValue(next)}
          showLabel={false}
        />
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!value || pending}
            onClick={() => onConfirm(value)}
            data-testid="button-confirm-interest-area"
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
