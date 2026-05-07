var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/run-email-worker.ts
import "dotenv/config";

// server/services/emailService.ts
import { MailService } from "@sendgrid/mail";
import jwt from "jsonwebtoken";

// shared/schema.ts
var schema_exports = {};
__export(schema_exports, {
  certificates: () => certificates,
  certificatesRelations: () => certificatesRelations,
  courtesyAttendees: () => courtesyAttendees,
  courtesyLinks: () => courtesyLinks,
  courtesyLinksRelations: () => courtesyLinksRelations,
  courtesyRedemptionSchema: () => courtesyRedemptionSchema,
  emailQueue: () => emailQueue,
  eventPrintSettings: () => eventPrintSettings,
  eventPrintSettingsRelations: () => eventPrintSettingsRelations,
  events: () => events,
  eventsRelations: () => eventsRelations,
  insertCourtesyAttendeeSchema: () => insertCourtesyAttendeeSchema,
  insertCourtesyLinkSchema: () => insertCourtesyLinkSchema,
  insertEmailQueueSchema: () => insertEmailQueueSchema,
  insertEventSchema: () => insertEventSchema,
  insertOrderSchema: () => insertOrderSchema,
  insertUserSchema: () => insertUserSchema,
  loginSchema: () => loginSchema,
  massSendJobs: () => massSendJobs,
  orders: () => orders,
  ordersRelations: () => ordersRelations,
  printJobs: () => printJobs,
  users: () => users,
  usersRelations: () => usersRelations
});
import { sql } from "drizzle-orm";
import { relations } from "drizzle-orm";
import {
  pgTable,
  varchar,
  text,
  timestamp,
  decimal,
  boolean,
  integer,
  serial,
  jsonb,
  unique
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
var users = pgTable("users", {
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
  emailVerificationCodeExpiresAt: timestamp("email_verification_code_expires_at")
});
var events = pgTable("events", {
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
  courtesyTemplate: text("courtesy_template")
});
var certificates = pgTable(
  "certificates",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    eventId: varchar("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    certificateUrl: text("certificate_url").notNull(),
    fullName: text("full_name").notNull(),
    npsResponses: jsonb("nps_responses").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull()
  },
  (t) => [unique("certificates_user_id_event_id_unique").on(t.userId, t.eventId)]
);
var courtesyLinks = pgTable("courtesy_links", {
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
  overridePrice: decimal("override_price", { precision: 10, scale: 2 })
});
var orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  eventId: varchar("event_id").notNull().references(() => events.id),
  courtesyAttendeeId: varchar("courtesy_attendee_id").references(() => courtesyAttendees.id),
  cpf: varchar("cpf", { length: 14 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  // pending, paid, cancelled
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
  qr_code_s3_url: varchar("qr_code_s3_url", { length: 500 })
});
var emailQueue = pgTable("email_queue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  to: varchar("to", { length: 255 }).notNull(),
  subject: varchar("subject", { length: 255 }).notNull(),
  html: text("html"),
  text: text("text"),
  attachments: text("attachments"),
  status: varchar("status", { length: 50 }).default("pending"),
  // pending, sent, failed
  attempts: integer("attempts").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  processedAt: timestamp("processed_at")
});
var courtesyAttendees = pgTable("courtesy_attendees", {
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
  updatedAt: timestamp("updated_at").defaultNow()
});
var massSendJobs = pgTable("mass_send_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  status: text("status", { enum: ["pending", "processing", "completed", "failed"] }).default("pending").notNull(),
  csvData: text("csv_data").notNull(),
  attachmentData: text("attachment_data"),
  // Storing as JSON string
  createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});
var eventPrintSettings = pgTable("event_print_settings", {
  eventId: varchar("event_id").primaryKey().references(() => events.id, { onDelete: "cascade" }),
  isEnabled: boolean("is_enabled").default(false).notNull(),
  updatedBy: varchar("updated_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});
var printJobs = pgTable("print_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  orderId: varchar("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  displayName: varchar("display_name", { length: 255 }).notNull(),
  /** Set for courtesy (`partner_company`); second line on the badge. */
  companyLine: varchar("company_line", { length: 255 }),
  status: text("status", {
    enum: ["pending", "processing", "completed", "failed"]
  }).default("pending").notNull(),
  /** Print attempts (incremented on each failure; max 3). */
  attempts: integer("attempts").default(0).notNull(),
  lockedBySocketId: varchar("locked_by_socket_id", { length: 64 }),
  lastErrorCode: varchar("last_error_code", { length: 50 }),
  lastErrorMessage: text("last_error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true })
});
var usersRelations = relations(users, ({ many }) => ({
  orders: many(orders),
  courtesyLinks: many(courtesyLinks),
  certificates: many(certificates)
}));
var eventsRelations = relations(events, ({ many }) => ({
  orders: many(orders),
  courtesyLinks: many(courtesyLinks),
  certificates: many(certificates)
}));
var certificatesRelations = relations(certificates, ({ one }) => ({
  user: one(users, {
    fields: [certificates.userId],
    references: [users.id]
  }),
  event: one(events, {
    fields: [certificates.eventId],
    references: [events.id]
  })
}));
var ordersRelations = relations(orders, ({ one }) => ({
  user: one(users, {
    fields: [orders.userId],
    references: [users.id]
  }),
  event: one(events, {
    fields: [orders.eventId],
    references: [events.id]
  }),
  courtesyLink: one(courtesyLinks, {
    fields: [orders.courtesyLinkId],
    references: [courtesyLinks.id]
  }),
  courtesyAttendee: one(courtesyAttendees, {
    fields: [orders.courtesyAttendeeId],
    references: [courtesyAttendees.id]
  })
}));
var courtesyLinksRelations = relations(courtesyLinks, ({ one, many }) => ({
  event: one(events, {
    fields: [courtesyLinks.eventId],
    references: [events.id]
  }),
  createdByUser: one(users, {
    fields: [courtesyLinks.createdBy],
    references: [users.id]
  }),
  orders: many(orders)
}));
var eventPrintSettingsRelations = relations(eventPrintSettings, ({ one }) => ({
  event: one(events, {
    fields: [eventPrintSettings.eventId],
    references: [events.id]
  }),
  updatedByUser: one(users, {
    fields: [eventPrintSettings.updatedBy],
    references: [users.id]
  })
}));
var insertUserSchema = createInsertSchema(users, {
  email: z.string().email("Email inv\xE1lido"),
  cpf: z.string().regex(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/, "CPF deve estar no formato 000.000.000-00"),
  phone: z.string().regex(/^\(\d{2}\)\s\d{4,5}-\d{4}$/, "Telefone deve estar no formato (00) 00000-0000"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  address: z.string().min(10, "Endere\xE7o deve ter pelo menos 10 caracteres"),
  birthDate: z.date({ required_error: "Data de nascimento \xE9 obrigat\xF3ria" })
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  emailVerified: true,
  isAdmin: true
});
var insertEventSchema = createInsertSchema(events).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  currentAttendees: true
});
var insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  qrCodeData: true,
  qrCodeUsed: true,
  qrCodeUsedAt: true
});
var insertEmailQueueSchema = createInsertSchema(emailQueue).omit({
  id: true,
  createdAt: true,
  processedAt: true,
  status: true,
  attempts: true
});
var insertCourtesyLinkSchema = createInsertSchema(courtesyLinks, {
  recipientEmail: z.string().email().optional(),
  recipientName: z.string().optional()
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  usedCount: true
});
var insertCourtesyAttendeeSchema = createInsertSchema(courtesyAttendees, {
  occupation: z.string().optional()
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
var loginSchema = z.object({
  email: z.string().email("Email inv\xE1lido"),
  password: z.string().min(1, "Senha \xE9 obrigat\xF3ria")
});
var courtesyRedemptionSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  email: z.string().email("Email inv\xE1lido"),
  emailConfirm: z.string().email("Email inv\xE1lido"),
  cpf: z.string().regex(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/, "CPF deve estar no formato 000.000.000-00"),
  partnerCompany: z.string().min(2, "Empresa parceira \xE9 obrigat\xF3ria"),
  occupation: z.string().min(2, "Cargo \xE9 obrigat\xF3rio"),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve estar no formato AAAA-MM-DD"),
  address: z.string().min(10, "Endere\xE7o deve ter pelo menos 10 caracteres"),
  phone: z.string().regex(/^\(\d{2}\)\s\d{4,5}-\d{4}$/, "Telefone deve estar no formato (00) 00000-0000")
}).refine((data) => data.email === data.emailConfirm, {
  message: "Os emails n\xE3o coincidem",
  path: ["emailConfirm"]
});

// server/db.ts
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import "dotenv/config";
import ws from "ws";
neonConfig.webSocketConstructor = ws;
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?"
  );
}
var pool = new Pool({ connectionString: process.env.DATABASE_URL });
var db = drizzle({ client: pool, schema: schema_exports });

// server/storage.ts
import { eq, ne, desc, sql as sql2, asc, count, and } from "drizzle-orm";

// server/services/s3Service.ts
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
var S3Service = class {
  s3Client;
  bucketName;
  constructor() {
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || "sa-east-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });
    this.bucketName = process.env.AWS_S3_BUCKET_NAME;
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || !this.bucketName) {
      throw new Error("Missing required AWS S3 environment variables");
    }
  }
  /**
   * Upload a buffer (like QR code image) to S3
   * @param buffer - The file buffer to upload
   * @param key - The S3 object key (file path)
   * @param contentType - The MIME type of the file
   * @returns Promise with the S3 object URL
   */
  async uploadBuffer(buffer, key, contentType = "image/png") {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType
      });
      await this.s3Client.send(command);
      return `https://${this.bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
    } catch (error) {
      console.error("Error uploading to S3:", error);
      throw new Error(`Failed to upload file to S3: ${error}`);
    }
  }
  /**
   * Upload QR code buffer specifically
   * @param qrCodeBuffer - The QR code image buffer
   * @param orderId - Order ID for unique naming
   * @returns Promise with the S3 URL
   */
  async uploadQRCode(qrCodeBuffer, orderId) {
    const timestamp2 = Date.now();
    const key = `qr-codes/${orderId}-${timestamp2}.png`;
    return this.uploadBuffer(qrCodeBuffer, key, "image/png");
  }
  /**
   * Generate a presigned URL for secure file access
   * @param key - The S3 object key
   * @param expiresIn - URL expiration time in seconds (default: 1 hour)
   * @returns Promise with the presigned URL
   */
  async getPresignedUrl(key, expiresIn = 3600) {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key
      });
      return await getSignedUrl(this.s3Client, command, { expiresIn });
    } catch (error) {
      console.error("Error generating presigned URL:", error);
      throw new Error(`Failed to generate presigned URL: ${error}`);
    }
  }
  /**
   * Delete a file from S3
   * @param key - The S3 object key to delete
   * @returns Promise<void>
   */
  async deleteFile(key) {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key
      });
      await this.s3Client.send(command);
    } catch (error) {
      console.error("Error deleting from S3:", error);
      throw new Error(`Failed to delete file from S3: ${error}`);
    }
  }
  /**
   * Extract S3 key from a full S3 URL
   * @param url - The full S3 URL
   * @returns The S3 object key
   */
  extractKeyFromUrl(url) {
    const urlParts = url.split("/");
    return urlParts.slice(3).join("/");
  }
};
var s3Service = new S3Service();

// server/utils/undoCheckInUpdate.ts
function buildUndoCheckInPatch(order) {
  const used = order.amntUsed ?? 0;
  const newAmntUsed = used - 1;
  const isStillUsed = newAmntUsed > 0;
  return {
    amntUsed: newAmntUsed,
    qrCodeUsed: isStillUsed,
    qrCodeUsedAt: isStillUsed ? order.qrCodeUsedAt ?? null : null
  };
}

// server/utils/courtesyTicketCountUpdate.ts
function validateCourtesyTicketCountUpdate(params) {
  const { nextTicketCount } = params;
  if (typeof nextTicketCount !== "number" || !Number.isInteger(nextTicketCount)) {
    return "Informe um limite inteiro v\xE1lido.";
  }
  if (nextTicketCount < 1) {
    return "O limite deve ser pelo menos 1.";
  }
  if (nextTicketCount < params.usedCount) {
    return "Limite n\xE3o pode ser menor que o n\xFAmero de usos j\xE1 registrados.";
  }
  return null;
}

// server/utils/printJobPolicy.ts
var MAX_PRINT_ATTEMPTS = 3;
function nextStateAfterPrintFailure(attemptsBefore) {
  const next = attemptsBefore + 1;
  if (next >= MAX_PRINT_ATTEMPTS) {
    return { status: "failed", attempts: next };
  }
  return { status: "pending", attempts: next };
}

// server/storage.ts
var DatabaseStorage = class {
  // User operations
  async getUser(id) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }
  async getUserByEmail(email) {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }
  async getUserByCpf(cpf) {
    const [user] = await db.select().from(users).where(eq(users.cpf, cpf));
    return user;
  }
  async createUser(userData) {
    const [user] = await db.insert(users).values({
      ...userData,
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    }).returning();
    return user;
  }
  async updateUser(id, updates) {
    const [user] = await db.update(users).set({ ...updates, updatedAt: /* @__PURE__ */ new Date() }).where(eq(users.id, id)).returning();
    return user;
  }
  async verifyUserEmail(id) {
    const [user] = await db.update(users).set({ emailVerified: true, updatedAt: /* @__PURE__ */ new Date() }).where(eq(users.id, id)).returning();
    return !!user;
  }
  async deleteUser(id) {
    await db.delete(orders).where(eq(orders.userId, id));
    const result = await db.delete(users).where(eq(users.id, id));
    return (result.rowCount ?? 0) > 0;
  }
  // Event operations
  async getEvents() {
    const startOfToday = /* @__PURE__ */ new Date();
    startOfToday.setHours(0, 0, 0, 0);
    return await db.select().from(events).where(eq(events.isActive, true)).orderBy(asc(events.date));
  }
  async getAllEventsForAdmin() {
    return await db.select().from(events).orderBy(asc(events.date));
  }
  async getAllEventsForAdminPaginated(page, limit) {
    const safePage = Math.max(1, Math.floor(page));
    const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));
    const offset = (safePage - 1) * safeLimit;
    const [countRow] = await db.select({ n: count() }).from(events);
    const total = Number(countRow?.n ?? 0);
    const list = await db.select().from(events).orderBy(desc(events.date)).limit(safeLimit).offset(offset);
    return { events: list, total };
  }
  async getEvent(id) {
    const [event] = await db.select().from(events).where(eq(events.id, id));
    return event;
  }
  async createEvent(eventData) {
    const [event] = await db.insert(events).values({
      ...eventData,
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    }).returning();
    return event;
  }
  async updateEvent(id, updates) {
    const [event] = await db.update(events).set({ ...updates, updatedAt: /* @__PURE__ */ new Date() }).where(eq(events.id, id)).returning();
    return event;
  }
  async deleteEvent(id) {
    return await db.transaction(async (tx) => {
      await tx.delete(orders).where(eq(orders.eventId, id));
      await tx.delete(courtesyLinks).where(eq(courtesyLinks.eventId, id));
      await tx.delete(certificates).where(eq(certificates.eventId, id));
      const result = await tx.delete(events).where(eq(events.id, id));
      return (result.rowCount ?? 0) > 0;
    });
  }
  // Order operations
  async getOrder(id) {
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    return order;
  }
  async getOrdersByUser(userId, page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    const ordersQuery = db.select({
      id: orders.id,
      userId: orders.userId,
      eventId: orders.eventId,
      status: orders.status,
      courtesyAttendeeId: orders.courtesyAttendeeId,
      cpf: orders.cpf,
      paymentMethod: orders.paymentMethod,
      amount: orders.amount,
      asaasPaymentId: orders.asaasPaymentId,
      courtesyLinkId: orders.courtesyLinkId,
      qrCodeData: orders.qrCodeData,
      qr_code_s3_url: orders.qr_code_s3_url,
      qrCodeUsed: orders.qrCodeUsed,
      maxUses: orders.maxUses,
      amntUsed: orders.amntUsed,
      qrCodeUsedAt: orders.qrCodeUsedAt,
      createdAt: orders.createdAt,
      updatedAt: orders.updatedAt,
      event: {
        id: events.id,
        title: events.title,
        description: events.description,
        date: events.date,
        location: events.location,
        price: events.price,
        imageUrl: events.imageUrl
      }
    }).from(orders).leftJoin(events, eq(orders.eventId, events.id)).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt)).limit(limit).offset(offset);
    const totalQuery = db.select({ value: count() }).from(orders).where(eq(orders.userId, userId));
    const [ordersResult, totalResult] = await Promise.all([ordersQuery, totalQuery]);
    return {
      orders: ordersResult,
      total: totalResult[0].value
    };
  }
  async createOrder(orderData) {
    const [order] = await db.insert(orders).values({
      ...orderData,
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    }).returning();
    return order;
  }
  async createCourtesyAttendee(attendee) {
    const [newAttendee] = await db.insert(courtesyAttendees).values(attendee).returning();
    return newAttendee;
  }
  async updateOrder(id, updates) {
    const [order] = await db.update(orders).set({ ...updates, updatedAt: /* @__PURE__ */ new Date() }).where(eq(orders.id, id)).returning();
    return order;
  }
  async getOrderByAsaasPaymentId(paymentId) {
    const [order] = await db.select().from(orders).where(eq(orders.asaasPaymentId, paymentId));
    return order;
  }
  async isCpfAlreadyRegisteredForEvent(cpf, eventId) {
    const existingOrder = await db.select().from(orders).where(
      and(
        eq(orders.cpf, cpf),
        eq(orders.eventId, eventId),
        ne(orders.status, "cancelled")
      )
    ).limit(1);
    return existingOrder.length > 0;
  }
  // Email queue operations
  async addEmailToQueue(emailData) {
    const [email] = await db.insert(emailQueue).values({
      ...emailData,
      createdAt: /* @__PURE__ */ new Date()
    }).returning();
    return email;
  }
  async getPendingEmails() {
    return await db.select().from(emailQueue).where(eq(emailQueue.status, "pending")).orderBy(emailQueue.createdAt);
  }
  async updateEmailStatus(id, status, processedAt) {
    await db.update(emailQueue).set({
      status,
      processedAt: processedAt || /* @__PURE__ */ new Date(),
      attempts: sql2`attempts + 1`
    }).where(eq(emailQueue.id, id));
  }
  async deleteOrder(id) {
    await db.delete(orders).where(eq(orders.id, id));
  }
  async getPendingOrders() {
    return await db.select().from(orders).where(eq(orders.status, "pending"));
  }
  // Courtesy link operations
  async createCourtesyLink(linkData) {
    const [link] = await db.insert(courtesyLinks).values({
      ...linkData,
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    }).returning();
    return link;
  }
  async getCourtesyLinkByCode(code) {
    const [link] = await db.select().from(courtesyLinks).where(eq(courtesyLinks.code, code));
    return link;
  }
  async getCourtesyLinksByCreator(userId, page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    const linksQuery = db.select().from(courtesyLinks).where(eq(courtesyLinks.createdBy, userId)).orderBy(desc(courtesyLinks.createdAt)).limit(limit).offset(offset);
    const totalQuery = db.select({ value: count() }).from(courtesyLinks).where(eq(courtesyLinks.createdBy, userId));
    const [linksResult, totalResult] = await Promise.all([linksQuery, totalQuery]);
    return {
      links: linksResult,
      total: totalResult[0].value
    };
  }
  async updateCourtesyLink(id, updates) {
    const [link] = await db.update(courtesyLinks).set({ ...updates, updatedAt: /* @__PURE__ */ new Date() }).where(eq(courtesyLinks.id, id)).returning();
    return link;
  }
  async updateCourtesyLinkTicketCount(id, ticketCount) {
    const [link] = await db.select().from(courtesyLinks).where(eq(courtesyLinks.id, id));
    if (!link) {
      throw new Error("LINK_NOT_FOUND");
    }
    const errMsg = validateCourtesyTicketCountUpdate({
      usedCount: link.usedCount ?? 0,
      nextTicketCount: ticketCount
    });
    if (errMsg) {
      throw new Error(errMsg);
    }
    const [updated] = await db.update(courtesyLinks).set({ ticketCount, updatedAt: /* @__PURE__ */ new Date() }).where(eq(courtesyLinks.id, id)).returning();
    if (!updated) {
      throw new Error("LINK_NOT_FOUND");
    }
    return updated;
  }
  async incrementCourtesyLinkUsage(id) {
    await db.update(courtesyLinks).set({
      usedCount: sql2`used_count + 1`,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq(courtesyLinks.id, id));
  }
  async cancelOrderAndInvalidateQr(orderId) {
    const order = await this.getOrder(orderId);
    if (!order) {
      return { ok: false, code: "not_found" };
    }
    if (order.status === "cancelled") {
      return { ok: false, code: "already_cancelled", order };
    }
    if (order.status !== "pending" && order.status !== "paid") {
      return { ok: false, code: "invalid_status", status: order.status };
    }
    if (order.qr_code_s3_url) {
      try {
        const key = s3Service.extractKeyFromUrl(order.qr_code_s3_url);
        await s3Service.deleteFile(key);
      } catch (s3Error) {
        console.error(`Erro ao deletar QR Code do S3 (Order ${orderId}):`, s3Error);
      }
    }
    const [updated] = await db.update(orders).set({
      status: "cancelled",
      qrCodeData: null,
      qr_code_s3_url: null,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq(orders.id, orderId)).returning();
    if (!updated) {
      return { ok: false, code: "not_found" };
    }
    return { ok: true, order: updated };
  }
  async undoOrderCheckIn(orderId) {
    const order = await this.getOrder(orderId);
    if (!order) {
      throw new Error("Pedido n\xE3o encontrado");
    }
    if (order.status === "cancelled") {
      throw new Error("N\xE3o \xE9 poss\xEDvel alterar presen\xE7a de ingresso cancelado");
    }
    if ((order.amntUsed ?? 0) === 0) {
      throw new Error("Este ingresso n\xE3o possui check-in para ser desmarcado");
    }
    const patch = buildUndoCheckInPatch(order);
    const [updated] = await db.update(orders).set({
      ...patch,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq(orders.id, orderId)).returning();
    if (!updated) {
      throw new Error("Pedido n\xE3o encontrado");
    }
    return updated;
  }
  async getCourtesyAttendeeById(id) {
    const [a] = await db.select().from(courtesyAttendees).where(eq(courtesyAttendees.id, id));
    return a;
  }
  async getEventPrintSetting(eventId) {
    const [row] = await db.select().from(eventPrintSettings).where(eq(eventPrintSettings.eventId, eventId));
    if (!row) {
      return { isEnabled: false };
    }
    return { isEnabled: row.isEnabled ?? false };
  }
  async upsertEventPrintSetting(eventId, isEnabled, updatedBy) {
    const now = /* @__PURE__ */ new Date();
    await db.insert(eventPrintSettings).values({
      eventId,
      isEnabled,
      updatedBy,
      createdAt: now,
      updatedAt: now
    }).onConflictDoUpdate({
      target: eventPrintSettings.eventId,
      set: {
        isEnabled,
        updatedBy,
        updatedAt: now
      }
    });
  }
  async createPrintJob(params) {
    const now = /* @__PURE__ */ new Date();
    const [row] = await db.insert(printJobs).values({
      eventId: params.eventId,
      orderId: params.orderId,
      displayName: params.displayName,
      companyLine: params.companyLine?.trim() ? params.companyLine.trim().slice(0, 255) : null,
      status: "pending",
      attempts: 0,
      createdAt: now,
      updatedAt: now
    }).returning();
    if (!row) {
      throw new Error("PRINT_JOB_INSERT_FAILED");
    }
    return row;
  }
  async claimNextPrintJobForEvent(eventId, socketId) {
    const maxA = MAX_PRINT_ATTEMPTS;
    const result = await db.execute(sql2`
      UPDATE print_jobs AS pj
      SET
        status = 'processing',
        locked_by_socket_id = ${socketId},
        updated_at = NOW()
      FROM (
        SELECT pj2.id
        FROM print_jobs pj2
        WHERE pj2.status = 'pending'
          AND pj2.attempts < ${maxA}
          AND pj2.event_id = ${eventId}
        ORDER BY pj2.created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      ) AS sub
      WHERE pj.id = sub.id
      RETURNING pj.id,
        pj.event_id AS "eventId",
        pj.order_id AS "orderId",
        pj.display_name AS "displayName",
        pj.company_line AS "companyLine",
        pj.status,
        pj.attempts,
        pj.locked_by_socket_id AS "lockedBySocketId",
        pj.last_error_code AS "lastErrorCode",
        pj.last_error_message AS "lastErrorMessage",
        pj.created_at AS "createdAt",
        pj.updated_at AS "updatedAt",
        pj.completed_at AS "completedAt"
    `);
    return result.rows?.[0];
  }
  async completePrintJob(jobId, socketId) {
    const [row] = await db.update(printJobs).set({
      status: "completed",
      completedAt: /* @__PURE__ */ new Date(),
      lockedBySocketId: null,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(
      and(
        eq(printJobs.id, jobId),
        eq(printJobs.lockedBySocketId, socketId)
      )
    ).returning();
    return !!row;
  }
  async failPrintJob(jobId, socketId, errorCode, message) {
    const job = await this.getPrintJobById(jobId);
    if (!job || job.lockedBySocketId !== socketId) {
      return { ok: false, terminalFailure: false };
    }
    const now = /* @__PURE__ */ new Date();
    const nextState = nextStateAfterPrintFailure(job.attempts ?? 0);
    if (nextState.status === "failed") {
      await db.update(printJobs).set({
        status: "failed",
        attempts: nextState.attempts,
        lastErrorCode: errorCode,
        lastErrorMessage: message,
        lockedBySocketId: null,
        updatedAt: now
      }).where(eq(printJobs.id, jobId));
      return { ok: true, terminalFailure: true };
    }
    await db.update(printJobs).set({
      status: "pending",
      attempts: nextState.attempts,
      lastErrorCode: errorCode,
      lastErrorMessage: message,
      lockedBySocketId: null,
      updatedAt: now
    }).where(eq(printJobs.id, jobId));
    return { ok: true, terminalFailure: false };
  }
  async getPrintJobById(id) {
    const [row] = await db.select().from(printJobs).where(eq(printJobs.id, id));
    return row;
  }
  async listPrintJobsForEvent(eventId, limit) {
    return await db.select().from(printJobs).where(eq(printJobs.eventId, eventId)).orderBy(desc(printJobs.createdAt)).limit(Math.min(200, Math.max(1, limit)));
  }
  async requeueJobOnSocketDisconnect(jobId, socketId) {
    await db.update(printJobs).set({
      status: "pending",
      lockedBySocketId: null,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(
      and(
        eq(printJobs.id, jobId),
        eq(printJobs.lockedBySocketId, socketId),
        eq(printJobs.status, "processing")
      )
    );
  }
  async addMassSendJobToQueue(jobData) {
    const newJob = {
      // ID is removed, database will generate it
      status: "pending",
      csvData: jobData.csvData,
      attachmentData: jobData.attachmentData,
      createdBy: jobData.createdBy
    };
    const [insertedJob] = await db.insert(massSendJobs).values(newJob).returning();
    return insertedJob;
  }
  /**
   * Gets pending mass-send jobs for the worker to process.
   * This is called by your new worker.
   */
  async getPendingMassSendJobs(limit = 5) {
    return db.select().from(massSendJobs).where(eq(massSendJobs.status, "pending")).orderBy(asc(massSendJobs.createdAt)).limit(limit);
  }
  /**
   * Updates the status of a specific mass-send job.
   * This is called by your new worker.
   */
  async updateMassSendJobStatus(jobId, status) {
    return db.update(massSendJobs).set({
      status,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq(massSendJobs.id, jobId));
  }
};
var storage = new DatabaseStorage();

// server/services/emailService.ts
if (!process.env.SENDGRID_API_KEY) {
  console.warn("SENDGRID_API_KEY environment variable not set");
}
var mailService = new MailService();
if (process.env.SENDGRID_API_KEY) {
  mailService.setApiKey(process.env.SENDGRID_API_KEY);
}
var FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || "relacionamento.mkt@cdpipharma.com.br";
var EVENT_TZ = "America/Sao_Paulo";
function courtesyMessageHtmlToPlainText(html) {
  return html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n").replace(/<\/li>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}
var EmailService = class {
  async sendEmail(to, subject, html, text2, attachments) {
    if (!process.env.SENDGRID_API_KEY) {
      console.log("SendGrid not configured, queuing email:", { to, subject });
      await storage.addEmailToQueue({
        to,
        subject,
        html,
        text: text2,
        attachments: attachments ? JSON.stringify(attachments) : null
      });
      return true;
    }
    try {
      const emailPayload = {
        to,
        from: { email: FROM_EMAIL, name: "CDPI Pass" },
        subject,
        html,
        text: text2
      };
      if (attachments && attachments.length > 0) {
        emailPayload.attachments = attachments;
      }
      await mailService.send(emailPayload);
      return true;
    } catch (error) {
      console.error("SendGrid email error:", error);
      await storage.addEmailToQueue({
        to,
        subject,
        html,
        text: text2,
        attachments: attachments ? JSON.stringify(attachments) : null
      });
      return false;
    }
  }
  async sendVerificationEmail(email, userId) {
    const verificationCode = Math.floor(1e5 + Math.random() * 9e5).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1e3);
    await storage.updateUser(userId, {
      emailVerificationCode: verificationCode,
      emailVerificationCodeExpiresAt: expiresAt
    });
    const html = `
      <h1>Confirme seu email - CDPI Pass</h1>
      <p>Seu c\xF3digo de verifica\xE7\xE3o \xE9:</p>
      <h2><b>${verificationCode}</b></h2>
      <p>Este c\xF3digo expira em 15 minutos.</p>
    `;
    const text2 = `Seu c\xF3digo de verifica\xE7\xE3o para o CDPI Pass \xE9: ${verificationCode}`;
    return this.sendEmail(email, "Seu C\xF3digo de Verifica\xE7\xE3o - CDPI Pass", html, text2);
  }
  async sendTicketEmail(email, data) {
    const eventDate = new Date(data.eventDate).toLocaleDateString("pt-BR", {
      timeZone: EVENT_TZ,
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Seu ingresso - CDPI Pass</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #0F4C75; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .ticket { 
            background: white; 
            border: 2px solid #3282B8; 
            border-radius: 10px; 
            padding: 20px; 
            margin: 20px 0; 
            text-align: center; 
          }
          .qr-code { 
            margin: 20px 0; 
            padding: 20px; 
            background: white; 
            border: 1px solid #ddd; 
            display: inline-block; 
          }
          .event-details { text-align: left; margin: 20px 0; }
          .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>\u{1F3AB} Seu Ingresso</h1>
            <h2>CDPI Pass</h2>
          </div>
          <div class="content">
            <p>Ol\xE1, <strong>${data.userName}</strong>!</p>
            <p>Seu pagamento foi confirmado! Aqui est\xE1 seu ingresso para o evento:</p>
            
            <div class="ticket">
              <h3>${data.eventTitle}</h3>
              <div class="event-details">
                <p><strong>\u{1F4C5} Data:</strong> ${eventDate}</p>
                <p><strong>\u{1F4CD} Local:</strong> ${data.eventLocation}</p>
                <p><strong>\u{1F39F}\uFE0F Pedido:</strong> #${data.orderId}</p>
              </div>
              
              <div class="qr-code">
                <p><strong>QR Code do Ingresso:</strong></p>
                <img src="${data.qrCodeS3Url}" alt="QR Code do Ingresso" style="max-width: 256px; height: auto; display: block; margin: 10px auto;">
                <p style="font-size: 12px; color: #666;">
                  Apresente este QR Code na entrada do evento
                </p>
              </div>
            </div>
            
            <div style="background: #BBE1FA; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <h4>\u{1F4CB} Instru\xE7\xF5es Importantes:</h4>
              <ul style="text-align: left;">
                <li>Chegue com 30 minutos de anteced\xEAncia</li>
                <li>O QR Code pode ser apresentado impresso ou no celular</li>
                <li>Em caso de d\xFAvidas, entre em contato conosco</li>
              </ul>
            </div>
          </div>
          <div class="footer">
            <p>CDPI Pass</p>
            <p>relacionamento.mkt@cdpipharma.com.br | +55 (62) 3636-9909 / (62) 99610-1694</p>
          </div>
        </div>
      </body>
      </html>
    `;
    const text2 = `
      CDPI Pass - Seu Ingresso
      
      Ol\xE1, ${data.userName}!
      
      Seu pagamento foi confirmado! Detalhes do evento:
      
      Evento: ${data.eventTitle}
      Data: ${eventDate}
      Local: ${data.eventLocation}
      Pedido: #${data.orderId}
      
      Importante: Seu QR Code est\xE1 anexado neste email. Para visualiz\xE1-lo, abra este email em HTML ou acesse sua conta no site.
      
      Apresente o QR Code na entrada do evento.
      Chegue com 30 minutos de anteced\xEAncia e traga um documento com foto.
    `;
    return this.sendEmail(email, `Seu ingresso para ${data.eventTitle} - CDPI Pass`, html, text2);
  }
  /**
   * E-mail simples com o link de checkout (cartão): sem template de cobrança Asaas;
   * apenas o link gerado pelo nosso fluxo.
   */
  async sendCardPaymentLinkEmail(email, data) {
    const html = `
      <p>Ol\xE1, <strong>${data.userName}</strong>,</p>
      <p>Para pagar com cart\xE3o o ingresso <strong>${data.eventTitle}</strong>, use o link abaixo:</p>
      <p><a href="${data.paymentUrl}">${data.paymentUrl}</a></p>
      <p>Ap\xF3s a confirma\xE7\xE3o do pagamento, voc\xEA receber\xE1 o QR Code do ingresso por e-mail.</p>
      <p style="color:#666;font-size:12px;">CDPI Pass</p>
    `;
    const text2 = `Ol\xE1, ${data.userName}. Link para pagamento com cart\xE3o (${data.eventTitle}): ${data.paymentUrl}`;
    return this.sendEmail(
      email,
      `Link de pagamento \u2014 ${data.eventTitle} \u2014 CDPI Pass`,
      html,
      text2
    );
  }
  async processEmailQueue() {
    if (!process.env.SENDGRID_API_KEY) {
      console.log("SendGrid not configured, skipping email queue processing");
      return;
    }
    const pendingEmails = await storage.getPendingEmails();
    for (const email of pendingEmails) {
      try {
        await mailService.send({
          to: email.to,
          from: { email: FROM_EMAIL, name: "CDPI Pass" },
          subject: email.subject,
          html: email.html || "",
          text: email.text || ""
        });
        await storage.updateEmailStatus(email.id, "sent");
        console.log(`Email sent successfully to ${email.to}`);
      } catch (error) {
        console.error(`Failed to send email to ${email.to}:`, error);
        await storage.updateEmailStatus(email.id, "failed");
      }
    }
  }
  async sendPasswordResetEmail(email, userId) {
    const resetToken = jwt.sign(
      { userId, type: "password-reset" },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "30m" }
    );
    const resetLink = `https://cdpipass.com.br/reset-password?token=${resetToken}`;
    const html = `
        <h1>Redefini\xE7\xE3o de Senha</h1>
        <p>Voc\xEA solicitou a redefini\xE7\xE3o de sua senha. Clique no link abaixo para criar uma nova:</p>
        <a href="${resetLink}">Redefinir Senha</a>
        <p>Este link expirar\xE1 em 30 minutos.</p>
    `;
    const text2 = `Acesse este link para redefinir sua senha: ${resetLink}`;
    return this.sendEmail(email, "Redefini\xE7\xE3o de Senha - CDPI Pass", html, text2);
  }
  /**
   * Sends the standard courtesy mass email layout. Header, CTA, notice box, and footer are fixed.
   * @param customMessageBoxHtml - If set (already-interpolated HTML), replaces only the dynamic paragraphs
   * inside `.message-box` before the static "Para resgatar..." line. Use placeholders resolved upstream.
   */
  async sendCourtesyMassEmail(email, name, eventName, courtesyCode, eventDate, attachments, customMessageBoxHtml) {
    const redeemUrl = `${process.env.BASE_URL}/cortesia?code=${courtesyCode}`;
    const subject = `Sua cortesia para o evento ${eventName}`;
    const defaultMessageInner = `
              <p style="font-size: 18px;">Ol\xE1, <strong>${name}</strong>!</p>
              <p>Voc\xEA recebeu uma cortesia para o <strong>${eventName}</strong> nas datas <strong>quarta-feira e quinta-feira, 04 e 05 de mar\xE7o de 2026!</strong>!</p>
              <p style="font-style: italic; color: #333;">
                Um evento que tem como objetivo aprofundar a discuss\xE3o sobre os crit\xE9rios t\xE9cnicos e regulat\xF3rios para comprova\xE7\xE3o de efic\xE1cia e seguran\xE7a de medicamentos de libera\xE7\xE3o prolongada, considerando os par\xE2metros farmacocin\xE9ticos exigidos atualmente e a aplica\xE7\xE3o pr\xE1tica dos guias internacionais utilizados como refer\xEAncia regulat\xF3ria.
              </p>
    `;
    const messageInner = customMessageBoxHtml !== void 0 && customMessageBoxHtml.trim() !== "" ? customMessageBoxHtml : defaultMessageInner;
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${subject}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #0F4C75; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; text-align: center; }
          .message-box { text-align: left; margin: 20px 0; }
          .cta-button {
            background-color: #3282B8;
            color: white;
            padding: 15px 25px;
            text-decoration: none;
            border-radius: 5px;
            font-size: 16px;
            display: inline-block;
            margin: 20px 0;
          }
          .important-notice {
            background: #BBE1FA;
            padding: 15px;
            border-radius: 5px;
            margin: 20px 0;
            text-align: left;
          }
          .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>\u{1F381} Voc\xEA Recebeu uma Cortesia!</h1>
            <h2>CDPI Pass</h2>
          </div>
          <div class="content">
            <div class="message-box">
              ${messageInner}
              <p>Para resgatar seu ingresso, clique no bot\xE3o abaixo:</p>
            </div>
            
            <a href="${redeemUrl}" class="cta-button">Resgatar Ingresso Agora</a>
            
            <div class="important-notice">
            <p>Ou se preferir, voc\xEA pode resgatar a cortesia por meio do nosso site com o c\xF3digo:    <strong>${courtesyCode}</strong></p>
              <h4>\u26A0\uFE0F Instru\xE7\xF5es Importantes:</h4>
              <p>
                \xC9 imprescind\xEDvel fazer o resgate da sua cortesia at\xE9 o prazo de <strong>48 horas</strong> ap\xF3s o recebimento dessa confirma\xE7\xE3o de inscri\xE7\xE3o para garantir a sua vaga e participar do evento.
              </p>
            </div>
          </div>
          <div class="footer">
            <p>Atenciosamente,<br>Equipe CDPI Pass</p>
            <p>relacionamento.mkt@cdpipharma.com.br | +55 (62) 3636-9909 / (62) 99610-1694</p>
          </div>
        </div>
      </body>
      </html>
    `;
    const defaultTextBody = `
      Ol\xE1, ${name}!

      Voc\xEA recebeu uma cortesia para o ${eventName} nas datas quarta-feira e quinta-feira, 04 e 05 de mar\xE7o de 2026!

      Um evento que tem como objetivo aprofundar a discuss\xE3o sobre os crit\xE9rios t\xE9cnicos e regulat\xF3rios para comprova\xE7\xE3o de efic\xE1cia e seguran\xE7a de medicamentos de libera\xE7\xE3o prolongada, considerando os par\xE2metros farmacocin\xE9ticos exigidos atualmente e a aplica\xE7\xE3o pr\xE1tica dos guias internacionais utilizados como refer\xEAncia regulat\xF3ria.
    `;
    const textMessagePart = customMessageBoxHtml !== void 0 && customMessageBoxHtml.trim() !== "" ? courtesyMessageHtmlToPlainText(customMessageBoxHtml) : defaultTextBody.trim();
    const text2 = `
${textMessagePart}

Para resgatar seu ingresso, acesse o seguinte link:
${redeemUrl}

C\xF3digo: ${courtesyCode}

\u26A0\uFE0F \xC9 imprescind\xEDvel fazer o resgate da sua cortesia at\xE9 o prazo de 48 horas ap\xF3s o recebimento dessa confirma\xE7\xE3o de inscri\xE7\xE3o para garantir a sua vaga e participar do evento.

Atenciosamente,
Equipe CDPI Pass
`.trim();
    return this.sendEmail(email, subject, html, text2, attachments);
  }
  async _sendEmailFromQueue(to, subject, html, text2, attachments) {
    if (!process.env.SENDGRID_API_KEY) {
      console.warn("SendGrid not configured, email worker cannot send email:", { to, subject });
      return false;
    }
    try {
      const emailPayload = {
        to,
        from: { email: FROM_EMAIL, name: "CDPI Pass" },
        subject,
        html,
        text: text2
      };
      if (attachments && attachments.length > 0) {
        emailPayload.attachments = attachments;
      }
      await mailService.send(emailPayload);
      return true;
    } catch (error) {
      console.error("SendGrid email error (from queue):", error);
      throw error;
    }
  }
};
var emailService = new EmailService();

// server/workers/emailWorker.ts
import { parse } from "csv-parse/sync";

// server/utils/templateRenderer.ts
function renderTemplate(html, variables) {
  return Object.entries(variables).reduce((result, [key, value]) => {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return result.replace(new RegExp(`\\{${escaped}\\}`, "g"), value);
  }, html);
}

// server/workers/emailWorker.ts
var EmailWorker = class {
  isRunning = false;
  processInterval = null;
  PROCESS_INTERVAL = 2e4;
  MAX_CONCURRENT_JOBS = 5;
  isCycleRunning = false;
  start() {
    if (this.isRunning) {
      console.log("Email worker is already running");
      return;
    }
    this.isRunning = true;
    console.log("Starting email worker...");
    this.processInterval = setInterval(() => {
      this.runWorkerCycle();
    }, this.PROCESS_INTERVAL);
  }
  stop() {
    if (!this.isRunning) {
      console.log("Email worker is not running");
      return;
    }
    this.isRunning = false;
    console.log("Stopping email worker...");
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
    }
  }
  async runWorkerCycle() {
    if (this.isCycleRunning) {
      return;
    }
    this.isCycleRunning = true;
    try {
      await Promise.allSettled([
        this.processEmailQueue(),
        this.processMassSendQueue()
        // <-- This is our new function
      ]);
    } catch (error) {
      console.error("Error during worker cycle:", error);
    } finally {
      this.isCycleRunning = false;
    }
  }
  async processEmailQueue() {
    try {
      const pendingEmails = await storage.getPendingEmails();
      if (pendingEmails.length === 0) {
        return;
      }
      console.log(`Processing ${pendingEmails.length} pending emails`);
      const emailsToProcess = pendingEmails.slice(0, this.MAX_CONCURRENT_JOBS);
      const processPromises = emailsToProcess.map(
        (email) => this.processEmailJob(email)
      );
      await Promise.allSettled(processPromises);
    } catch (error) {
      console.error("Error processing email queue:", error);
    }
  }
  async processEmailJob(email) {
    try {
      console.log(`Processing email job ${email.id} to ${email.to}`);
      const attachments = email.attachments ? JSON.parse(email.attachments) : void 0;
      const success = await emailService._sendEmailFromQueue(
        email.to,
        email.subject,
        email.html || "",
        email.text || "",
        attachments
      );
      if (success) {
        await storage.updateEmailStatus(email.id, "sent");
        console.log(`Email sent successfully to ${email.to}`);
      } else {
        await storage.updateEmailStatus(email.id, "failed");
        console.error(`Email job ${email.id} failed: SendGrid is not configured.`);
      }
    } catch (error) {
      console.error(`Error processing email job ${email.id}:`, error);
      await this.handleEmailFailure(email);
    }
  }
  async handleEmailFailure(email) {
    const maxAttempts = 3;
    if (email.attempts >= maxAttempts) {
      await storage.updateEmailStatus(email.id, "failed");
      console.error(`Email job ${email.id} failed after ${maxAttempts} attempts`);
    } else {
      console.log(`Email job ${email.id} failed, will retry (attempt ${email.attempts + 1}/${maxAttempts})`);
    }
  }
  async processMassSendQueue() {
    const pendingJobs = await storage.getPendingMassSendJobs(1);
    if (pendingJobs.length === 0) {
      return;
    }
    const job = pendingJobs[0];
    try {
      console.log(`Processing mass-send job ${job.id}.`);
      await storage.updateMassSendJobStatus(job.id, "processing");
      const results = parse(job.csvData, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        delimiter: [",", ";"],
        // Detects comma or semicolon
        relax_column_count: true
      });
      const attachments = job.attachmentData ? [JSON.parse(job.attachmentData)] : void 0;
      console.log(`Job ${job.id}: Found ${results.length} rows to process.`);
      const eventCache = /* @__PURE__ */ new Map();
      const getCachedEvent = async (eventId) => {
        if (eventCache.has(eventId)) {
          return eventCache.get(eventId);
        }
        const ev = await storage.getEvent(eventId);
        eventCache.set(eventId, ev);
        return ev;
      };
      const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      });
      for (const row of results) {
        const normalizedRow = Object.keys(row).reduce((acc, key) => {
          acc[key.trim()] = row[key];
          return acc;
        }, {});
        const { name, email, amount_of_courtesies, event_id } = normalizedRow;
        if (!name || !email || !event_id || !amount_of_courtesies) {
          console.warn(`Job ${job.id}: Skipping row due to missing data:`, normalizedRow);
          continue;
        }
        const event = await getCachedEvent(event_id);
        if (event) {
          const code = `CDPI${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
          const link = await storage.createCourtesyLink({
            code,
            eventId: event.id,
            ticketCount: parseInt(amount_of_courtesies, 10),
            createdBy: job.createdBy,
            isActive: true,
            recipientEmail: email,
            recipientName: name
          });
          const eventDate = event.date instanceof Date ? event.date : new Date(event.date);
          if (event.courtesyTemplate?.trim()) {
            const redeemUrl = `${process.env.BASE_URL}/cortesia?code=${link.code}`;
            const variables = {
              nome: String(name),
              evento: event.title,
              data: Number.isNaN(eventDate.getTime()) ? "" : dateFormatter.format(eventDate),
              link: redeemUrl
            };
            const customMessageBoxHtml = renderTemplate(event.courtesyTemplate, variables);
            await emailService.sendCourtesyMassEmail(
              email,
              name,
              event.title,
              link.code,
              event.date,
              attachments,
              customMessageBoxHtml
            );
          } else {
            await emailService.sendCourtesyMassEmail(
              email,
              name,
              event.title,
              link.code,
              event.date,
              attachments
            );
          }
        } else {
          console.warn(`Job ${job.id}: Event not found for ID ${event_id}`);
        }
      }
      await storage.updateMassSendJobStatus(job.id, "completed");
      console.log(`Mass-send job ${job.id} completed successfully.`);
    } catch (error) {
      console.error(`Error processing mass-send job ${job.id}:`, error);
      await storage.updateMassSendJobStatus(job.id, "failed");
    }
  }
  async addEmailJob(emailData) {
    try {
      await storage.addEmailToQueue(emailData);
      console.log(`Added email job to queue: ${emailData.to}`);
    } catch (error) {
      console.error("Error adding email job to queue:", error);
      throw error;
    }
  }
  async getQueueStatus() {
    const pendingEmails = await storage.getPendingEmails();
    return {
      pending: pendingEmails.length,
      failed: 0,
      // Would need to implement this query
      sent: 0
      // Would need to implement this query
    };
  }
  isWorkerRunning() {
    return this.isRunning;
  }
};
var emailWorker = new EmailWorker();

// server/run-email-worker.ts
console.log("Starting the dedicated email worker process...");
emailWorker.start();
//# sourceMappingURL=run-email-worker.js.map