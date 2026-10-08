import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm';
import {
  pgTable,
  varchar,
  text,
  timestamp,
  decimal,
  boolean,
  integer,
  serial,
  unique,
  index,
  uniqueIndex,
  check,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import type { RegistrationAnswer, RegistrationField } from "./eventRegistrationForm";

/**
 * Account mailbox: trim and lowercase before format check.
 * " User@Example.COM " and "user@example.com" are the same address.
 */
export const accountEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Email inválido");

// Users table
export const users = pgTable(
  "users",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    email: varchar("email", { length: 255 }).notNull().unique(),
    emailVerified: boolean("email_verified").default(false),
    password: text("password").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    /**
     * Brazilian CPF. Null when `is_foreigner` is true.
     * UNIQUE allows many nulls, so several foreigners can omit it.
     */
    cpf: varchar("cpf", { length: 14 }).unique(),
    /** True when the account has a passport instead of a CPF. */
    isForeigner: boolean("is_foreigner").notNull().default(false),
    /** Passport or other foreign id. Null for Brazilian accounts. */
    foreignDocument: varchar("foreign_document", { length: 32 }),
    phone: varchar("phone", { length: 20 }).notNull(),
    /** Profile-only since ADR-016; null until the user fills the profile. */
    birthDate: timestamp("birth_date"),
    /** Asked by in-person inscriptions (ADR-016); null until then. */
    address: text("address"),
    occupation: varchar("occupation", { length: 255 }).notNull().default("Nao aplicavel"),
    partnerCompany: varchar("partner_company", { length: 255 }).notNull().default("Nao aplicavel"),
    areaOfActivity: varchar("area_of_activity", { length: 255 }).notNull().default("Nao aplicavel"),
    isAdmin: boolean("is_admin").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
    emailVerificationCode: varchar("email_verification_code", { length: 6 }),
    emailVerificationCodeExpiresAt: timestamp("email_verification_code_expires_at"),
  },
  (table) => [
    uniqueIndex("users_email_lower_unique").on(sql`lower(${table.email})`),
    uniqueIndex("users_foreign_document_unique")
      .on(table.foreignDocument)
      .where(sql`${table.foreignDocument} is not null`),
    // ADR-016: a Brazilian account may have no CPF until its first in-person
    // or paid inscription. Never re-tighten once such rows exist.
    check(
      "users_identity_document_chk",
      sql`(
        (${table.isForeigner} = false AND ${table.foreignDocument} IS NULL)
        OR
        (${table.isForeigner} = true AND ${table.cpf} IS NULL AND ${table.foreignDocument} IS NOT NULL)
      )`,
    ),
  ],
);

// Events table
export const events = pgTable("events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  date: timestamp("date").notNull(),
  location: varchar("location", { length: 255 }).notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  imageUrl: varchar("image_url", { length: 500 }),
  maxAttendees: integer("max_attendees"),
  currentAttendees: integer("current_attendees").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  /** S3 URL of the .docx certificate template (filled to PDF by AWS Lambda). */
  certificateTemplateUrl: text("certificate_template_url"),
  /** Custom HTML for courtesy mass-send emails; placeholders {nome}, {evento}, {data}, {link}. */
  courtesyTemplate: text("courtesy_template"),
  /** Plain-text subject template for courtesy mass-send; same placeholders; null = use default subject. */
  courtesyEmailSubject: text("courtesy_email_subject"),
  /** Which NPS form appears when redeeming certificate: Evento CDPI vs Evento de Terceiros. */
  npsType: text("nps_type", { enum: ["cdpi_event", "cdpi_apoiando"] })
    .notNull()
    .default("cdpi_event"),
  /**
   * Free event ("Evento Grátis"): price is forced to 0, the R$5 convenience fee is
   * skipped and inscription happens via POST /api/events/:id/subscribe with no
   * Asaas charge. Authoritative on the server — never trust the client.
   */
  isFree: boolean("is_free").notNull().default(false),
  /**
   * "Encerrar Vendas": blocks new purchases and free subscriptions while leaving
   * the event active and visible. Deliberately separate from `isActive`, because
   * courtesy redemption must keep working after sales close.
   */
  salesClosed: boolean("sales_closed").notNull().default(false),
  /**
   * Event format: in-person (`presencial`) keeps the QR ticket flow;
   * `online` skips QR generation and sends the meeting URL by e-mail instead.
   * Existing rows default to presencial.
   */
  modality: text("modality", { enum: ["presencial", "online"] })
    .notNull()
    .default("presencial"),
  /**
   * Meeting URL for online events. Secret on public event APIs; sent in the
   * confirmation e-mail and shown to confirmed ticket holders on Meus Ingressos.
   * Null for presencial.
   */
  meetingUrl: varchar("meeting_url", { length: 500 }),
  /**
   * Optional meeting password for online events. Secret on public event APIs;
   * sent in the confirmation e-mail and shown on Meus Ingressos after
   * confirmation. Null when presencial, unset, or blank. Not required online.
   */
  meetingPassword: varchar("meeting_password", { length: 100 }),
  /**
   * Optional WhatsApp group invite URL for online events. Secret on public
   * event APIs; confirmed attendees only. Null when presencial or unset.
   */
  whatsappGroupUrl: varchar("whatsapp_group_url", { length: 500 }),
  /**
   * Optional TipTap HTML injected into the purchase confirmation e-mail.
   * Null/empty = default template. Stripped from public event APIs.
   */
  confirmationEmailHtml: text("confirmation_email_html"),
  /**
   * Optional cap on successful courtesy redeems for this event.
   * Null = unlimited. When paid courtesy orders reach this number, every
   * courtesy link is deactivated until the cap is raised or cleared.
   */
  courtesyLimit: integer("courtesy_limit"),
  /**
   * Optional closed list of "Área de Interesse" labels, in insertion order.
   * Empty means inscription does not ask. Not users.area_of_activity.
   * @deprecated ADR-016: copied into registration_form by
   * sql/backfill_interest_areas_into_registration_form.sql. Read-only until a
   * separately approved step drops it.
   */
  interestAreas: text("interest_areas")
    .array()
    .notNull()
    .default([]),
  /** Creator-defined questions (ADR-016). Locked document/address questions are not stored here. */
  registrationForm: jsonb("registration_form")
    .$type<RegistrationField[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
}, (table) => [
  check("events_courtesy_limit_chk", sql`${table.courtesyLimit} IS NULL OR ${table.courtesyLimit} >= 1`),
  check("events_free_price_zero_chk", sql`${table.isFree} = false OR ${table.price} = 0`),
  check("events_modality_chk", sql`${table.modality} IN ('presencial', 'online')`),
  check("events_nps_type_chk", sql`${table.npsType} IN ('cdpi_event', 'cdpi_apoiando')`),
  check(
    "events_online_meeting_url_chk",
    sql`${table.modality} <> 'online' OR (${table.meetingUrl} IS NOT NULL AND btrim(${table.meetingUrl}) <> '')`,
  ),
]);

/** NPS responses for "Evento CDPI" certificate flow. */
export const npsCdpiEventResponses = pgTable(
  "nps_cdpi_event_responses",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    eventId: varchar("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 20 }).notNull(),
    workshopFeeling: text("workshop_feeling").notNull(),
    themesRelevant: text("themes_relevant").notNull(),
    instructorsDidactics: text("instructors_didactics").notNull(),
    highlight: text("highlight").notNull(),
    careerValue: text("career_value").notNull(),
    wouldAttendAgain: text("would_attend_again").notNull(),
    supportRating: text("support_rating").notNull(),
    supportOtherText: text("support_other_text"),
    messageToTeam: text("message_to_team"),
    privacyConsent: boolean("privacy_consent").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("nps_cdpi_event_user_event_unique").on(t.userId, t.eventId),
    index("nps_cdpi_event_created_at_idx").on(t.createdAt.desc().nullsFirst()),
    index("nps_cdpi_event_event_id_idx").on(t.eventId),
    check(
      "nps_cdpi_event_workshop_feeling_chk",
      sql`${t.workshopFeeling} IN ('Foi incrível!', 'Gostei bastante', 'Foi bom, mas esperava mais', 'Não atendeu minhas expectativas')`,
    ),
    check("nps_cdpi_event_themes_relevant_chk", sql`${t.themesRelevant} IN ('Sim', 'Não')`),
    check(
      "nps_cdpi_event_didactics_chk",
      sql`${t.instructorsDidactics} IN ('Excelente', 'Muito boa', 'Boa', 'Regular', 'Ruim')`,
    ),
    check(
      "nps_cdpi_event_career_value_chk",
      sql`${t.careerValue} IN ('Com certeza', 'Em partes', 'Ainda estou processando')`,
    ),
    check(
      "nps_cdpi_event_attend_again_chk",
      sql`${t.wouldAttendAgain} IN ('Sim, com certeza', 'Talvez, depende do tema', 'Ainda não sei')`,
    ),
    check(
      "nps_cdpi_event_support_chk",
      sql`${t.supportRating} IN ('Excelente, sempre por perto', 'Bom, mas pode melhorar', 'Tive algumas dificuldades', 'Outro')`,
    ),
    check(
      "nps_cdpi_event_support_other_chk",
      sql`(
        (${t.supportRating} = 'Outro' AND ${t.supportOtherText} IS NOT NULL AND length(trim(${t.supportOtherText})) > 0)
        OR
        (${t.supportRating} <> 'Outro' AND (${t.supportOtherText} IS NULL OR length(trim(${t.supportOtherText})) = 0))
      )`,
    ),
    check("nps_cdpi_event_privacy_chk", sql`${t.privacyConsent} IS TRUE`),
  ],
);

/** NPS responses for "Evento de Terceiros" certificate flow. */
export const npsCdpiApoiandoResponses = pgTable(
  "nps_cdpi_apoiando_responses",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    eventId: varchar("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 20 }).notNull(),
    overallScore: integer("overall_score").notNull(),
    futureTopics: text("future_topics").notNull(),
    organizationExperience: text("organization_experience").notNull(),
    organizationOtherText: text("organization_other_text"),
    feedback: text("feedback"),
    privacyConsent: boolean("privacy_consent").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("nps_cdpi_apoiando_user_event_unique").on(t.userId, t.eventId),
    index("nps_cdpi_apoiando_created_at_idx").on(t.createdAt.desc().nullsFirst()),
    index("nps_cdpi_apoiando_event_id_idx").on(t.eventId),
    check("nps_cdpi_apoiando_overall_chk", sql`${t.overallScore} >= 0 AND ${t.overallScore} <= 10`),
    check(
      "nps_cdpi_apoiando_organization_chk",
      sql`${t.organizationExperience} IN ('Excelente, sempre por perto', 'Bom, mas pode melhorar', 'Tive algumas dificuldades', 'Outro')`,
    ),
    check(
      "nps_cdpi_apoiando_organization_other_chk",
      sql`(
        (${t.organizationExperience} = 'Outro' AND ${t.organizationOtherText} IS NOT NULL AND length(trim(${t.organizationOtherText})) > 0)
        OR
        (${t.organizationExperience} <> 'Outro' AND (${t.organizationOtherText} IS NULL OR length(trim(${t.organizationOtherText})) = 0))
      )`,
    ),
    check("nps_cdpi_apoiando_privacy_chk", sql`${t.privacyConsent} IS TRUE`),
  ],
);

// Generated certificates (one per user per event)
export const certificates = pgTable(
  "certificates",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    eventId: varchar("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    certificateUrl: text("certificate_url").notNull(),
    fullName: text("full_name").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [unique("certificates_user_id_event_id_unique").on(t.userId, t.eventId)],
);

// Courtesy Links table
export const courtesyLinks = pgTable("courtesy_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 100 }).notNull().unique(),
  eventId: varchar("event_id").notNull().references(() => events.id),
  recipientEmail: varchar("recipient_email", { length: 255 }), 
  recipientName: varchar("recipient_name", { length: 255 }),
  ticketCount: integer("ticket_count").notNull().default(1),
  usedCount: integer("used_count").default(0),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  overridePrice: decimal("override_price", { precision: 10, scale: 2 }),
});

// Orders table
export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  eventId: varchar("event_id").notNull().references(() => events.id),
  courtesyAttendeeId: varchar("courtesy_attendee_id").references(() => courtesyAttendees.id),
  /** Snapshot of the buyer's CPF. Null when the buyer is a foreigner. */
  cpf: varchar("cpf", { length: 14 }),
  /** Snapshot of the buyer's passport. Null for Brazilian buyers. */
  foreignDocument: varchar("foreign_document", { length: 32 }),
  status: varchar("status", { length: 50 }).notNull().default("pending"), // pending, paid, cancelled
  paymentMethod: varchar("payment_method", { length: 50 }).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  asaasPaymentId: varchar("asaas_payment_id", { length: 255 }),
  courtesyLinkId: varchar("courtesy_link_id").references(() => courtesyLinks.id),
  qrCodeData: text("qr_code_data"),
  qrCodeUsed: boolean("qr_code_used").default(false),
  qrCodeUsedAt: timestamp("qr_code_used_at"),
  maxUses: integer("max_uses").default(1).notNull(),
  amntUsed: integer("amnt_used").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  qr_code_s3_url: varchar("qr_code_s3_url", { length: 500 }),
  /**
   * Snapshot of the event interest-area label chosen at order creation.
   * Null when the event list was empty. Not a foreign key: later edits to
   * events.interest_areas do not change this value.
   * @deprecated ADR-016: replaced by registration_answers; kept read-only.
   */
  interestArea: varchar("interest_area", { length: 255 }),
  /** Snapshot of the registration-form answers at inscription (ADR-016). */
  registrationAnswers: jsonb("registration_answers")
    .$type<RegistrationAnswer[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
}, (table) => [
  // ADR-016: an online order may carry no document; never both.
  check(
    "orders_identity_document_chk",
    sql`NOT (${table.cpf} IS NOT NULL AND ${table.foreignDocument} IS NOT NULL)`,
  ),
]);

// Email queue table for async processing
export const emailQueue = pgTable("email_queue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  to: varchar("to", { length: 255 }).notNull(),
  subject: text("subject").notNull(),
  html: text("html"),
  text: text("text"),
  attachments: text('attachments'),
  status: varchar("status", { length: 50 }).default("pending"), // pending, sent, failed
  attempts: integer("attempts").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  processedAt: timestamp("processed_at"),
});

// Courtesy Attendees table
export const courtesyAttendees = pgTable("courtesy_attendees", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  cpf: varchar("cpf", { length: 14 }),
  isForeigner: boolean("is_foreigner").notNull().default(false),
  foreignDocument: varchar("foreign_document", { length: 32 }),
  phone: varchar("phone", { length: 20 }).notNull(),
  /** Asked only on in-person courtesy events (ADR-016). */
  birthDate: timestamp("birth_date"),
  address: text("address"),
  partnerCompany: varchar("partner_company", { length: 255 }),
  occupation: varchar("occupation", { length: 255 }),
  eventTitle: varchar("event_title", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  check(
    "courtesy_attendees_identity_document_chk",
    sql`(
      (${table.isForeigner} = false AND ${table.foreignDocument} IS NULL)
      OR
      (${table.isForeigner} = true AND ${table.cpf} IS NULL AND ${table.foreignDocument} IS NOT NULL)
    )`,
  ),
]);

// Mass send jobs table
export const massSendJobs = pgTable('mass_send_jobs', {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  status: text('status', { enum: ['pending', 'processing', 'completed', 'failed'] }).default('pending').notNull(),
  csvData: text('csv_data').notNull(),
  attachmentData: text('attachment_data'), // Storing as JSON string
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check("mass_send_jobs_status_check", sql`${table.status} IN ('pending', 'processing', 'completed', 'failed')`),
]);

/** Reminder e-mail template per event; keyed by event_id. */
export const reminderTemplates = pgTable("reminder_templates", {
  eventId: varchar("event_id")
    .primaryKey()
    .references(() => events.id, { onDelete: "cascade" }),
  body: text("body").notNull().default(""),
  /** Plain-text subject line template; same {nome},{evento},{data},{link} placeholders; empty = default subject. */
  subject: text("subject").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Reminder send jobs: same queue pattern as massSendJobs. */
export const reminderJobs = pgTable("reminder_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  status: text("status", { enum: ["pending", "processing", "completed", "failed"] })
    .default("pending")
    .notNull(),
  eventId: varchar("event_id").notNull().references(() => events.id),
  attachmentData: text("attachment_data"),
  createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check("reminder_jobs_status_chk", sql`${table.status} IN ('pending', 'processing', 'completed', 'failed')`),
]);

/** Communicate (announcement) e-mail template per event; placeholders {nome}, {evento}, {data}. */
export const communicateTemplates = pgTable("communicate_templates", {
  eventId: varchar("event_id")
    .primaryKey()
    .references(() => events.id, { onDelete: "cascade" }),
  body: text("body").notNull().default(""),
  subject: text("subject").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Communicate mass-send jobs. */
export const communicateJobs = pgTable("communicate_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  status: text("status", { enum: ["pending", "processing", "completed", "failed"] })
    .default("pending")
    .notNull(),
  eventId: varchar("event_id").notNull().references(() => events.id),
  recipientMode: text("recipient_mode", {
    enum: ["participants", "participants_and_unredeemed", "unredeemed_only"],
  }).notNull(),
  attachmentData: text("attachment_data"),
  createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("communicate_jobs_status_created_at_idx").on(table.status, table.createdAt),
  check("communicate_jobs_status_check", sql`${table.status} IN ('pending', 'processing', 'completed', 'failed')`),
  check(
    "communicate_jobs_recipient_mode_check",
    sql`${table.recipientMode} IN ('participants', 'participants_and_unredeemed', 'unredeemed_only')`,
  ),
]);

/** One row per event: toggle automatic Zebra print queue on check-in. */
export const eventPrintSettings = pgTable("event_print_settings", {
  eventId: varchar("event_id")
    .primaryKey()
    .references(() => events.id, { onDelete: "cascade" }),
  isEnabled: boolean("is_enabled").default(false).notNull(),
  updatedBy: varchar("updated_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Badge print jobs (queued by server, consumed by a WebUSB terminal). */
export const printJobs = pgTable("print_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  orderId: varchar("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  displayName: varchar("display_name", { length: 255 }).notNull(),
  /** Set for courtesy (`partner_company`); second line on the badge. */
  companyLine: varchar("company_line", { length: 255 }),
  status: text("status", {
    enum: ["pending", "processing", "completed", "failed"],
  })
    .default("pending")
    .notNull(),
  /** Print attempts (incremented on each failure; max 3). */
  attempts: integer("attempts").default(0).notNull(),
  lockedBySocketId: varchar("locked_by_socket_id", { length: 64 }),
  lastErrorCode: varchar("last_error_code", { length: 50 }),
  lastErrorMessage: text("last_error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [
  index("print_jobs_event_status_created_idx").on(table.eventId, table.status, table.createdAt),
  index("print_jobs_order_id_idx").on(table.orderId),
  check("print_jobs_status_chk", sql`${table.status} IN ('pending', 'processing', 'completed', 'failed')`),
]);

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  orders: many(orders),
  courtesyLinks: many(courtesyLinks),
  certificates: many(certificates),
  npsCdpiEventResponses: many(npsCdpiEventResponses),
  npsCdpiApoiandoResponses: many(npsCdpiApoiandoResponses),
}));

export const eventsRelations = relations(events, ({ many }) => ({
  orders: many(orders),
  courtesyLinks: many(courtesyLinks),
  certificates: many(certificates),
  npsCdpiEventResponses: many(npsCdpiEventResponses),
  npsCdpiApoiandoResponses: many(npsCdpiApoiandoResponses),
}));

export const certificatesRelations = relations(certificates, ({ one }) => ({
  user: one(users, {
    fields: [certificates.userId],
    references: [users.id],
  }),
  event: one(events, {
    fields: [certificates.eventId],
    references: [events.id],
  }),
}));

export const npsCdpiEventResponsesRelations = relations(npsCdpiEventResponses, ({ one }) => ({
  user: one(users, {
    fields: [npsCdpiEventResponses.userId],
    references: [users.id],
  }),
  event: one(events, {
    fields: [npsCdpiEventResponses.eventId],
    references: [events.id],
  }),
}));

export const npsCdpiApoiandoResponsesRelations = relations(npsCdpiApoiandoResponses, ({ one }) => ({
  user: one(users, {
    fields: [npsCdpiApoiandoResponses.userId],
    references: [users.id],
  }),
  event: one(events, {
    fields: [npsCdpiApoiandoResponses.eventId],
    references: [events.id],
  }),
}));

export const ordersRelations = relations(orders, ({ one }) => ({
  user: one(users, {
    fields: [orders.userId],
    references: [users.id],
  }),
  event: one(events, {
    fields: [orders.eventId],
    references: [events.id],
  }),
  courtesyLink: one(courtesyLinks, {
    fields: [orders.courtesyLinkId],
    references: [courtesyLinks.id],
  }),
  courtesyAttendee: one(courtesyAttendees, {
    fields: [orders.courtesyAttendeeId],
    references: [courtesyAttendees.id],
  }),
}));

export const courtesyLinksRelations = relations(courtesyLinks, ({ one, many }) => ({
  event: one(events, {
    fields: [courtesyLinks.eventId],
    references: [events.id],
  }),
  createdByUser: one(users, {
    fields: [courtesyLinks.createdBy],
    references: [users.id],
  }),
  orders: many(orders),
}));

export const eventPrintSettingsRelations = relations(eventPrintSettings, ({ one }) => ({
  event: one(events, {
    fields: [eventPrintSettings.eventId],
    references: [events.id],
  }),
  updatedByUser: one(users, {
    fields: [eventPrintSettings.updatedBy],
    references: [users.id],
  }),
}));

export const CPF_FORMAT = /^\d{3}\.\d{3}\.\d{3}-\d{2}$/;
export const CPF_FORMAT_MESSAGE = "CPF deve estar no formato 000.000.000-00";
export const FOREIGN_DOCUMENT_PATTERN = /^[A-Z0-9]{5,32}$/;
export const FOREIGN_DOCUMENT_MESSAGE =
  "Documento estrangeiro deve ter 5 a 32 letras ou números";

type AccountDocumentFields = {
  isForeigner?: boolean | null;
  cpf?: string | null;
  foreignDocument?: string | null;
};

function presentDocument(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Brazilian accounts require a formatted CPF. Foreigners require a passport and no CPF. */
export function refineAccountDocument(
  data: AccountDocumentFields,
  ctx: z.RefinementCtx,
) {
  const isForeigner = data.isForeigner === true;
  const cpf = presentDocument(data.cpf);
  const foreignDocument =
    presentDocument(data.foreignDocument)
      ?.toUpperCase()
      .replace(/[^A-Z0-9]/g, "") ?? null;

  if (isForeigner) {
    if (cpf) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cpf"],
        message: "Estrangeiro não informa CPF",
      });
    }
    if (!foreignDocument || !FOREIGN_DOCUMENT_PATTERN.test(foreignDocument)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["foreignDocument"],
        message: FOREIGN_DOCUMENT_MESSAGE,
      });
    }
    return;
  }

  if (foreignDocument) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["foreignDocument"],
      message: "Documento estrangeiro só vale para estrangeiros",
    });
  }
  if (!cpf || !CPF_FORMAT.test(cpf)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["cpf"],
      message: CPF_FORMAT_MESSAGE,
    });
  }
}

// Insert schemas
export const insertUserObjectSchema = createInsertSchema(users, {
  email: accountEmailSchema,
  cpf: z.string().nullable().optional(),
  isForeigner: z.boolean().optional(),
  foreignDocument: z.string().nullable().optional(),
  phone: z
    .string()
    .regex(/^\d{8,15}$/, "Telefone deve conter 8 a 15 dígitos (código do país sem +)"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  address: z.string().min(10, "Endereço deve ter pelo menos 10 caracteres"),
  birthDate: z.date({ required_error: "Data de nascimento é obrigatória" }),
  partnerCompany: z.string().trim().min(2, "Empresa que trabalha é obrigatória").max(255),
  occupation: z.string().trim().min(2, "Cargo que ocupa é obrigatório").max(255),
  areaOfActivity: z.string().trim().min(2, "Área de Atuação é obrigatória").max(255),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  emailVerified: true,
  isAdmin: true,
});

export const insertUserSchema = insertUserObjectSchema.superRefine(refineAccountDocument);

export const insertEventSchema = createInsertSchema(events).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  currentAttendees: true,
});

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  qrCodeData: true,
  qrCodeUsed: true,
  qrCodeUsedAt: true,
});

export const insertEmailQueueSchema = createInsertSchema(emailQueue).omit({
  id: true,
  createdAt: true,
  processedAt: true,
  status: true,
  attempts: true,
});

export const insertCourtesyLinkSchema = createInsertSchema(courtesyLinks, {
  recipientEmail: z.string().email().optional(),
  recipientName: z.string().optional(), 
  }).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  usedCount: true,
});

export const insertCourtesyAttendeeSchema = createInsertSchema(courtesyAttendees, {
  occupation: z.string().optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Event = typeof events.$inferSelect;
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Order = typeof orders.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type EmailQueue = typeof emailQueue.$inferSelect;
export type InsertEmailQueue = z.infer<typeof insertEmailQueueSchema>;
export type CourtesyLink = typeof courtesyLinks.$inferSelect;
export type InsertCourtesyLink = z.infer<typeof insertCourtesyLinkSchema>;
export type CourtesyAttendee = typeof courtesyAttendees.$inferSelect;
export type InsertCourtesyAttendee = z.infer<typeof insertCourtesyAttendeeSchema>;
export type Certificate = typeof certificates.$inferSelect;
export type NpsCdpiEventResponse = typeof npsCdpiEventResponses.$inferSelect;
export type NpsCdpiApoiandoResponse = typeof npsCdpiApoiandoResponses.$inferSelect;
export type EventPrintSettings = typeof eventPrintSettings.$inferSelect;
export type PrintJob = typeof printJobs.$inferSelect;
export type ReminderTemplate = typeof reminderTemplates.$inferSelect;
export type ReminderJob = typeof reminderJobs.$inferSelect;
export type CommunicateTemplate = typeof communicateTemplates.$inferSelect;
export type CommunicateJob = typeof communicateJobs.$inferSelect;

export const communicateRecipientModes = [
  "participants",
  "participants_and_unredeemed",
  "unredeemed_only",
] as const;

export type CommunicateRecipientMode = (typeof communicateRecipientModes)[number];

// Login schema
export const loginSchema = z.object({
  email: accountEmailSchema,
  password: z.string().min(1, "Senha é obrigatória"),
});

export type LoginRequest = z.infer<typeof loginSchema>;

// Courtesy redemption schema
export const courtesyRedemptionSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  email: accountEmailSchema,
  emailConfirm: accountEmailSchema,
  isForeigner: z.boolean().optional(),
  cpf: z.string().optional(),
  foreignDocument: z.string().optional(),
  partnerCompany: z.string().min(2, "Empresa que atua é obrigatória"),
  occupation: z.string().min(2, "Cargo é obrigatório"),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve estar no formato AAAA-MM-DD"),
  address: z.string().min(10, "Endereço deve ter pelo menos 10 caracteres"),
  phone: z
    .string()
    .regex(/^\d{8,15}$/, "Telefone deve conter 8 a 15 dígitos (código do país sem +)"),
}).refine((data) => data.email === data.emailConfirm, {
  message: "Os emails não coincidem",
  path: ["emailConfirm"],
}).superRefine(refineAccountDocument);

export type CourtesyRedemption = z.infer<typeof courtesyRedemptionSchema>;
