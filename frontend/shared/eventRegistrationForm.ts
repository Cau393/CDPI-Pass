/**
 * Per-event registration form (ADR-016). The definition lives in
 * events.registration_form; each order keeps a snapshot of the answers in
 * orders.registration_answers. Locked questions (document, address) are
 * computed from the event's modality and price, never stored here.
 */

export type RegistrationFieldType = "text" | "select" | "radio";

export interface RegistrationField {
  /** Stable id; answers point at it, so it never changes once saved. */
  id: string;
  type: RegistrationFieldType;
  label: string;
  /** Choices for select/radio; empty for text. */
  options: string[];
  required: boolean;
  /** Removed by the admin after it had answers; kept so exports still show them. */
  archived: boolean;
}

export interface RegistrationAnswer {
  fieldId: string;
  /** Label at answer time, so a later rename does not rewrite history. */
  label: string;
  value: string;
}
