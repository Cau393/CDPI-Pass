import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { dropGuestAccessTokens } from "@/lib/cardChargeLock";

/** Mounted once (App): when the session user changes, the guest order token in the card locks is dropped (R2). */
export function useDropGuestTokenOnAuthChange(): void {
  const userId = useAuth().user?.id;
  const previous = useRef(userId);
  useEffect(() => {
    if (previous.current === userId) return;
    previous.current = userId;
    dropGuestAccessTokens();
  }, [userId]);
}
