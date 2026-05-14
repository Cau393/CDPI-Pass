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
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email", { length: 255 }).notNull().unique(),
  emailVerified: boolean("email_verified").default(false),
  password: text("password").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  cpf: varchar("cpf", { length: 14 }).notNull().unique(),
  phone: varchar("phone", { length: 20 }).notNull(),
  birthDate: timestamp("birth_date").notNull(),
  address: text("address").notNull(),
  partnerCompany: varchar("partner_company", { length: 255 }),
  isAdmin: boolean("is_admin").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  emailVerificationCode: varchar("email_verification_code", { length: 6 }),
  emailVerificationCodeExpiresAt: timestamp("email_verification_code_expires_at"),
});

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
  /** Which NPS form appears when redeeming certificate: Evento do CDPI vs CDPI Apoiando. */
  npsType: text("nps_type", { enum: ["cdpi_event", "cdpi_apoiando"] })
    .notNull()
    .default("cdpi_event"),
});

/** NPS responses for "Evento do CDPI" certificate flow. */
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
    overallRating: text("overall_rating").notNull(),
    themesRelevance: text("themes_relevance").notNull(),
    speakersRating: text("speakers_rating").notNull(),
    applicability: text("applicability").notNull(),
    highlight: text("highlight").notNull(),
    organizationRating: text("organization_rating").notNull(),
    wouldAttendAgain: text("would_attend_again").notNull(),
    improvements: text("improvements").notNull(),
    interestInTopics: text("interest_in_topics").notNull(),
    interestTopicText: text("interest_topic_text"),
    recommendationScore: integer("recommendation_score").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique("nps_cdpi_event_user_event_unique").on(t.userId, t.eventId)],
);

/** NPS responses for "CDPI Apoiando Evento" certificate flow. */
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
    themesRelevance: text("themes_relevance").notNull(),
    applicability: text("applicability").notNull(),
    futureTopics: text("future_topics").notNull(),
    organizationExperience: text("organization_experience").notNull(),
    improvements: text("improvements").notNull(),
    wantsUpdates: text("wants_updates").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique("nps_cdpi_apoiando_user_event_unique").on(t.userId, t.eventId)],
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
  cpf: varchar("cpf", { length: 14 }).notNull(),
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
});

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
  cpf: varchar("cpf", { length: 14 }).notNull(),
  phone: varchar("phone", { length: 20 }).notNull(),
  birthDate: timestamp("birth_date").notNull(),
  address: text("address").notNull(),
  partnerCompany: varchar("partner_company", { length: 255 }),
  occupation: varchar("occupation", { length: 255 }),
  eventTitle: varchar("event_title", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Mass send jobs table
export const massSendJobs = pgTable('mass_send_jobs', {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  status: text('status', { enum: ['pending', 'processing', 'completed', 'failed'] }).default('pending').notNull(),
  csvData: text('csv_data').notNull(),
  attachmentData: text('attachment_data'), // Storing as JSON string
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

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
});

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
});

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
});

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

// Insert schemas
export const insertUserSchema = createInsertSchema(users, {
  email: z.string().email("Email inválido"),
  cpf: z.string().regex(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/, "CPF deve estar no formato 000.000.000-00"),
  phone: z
    .string()
    .regex(/^\d{8,15}$/, "Telefone deve conter 8 a 15 dígitos (código do país sem +)"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  address: z.string().min(10, "Endereço deve ter pelo menos 10 caracteres"),
  birthDate: z.date({ required_error: "Data de nascimento é obrigatória" }),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  emailVerified: true,
  isAdmin: true,
});

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
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Senha é obrigatória"),
});

export type LoginRequest = z.infer<typeof loginSchema>;

// Courtesy redemption schema
export const courtesyRedemptionSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  email: z.string().email("Email inválido"),
  emailConfirm: z.string().email("Email inválido"),
  cpf: z.string().regex(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/, "CPF deve estar no formato 000.000.000-00"),
  partnerCompany: z.string().min(2, "Empresa parceira é obrigatória"),
  occupation: z.string().min(2, "Cargo é obrigatório"),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve estar no formato AAAA-MM-DD"),
  address: z.string().min(10, "Endereço deve ter pelo menos 10 caracteres"),
  phone: z
    .string()
    .regex(/^\d{8,15}$/, "Telefone deve conter 8 a 15 dígitos (código do país sem +)"),
}).refine((data) => data.email === data.emailConfirm, {
  message: "Os emails não coincidem",
  path: ["emailConfirm"],
});

export type CourtesyRedemption = z.infer<typeof courtesyRedemptionSchema>;
