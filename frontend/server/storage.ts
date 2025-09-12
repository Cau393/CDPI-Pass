import {
  users,
  events,
  orders,
  emailQueue,
  courtesyLinks,
  type User,
  type InsertUser,
  type Event,
  type InsertEvent,
  type Order,
  type InsertOrder,
  type EmailQueue,
  type InsertEmailQueue,
  type CourtesyLink,
  type InsertCourtesyLink,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByCpf(cpf: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User | undefined>;
  verifyUserEmail(id: string): Promise<boolean>;
  deleteUser(id: string): Promise<boolean>;

  // Event operations
  getEvents(): Promise<Event[]>;
  getEvent(id: string): Promise<Event | undefined>;
  createEvent(event: InsertEvent): Promise<Event>;
  updateEvent(id: string, updates: Partial<Event>): Promise<Event | undefined>;

  // Order operations
  getOrder(id: string): Promise<Order | undefined>;
  getOrdersByUser(userId: string): Promise<Order[]>;
  createOrder(order: InsertOrder): Promise<Order>;
  updateOrder(id: string, updates: Partial<Order>): Promise<Order | undefined>;
  getOrderByAsaasPaymentId(paymentId: string): Promise<Order | undefined>;

  // Email queue operations
  addEmailToQueue(email: InsertEmailQueue): Promise<EmailQueue>;
  getPendingEmails(): Promise<EmailQueue[]>;
  updateEmailStatus(id: string, status: string, processedAt?: Date): Promise<void>;

  // Courtesy link operations
  createCourtesyLink(link: InsertCourtesyLink): Promise<CourtesyLink>;
  getCourtesyLinkByCode(code: string): Promise<CourtesyLink | undefined>;
  getCourtesyLinksByCreator(userId: string): Promise<CourtesyLink[]>;
  updateCourtesyLink(id: string, updates: Partial<CourtesyLink>): Promise<CourtesyLink | undefined>;
  incrementCourtesyLinkUsage(id: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByCpf(cpf: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.cpf, cpf));
    return user;
  }

  async createUser(userData: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({
        ...userData,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async verifyUserEmail(id: string): Promise<boolean> {
    const [user] = await db
      .update(users)
      .set({ emailVerified: true, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return !!user;
  }

  async deleteUser(id: string): Promise<boolean> {
    // Delete user's orders first (due to foreign key constraint)
    await db.delete(orders).where(eq(orders.userId, id));
    
    // Then delete the user
    const result = await db.delete(users).where(eq(users.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Event operations
  async getEvents(): Promise<Event[]> {
    return await db
      .select()
      .from(events)
      .where(eq(events.isActive, true))
      .orderBy(desc(events.date));
  }

  async getEvent(id: string): Promise<Event | undefined> {
    const [event] = await db.select().from(events).where(eq(events.id, id));
    return event;
  }

  async createEvent(eventData: InsertEvent): Promise<Event> {
    const [event] = await db
      .insert(events)
      .values({
        ...eventData,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return event;
  }

  async updateEvent(id: string, updates: Partial<Event>): Promise<Event | undefined> {
    const [event] = await db
      .update(events)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(events.id, id))
      .returning();
    return event;
  }

  // Order operations
  async getOrder(id: string): Promise<Order | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    return order;
  }

  async getOrdersByUser(userId: string): Promise<Order[]> {
    return await db
      .select({
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
          imageUrl: events.imageUrl,
        },
      })
      .from(orders)
      .leftJoin(events, eq(orders.eventId, events.id))
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.createdAt));
  }

  async createOrder(orderData: InsertOrder): Promise<Order> {
    const [order] = await db
      .insert(orders)
      .values({
        ...orderData,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return order;
  }

  async updateOrder(id: string, updates: Partial<Order>): Promise<Order | undefined> {
    const [order] = await db
      .update(orders)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(orders.id, id))
      .returning();
    return order;
  }

  async getOrderByAsaasPaymentId(paymentId: string): Promise<Order | undefined> {
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.asaasPaymentId, paymentId));
    return order;
  }

  // Email queue operations
  async addEmailToQueue(emailData: InsertEmailQueue): Promise<EmailQueue> {
    const [email] = await db
      .insert(emailQueue)
      .values({
        ...emailData,
        createdAt: new Date(),
      })
      .returning();
    return email;
  }

  async getPendingEmails(): Promise<EmailQueue[]> {
    return await db
      .select()
      .from(emailQueue)
      .where(eq(emailQueue.status, "pending"))
      .orderBy(emailQueue.createdAt);
  }

  async updateEmailStatus(id: string, status: string, processedAt?: Date): Promise<void> {
    await db
      .update(emailQueue)
      .set({ 
        status, 
        processedAt: processedAt || new Date(),
        attempts: sql`attempts + 1` 
      })
      .where(eq(emailQueue.id, id));
  }

  async deleteOrder(id: string): Promise<void> {
    await db.delete(orders).where(eq(orders.id, id));
  }

  async getPendingOrders(): Promise<Order[]> {
    return await db
      .select()
      .from(orders)
      .where(eq(orders.status, "pending"));
  }

  // Courtesy link operations
  async createCourtesyLink(linkData: InsertCourtesyLink): Promise<CourtesyLink> {
    const [link] = await db
      .insert(courtesyLinks)
      .values({
        ...linkData,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return link;
  }

  async getCourtesyLinkByCode(code: string): Promise<CourtesyLink | undefined> {
    const [link] = await db
      .select()
      .from(courtesyLinks)
      .where(eq(courtesyLinks.code, code));
    return link;
  }

  async getCourtesyLinksByCreator(userId: string): Promise<CourtesyLink[]> {
    return await db
      .select()
      .from(courtesyLinks)
      .where(eq(courtesyLinks.createdBy, userId))
      .orderBy(desc(courtesyLinks.createdAt));
  }

  async updateCourtesyLink(id: string, updates: Partial<CourtesyLink>): Promise<CourtesyLink | undefined> {
    const [link] = await db
      .update(courtesyLinks)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(courtesyLinks.id, id))
      .returning();
    return link;
  }

  async incrementCourtesyLinkUsage(id: string): Promise<void> {
    await db
      .update(courtesyLinks)
      .set({ 
        usedCount: sql`used_count + 1`,
        updatedAt: new Date()
      })
      .where(eq(courtesyLinks.id, id));
  }
}

export const storage = new DatabaseStorage();
