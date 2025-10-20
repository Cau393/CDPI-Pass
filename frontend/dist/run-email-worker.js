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
  courtesyAttendees: () => courtesyAttendees,
  courtesyLinks: () => courtesyLinks,
  courtesyLinksRelations: () => courtesyLinksRelations,
  courtesyRedemptionSchema: () => courtesyRedemptionSchema,
  emailQueue: () => emailQueue,
  events: () => events,
  eventsRelations: () => eventsRelations,
  insertCourtesyAttendeeSchema: () => insertCourtesyAttendeeSchema,
  insertCourtesyLinkSchema: () => insertCourtesyLinkSchema,
  insertEmailQueueSchema: () => insertEmailQueueSchema,
  insertEventSchema: () => insertEventSchema,
  insertOrderSchema: () => insertOrderSchema,
  insertUserSchema: () => insertUserSchema,
  loginSchema: () => loginSchema,
  orders: () => orders,
  ordersRelations: () => ordersRelations,
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
  integer
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
  updatedAt: timestamp("updated_at").defaultNow()
});
var courtesyLinks = pgTable("courtesy_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 100 }).notNull().unique(),
  eventId: varchar("event_id").notNull().references(() => events.id),
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
  // pending, paid, cancelled, courtesy
  paymentMethod: varchar("payment_method", { length: 50 }).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  asaasPaymentId: varchar("asaas_payment_id", { length: 255 }),
  courtesyLinkId: varchar("courtesy_link_id").references(() => courtesyLinks.id),
  qrCodeData: text("qr_code_data"),
  qrCodeUsed: boolean("qr_code_used").default(false),
  qrCodeUsedAt: timestamp("qr_code_used_at"),
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
  eventTitle: varchar("event_title", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var usersRelations = relations(users, ({ many }) => ({
  orders: many(orders),
  courtesyLinks: many(courtesyLinks)
}));
var eventsRelations = relations(events, ({ many }) => ({
  orders: many(orders),
  courtesyLinks: many(courtesyLinks)
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
var insertCourtesyLinkSchema = createInsertSchema(courtesyLinks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  usedCount: true
});
var insertCourtesyAttendeeSchema = createInsertSchema(courtesyAttendees).omit({
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
import { eq, desc, sql as sql2, asc, count, and } from "drizzle-orm";
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
      paymentMethod: orders.paymentMethod,
      amount: orders.amount,
      asaasPaymentId: orders.asaasPaymentId,
      courtesyLinkId: orders.courtesyLinkId,
      qrCodeData: orders.qrCodeData,
      qr_code_s3_url: orders.qr_code_s3_url,
      qrCodeUsed: orders.qrCodeUsed,
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
        eq(orders.eventId, eventId)
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
  async incrementCourtesyLinkUsage(id) {
    await db.update(courtesyLinks).set({
      usedCount: sql2`used_count + 1`,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq(courtesyLinks.id, id));
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
var FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || "relacionamento@cdpipharma.com.br";
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
            <p>relacionamento@cdpipharma.com.br | +55 (62) 99860-6833</p>
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
  async sendCourtesyMassEmail(email, name, eventName, courtesyCode, eventDate, attachments) {
    const redeemUrl = `${process.env.BASE_URL}/cortesia?code=${courtesyCode}`;
    const subject = `Sua cortesia para o evento ${eventName}`;
    const formattedEventDate = new Date(eventDate).toLocaleDateString("pt-BR", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric"
    });
    const redeemByDate = new Date(eventDate);
    redeemByDate.setDate(redeemByDate.getDate() - 6);
    const formattedRedeemByDate = redeemByDate.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
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
              <p style="font-size: 18px;">Ol\xE1, <strong>${name}</strong>!</p>
              <p>Voc\xEA recebeu uma cortesia para o <strong>${eventName}</strong> na data <strong>${formattedEventDate}</strong>!</p>
              <p style="font-style: italic; color: #333;">
                Um evento que amplia horizontes e conecta quem faz a diferen\xE7a na ind\xFAstria. Oportunidade \xEDmpar para voc\xEA dominar o Ciclo de Vida do Medicamento e acelerar a sua trajet\xF3ria profissional!
              </p>
              <p>Para resgatar seu ingresso, clique no bot\xE3o abaixo:</p>
            </div>
            
            <a href="${redeemUrl}" class="cta-button">Resgatar Ingresso Agora</a>
            
            <div class="important-notice">
            <p>Ou se preferir, voc\xEA pode resgatar a cortesia por meio do nosso site com o c\xF3digo:    <strong>${courtesyCode}</strong></p>
              <h4>\u26A0\uFE0F Instru\xE7\xF5es Importantes:</h4>
              <p>
                \xC9 importante fazer o resgate da sua cortesia imediatamente ou <strong>at\xE9 dia ${formattedRedeemByDate}</strong> para garantir sua vaga e participar do evento.
              </p>
            </div>
          </div>
          <div class="footer">
            <p>Atenciosamente,<br>Equipe CDPI Pass</p>
            <p>relacionamento@cdpipharma.com.br | +55 (62) 99860-6833</p>
          </div>
        </div>
      </body>
      </html>
    `;
    const text2 = `
      Ol\xE1, ${name}!

      Voc\xEA recebeu uma cortesia para o ${eventName} na data ${formattedEventDate}!

      Um evento que amplia horizontes e conecta quem faz a diferen\xE7a na ind\xFAstria.
      Oportunidade \xEDmpar para voc\xEA dominar o Ciclo de Vida do Medicamento e acelerar a sua trajet\xF3ria profissional!

      Para resgatar seu ingresso, acesse o seguinte link:
      ${redeemUrl}

      \u26A0\uFE0F Importante fazer o resgate da sua cortesia imediatamente ou at\xE9 dia ${formattedRedeemByDate} para garantir sua vaga e participar do evento.

      Atenciosamente,
      Equipe CDPI Pass
    `;
    return this.sendEmail(email, subject, html, text2, attachments);
  }
};
var emailService = new EmailService();

// server/workers/emailWorker.ts
var EmailWorker = class {
  isRunning = false;
  processInterval = null;
  PROCESS_INTERVAL = 2e3;
  // 2 seconds
  MAX_CONCURRENT_JOBS = 5;
  start() {
    if (this.isRunning) {
      console.log("Email worker is already running");
      return;
    }
    this.isRunning = true;
    console.log("Starting email worker...");
    this.processInterval = setInterval(() => {
      this.processEmailQueue();
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
  async processEmailQueue() {
    if (!this.isRunning) return;
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
      const success = await emailService.sendEmail(
        email.to,
        email.subject,
        email.html || "",
        email.text || ""
      );
      if (success) {
        await storage.updateEmailStatus(email.id, "sent");
        console.log(`Email sent successfully to ${email.to}`);
      } else {
        await this.handleEmailFailure(email);
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