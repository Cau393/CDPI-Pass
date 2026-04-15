/**
 * Option A (data integrity): positive integer ≥ 1, and new max ≥ usedCount.
 * Returns an error message in Portuguese or null if valid.
 */
export function validateCourtesyTicketCountUpdate(params: {
  usedCount: number;
  nextTicketCount: unknown;
}): string | null {
  const { nextTicketCount } = params;
  if (typeof nextTicketCount !== "number" || !Number.isInteger(nextTicketCount)) {
    return "Informe um limite inteiro válido.";
  }
  if (nextTicketCount < 1) {
    return "O limite deve ser pelo menos 1.";
  }
  if (nextTicketCount < params.usedCount) {
    return "Limite não pode ser menor que o número de usos já registrados.";
  }
  return null;
}
