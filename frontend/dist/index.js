var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/index.ts
import "dotenv/config";
import express2 from "express";

// server/routes.ts
import { createServer } from "http";

// shared/schema.ts
var schema_exports = {};
__export(schema_exports, {
  courtesyLinks: () => courtesyLinks,
  courtesyLinksRelations: () => courtesyLinksRelations,
  courtesyRedemptionSchema: () => courtesyRedemptionSchema,
  emailQueue: () => emailQueue,
  events: () => events,
  eventsRelations: () => eventsRelations,
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
  updatedAt: timestamp("updated_at").defaultNow()
});
var orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  eventId: varchar("event_id").notNull().references(() => events.id),
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
  status: varchar("status", { length: 50 }).default("pending"),
  // pending, sent, failed
  attempts: integer("attempts").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  processedAt: timestamp("processed_at")
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
import { eq, desc, sql as sql2 } from "drizzle-orm";
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
    return await db.select().from(events).where(eq(events.isActive, true)).orderBy(desc(events.date));
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
  async getOrdersByUser(userId) {
    return await db.select({
      id: orders.id,
      userId: orders.userId,
      eventId: orders.eventId,
      status: orders.status,
      paymentMethod: orders.paymentMethod,
      amount: orders.amount,
      asaasPaymentId: orders.asaasPaymentId,
      courtesyLinkId: orders.courtesyLinkId,
      qrCodeData: orders.qrCodeData,
      qrCodeS3Url: orders.qr_code_s3_url,
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
    }).from(orders).leftJoin(events, eq(orders.eventId, events.id)).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt));
  }
  async createOrder(orderData) {
    const [order] = await db.insert(orders).values({
      ...orderData,
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    }).returning();
    return order;
  }
  async updateOrder(id, updates) {
    const [order] = await db.update(orders).set({ ...updates, updatedAt: /* @__PURE__ */ new Date() }).where(eq(orders.id, id)).returning();
    return order;
  }
  async getOrderByAsaasPaymentId(paymentId) {
    const [order] = await db.select().from(orders).where(eq(orders.asaasPaymentId, paymentId));
    return order;
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
  async getCourtesyLinksByCreator(userId) {
    return await db.select().from(courtesyLinks).where(eq(courtesyLinks.createdBy, userId)).orderBy(desc(courtesyLinks.createdAt));
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

// server/routes.ts
import { z as z2 } from "zod";
import bcrypt from "bcrypt";
import jwt3 from "jsonwebtoken";

// server/utils/validation.ts
function validateCpf(cpf) {
  cpf = cpf.replace(/[^\d]/g, "");
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  let sum = 0;
  let remainder;
  for (let i = 1; i <= 9; i++) {
    sum += parseInt(cpf.substring(i - 1, i)) * (11 - i);
  }
  remainder = sum * 10 % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cpf.substring(9, 10))) return false;
  sum = 0;
  for (let i = 1; i <= 10; i++) {
    sum += parseInt(cpf.substring(i - 1, i)) * (12 - i);
  }
  remainder = sum * 10 % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cpf.substring(10, 11))) return false;
  return true;
}
function formatCpf(cpf) {
  cpf = cpf.replace(/[^\d]/g, "");
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}
function formatPhone(phone) {
  phone = phone.replace(/[^\d]/g, "");
  if (phone.length === 11) {
    return phone.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  } else if (phone.length === 10) {
    return phone.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  }
  return phone;
}

// server/services/emailService.ts
import { MailService } from "@sendgrid/mail";
import jwt from "jsonwebtoken";
if (!process.env.SENDGRID_API_KEY) {
  console.warn("SENDGRID_API_KEY environment variable not set");
}
var mailService = new MailService();
if (process.env.SENDGRID_API_KEY) {
  mailService.setApiKey(process.env.SENDGRID_API_KEY);
}
var FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || "relacionamento@cdpipharma.com.br";
var EmailService = class {
  async sendEmail(to, subject, html, text2) {
    if (!process.env.SENDGRID_API_KEY) {
      console.log("SendGrid not configured, queuing email:", { to, subject });
      await storage.addEmailToQueue({
        to,
        subject,
        html,
        text: text2
      });
      return true;
    }
    try {
      await mailService.send({
        to,
        from: FROM_EMAIL,
        subject,
        html,
        text: text2
      });
      return true;
    } catch (error) {
      console.error("SendGrid email error:", error);
      await storage.addEmailToQueue({
        to,
        subject,
        html,
        text: text2
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
                <li>Traga um documento com foto</li>
                <li>O QR Code pode ser apresentado impresso ou no celular</li>
                <li>Em caso de d\xFAvidas, entre em contato conosco</li>
              </ul>
            </div>
          </div>
          <div class="footer">
            <p>CDPI Pass - Eventos Farmac\xEAuticos</p>
            <p>contato@cdpipass.com.br | (11) 3000-0000</p>
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
          from: FROM_EMAIL,
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
};
var emailService = new EmailService();

// server/services/asaasService.ts
var AsaasService = class {
  apiKey;
  baseUrl;
  constructor() {
    this.apiKey = process.env.ASAAS_API_KEY || "";
    this.baseUrl = "https://api.asaas.com/v3";
    if (!process.env.ASAAS_API_KEY) {
      console.error("ASAAS_API_KEY environment variable is required for payment processing");
    }
  }
  async makeRequest(endpoint, method = "GET", data) {
    const url = `${this.baseUrl}${endpoint}`;
    const options = {
      method,
      headers: {
        "Content-Type": "application/json",
        "access_token": this.apiKey
      }
    };
    if (data && (method === "POST" || method === "PUT")) {
      options.body = JSON.stringify(data);
    }
    try {
      const response = await fetch(url, options);
      const responseData = await response.json();
      if (!response.ok) {
        throw new Error(`Asaas API error: ${response.status} - ${JSON.stringify(responseData)}`);
      }
      return responseData;
    } catch (error) {
      console.error("Asaas API request failed:", error);
      throw error;
    }
  }
  async createCustomer(customerData) {
    try {
      const existingCustomers = await this.makeRequest(`/customers?cpfCnpj=${customerData.cpfCnpj}`);
      if (existingCustomers.data && existingCustomers.data.length > 0) {
        return existingCustomers.data[0];
      }
      return await this.makeRequest("/customers", "POST", customerData);
    } catch (error) {
      console.error("Error creating/finding customer:", error);
      throw error;
    }
  }
  async createPayment(paymentData) {
    try {
      const customer = await this.createCustomer(paymentData.customer);
      const paymentPayload = {
        customer: customer.id,
        billingType: paymentData.billingType,
        value: paymentData.value,
        dueDate: paymentData.dueDate.toISOString().split("T")[0],
        // YYYY-MM-DD format
        description: paymentData.description,
        externalReference: paymentData.externalReference
      };
      const payment = await this.makeRequest("/payments", "POST", paymentPayload);
      if (paymentData.billingType === "PIX") {
        try {
          const pixInfo = await this.makeRequest(`/payments/${payment.id}/pixQrCode`);
          payment.pixTransaction = {
            qrCode: {
              encodedImage: pixInfo.encodedImage,
              payload: pixInfo.payload
            },
            expirationDate: pixInfo.expirationDate
          };
        } catch (pixError) {
          console.error("Error getting PIX QR code:", pixError);
        }
      }
      if (paymentData.billingType === "BOLETO") {
        payment.bankSlipUrl = payment.bankSlipUrl;
      }
      return payment;
    } catch (error) {
      console.error("Error creating payment:", error);
      throw error;
    }
  }
  async getPayment(paymentId) {
    try {
      return await this.makeRequest(`/payments/${paymentId}`);
    } catch (error) {
      console.error("Error getting payment:", error);
      throw error;
    }
  }
  async updatePayment(paymentId, updateData) {
    try {
      return await this.makeRequest(`/payments/${paymentId}`, "POST", updateData);
    } catch (error) {
      console.error("Error updating payment:", error);
      throw error;
    }
  }
  // Webhook signature validation (for production use)
  validateWebhookSignature(requestToken) {
    const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN;
    if (!expectedToken) {
      console.warn("ASAAS_WEBHOOK_TOKEN is not set. Skipping webhook validation.");
      return true;
    }
    if (!requestToken) {
      return false;
    }
    return requestToken === expectedToken;
  }
  async cancelPayment(paymentId) {
    try {
      return await this.makeRequest(`/payments/${paymentId}`, "DELETE");
    } catch (error) {
      console.error("Error canceling Asaas payment:", error);
      throw error;
    }
  }
};
var asaasService = new AsaasService();

// server/services/qrCodeService.ts
import QRCode from "qrcode";
import crypto from "crypto";

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

// server/services/qrCodeService.ts
var QRCodeService = class {
  /*
    Generate a QR code for the given data.
    @param data - The data to encode in the QR code.
    @returns The base64-encoded QR code data for database.
    @returns the S3 URL of the QR code uploaded.
  */
  async generateQRCode(data) {
    try {
      const ticketData = {
        orderId: data.orderId,
        eventId: data.eventId,
        userId: data.userId,
        timestamp: Date.now(),
        checksum: this.generateChecksum(data.orderId, data.eventId, data.userId)
      };
      const dataString = JSON.stringify(ticketData);
      const qrCodeDataUrl = await QRCode.toDataURL(dataString, {
        errorCorrectionLevel: "M",
        margin: 1,
        color: {
          dark: "#0F4C75",
          // Primary color
          light: "#FFFFFF"
        },
        width: 256
      });
      this.generateQRCodeBuffer(data);
      return qrCodeDataUrl;
    } catch (error) {
      console.error("Error generating QR code:", error);
      throw new Error("Failed to generate QR code");
    }
  }
  async generateQRCodeBuffer(data) {
    try {
      const ticketData = {
        orderId: data.orderId,
        eventId: data.eventId,
        userId: data.userId,
        timestamp: Date.now(),
        checksum: this.generateChecksum(data.orderId, data.eventId, data.userId)
      };
      const dataString = JSON.stringify(ticketData);
      const qrCodeBuffer = await QRCode.toBuffer(dataString, {
        errorCorrectionLevel: "M",
        type: "png",
        margin: 1,
        color: {
          dark: "#0F4C75",
          light: "#FFFFFF"
        },
        width: 256
      });
      let s3Url;
      try {
        s3Url = await s3Service.uploadQRCode(qrCodeBuffer, data.orderId);
        console.log(`QR code uploaded to S3: ${s3Url}`);
        await storage.updateOrder(data.orderId, { qr_code_s3_url: s3Url });
        console.log("QR code S3 URL saved in database");
      } catch (s3Error) {
        console.warn("Failed to upload QR code to S3, using base64 only:", s3Error);
      }
      return qrCodeBuffer;
    } catch (error) {
      console.error("Error generating QR code:", error);
      throw new Error("Failed to generate QR code");
    }
  }
  verifyQRCode(qrCodeData) {
    try {
      const parsedData = JSON.parse(qrCodeData);
      if (!parsedData.orderId || !parsedData.eventId || !parsedData.userId || !parsedData.checksum) {
        return { valid: false, error: "Invalid QR code format" };
      }
      const expectedChecksum = this.generateChecksum(
        parsedData.orderId,
        parsedData.eventId,
        parsedData.userId
      );
      if (parsedData.checksum !== expectedChecksum) {
        return { valid: false, error: "Invalid QR code checksum" };
      }
      const maxAge = 365 * 24 * 60 * 60 * 1e3;
      if (Date.now() - parsedData.timestamp > maxAge) {
        return { valid: false, error: "QR code expired" };
      }
      return { valid: true, data: parsedData };
    } catch (error) {
      return { valid: false, error: "Failed to parse QR code data" };
    }
  }
  generateChecksum(orderId, eventId, userId) {
    const secret = process.env.QR_CODE_SECRET || "default-secret-key";
    const data = `${orderId}:${eventId}:${userId}:${secret}`;
    return crypto.createHash("sha256").update(data).digest("hex").substring(0, 16);
  }
  async uploadExistingQRCode(base64Data, orderId) {
    try {
      const base64String = base64Data.replace(/^data:image\/png;base64,/, "");
      const buffer = Buffer.from(base64String, "base64");
      return await s3Service.uploadQRCode(buffer, orderId);
    } catch (error) {
      console.error("Failed to upload existing QR code to S3:", error);
      return null;
    }
  }
};
var qrCodeService = new QRCodeService();

// server/middleware/auth.ts
import jwt2 from "jsonwebtoken";
var JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
var requireEmailVerification = (req, res, next) => {
  if (req.user && !req.user.emailVerified) {
    return res.status(403).json({
      message: "E-mail n\xE3o verificado.",
      code: "EMAIL_NOT_VERIFIED"
    });
  }
  next();
};

// server/routes.ts
var JWT_SECRET2 = process.env.JWT_SECRET || "your-secret-key";
var authenticateToken = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Token de acesso requerido" });
  }
  try {
    const decoded = jwt3.verify(token, JWT_SECRET2);
    const user = await storage.getUser(decoded.userId);
    if (!user) {
      return res.status(401).json({ message: "Usu\xE1rio n\xE3o encontrado" });
    }
    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ message: "Token inv\xE1lido" });
  }
};
async function registerRoutes(app2) {
  app2.post("/api/auth/register", async (req, res) => {
    try {
      const apiUserSchema = insertUserSchema.extend({
        birthDate: z2.string().regex(/^\d{2}\/\d{2}\/\d{4}$/, "Data deve estar no formato dd/mm/aaaa")
      });
      const body = apiUserSchema.parse(req.body);
      if (!validateCpf(body.cpf)) {
        return res.status(400).json({ message: "CPF inv\xE1lido" });
      }
      const existingUser = await storage.getUserByEmail(body.email);
      if (existingUser) {
        return res.status(400).json({ message: "Email j\xE1 cadastrado" });
      }
      const existingCpf = await storage.getUserByCpf(body.cpf);
      if (existingCpf) {
        return res.status(400).json({ message: "CPF j\xE1 cadastrado" });
      }
      const [day, month, year] = body.birthDate.split("/");
      const birthDateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      const hashedPassword = await bcrypt.hash(body.password, 10);
      const user = await storage.createUser({
        ...body,
        birthDate: birthDateObj,
        password: hashedPassword,
        cpf: formatCpf(body.cpf),
        phone: formatPhone(body.phone)
      });
      await emailService.sendVerificationEmail(user.email, user.id);
      res.status(201).json({
        message: "Conta criada! Um c\xF3digo de verifica\xE7\xE3o foi enviado para o seu e-mail.",
        // We send the email back so the frontend knows who to verify
        email: user.email
      });
    } catch (error) {
      console.error("Registration error:", error);
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });
  app2.post("/api/auth/verify-code", async (req, res) => {
    try {
      const { email, code } = req.body;
      const user = await storage.getUserByEmail(email);
      if (!user || user.emailVerificationCode !== code) {
        return res.status(400).json({ message: "C\xF3digo inv\xE1lido." });
      }
      if (!user.emailVerificationCodeExpiresAt || /* @__PURE__ */ new Date() > new Date(user.emailVerificationCodeExpiresAt)) {
        return res.status(400).json({ message: "O c\xF3digo expirou." });
      }
      await storage.updateUser(user.id, {
        emailVerified: true,
        emailVerificationCode: null,
        // Clear the code
        emailVerificationCodeExpiresAt: null
      });
      const token = jwt3.sign({ userId: user.id }, JWT_SECRET2, { expiresIn: "7d" });
      res.json({ token, user: { id: user.id, email: user.email, name: user.name, emailVerified: true } });
    } catch (error) {
      res.status(500).json({ message: "Erro interno do servidor." });
    }
  });
  app2.post("/api/auth/resend-code", async (req, res) => {
    try {
      const { email } = req.body;
      const user = await storage.getUserByEmail(email);
      if (user && !user.emailVerified) {
        await emailService.sendVerificationEmail(user.email, user.id);
      }
      res.status(200).json({ message: "Um novo c\xF3digo foi enviado." });
    } catch (error) {
      res.status(500).json({ message: "Erro ao reenviar o c\xF3digo." });
    }
  });
  app2.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = loginSchema.parse(req.body);
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: "Email ou senha incorretos" });
      }
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ message: "Email ou senha incorretos" });
      }
      const token = jwt3.sign({ userId: user.id }, JWT_SECRET2, { expiresIn: "7d" });
      res.json({
        token,
        user: { id: user.id, email: user.email, name: user.name, emailVerified: user.emailVerified }
      });
    } catch (error) {
      console.error("Login error:", error);
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });
  app2.get("/api/auth/me", authenticateToken, async (req, res) => {
    const { password, ...userWithoutPassword } = req.user;
    res.json(userWithoutPassword);
  });
  app2.get("/api/auth/verify-email", async (req, res) => {
    try {
      const { token } = req.query;
      if (!token || typeof token !== "string") {
        return res.status(400).json({ message: "Token de verifica\xE7\xE3o inv\xE1lido" });
      }
      try {
        const decoded = jwt3.verify(token, JWT_SECRET2);
        if (decoded.type !== "email-verification") {
          return res.status(400).json({ message: "Token inv\xE1lido" });
        }
        const success = await storage.verifyUserEmail(decoded.userId);
        if (success) {
          res.json({ message: "Email verificado com sucesso! Voc\xEA j\xE1 pode fazer login." });
        } else {
          res.status(404).json({ message: "Usu\xE1rio n\xE3o encontrado" });
        }
      } catch (tokenError) {
        return res.status(400).json({ message: "Token de verifica\xE7\xE3o expirado ou inv\xE1lido" });
      }
    } catch (error) {
      console.error("Email verification error:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });
  app2.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ message: "O e-mail \xE9 obrigat\xF3rio" });
      }
      const user = await storage.getUserByEmail(email);
      if (user) {
        await emailService.sendPasswordResetEmail(user.email, user.id);
      }
      res.status(200).json({ message: "Se o e-mail estiver cadastrado, um link de redefini\xE7\xE3o foi enviado." });
    } catch (error) {
      console.error("Forgot password error:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });
  app2.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, newPassword } = req.body;
      if (!token || !newPassword) {
        return res.status(400).json({ message: "Token e nova senha s\xE3o obrigat\xF3rios." });
      }
      const decoded = jwt3.verify(token, JWT_SECRET2);
      if (decoded.type !== "password-reset") {
        return res.status(400).json({ message: "Token inv\xE1lido." });
      }
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await storage.updateUser(decoded.userId, { password: hashedPassword });
      res.status(200).json({ message: "Senha redefinida com sucesso." });
    } catch (error) {
      console.error("Reset password error:", error);
      if (error instanceof jwt3.TokenExpiredError) {
        return res.status(400).json({ message: "O link de redefini\xE7\xE3o expirou." });
      }
      res.status(400).json({ message: "Link de redefini\xE7\xE3o inv\xE1lido ou expirado." });
    }
  });
  app2.post("/api/auth/resend-verification", authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const user = req.user;
      if (user.emailVerified) {
        return res.status(400).json({ message: "Email j\xE1 est\xE1 verificado" });
      }
      const sent = await emailService.sendVerificationEmail(user.email, userId);
      if (sent) {
        res.json({ message: "Email de verifica\xE7\xE3o enviado com sucesso!" });
      } else {
        res.status(500).json({ message: "Erro ao enviar email de verifica\xE7\xE3o" });
      }
    } catch (error) {
      console.error("Resend verification error:", error);
      res.status(500).json({ message: "Erro ao reenviar email de verifica\xE7\xE3o" });
    }
  });
  app2.get("/api/events", async (req, res) => {
    try {
      const events2 = await storage.getEvents();
      res.json(events2);
    } catch (error) {
      console.error("Get events error:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });
  app2.get("/api/events/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const event = await storage.getEvent(id);
      if (!event) {
        return res.status(404).json({ message: "Evento n\xE3o encontrado" });
      }
      res.json(event);
    } catch (error) {
      console.error("Get event error:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });
  app2.post("/api/orders", authenticateToken, async (req, res) => {
    try {
      const { eventId, paymentMethod } = req.body;
      const userId = req.user.id;
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ message: "Evento n\xE3o encontrado" });
      }
      if (event.maxAttendees && (event.currentAttendees || 0) >= event.maxAttendees) {
        return res.status(400).json({ message: "Evento lotado" });
      }
      const eventPrice = parseFloat(event.price);
      const convenienceFee = 5;
      const totalAmount = eventPrice + convenienceFee;
      const order = await storage.createOrder({
        userId,
        eventId,
        paymentMethod,
        amount: totalAmount.toString(),
        status: "pending"
      });
      try {
        const paymentData = await asaasService.createPayment({
          customer: {
            name: req.user.name,
            email: req.user.email,
            cpfCnpj: req.user.cpf.replace(/\D/g, ""),
            // Remove formatting
            phone: req.user.phone?.replace(/\D/g, "") || ""
          },
          billingType: paymentMethod === "credit_card" ? "CREDIT_CARD" : paymentMethod === "pix" ? "PIX" : "BOLETO",
          value: totalAmount,
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1e3),
          // 7 days from now
          description: `Ingresso para ${event.title}`,
          externalReference: order.id
        });
        await storage.updateOrder(order.id, {
          asaasPaymentId: paymentData.id
        });
        const qrCodeData = await qrCodeService.generateQRCode({
          orderId: order.id,
          eventId: event.id,
          userId
        });
        const updatedOrder = await storage.updateOrder(order.id, {
          qrCodeData
        });
        const response = {
          order: updatedOrder,
          payment: {
            id: paymentData.id,
            link: paymentData.paymentLink,
            status: paymentData.status,
            value: paymentData.value
          }
        };
        if (paymentMethod === "pix" && paymentData.pixTransaction) {
          response.payment.pixQrCode = paymentData.pixTransaction.qrCode.encodedImage;
          response.payment.pixPayload = paymentData.pixTransaction.qrCode.payload;
          response.payment.pixExpiration = paymentData.pixTransaction.expirationDate;
        } else if (paymentMethod === "boleto" && paymentData.bankSlipUrl) {
          response.payment.boletoUrl = paymentData.bankSlipUrl;
        }
        res.status(201).json(response);
      } catch (paymentError) {
        console.error("Payment creation error:", paymentError);
        await storage.deleteOrder(order.id);
        res.status(500).json({ message: "Erro ao processar pagamento. Tente novamente." });
      }
    } catch (error) {
      console.error("Create order error:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });
  app2.get("/api/orders", authenticateToken, requireEmailVerification, async (req, res) => {
    try {
      const userId = req.user.id;
      const orders2 = await storage.getOrdersByUser(userId);
      res.json(orders2);
    } catch (error) {
      console.error("Get orders error:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });
  app2.get("/api/orders/:id", authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const order = await storage.getOrder(id);
      if (!order || order.userId !== userId) {
        return res.status(404).json({ message: "Pedido n\xE3o encontrado" });
      }
      res.json(order);
    } catch (error) {
      console.error("Get order error:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });
  app2.post("/api/orders/:id/check-status", authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const order = await storage.getOrder(id);
      if (!order || order.userId !== userId) {
        return res.status(404).json({ message: "Pedido n\xE3o encontrado" });
      }
      if (!order.asaasPaymentId) {
        return res.status(400).json({ message: "Pedido sem ID de pagamento" });
      }
      const payment = await asaasService.getPayment(order.asaasPaymentId);
      console.log(`Manual check - Payment status for order ${id}:`, payment.status);
      if ((payment.status === "CONFIRMED" || payment.status === "RECEIVED") && order.status !== "paid") {
        await storage.updateOrder(id, { status: "paid" });
        const event = await storage.getEvent(order.eventId);
        const ticketUser = await storage.getUser(order.userId);
        if (event && ticketUser) {
          await storage.updateEvent(event.id, {
            currentAttendees: (event.currentAttendees || 0) + 1
          });
          await emailService.sendTicketEmail(ticketUser.email, {
            userName: ticketUser.name,
            eventTitle: event.title,
            eventDate: event.date,
            eventLocation: event.location,
            qrCodeData: order.qrCodeData || "",
            orderId: order.id,
            qrCodeS3Url: order.qr_code_s3_url || ""
          });
        }
        const updatedOrder = await storage.getOrder(id);
        return res.json({
          message: "Pagamento confirmado!",
          order: updatedOrder
        });
      } else if ((payment.status === "OVERDUE" || payment.status === "CANCELED") && order.status === "pending") {
        await storage.updateOrder(id, { status: "cancelled" });
        const updatedOrder = await storage.getOrder(id);
        return res.json({
          message: "Pagamento cancelado",
          order: updatedOrder
        });
      }
      res.json({
        message: `Status do pagamento: ${payment.status}`,
        order,
        paymentStatus: payment.status
      });
    } catch (error) {
      console.error("Check payment status error:", error);
      res.status(500).json({ message: "Erro ao verificar status do pagamento" });
    }
  });
  app2.delete("/api/orders/:id/cancel", authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const order = await storage.getOrder(id);
      if (!order) {
        return res.status(404).json({ message: "Pedido n\xE3o encontrado" });
      }
      if (order.userId !== userId) {
        return res.status(403).json({ message: "Acesso n\xE3o autorizado" });
      }
      if (order.status !== "pending") {
        return res.status(400).json({ message: "Este pedido n\xE3o pode ser cancelado" });
      }
      if (order.asaasPaymentId) {
        await asaasService.cancelPayment(order.asaasPaymentId);
      }
      await storage.deleteOrder(id);
      res.status(200).json({ message: "Pedido cancelado com sucesso" });
    } catch (error) {
      console.error("Cancel order error:", error);
      res.status(500).json({ message: "Erro ao cancelar o pedido" });
    }
  });
  app2.post("/api/reset-ticket/:orderId", authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Acesso negado. Apenas administradores." });
      }
      const { orderId } = req.params;
      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ message: "Pedido n\xE3o encontrado" });
      }
      await storage.updateOrder(orderId, {
        qrCodeUsed: false,
        qrCodeUsedAt: null
      });
      res.json({ message: "Ticket resetado" });
    } catch (error) {
      console.error("Reset ticket error:", error);
      res.status(500).json({ message: "Erro ao resetar ticket" });
    }
  });
  app2.post("/api/verify-ticket", authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.isAdmin) {
        return res.status(403).json({
          success: false,
          message: "Acesso negado. Apenas administradores podem verificar ingressos."
        });
      }
      const { qrCodeData } = req.body;
      if (!qrCodeData) {
        return res.status(400).json({
          success: false,
          message: "QR Code n\xE3o fornecido"
        });
      }
      const verification = qrCodeService.verifyQRCode(qrCodeData);
      if (!verification.valid) {
        return res.status(400).json({
          success: false,
          message: verification.error || "QR Code inv\xE1lido"
        });
      }
      const order = await storage.getOrder(verification.data.orderId);
      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Ingresso n\xE3o encontrado"
        });
      }
      if (order.qrCodeUsed) {
        return res.status(400).json({
          success: false,
          message: "Ingresso j\xE1 foi utilizado"
        });
      }
      if (order.status !== "paid") {
        return res.status(400).json({
          success: false,
          message: "Pagamento n\xE3o confirmado"
        });
      }
      await storage.updateOrder(order.id, {
        qrCodeUsed: true,
        qrCodeUsedAt: /* @__PURE__ */ new Date()
      });
      const ticketUser = await storage.getUser(order.userId);
      const event = await storage.getEvent(order.eventId);
      res.json({
        success: true,
        message: "Ingresso verificado com sucesso",
        userName: ticketUser?.name || "Participante",
        eventTitle: event?.title || "Evento"
      });
    } catch (error) {
      console.error("Ticket verification error:", error);
      res.status(500).json({
        success: false,
        message: "Erro ao verificar ingresso"
      });
    }
  });
  app2.post("/api/webhooks/asaas", async (req, res) => {
    try {
      const asaasToken = req.headers["asaas-access-token"];
      if (!asaasService.validateWebhookSignature(asaasToken)) {
        console.warn("Invalid or missing Asaas webhook token received.");
        return res.status(401).json({ error: "Unauthorized" });
      }
      const { event: eventType, payment } = req.body;
      console.log("Asaas webhook received and validated:", eventType, payment?.id);
      console.log("Full webhook payload:", JSON.stringify(req.body, null, 2));
      if (eventType === "PAYMENT_CONFIRMED" || eventType === "PAYMENT_RECEIVED") {
        const order = await storage.getOrderByAsaasPaymentId(payment.id);
        if (order && order.status !== "paid") {
          await storage.updateOrder(order.id, { status: "paid" });
          const event = await storage.getEvent(order.eventId);
          const user = await storage.getUser(order.userId);
          if (event && user) {
            await storage.updateEvent(event.id, {
              currentAttendees: (event.currentAttendees || 0) + 1
            });
            await emailService.sendTicketEmail(user.email, {
              userName: user.name,
              eventTitle: event.title,
              eventDate: event.date,
              eventLocation: event.location,
              qrCodeData: order.qrCodeData || "",
              orderId: order.id,
              qrCodeS3Url: order.qr_code_s3_url || ""
            });
          }
        }
      } else if (eventType === "PAYMENT_OVERDUE" || eventType === "PAYMENT_DELETED") {
        const order = await storage.getOrderByAsaasPaymentId(payment.id);
        if (order && order.status === "pending") {
          await storage.updateOrder(order.id, { status: "cancelled" });
        }
      }
      res.status(200).json({ received: true });
    } catch (error) {
      console.error("Webhook error:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });
  app2.post("/api/make-admin/:userId", authenticateToken, async (req, res) => {
    try {
      if (process.env.NODE_ENV === "production") {
        return res.status(403).json({ message: "Not available in production" });
      }
      const { userId } = req.params;
      await storage.updateUser(userId, { isAdmin: true });
      const user = await storage.getUser(userId);
      res.json({
        message: "User is now admin",
        user: {
          id: user?.id,
          name: user?.name,
          email: user?.email,
          isAdmin: user?.isAdmin
        }
      });
    } catch (error) {
      console.error("Error making user admin:", error);
      res.status(500).json({ message: "Erro ao tornar usu\xE1rio admin" });
    }
  });
  app2.put("/api/profile", authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { currentPassword, ...updates } = req.body;
      const sensitiveFields = ["name", "email", "phone"];
      const hasChangedSensitiveField = sensitiveFields.some(
        (field) => updates[field] !== void 0 && updates[field] !== req.user[field]
      );
      if (hasChangedSensitiveField) {
        if (!currentPassword) {
          return res.status(400).json({
            message: "Senha atual \xE9 necess\xE1ria para alterar informa\xE7\xF5es sens\xEDveis"
          });
        }
        const isValidPassword = await bcrypt.compare(currentPassword, req.user.password);
        if (!isValidPassword) {
          return res.status(401).json({ message: "Senha incorreta" });
        }
      }
      delete updates.password;
      delete updates.cpf;
      delete updates.emailVerified;
      delete updates.id;
      delete updates.createdAt;
      delete updates.updatedAt;
      if (updates.birthDate && typeof updates.birthDate === "string") {
        const [day, month, year] = updates.birthDate.split("/").map(Number);
        if (day && month && year) {
          updates.birthDate = new Date(year, month - 1, day);
        } else {
          updates.birthDate = new Date(updates.birthDate);
        }
      }
      const updatedUser = await storage.updateUser(userId, updates);
      if (!updatedUser) {
        return res.status(404).json({ message: "Usu\xE1rio n\xE3o encontrado" });
      }
      const { password, ...userWithoutPassword } = updatedUser;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Update profile error:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });
  app2.put("/api/profile/password", authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Senhas s\xE3o obrigat\xF3rias" });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ message: "Nova senha deve ter pelo menos 6 caracteres" });
      }
      const isValidPassword = await bcrypt.compare(currentPassword, req.user.password);
      if (!isValidPassword) {
        return res.status(400).json({ message: "Senha atual incorreta" });
      }
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await storage.updateUser(userId, { password: hashedPassword });
      res.json({ message: "Senha alterada com sucesso" });
    } catch (error) {
      console.error("Change password error:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });
  app2.delete("/api/profile", authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { password } = req.body;
      if (!password) {
        return res.status(400).json({ message: "Senha \xE9 obrigat\xF3ria para confirmar exclus\xE3o" });
      }
      const isValidPassword = await bcrypt.compare(password, req.user.password);
      if (!isValidPassword) {
        return res.status(401).json({ message: "Senha incorreta" });
      }
      const deleted = await storage.deleteUser(userId);
      if (deleted) {
        res.json({ message: "Conta exclu\xEDda com sucesso" });
      } else {
        res.status(404).json({ message: "Usu\xE1rio n\xE3o encontrado" });
      }
    } catch (error) {
      console.error("Delete account error:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });
  app2.post("/api/courtesy-links", authenticateToken, async (req, res) => {
    try {
      if (req.user.email !== "caueroriz@gmail.com") {
        return res.status(403).json({ message: "Acesso negado. Apenas administradores podem criar links de cortesia." });
      }
      const { eventId, ticketCount } = req.body;
      if (!eventId || !ticketCount || ticketCount < 1) {
        return res.status(400).json({ message: "Dados inv\xE1lidos. Forne\xE7a eventId e ticketCount." });
      }
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ message: "Evento n\xE3o encontrado" });
      }
      const code = `CDPI${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
      const link = await storage.createCourtesyLink({
        code,
        eventId,
        ticketCount: parseInt(ticketCount),
        createdBy: req.user.id,
        isActive: true
      });
      res.status(201).json({
        ...link,
        redeemUrl: `${req.protocol}://${req.get("host")}/cortesia?code=${link.code}`
      });
    } catch (error) {
      console.error("Create courtesy link error:", error);
      res.status(500).json({ message: "Erro ao criar link de cortesia" });
    }
  });
  app2.get("/api/courtesy-links", authenticateToken, async (req, res) => {
    try {
      if (req.user.email !== "caueroriz@gmail.com") {
        return res.status(403).json({ message: "Acesso negado" });
      }
      const links = await storage.getCourtesyLinksByCreator(req.user.id);
      const linksWithDetails = await Promise.all(links.map(async (link) => {
        const event = await storage.getEvent(link.eventId);
        return {
          ...link,
          event,
          redeemUrl: `${req.protocol}://${req.get("host")}/cortesia?code=${link.code}`,
          remainingTickets: link.ticketCount - (link.usedCount || 0)
        };
      }));
      res.json(linksWithDetails);
    } catch (error) {
      console.error("Get courtesy links error:", error);
      res.status(500).json({ message: "Erro ao buscar links de cortesia" });
    }
  });
  app2.get("/api/courtesy-links/:code", async (req, res) => {
    try {
      const { code } = req.params;
      const link = await storage.getCourtesyLinkByCode(code);
      if (!link) {
        return res.status(404).json({ message: "Link de cortesia n\xE3o encontrado" });
      }
      if (!link.isActive) {
        return res.status(400).json({ message: "Link de cortesia inativo" });
      }
      const remainingTickets = link.ticketCount - (link.usedCount || 0);
      if (remainingTickets <= 0) {
        return res.status(400).json({ message: "Todos os ingressos deste link j\xE1 foram resgatados" });
      }
      const event = await storage.getEvent(link.eventId);
      res.json({
        ...link,
        event,
        remainingTickets
      });
    } catch (error) {
      console.error("Get courtesy link error:", error);
      res.status(500).json({ message: "Erro ao buscar link de cortesia" });
    }
  });
  app2.post("/api/courtesy/redeem", authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { code, ...userData } = req.body;
      const validationResult = courtesyRedemptionSchema.safeParse(userData);
      if (!validationResult.success) {
        return res.status(400).json({
          message: "Dados inv\xE1lidos",
          errors: validationResult.error.errors
        });
      }
      const link = await storage.getCourtesyLinkByCode(code);
      if (!link) {
        return res.status(404).json({ message: "Link de cortesia n\xE3o encontrado" });
      }
      if (!link.isActive) {
        return res.status(400).json({ message: "Link de cortesia inativo" });
      }
      const remainingTickets = link.ticketCount - (link.usedCount || 0);
      if (remainingTickets <= 0) {
        return res.status(400).json({ message: "Todos os ingressos deste link j\xE1 foram resgatados" });
      }
      const event = await storage.getEvent(link.eventId);
      if (!event) {
        return res.status(404).json({ message: "Evento n\xE3o encontrado" });
      }
      if (event.maxAttendees && (event.currentAttendees || 0) >= event.maxAttendees) {
        return res.status(400).json({ message: "Evento lotado" });
      }
      const birthDateObj = new Date(userData.birthDate);
      await storage.updateUser(userId, {
        name: userData.name,
        cpf: userData.cpf,
        phone: userData.phone,
        birthDate: birthDateObj,
        address: userData.address,
        partnerCompany: userData.partnerCompany
      });
      const order = await storage.createOrder({
        userId,
        eventId: link.eventId,
        paymentMethod: "courtesy",
        amount: "0.00",
        status: "paid",
        // Courtesy tickets are automatically confirmed
        courtesyLinkId: link.id
      });
      const qrCodeData = await qrCodeService.generateQRCode({
        orderId: order.id,
        eventId: event.id,
        userId
      });
      const updatedOrder = await storage.updateOrder(order.id, {
        qrCodeData
      });
      await storage.incrementCourtesyLinkUsage(link.id);
      await storage.updateEvent(event.id, {
        currentAttendees: (event.currentAttendees || 0) + 1
      });
      await emailService.sendTicketEmail(userData.email, {
        userName: userData.name,
        eventTitle: event.title,
        eventDate: event.date,
        eventLocation: event.location,
        qrCodeData,
        orderId: order.id,
        qrCodeS3Url: order.qr_code_s3_url || ""
      });
      res.status(201).json({
        message: "Cortesia resgatada com sucesso!",
        order: updatedOrder,
        qrCode: qrCodeData
      });
    } catch (error) {
      console.error("Redeem courtesy error:", error);
      res.status(500).json({ message: "Erro ao resgatar cortesia" });
    }
  });
  const httpServer = createServer(app2);
  return httpServer;
}

// server/vite.ts
import express from "express";
import fs from "fs";
import path2 from "path";
import { createServer as createViteServer, createLogger } from "vite";

// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
var vite_config_default = defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...process.env.NODE_ENV !== "production" && process.env.REPL_ID !== void 0 ? [
      await import("@replit/vite-plugin-cartographer").then(
        (m) => m.cartographer()
      )
    ] : []
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets")
    }
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"]
    }
  }
});

// server/vite.ts
import { nanoid } from "nanoid";
var viteLogger = createLogger();
function log(message, source = "express") {
  const formattedTime = (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}
async function setupVite(app2, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      }
    },
    server: serverOptions,
    appType: "custom"
  });
  app2.use(vite.middlewares);
  app2.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path2.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html"
      );
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app2) {
  const distPath = path2.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app2.use(express.static(distPath));
  app2.use("*", (_req, res) => {
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/index.ts
var app = express2();
app.use(express2.json());
app.use(express2.urlencoded({ extended: false }));
app.use((req, res, next) => {
  const start = Date.now();
  const path3 = req.path;
  let capturedJsonResponse = void 0;
  const originalResJson = res.json;
  res.json = function(bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path3.startsWith("/api")) {
      let logLine = `${req.method} ${path3} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    }
  });
  next();
});
(async () => {
  const server = await registerRoutes(app);
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const port = parseInt(process.env.PORT || "5003", 10);
  server.listen(port, "0.0.0.0", () => {
    log(`serving on port ${port}`);
  });
})();
