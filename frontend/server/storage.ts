import {
  users,
  events,
  orders,
  certificates,
  emailQueue,
  courtesyLinks,
  courtesyAttendees,
  massSendJobs,
  eventPrintSettings,
  printJobs,
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
  type CourtesyAttendee,
  type InsertCourtesyAttendee,
  type PrintJob,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, sql, asc, count, and } from "drizzle-orm";
import { s3Service } from "./services/s3Service";
import { buildUndoCheckInPatch } from "./utils/undoCheckInUpdate";
import { validateCourtesyTicketCountUpdate } from "./utils/courtesyTicketCountUpdate";
import { MAX_PRINT_ATTEMPTS, nextStateAfterPrintFailure } from "./utils/printJobPolicy";

export type CancelOrderResult =
  | { ok: true; order: Order }
  | { ok: false; code: "not_found" }
  | { ok: false; code: "already_cancelled"; order: Order }
  | { ok: false; code: "invalid_status"; status: string };

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
  /** All events (active and inactive), for admin tooling. */
  getAllEventsForAdmin(): Promise<Event[]>;
  /** Paginated list for admin (newest by date first). */
  getAllEventsForAdminPaginated(
    page: number,
    limit: number,
  ): Promise<{ events: Event[]; total: number }>;
  getEvent(id: string): Promise<Event | undefined>;
  createEvent(event: InsertEvent): Promise<Event>;
  updateEvent(id: string, updates: Partial<Event>): Promise<Event | undefined>;
  /** Deletes event and dependent orders, courtesy links, and certificates. */
  deleteEvent(id: string): Promise<boolean>;

  // Order operations
  getOrder(id: string): Promise<Order | undefined>;
  getOrdersByUser(userId: string, page: number, limit: number): Promise<{ orders: Order[]; total: number }>;
  createOrder(order: InsertOrder): Promise<Order>;
  updateOrder(id: string, updates: Partial<Order>): Promise<Order | undefined>;
  getOrderByAsaasPaymentId(paymentId: string): Promise<Order | undefined>;
  isCpfAlreadyRegisteredForEvent(cpf: string, eventId: string): Promise<boolean>;
  createCourtesyAttendee(attendee: InsertCourtesyAttendee): Promise<CourtesyAttendee>;

  // Email queue operations
  addEmailToQueue(email: InsertEmailQueue): Promise<EmailQueue>;
  getPendingEmails(): Promise<EmailQueue[]>;
  updateEmailStatus(id: string, status: string, processedAt?: Date): Promise<void>;

  // Courtesy link operations
  createCourtesyLink(link: InsertCourtesyLink): Promise<CourtesyLink>;
  getCourtesyLinkByCode(code: string): Promise<CourtesyLink | undefined>;
  getCourtesyLinksByCreator(userId: string, page: number, limit: number): Promise<{ links: CourtesyLink[]; total: number }>;
  updateCourtesyLink(id: string, updates: Partial<CourtesyLink>): Promise<CourtesyLink | undefined>;
  /** Validates ticketCount vs usedCount and updates; throws if link missing or invalid. */
  updateCourtesyLinkTicketCount(id: string, ticketCount: number): Promise<CourtesyLink>;
  incrementCourtesyLinkUsage(id: string): Promise<void>;

  /** Cancels order, clears QR fields, deletes S3 object when present. */
  cancelOrderAndInvalidateQr(orderId: string): Promise<CancelOrderResult>;

  /** Reverts one check-in (decrement amntUsed, sync qr flags). */
  undoOrderCheckIn(orderId: string): Promise<Order>;

  getCourtesyAttendeeById(id: string): Promise<CourtesyAttendee | undefined>;

  getEventPrintSetting(eventId: string): Promise<{ isEnabled: boolean }>;
  upsertEventPrintSetting(
    eventId: string,
    isEnabled: boolean,
    updatedBy: string,
  ): Promise<void>;
  createPrintJob(params: {
    eventId: string;
    orderId: string;
    displayName: string;
    companyLine?: string | null;
  }): Promise<PrintJob>;
  claimNextPrintJobForEvent(
    eventId: string,
    socketId: string,
  ): Promise<PrintJob | undefined>;
  completePrintJob(jobId: string, socketId: string): Promise<boolean>;
  failPrintJob(
    jobId: string,
    socketId: string,
    errorCode: string,
    message: string,
  ): Promise<{ ok: boolean; terminalFailure: boolean }>;
  getPrintJobById(id: string): Promise<PrintJob | undefined>;
  listPrintJobsForEvent(
    eventId: string,
    limit: number,
  ): Promise<PrintJob[]>;
  requeueJobOnSocketDisconnect(jobId: string, socketId: string): Promise<void>;
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
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    
    return await db
      .select()
      .from(events)
      .where(eq(events.isActive, true))
      .orderBy(asc(events.date));
  }

  async getAllEventsForAdmin(): Promise<Event[]> {
    return await db.select().from(events).orderBy(asc(events.date));
  }

  async getAllEventsForAdminPaginated(
    page: number,
    limit: number,
  ): Promise<{ events: Event[]; total: number }> {
    const safePage = Math.max(1, Math.floor(page));
    const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));
    const offset = (safePage - 1) * safeLimit;

    const [countRow] = await db.select({ n: count() }).from(events);
    const total = Number(countRow?.n ?? 0);

    const list = await db
      .select()
      .from(events)
      .orderBy(desc(events.date))
      .limit(safeLimit)
      .offset(offset);

    return { events: list, total };
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

  async deleteEvent(id: string): Promise<boolean> {
    return await db.transaction(async (tx) => {
      await tx.delete(orders).where(eq(orders.eventId, id));
      await tx.delete(courtesyLinks).where(eq(courtesyLinks.eventId, id));
      await tx.delete(certificates).where(eq(certificates.eventId, id));
      const result = await tx.delete(events).where(eq(events.id, id));
      return (result.rowCount ?? 0) > 0;
    });
  }

  // Order operations
  async getOrder(id: string): Promise<Order | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    return order;
  }

  async getOrdersByUser(userId: string, page: number = 1, limit: number = 10): Promise<{ orders: Order[]; total: number }> {
    const offset = (page - 1) * limit;
    
    const ordersQuery = db
      .select({
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
          imageUrl: events.imageUrl,
        },
      })
      .from(orders)
      .leftJoin(events, eq(orders.eventId, events.id))
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.createdAt))
      .limit(limit)
      .offset(offset);

    const totalQuery = db
      .select({ value: count() })
      .from(orders)
      .where(eq(orders.userId, userId));

    const [ordersResult, totalResult] = await Promise.all([ordersQuery, totalQuery]);
    
    return {
      orders: ordersResult,
      total: totalResult[0].value,
    };
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

  async createCourtesyAttendee(attendee: InsertCourtesyAttendee): Promise<CourtesyAttendee> {
    const [newAttendee] = await db
      .insert(courtesyAttendees)
      .values(attendee)
      .returning();
    return newAttendee;
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

  async isCpfAlreadyRegisteredForEvent(cpf: string, eventId: string): Promise<boolean> {  
  const existingOrder = await db.select().from(orders).where(
    and(
      eq(orders.cpf, cpf),
      eq(orders.eventId, eventId)
    )
  ).limit(1);

  return existingOrder.length > 0;
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

  async getCourtesyLinksByCreator(userId: string, page: number = 1, limit: number = 10): Promise<{ links: CourtesyLink[]; total: number }> {
    const offset = (page - 1) * limit;

    const linksQuery = db
      .select()
      .from(courtesyLinks)
      .where(eq(courtesyLinks.createdBy, userId))
      .orderBy(desc(courtesyLinks.createdAt))
      .limit(limit)
      .offset(offset);

    const totalQuery = db
      .select({ value: count() })
      .from(courtesyLinks)
      .where(eq(courtesyLinks.createdBy, userId));

    const [linksResult, totalResult] = await Promise.all([linksQuery, totalQuery]);

    return {
      links: linksResult,
      total: totalResult[0].value,
    };
  }

  async updateCourtesyLink(id: string, updates: Partial<CourtesyLink>): Promise<CourtesyLink | undefined> {
    const [link] = await db
      .update(courtesyLinks)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(courtesyLinks.id, id))
      .returning();
    return link;
  }

  async updateCourtesyLinkTicketCount(id: string, ticketCount: number): Promise<CourtesyLink> {
    const [link] = await db.select().from(courtesyLinks).where(eq(courtesyLinks.id, id));
    if (!link) {
      throw new Error("LINK_NOT_FOUND");
    }
    const errMsg = validateCourtesyTicketCountUpdate({
      usedCount: link.usedCount ?? 0,
      nextTicketCount: ticketCount,
    });
    if (errMsg) {
      throw new Error(errMsg);
    }
    const [updated] = await db
      .update(courtesyLinks)
      .set({ ticketCount, updatedAt: new Date() })
      .where(eq(courtesyLinks.id, id))
      .returning();
    if (!updated) {
      throw new Error("LINK_NOT_FOUND");
    }
    return updated;
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

  async cancelOrderAndInvalidateQr(orderId: string): Promise<CancelOrderResult> {
    const order = await this.getOrder(orderId);
    if (!order) {
      return { ok: false, code: "not_found" };
    }
    if (order.status === "cancelled") {
      return { ok: false, code: "already_cancelled", order };
    }
    if (order.status !== "pending" && order.status !== "paid" && order.status !== "courtesy") {
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

    const [updated] = await db
      .update(orders)
      .set({
        status: "cancelled",
        qrCodeData: null,
        qr_code_s3_url: null,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId))
      .returning();

    if (!updated) {
      return { ok: false, code: "not_found" };
    }
    return { ok: true, order: updated };
  }

  async undoOrderCheckIn(orderId: string): Promise<Order> {
    const order = await this.getOrder(orderId);
    if (!order) {
      throw new Error("Pedido não encontrado");
    }
    if (order.status === "cancelled") {
      throw new Error("Não é possível alterar presença de ingresso cancelado");
    }
    if ((order.amntUsed ?? 0) === 0) {
      throw new Error("Este ingresso não possui check-in para ser desmarcado");
    }
    const patch = buildUndoCheckInPatch(order);
    const [updated] = await db
      .update(orders)
      .set({
        ...patch,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId))
      .returning();
    if (!updated) {
      throw new Error("Pedido não encontrado");
    }
    return updated;
  }

  async getCourtesyAttendeeById(
    id: string,
  ): Promise<CourtesyAttendee | undefined> {
    const [a] = await db
      .select()
      .from(courtesyAttendees)
      .where(eq(courtesyAttendees.id, id));
    return a;
  }

  async getEventPrintSetting(eventId: string): Promise<{ isEnabled: boolean }> {
    const [row] = await db
      .select()
      .from(eventPrintSettings)
      .where(eq(eventPrintSettings.eventId, eventId));
    if (!row) {
      return { isEnabled: false };
    }
    return { isEnabled: row.isEnabled ?? false };
  }

  async upsertEventPrintSetting(
    eventId: string,
    isEnabled: boolean,
    updatedBy: string,
  ): Promise<void> {
    const now = new Date();
    await db
      .insert(eventPrintSettings)
      .values({
        eventId,
        isEnabled,
        updatedBy,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: eventPrintSettings.eventId,
        set: {
          isEnabled,
          updatedBy,
          updatedAt: now,
        },
      });
  }

  async createPrintJob(params: {
    eventId: string;
    orderId: string;
    displayName: string;
    companyLine?: string | null;
  }): Promise<PrintJob> {
    const now = new Date();
    const [row] = await db
      .insert(printJobs)
      .values({
        eventId: params.eventId,
        orderId: params.orderId,
        displayName: params.displayName,
        companyLine:
          params.companyLine?.trim() ? params.companyLine.trim().slice(0, 255) : null,
        status: "pending",
        attempts: 0,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    if (!row) {
      throw new Error("PRINT_JOB_INSERT_FAILED");
    }
    return row;
  }

  async claimNextPrintJobForEvent(
    eventId: string,
    socketId: string,
  ): Promise<PrintJob | undefined> {
    const maxA = MAX_PRINT_ATTEMPTS;
    const result = (await db.execute(sql`
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
    `)) as { rows: PrintJob[] };
    return result.rows?.[0];
  }

  async completePrintJob(jobId: string, socketId: string): Promise<boolean> {
    const [row] = await db
      .update(printJobs)
      .set({
        status: "completed",
        completedAt: new Date(),
        lockedBySocketId: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(printJobs.id, jobId),
          eq(printJobs.lockedBySocketId, socketId),
        ),
      )
      .returning();
    return !!row;
  }

  async failPrintJob(
    jobId: string,
    socketId: string,
    errorCode: string,
    message: string,
  ): Promise<{ ok: boolean; terminalFailure: boolean }> {
    const job = await this.getPrintJobById(jobId);
    if (!job || job.lockedBySocketId !== socketId) {
      return { ok: false, terminalFailure: false };
    }
    const now = new Date();
    const nextState = nextStateAfterPrintFailure(job.attempts ?? 0);
    if (nextState.status === "failed") {
      await db
        .update(printJobs)
        .set({
          status: "failed",
          attempts: nextState.attempts,
          lastErrorCode: errorCode,
          lastErrorMessage: message,
          lockedBySocketId: null,
          updatedAt: now,
        })
        .where(eq(printJobs.id, jobId));
      return { ok: true, terminalFailure: true };
    }
    await db
      .update(printJobs)
      .set({
        status: "pending",
        attempts: nextState.attempts,
        lastErrorCode: errorCode,
        lastErrorMessage: message,
        lockedBySocketId: null,
        updatedAt: now,
      })
      .where(eq(printJobs.id, jobId));
    return { ok: true, terminalFailure: false };
  }

  async getPrintJobById(id: string): Promise<PrintJob | undefined> {
    const [row] = await db.select().from(printJobs).where(eq(printJobs.id, id));
    return row;
  }

  async listPrintJobsForEvent(
    eventId: string,
    limit: number,
  ): Promise<PrintJob[]> {
    return await db
      .select()
      .from(printJobs)
      .where(eq(printJobs.eventId, eventId))
      .orderBy(desc(printJobs.createdAt))
      .limit(Math.min(200, Math.max(1, limit)));
  }

  async requeueJobOnSocketDisconnect(
    jobId: string,
    socketId: string,
  ): Promise<void> {
    await db
      .update(printJobs)
      .set({
        status: "pending",
        lockedBySocketId: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(printJobs.id, jobId),
          eq(printJobs.lockedBySocketId, socketId),
          eq(printJobs.status, "processing"),
        ),
      );
  }

  async addMassSendJobToQueue(jobData: {
    csvData: string;
    attachmentData: string | null;
    createdBy: string;
  }) {
    const newJob = {
      // ID is removed, database will generate it
      status: 'pending' as const,
      csvData: jobData.csvData,
      attachmentData: jobData.attachmentData,
      createdBy: jobData.createdBy,
    };
    // Use 'db' instead of 'this.db'
    const [insertedJob] = await db.insert(massSendJobs).values(newJob).returning();
    return insertedJob;
  }

/**
 * Gets pending mass-send jobs for the worker to process.
 * This is called by your new worker.
 */
async getPendingMassSendJobs(limit: number = 5) {
  return db
    .select()
    .from(massSendJobs)
    .where(eq(massSendJobs.status, 'pending'))
    .orderBy(asc(massSendJobs.createdAt))
    .limit(limit);
}

/**
 * Updates the status of a specific mass-send job.
 * This is called by your new worker.
 */
  async updateMassSendJobStatus(jobId: string, status: 'processing' | 'completed' | 'failed') {
    return db
      .update(massSendJobs)
      .set({
        status: status,
        updatedAt: new Date(),
      })
      .where(eq(massSendJobs.id, jobId));
  }
}

export const storage = new DatabaseStorage();
