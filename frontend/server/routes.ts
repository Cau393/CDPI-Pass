import axios from "axios";
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Express } from "express";
import { createServer, type Server } from "http";
import { randomUUID } from "crypto";
import { storage } from "./storage";
import { db } from "./db";
import { z } from "zod";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { 
  insertUserSchema, 
  loginSchema, 
  insertOrderSchema,
  courtesyRedemptionSchema,
  type User,
  type Event,
  events,
  orders,
  certificates,
  users,
  courtesyLinks,
  courtesyAttendees,
} from "@shared/schema";
import { validateCpf, validateEmail, formatCpf, formatPhone } from "./utils/validation";
import { parseBrazilEventLocalDateTime } from "./utils/eventDateTime";
import { sanitizeCourtesyTemplateHtml } from "./utils/courtesyTemplateSanitize";
import { mapCommercialSales } from "./utils/commercialSalesMapper";
import { buildCancellationEmailHtml } from "./utils/cancellationEmailTemplate";
import { emailService } from "./services/emailService";
import { asaasService } from "./services/asaasService";
import { qrCodeService } from "./services/qrCodeService";
import { s3Service } from "./services/s3Service";
import { invokeGenerateCertificatePdf } from "./services/certificateLambdaService";
import { requireEmailVerification } from "./middleware/auth"; 
import multer from 'multer';
import csv from 'csv-parser';
import { parse } from 'csv-parse/sync';
import { Readable } from 'stream';

const generateCertificateNpsSchema = z.object({
  overallRating: z.number().int().min(1).max(10),
  wouldRecommend: z.boolean(),
  highlights: z.string().max(2000).optional().default(""),
  improvements: z.string().max(2000).optional().default(""),
});

const generateCertificateBodySchema = z.object({
  eventId: z.string().uuid({ message: "eventId inválido" }),
  fullName: z.string().min(1, "Nome é obrigatório").max(120, "Nome deve ter no máximo 120 caracteres"),
  npsResponses: generateCertificateNpsSchema,
});

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

interface CSVRow {
  name: string;
  email: string;
  amount_of_courtesies: string;
  event_id: string;
  [key: string]: string;
}

// Auth middleware
const authenticateToken = async (req: any, res: any, next: any) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Token de acesso requerido" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    const user = await storage.getUser(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ message: "Usuário não encontrado" });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ message: "Token inválido" });
  }
};

export async function registerRoutes(app: Express): Promise<Server> {

  // Apply rate limiting to all /api/auth routes
 const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again after 15 minutes',
  keyGenerator: (req) => {
    const xForwardedFor = req.headers['x-forwarded-for'];

    if (typeof xForwardedFor === 'string') {
      const clientIp = xForwardedFor.split(',')[0].trim();
      return ipKeyGenerator(clientIp);
    }

    // Normalize IPv6 and always return a string
    return ipKeyGenerator(req.ip || 'unknown-ip');
  },
  });

  app.use('/api/auth', authLimiter);
  
  // Auth routes
  app.post("/api/auth/register", async (req, res) => {
    try {
      // Create a custom schema for API that accepts string date
      const apiUserSchema = insertUserSchema.extend({
        birthDate: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/, "Data deve estar no formato dd/mm/aaaa")
      });
      
      const body = apiUserSchema.parse(req.body);
      
      // Validate CPF
      if (!validateCpf(body.cpf)) {
        return res.status(400).json({ message: "CPF inválido" });
      }

      // Check if user already exists
      const existingUser = await storage.getUserByEmail(body.email);
      if (existingUser) {
        return res.status(400).json({ message: "Email já cadastrado" });
      }

      const existingCpf = await storage.getUserByCpf(body.cpf);
      if (existingCpf) {
        return res.status(400).json({ message: "CPF já cadastrado" });
      }

      // Convert birthDate string from dd/mm/yyyy to Date object for database
      const [day, month, year] = body.birthDate.split('/');
      const birthDateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));

      // Hash password
      const hashedPassword = await bcrypt.hash(body.password, 10);

      // Create user
      const user = await storage.createUser({
        ...body,
        birthDate: birthDateObj,
        password: hashedPassword,
        cpf: formatCpf(body.cpf),
        phone: formatPhone(body.phone),
      });
      
      await emailService.sendVerificationEmail(user.email, user.id);

      res.status(201).json({
    message: "Conta criada! Um código de verificação foi enviado para o seu e-mail.",
    // We send the email back so the frontend knows who to verify
    email: user.email
      });
    
    } catch (error) {
      console.error("Registration error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  app.post("/api/auth/verify-code", async (req, res) => {
    try {
        const { email, code } = req.body;
        const user = await storage.getUserByEmail(email);

        if (!user || user.emailVerificationCode !== code) {
            return res.status(400).json({ message: "Código inválido." });
        }

        if (!user.emailVerificationCodeExpiresAt || new Date() > new Date(user.emailVerificationCodeExpiresAt)) {
            return res.status(400).json({ message: "O código expirou." });
        }

        // Success! Verify the user and log them in.
        await storage.updateUser(user.id, {
            emailVerified: true,
            emailVerificationCode: null, // Clear the code
            emailVerificationCodeExpiresAt: null,
        });

        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });
        res.json({ token, user: { id: user.id, email: user.email, name: user.name, emailVerified: true } });

    } catch (error) {
        res.status(500).json({ message: "Erro interno do servidor." });
    }
  });

  app.post("/api/auth/resend-code", async (req, res) => {
    try {
        const { email } = req.body;
        const user = await storage.getUserByEmail(email);

        if (user && !user.emailVerified) {
            await emailService.sendVerificationEmail(user.email, user.id);
        }

        res.status(200).json({ message: "Um novo código foi enviado." });
    } catch (error) {
        res.status(500).json({ message: "Erro ao reenviar o código." });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = loginSchema.parse(req.body);

      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: "Email ou senha incorretos" });
      }

      // Skip email verification check for MVP

      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ message: "Email ou senha incorretos" });
      }

      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });

      res.json({
        token,
        user: { id: user.id, email: user.email, name: user.name, emailVerified: user.emailVerified }
      });
    } catch (error) {
      console.error("Login error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  app.get("/api/auth/me", authenticateToken, async (req: any, res) => {
    const { password, ...userWithoutPassword } = req.user;
    res.json(userWithoutPassword);
  });

  app.get("/api/auth/verify-email", async (req, res) => {
    try {
      const { token } = req.query;
      
      if (!token || typeof token !== 'string') {
        return res.status(400).json({ message: "Token de verificação inválido" });
      }
      
      // Decode the token to get userId
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as { userId: string, type: string };
        
        if (decoded.type !== 'email-verification') {
          return res.status(400).json({ message: "Token inválido" });
        }
        
        const success = await storage.verifyUserEmail(decoded.userId);
        
        if (success) {
          res.json({ message: "Email verificado com sucesso! Você já pode fazer login." });
        } else {
          res.status(404).json({ message: "Usuário não encontrado" });
        }
      } catch (tokenError) {
        return res.status(400).json({ message: "Token de verificação expirado ou inválido" });
      }
    } catch (error) {
      console.error("Email verification error:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ message: "O e-mail é obrigatório" });
        }

        const user = await storage.getUserByEmail(email);

        // For security, always return a success message, even if the user doesn't exist.
        if (user) {
            await emailService.sendPasswordResetEmail(user.email, user.id);
        }

        res.status(200).json({ message: "Se o e-mail estiver cadastrado, um link de redefinição foi enviado." });
    } catch (error) {
        console.error("Forgot password error:", error);
        res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    try {
        const { token, newPassword } = req.body;

        if (!token || !newPassword) {
            return res.status(400).json({ message: "Token e nova senha são obrigatórios." });
        }

        const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; type: string };

        if (decoded.type !== 'password-reset') {
            return res.status(400).json({ message: "Token inválido." });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await storage.updateUser(decoded.userId, { password: hashedPassword });

        res.status(200).json({ message: "Senha redefinida com sucesso." });
    } catch (error) {
        console.error("Reset password error:", error);
        // Handle expired or invalid tokens specifically
        if (error instanceof jwt.TokenExpiredError) {
            return res.status(400).json({ message: "O link de redefinição expirou." });
        }
        res.status(400).json({ message: "Link de redefinição inválido ou expirado." });
    }
  });

  app.post("/api/auth/resend-verification", authenticateToken, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = req.user;
      
      // Check if email is already verified
      if (user.emailVerified) {
        return res.status(400).json({ message: "Email já está verificado" });
      }
      
      // Send verification email
      const sent = await emailService.sendVerificationEmail(user.email, userId);
      
      if (sent) {
        res.json({ message: "Email de verificação enviado com sucesso!" });
      } else {
        res.status(500).json({ message: "Erro ao enviar email de verificação" });
      }
    } catch (error) {
      console.error("Resend verification error:", error);
      res.status(500).json({ message: "Erro ao reenviar email de verificação" });
    }
  });
  
  app.post("/api/admin/generate-reset-link", authenticateToken, async (req: any, res) => {
  try {
    // 1. Check if the logged-in user is an admin
    if (!req.user.isAdmin) {
      return res.status(403).json({ message: "Acesso negado. Apenas administradores." });
    }

    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    // 2. Find the user to reset
    const userToReset = await storage.getUserByEmail(email);
    if (!userToReset) {
      return res.status(404).json({ message: "User not found" });
    }

    // 3. Manually create the password reset token
    // This token is identical to the one your /reset-password endpoint expects
    const token = jwt.sign(
      { userId: userToReset.id, type: 'password-reset' },
      JWT_SECRET,
      { expiresIn: '1h' } // 1 hour expiration is standard
    );

    // 4. Construct the full URL
    // Make sure to use your *frontend* domain here
    const resetUrl = `${req.protocol}://${req.get('host')}/reset-password?token=${token}`;

    // 5. Return the link to the admin
    res.json({ 
      message: "Password reset link generated successfully",
      resetUrl: resetUrl 
    });

  } catch (error) {
    console.error("Error generating reset link:", error);
    res.status(500).json({ message: "Erro interno do servidor" });
  }
});

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 },
  });

  const uploadCoverImage = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
      if (allowed.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error("Only JPEG, PNG, and WebP images are allowed"));
      }
    },
  });

  // Events routes
  app.get("/api/events", async (req, res) => {
    try {
      const events = await storage.getEvents();
      res.json(events);
    } catch (error) {
      console.error("Get events error:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  app.get("/api/events/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const event = await storage.getEvent(id);
      
      if (!event) {
        return res.status(404).json({ message: "Evento não encontrado" });
      }

      res.json(event);
    } catch (error) {
      console.error("Get event error:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  app.get("/api/admin/events", authenticateToken, async (req: any, res) => {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({ message: "Acesso negado. Apenas administradores." });
      }

      const q = req.query as Record<string, string | undefined>;
      const hasPage = q.page !== undefined && q.page !== "";
      const hasLimit = q.limit !== undefined && q.limit !== "";

      if (hasPage || hasLimit) {
        const page = Math.max(1, Number.parseInt(q.page ?? "1", 10) || 1);
        const limit = Math.min(100, Math.max(1, Number.parseInt(q.limit ?? "10", 10) || 10));
        const { events: pageEvents, total } = await storage.getAllEventsForAdminPaginated(page, limit);
        return res.json({ events: pageEvents, total, page, limit });
      }

      const allEvents = await storage.getAllEventsForAdmin();
      res.json(allEvents);
    } catch (error) {
      console.error("Get admin events error:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  app.post(
    "/api/admin/events",
    authenticateToken,
    (req, res, next) => {
      uploadCoverImage.single("coverImage")(req, res, (err: unknown) => {
        if (err instanceof multer.MulterError) {
          if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({ error: "Image must be smaller than 5MB" });
          }
          return res.status(400).json({ error: err.message });
        }
        if (err) {
          const msg = err instanceof Error ? err.message : "Invalid file upload";
          return res.status(400).json({ error: msg });
        }
        next();
      });
    },
    async (req: any, res) => {
      try {
        if (!req.user.isAdmin) {
          return res.status(403).json({ message: "Acesso negado. Apenas administradores." });
        }

        const file = req.file as { buffer: Buffer; mimetype: string } | undefined;
        if (!file?.buffer) {
          return res.status(400).json({ error: "Cover image is required" });
        }

        const { title, description, date, location, price } = req.body as Record<
          string,
          string | undefined
        >;

        const textFields = { title, description, date, location, price } as const;
        for (const key of Object.keys(textFields) as (keyof typeof textFields)[]) {
          const v = textFields[key];
          if (typeof v !== "string" || !v.trim()) {
            return res.status(400).json({ error: `${key} is required` });
          }
        }

        const dateObj = parseBrazilEventLocalDateTime(String(date));
        if (Number.isNaN(dateObj.getTime())) {
          return res.status(400).json({ error: "date must be a valid date" });
        }

        const normalizedPrice = String(price).trim().replace(",", ".");
        const priceNum = Number(normalizedPrice);
        if (!Number.isFinite(priceNum) || priceNum < 0) {
          return res.status(400).json({ error: "price must be a valid non-negative number" });
        }

        const mimeToExt: Record<string, string> = {
          "image/jpeg": "jpeg",
          "image/jpg": "jpg",
          "image/png": "png",
          "image/webp": "webp",
        };
        const ext = mimeToExt[file.mimetype];
        if (!ext) {
          return res.status(400).json({ error: "Invalid image type" });
        }

        const key = `events/covers/${randomUUID()}.${ext}`;
        let imageUrl: string;
        try {
          // Event cover uses s3Service.uploadBuffer (same as certificate template / QR uploads).
          imageUrl = await s3Service.uploadBuffer(file.buffer, key, file.mimetype);
        } catch (uploadErr: unknown) {
          const detail = uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
          return res.status(500).json({
            error: "Failed to upload cover image",
            detail,
          });
        }

        const [newEvent] = await db
          .insert(events)
          .values({
            title: title!.trim(),
            description: description!.trim(),
            date: dateObj,
            location: location!.trim(),
            price: normalizedPrice,
            imageUrl,
          })
          .returning();

        return res.status(201).json(newEvent);
      } catch (error: any) {
        const code = error?.code ?? error?.cause?.code;
        if (code === "23505") {
          return res.status(409).json({ error: "An event with this name already exists" });
        }
        console.error("POST /api/admin/events:", error);
        return res.status(500).json({ error: "Failed to create event" });
      }
    },
  );

  app.get("/api/admin/events/:eventId", authenticateToken, async (req: any, res) => {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({ message: "Acesso negado. Apenas administradores." });
      }
      const parsed = z.string().uuid().safeParse(req.params.eventId);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid event id" });
      }
      const event = await storage.getEvent(parsed.data);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      res.json(event);
    } catch (error) {
      console.error("GET /api/admin/events/:eventId:", error);
      res.status(500).json({ error: "Failed to load event" });
    }
  });

  app.patch("/api/admin/events/:eventId/courtesy-template", authenticateToken, async (req: any, res) => {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({ message: "Acesso negado. Apenas administradores." });
      }
      const parsedId = z.string().uuid().safeParse(req.params.eventId);
      if (!parsedId.success) {
        return res.status(400).json({ error: "Invalid event id" });
      }
      const eventId = parsedId.data;

      const body = req.body as { template?: unknown };
      if (typeof body.template !== "string") {
        return res.status(400).json({ error: "template must be a string" });
      }
      if (body.template.length > 50_000) {
        return res.status(400).json({ error: "template exceeds maximum length" });
      }

      const existing = await storage.getEvent(eventId);
      if (!existing) {
        return res.status(404).json({ error: "Event not found" });
      }

      const sanitized = sanitizeCourtesyTemplateHtml(body.template);
      const trimmed = sanitized.trim();
      const isEmpty =
        trimmed === "" || trimmed === "<p></p>" || sanitized.replace(/\s/g, "") === "<p></p>";
      const toStore: string | null = isEmpty ? null : sanitized;

      const updated = await storage.updateEvent(eventId, { courtesyTemplate: toStore });
      if (!updated) {
        return res.status(404).json({ error: "Event not found" });
      }

      return res.status(200).json({
        success: true,
        eventId,
        templateLength: toStore?.length ?? 0,
      });
    } catch (error) {
      console.error("PATCH /api/admin/events/:eventId/courtesy-template:", error);
      return res.status(500).json({ error: "Failed to save template" });
    }
  });

  app.patch(
    "/api/admin/events/:eventId",
    authenticateToken,
    (req, res, next) => {
      uploadCoverImage.single("coverImage")(req, res, (err: unknown) => {
        if (err instanceof multer.MulterError) {
          if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({ error: "Image must be smaller than 5MB" });
          }
          return res.status(400).json({ error: err.message });
        }
        if (err) {
          const msg = err instanceof Error ? err.message : "Invalid file upload";
          return res.status(400).json({ error: msg });
        }
        next();
      });
    },
    async (req: any, res) => {
      try {
        if (!req.user.isAdmin) {
          return res.status(403).json({ message: "Acesso negado. Apenas administradores." });
        }
        const parsed = z.string().uuid().safeParse(req.params.eventId);
        if (!parsed.success) {
          return res.status(400).json({ error: "Invalid event id" });
        }
        const eventId = parsed.data;

        const existing = await storage.getEvent(eventId);
        if (!existing) {
          return res.status(404).json({ error: "Event not found" });
        }

        const body = req.body as Record<string, string | undefined>;
        const payload: Partial<{
          title: string;
          description: string;
          date: Date;
          location: string;
          price: string;
          imageUrl: string;
        }> = {};

        if (Object.prototype.hasOwnProperty.call(body, "title")) {
          const v = body.title;
          if (typeof v !== "string" || !v.trim()) {
            return res.status(400).json({ error: "title must be a non-empty string" });
          }
          const t = v.trim();
          if (t !== existing.title) payload.title = t;
        }

        if (Object.prototype.hasOwnProperty.call(body, "description")) {
          const v = body.description;
          if (typeof v !== "string" || !v.trim()) {
            return res.status(400).json({ error: "description must be a non-empty string" });
          }
          const t = v.trim();
          if (t !== existing.description) payload.description = t;
        }

        if (Object.prototype.hasOwnProperty.call(body, "location")) {
          const v = body.location;
          if (typeof v !== "string" || !v.trim()) {
            return res.status(400).json({ error: "location must be a non-empty string" });
          }
          const t = v.trim();
          if (t !== existing.location) payload.location = t;
        }

        if (Object.prototype.hasOwnProperty.call(body, "date")) {
          const v = body.date;
          if (typeof v !== "string" || !v.trim()) {
            return res.status(400).json({ error: "date must be a non-empty string" });
          }
          const dateObj = parseBrazilEventLocalDateTime(v);
          if (Number.isNaN(dateObj.getTime())) {
            return res.status(400).json({ error: "date must be a valid date" });
          }

          const prev = existing.date instanceof Date ? existing.date : new Date(existing.date as string);
          if (dateObj.getTime() !== prev.getTime()) {
            payload.date = dateObj;
          }
        }

        if (Object.prototype.hasOwnProperty.call(body, "price")) {
          const v = body.price;
          if (typeof v !== "string" || !v.trim()) {
            return res.status(400).json({ error: "price must be a non-empty string" });
          }
          const normalizedPrice = String(v).trim().replace(",", ".");
          const priceNum = Number(normalizedPrice);
          if (!Number.isFinite(priceNum) || priceNum < 0) {
            return res.status(400).json({ error: "price must be a valid non-negative number" });
          }
          const prevNum = Number(String(existing.price).replace(",", "."));
          if (!Number.isFinite(prevNum) || priceNum !== prevNum) {
            payload.price = normalizedPrice;
          }
        }

        const file = req.file as { buffer: Buffer; mimetype: string } | undefined;
        if (file?.buffer) {
          const mimeToExt: Record<string, string> = {
            "image/jpeg": "jpeg",
            "image/jpg": "jpg",
            "image/png": "png",
            "image/webp": "webp",
          };
          const ext = mimeToExt[file.mimetype];
          if (!ext) {
            return res.status(400).json({ error: "Invalid image type" });
          }
          const key = `events/covers/${randomUUID()}.${ext}`;
          try {
            const imageUrl = await s3Service.uploadBuffer(file.buffer, key, file.mimetype);
            if (imageUrl !== existing.imageUrl) {
              payload.imageUrl = imageUrl;
            }
          } catch (uploadErr: unknown) {
            const detail = uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
            return res.status(500).json({
              error: "Failed to upload cover image",
              detail,
            });
          }
        }

        if (Object.keys(payload).length === 0) {
          return res.status(200).json(existing);
        }

        const updated = await storage.updateEvent(eventId, payload as Partial<Event>);
        if (!updated) {
          return res.status(404).json({ error: "Event not found" });
        }
        return res.status(200).json(updated);
      } catch (error: any) {
        const code = error?.code ?? error?.cause?.code;
        if (code === "23505") {
          return res.status(409).json({ error: "An event with this name already exists" });
        }
        console.error("PATCH /api/admin/events/:eventId:", error);
        return res.status(500).json({ error: "Failed to update event" });
      }
    },
  );

  app.delete("/api/admin/events/:eventId", authenticateToken, async (req: any, res) => {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({ message: "Acesso negado. Apenas administradores." });
      }
      const parsed = z.string().uuid().safeParse(req.params.eventId);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid event id" });
      }
      const eventId = parsed.data;
      const existing = await storage.getEvent(eventId);
      if (!existing) {
        return res.status(404).json({ error: "Event not found" });
      }
      const ok = await storage.deleteEvent(eventId);
      if (!ok) {
        return res.status(500).json({ error: "Failed to delete event" });
      }
      return res.status(204).send();
    } catch (error) {
      console.error("DELETE /api/admin/events/:eventId:", error);
      res.status(500).json({ error: "Failed to delete event" });
    }
  });

  app.get("/api/admin/events/:eventId/participants", authenticateToken, async (req: any, res) => {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({ message: "Acesso negado. Apenas administradores." });
      }
      const parsed = z.string().uuid().safeParse(req.params.eventId);
      if (!parsed.success) {
        return res.status(400).json({ message: "eventId inválido" });
      }
      const eventId = parsed.data;

      const rows = await db
        .select({
          userId: users.id,
          name: users.name,
          cpf: users.cpf,
          email: users.email,
          phone: users.phone,
          ticketId: orders.id,
          orderStatus: orders.status,
          amntUsed: orders.amntUsed,
          maxUses: orders.maxUses,
          qrCodeUsed: orders.qrCodeUsed,
          qrCodeUsedAt: orders.qrCodeUsedAt,
        })
        .from(orders)
        .innerJoin(users, eq(orders.userId, users.id))
        .where(
          and(
            eq(orders.eventId, eventId),
            inArray(orders.status, ["paid", "courtesy"]),
          ),
        )
        .orderBy(asc(users.name));

      const data = rows.map((r) => {
        const used = r.amntUsed ?? 0;
        const maxU = r.maxUses ?? 1;
        return {
          userId: r.userId,
          name: r.name,
          cpf: r.cpf,
          email: r.email,
          phone: r.phone,
          ticketId: r.ticketId,
          orderStatus: r.orderStatus,
          amntUsed: used,
          maxUses: maxU,
          checkedIn: used > 0,
          checkedInAt: r.qrCodeUsedAt
            ? r.qrCodeUsedAt instanceof Date
              ? r.qrCodeUsedAt.toISOString()
              : new Date(r.qrCodeUsedAt as string).toISOString()
            : null,
        };
      });

      res.json({ data, total: data.length });
    } catch (error) {
      console.error("GET /api/admin/events/:eventId/participants:", error);
      res.status(500).json({ message: "Erro ao listar participantes" });
    }
  });

  app.get("/api/admin/events/:eventId/commercial-sales", authenticateToken, async (req: any, res) => {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      const parsed = z.string().uuid().safeParse(req.params.eventId);
      if (!parsed.success) {
        return res.status(400).json({ error: "eventId inválido" });
      }
      const eventId = parsed.data;

      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      const sellers = alias(users, "sellers");

      const rows = await db
        .select({
          id: orders.id,
          status: orders.status,
          buyerName: users.name,
          cpf: orders.cpf,
          buyerEmail: users.email,
          buyerPhone: users.phone,
          courtesyAttendeeId: orders.courtesyAttendeeId,
          attendeeName: courtesyAttendees.name,
          attendeeCpf: courtesyAttendees.cpf,
          attendeeEmail: courtesyAttendees.email,
          attendeePhone: courtesyAttendees.phone,
          sellerName: sellers.name,
          courtesyLinkId: orders.courtesyLinkId,
          createdAt: orders.createdAt,
        })
        .from(orders)
        .innerJoin(users, eq(orders.userId, users.id))
        .leftJoin(courtesyAttendees, eq(orders.courtesyAttendeeId, courtesyAttendees.id))
        .leftJoin(courtesyLinks, eq(orders.courtesyLinkId, courtesyLinks.id))
        .leftJoin(sellers, eq(courtesyLinks.createdBy, sellers.id))
        .where(and(
          eq(orders.eventId, eventId),
          inArray(orders.status, ["pending", "paid", "courtesy"]),
        ))
        .orderBy(desc(orders.createdAt));

      const data = mapCommercialSales(rows);
      res.json(data);
    } catch (error) {
      console.error("GET /api/admin/events/:eventId/commercial-sales:", error);
      res.status(500).json({ error: "Erro ao carregar dados de vendas" });
    }
  });

  app.get(
    "/api/admin/courtesy-links/by-code/:code",
    authenticateToken,
    async (req: any, res) => {
      try {
        if (!req.user.isAdmin) {
          return res.status(403).json({ message: "Acesso negado. Apenas administradores." });
        }
        let raw = req.params.code ?? "";
        try {
          raw = decodeURIComponent(raw);
        } catch {
          return res.status(400).json({ error: "Código inválido" });
        }
        const code = raw.trim();
        if (!code) {
          return res.status(400).json({ error: "Código inválido" });
        }

        const link = await storage.getCourtesyLinkByCode(code);
        if (!link) {
          return res.status(404).json({ error: "Link de cortesia não encontrado" });
        }

        const event = await storage.getEvent(link.eventId);
        res.json({
          link: {
            id: link.id,
            code: link.code,
            eventId: link.eventId,
            ticketCount: link.ticketCount,
            usedCount: link.usedCount ?? 0,
            isActive: link.isActive,
          },
          eventTitle: event?.title ?? null,
        });
      } catch (error) {
        console.error("GET /api/admin/courtesy-links/by-code/:code:", error);
        res.status(500).json({ error: "Erro ao buscar link de cortesia" });
      }
    },
  );

  app.patch("/api/admin/courtesy-links/:id", authenticateToken, async (req: any, res) => {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({ message: "Acesso negado. Apenas administradores." });
      }
      const idParsed = z.string().uuid().safeParse(req.params.id);
      if (!idParsed.success) {
        return res.status(400).json({ error: "id inválido" });
      }

      const bodyParsed = z
        .object({ ticketCount: z.coerce.number() })
        .safeParse(req.body);
      if (!bodyParsed.success) {
        return res.status(400).json({ error: "Payload inválido: informe ticketCount" });
      }
      const ticketCount = bodyParsed.data.ticketCount;
      if (!Number.isInteger(ticketCount)) {
        return res.status(400).json({ error: "Informe um limite inteiro válido." });
      }

      try {
        const updated = await storage.updateCourtesyLinkTicketCount(idParsed.data, ticketCount);
        res.json({
          link: {
            id: updated.id,
            code: updated.code,
            eventId: updated.eventId,
            ticketCount: updated.ticketCount,
            usedCount: updated.usedCount ?? 0,
            isActive: updated.isActive,
          },
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Erro ao atualizar";
        if (msg === "LINK_NOT_FOUND") {
          return res.status(404).json({ error: "Link de cortesia não encontrado" });
        }
        return res.status(400).json({ error: msg });
      }
    } catch (error) {
      console.error("PATCH /api/admin/courtesy-links/:id:", error);
      res.status(500).json({ error: "Erro ao atualizar link de cortesia" });
    }
  });

  app.post("/api/admin/tickets/:ticketId/check-in", authenticateToken, async (req: any, res) => {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({ message: "Acesso negado. Apenas administradores." });
      }
      const parsed = z.string().uuid().safeParse(req.params.ticketId);
      if (!parsed.success) {
        return res.status(400).json({ message: "ticketId inválido" });
      }
      const ticketId = parsed.data;

      const order = await storage.getOrder(ticketId);
      if (!order) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      if (order.status === "cancelled") {
        return res.status(400).json({
          error: "Ingresso Cancelado",
          message: "Ingresso Cancelado",
        });
      }

      if (order.status !== "paid" && order.status !== "courtesy") {
        return res.status(400).json({ error: "Ticket not valid for check-in" });
      }

      const maxUses = order.maxUses ?? 1;
      const used = order.amntUsed ?? 0;
      if (used >= maxUses) {
        return res.status(409).json({
          error: "Already checked in",
          checkedInAt: order.qrCodeUsedAt
            ? order.qrCodeUsedAt instanceof Date
              ? order.qrCodeUsedAt.toISOString()
              : new Date(order.qrCodeUsedAt as string).toISOString()
            : null,
        });
      }

      // Mirrors /api/verify-ticket DB update; manual admin override.
      const now = new Date();
      const newUsed = used + 1;
      await storage.updateOrder(ticketId, {
        qrCodeUsed: true,
        qrCodeUsedAt: now,
        amntUsed: newUsed,
      });

      res.json({
        success: true,
        checkedInAt: now.toISOString(),
        amntUsed: newUsed,
        maxUses,
        checkedIn: newUsed > 0,
      });
    } catch (error) {
      console.error("POST /api/admin/tickets/:ticketId/check-in:", error);
      res.status(500).json({ message: "Erro ao registrar presença" });
    }
  });

  app.post("/api/admin/orders/:id/cancel", authenticateToken, async (req: any, res) => {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          message: "Acesso negado. Apenas administradores.",
        });
      }
      const parsed = z.string().uuid().safeParse(req.params.id);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: "orderId inválido" });
      }
      const orderId = parsed.data;

      const result = await storage.cancelOrderAndInvalidateQr(orderId);
      if (!result.ok) {
        if (result.code === "not_found") {
          return res.status(404).json({
            success: false,
            message: "Pedido não encontrado.",
          });
        }
        if (result.code === "already_cancelled") {
          return res.status(409).json({
            success: false,
            message: "Este ingresso já está cancelado.",
          });
        }
        if (result.code === "invalid_status") {
          return res.status(400).json({
            success: false,
            message: `Não é possível cancelar um pedido com status: ${result.status}`,
          });
        }
        return res.status(400).json({ success: false, message: "Não foi possível cancelar o pedido." });
      }

      const buyer = await storage.getUser(result.order.userId);
      const event = await storage.getEvent(result.order.eventId);
      if (buyer?.email) {
        const html = buildCancellationEmailHtml(
          buyer.name ?? "Participante",
          event?.title ?? "Evento",
        );
        const text = [
          `Olá, ${buyer.name ?? "Participante"},`,
          "",
          `Sua inscrição no evento ${event?.title ?? "Evento"} foi cancelada pela organização.`,
          "O QR Code do ingresso foi invalidado.",
          "",
          "Equipe CDPI Pass",
        ].join("\n");
        await storage.addEmailToQueue({
          to: buyer.email,
          subject: "Cancelamento de inscrição — CDPI Pass",
          html,
          text,
          attachments: null,
        });
      }

      res.json({
        success: true,
        message:
          "Inscrição cancelada com sucesso. O QR Code foi invalidado e um e-mail foi enfileirado.",
      });
    } catch (error) {
      console.error("POST /api/admin/orders/:id/cancel:", error);
      res.status(500).json({
        success: false,
        message: "Erro interno ao cancelar inscrição",
      });
    }
  });

  app.post("/api/admin/orders/:id/undo-check-in", authenticateToken, async (req: any, res) => {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({ message: "Acesso negado. Apenas administradores." });
      }
      const parsed = z.string().uuid().safeParse(req.params.id);
      if (!parsed.success) {
        return res.status(400).json({ error: "orderId inválido" });
      }
      const orderId = parsed.data;

      const updated = await storage.undoOrderCheckIn(orderId);
      const amntUsed = updated.amntUsed ?? 0;
      const maxUses = updated.maxUses ?? 1;
      res.json({
        success: true,
        message: "Presença desmarcada com sucesso.",
        data: {
          checkedIn: amntUsed > 0,
          amntUsed,
          maxUses,
        },
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Erro ao desmarcar presença";
      console.error("POST /api/admin/orders/:id/undo-check-in:", error);
      if (msg === "Pedido não encontrado") {
        return res.status(400).json({ error: msg });
      }
      if (
        msg === "Não é possível alterar presença de ingresso cancelado" ||
        msg === "Este ingresso não possui check-in para ser desmarcado"
      ) {
        return res.status(400).json({ error: msg });
      }
      res.status(400).json({ error: msg });
    }
  });

  const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  app.post(
    "/api/events/:id/certificate-template",
    authenticateToken,
    upload.single("file"),
    async (req: any, res) => {
      try {
        if (!req.user.isAdmin) {
          return res.status(403).json({ message: "Acesso negado. Apenas administradores." });
        }
        const { id } = req.params;
        const file = req.file as { buffer: Buffer; originalname?: string; mimetype: string } | undefined;
        if (!file?.buffer) {
          return res.status(400).json({ message: "Envie um arquivo .docx" });
        }
        const extOk = file.originalname?.toLowerCase().endsWith(".docx") ?? false;
        const mimeOk = file.mimetype === DOCX_MIME;
        if (!extOk && !mimeOk) {
          return res.status(400).json({ message: "Apenas arquivos .docx são permitidos" });
        }

        const event = await storage.getEvent(id);
        if (!event) {
          return res.status(404).json({ message: "Evento não encontrado" });
        }

        const key = `certificate-templates/${id}/${randomUUID()}.docx`;
        const certificateTemplateUrl = await s3Service.uploadBuffer(
          file.buffer,
          key,
          DOCX_MIME,
        );

        const updated = await storage.updateEvent(id, { certificateTemplateUrl });
        if (!updated) {
          return res.status(500).json({ message: "Erro ao salvar URL do template" });
        }

        res.status(201).json({ event: updated, certificateTemplateUrl });
      } catch (error) {
        console.error("POST certificate-template error:", error);
        res.status(500).json({ message: "Erro ao enviar template" });
      }
    },
  );

  // Orders routes
  app.post("/api/orders", authenticateToken, async (req: any, res) => {
    try {
      const { eventId, paymentMethod, promoCode } = req.body;
      const userId = req.user.id;

      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ message: "Evento não encontrado" });
      }

      // Check if event is full
      if (event.maxAttendees && (event.currentAttendees || 0) >= event.maxAttendees) {
        return res.status(400).json({ message: "Evento lotado" });
      }

      // Calculate total amount (event price + convenience fee)
      let finalPrice = parseFloat(event.price);
      let promoLinkId: string | null = null;
      
      if (promoCode) {
        const link = await storage.getCourtesyLinkByCode(promoCode);
        const remainingUses = link ? link.ticketCount - (link.usedCount || 0) : 0;

        // It correctly checks for an overridePrice to apply the discount
        if (link && link.isActive && remainingUses > 0 && link.overridePrice) {
          finalPrice = parseFloat(link.overridePrice);
          promoLinkId = link.id;
        } else {
          return res.status(400).json({ message: "Código promocional inválido ou esgotado." });
        }
      }
      
      const convenienceFee = 5.00;
      const totalAmount = finalPrice + convenienceFee;

      // Create order
      const order = await storage.createOrder({
        userId,
        eventId,
        cpf: req.user.cpf,
        paymentMethod,
        amount: totalAmount.toString(),
        status: "pending",
        courtesyLinkId: promoLinkId,
      });

      // Create payment with Asaas
      try {
        const paymentData = await asaasService.createPayment({
          customer: {
            name: req.user.name,
            email: req.user.email,
            cpfCnpj: req.user.cpf.replace(/\D/g, ''), // Remove formatting
            phone: req.user.phone?.replace(/\D/g, '') || '',
          },
          billingType: paymentMethod === "credit_card" ? "CREDIT_CARD" : 
                      paymentMethod === "pix" ? "PIX" : "BOLETO",
          value: totalAmount,
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
          description: `Ingresso para ${event.title}`,
          externalReference: order.id,
        });

        // Update order with payment ID
        await storage.updateOrder(order.id, {
          asaasPaymentId: paymentData.id,
        });

        // Generate QR code for the ticket
        const qrCodeData = await qrCodeService.generateQRCode({
          orderId: order.id,
          eventId: event.id,
          userId: userId,
        });

        // Update order with QR code
        const updatedOrder = await storage.updateOrder(order.id, {
          qrCodeData,
          
        });

        // Prepare response with payment details
        const response: any = {
          order: updatedOrder,
          payment: {
            id: paymentData.id,
            link: paymentData.paymentLink,
            paymentLink: paymentData.paymentLink,
            status: paymentData.status,
            value: paymentData.value,
          }
        };

        if (paymentMethod === "credit_card" && paymentData.paymentLink) {
          try {
            await emailService.sendCardPaymentLinkEmail(req.user.email, {
              userName: req.user.name,
              eventTitle: event.title,
              paymentUrl: paymentData.paymentLink,
            });
          } catch (emailErr) {
            console.error("Erro ao enviar e-mail com link de pagamento:", emailErr);
          }
        }

        // Add payment method specific data
        if (paymentMethod === 'pix' && paymentData.pixTransaction) {
          response.payment.pixQrCode = paymentData.pixTransaction.qrCode.encodedImage;
          response.payment.pixPayload = paymentData.pixTransaction.qrCode.payload;
          response.payment.pixExpiration = paymentData.pixTransaction.expirationDate;
        } else if (paymentMethod === 'boleto' && paymentData.bankSlipUrl) {
          response.payment.boletoUrl = paymentData.bankSlipUrl;
        }

        res.status(201).json(response);
      } catch (paymentError) {
        console.error("Payment creation error:", paymentError);
        // Delete the order if payment creation fails
        await storage.deleteOrder(order.id);
        res.status(500).json({ message: "Erro ao processar pagamento. Tente novamente." });
      }
    } catch (error) {
      console.error("Create order error:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  app.get("/api/orders", authenticateToken, requireEmailVerification, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const page = parseInt(req.query.page as string) || 1;
      // console.log("🔍 GET /api/orders - Page:", page, "UserId:", userId);
      const limit = 10;

      const { orders, total } = await storage.getOrdersByUser(userId, page, limit);

      res.json({
        orders,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
      });
    
    } catch (error) {
      console.error("Get orders error:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  app.get("/api/orders/:id", authenticateToken, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      
      const order = await storage.getOrder(id);
      if (!order || order.userId !== userId) {
        return res.status(404).json({ message: "Pedido não encontrado" });
      }

      res.json(order);
    } catch (error) {
      console.error("Get order error:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  // Endpoint to manually check payment status
  app.post("/api/orders/:id/check-status", authenticateToken, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      
      const order = await storage.getOrder(id);
      if (!order || order.userId !== userId) {
        return res.status(404).json({ message: "Pedido não encontrado" });
      }

      if (!order.asaasPaymentId) {
        return res.status(400).json({ message: "Pedido sem ID de pagamento" });
      }

      // Check payment status with Asaas
      const payment = await asaasService.getPayment(
        order.asaasPaymentId,
        order.id
      );
      
      console.log(`Manual check - Payment status for order ${id}:`, payment.status);

      if ((payment.status === 'CONFIRMED' || payment.status === 'RECEIVED') && order.status !== 'paid') {
        // Update order status
        await storage.updateOrder(id, { status: 'paid' });
        
        // Get event and user details
        const event = await storage.getEvent(order.eventId);
        const ticketUser = await storage.getUser(order.userId);
        
        if (event && ticketUser) {
          // Increment event attendees
          await storage.updateEvent(event.id, {
            currentAttendees: (event.currentAttendees || 0) + 1,
          });

          // Send confirmation email with QR code ticket
          await emailService.sendTicketEmail(ticketUser.email, {
            userName: ticketUser.name,
            eventTitle: event.title,
            eventDate: event.date,
            eventLocation: event.location,
            qrCodeData: order.qrCodeData || '',
            orderId: order.id,
            qrCodeS3Url: order.qr_code_s3_url || '',
          });
        }

        const updatedOrder = await storage.getOrder(id);
        return res.json({ 
          message: "Pagamento confirmado!", 
          order: updatedOrder 
        });
      } else if ((payment.status === 'OVERDUE' || payment.status === 'CANCELED') && order.status === 'pending') {
        await storage.updateOrder(id, { status: 'cancelled' });
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

  // Cancel order
  app.delete("/api/orders/:id/cancel", authenticateToken, async (req: any, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const order = await storage.getOrder(id);

        if (!order) {
            return res.status(404).json({ message: "Pedido não encontrado" });
        }

        if (order.userId !== userId) {
            return res.status(403).json({ message: "Acesso não autorizado" });
        }

        if (order.status !== 'pending') {
            return res.status(400).json({ message: "Este pedido não pode ser cancelado" });
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

  // Asaas webhook for payment notifications

  // Verify ticket endpoint - Admin only
  app.post("/api/verify-ticket", authenticateToken, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      // Check if user is admin
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
          message: "QR Code não fornecido" 
        });
      }

      // Verify QR code
      const verification = qrCodeService.verifyQRCode(qrCodeData);
      
      if (!verification.valid) {
        return res.status(400).json({ 
          success: false, 
          message: verification.error || "QR Code inválido" 
        });
      }

      // Get order from database
      const order = await storage.getOrder(verification.data.orderId);
      
      if (!order) {
        return res.status(404).json({ 
          success: false, 
          message: "Ingresso não encontrado" 
        });
      }

      if (order.status === "cancelled") {
        return res.status(400).json({
          success: false,
          message: "Ingresso Cancelado",
          error: "Ingresso Cancelado",
        });
      }

      // Check if ticket was already used more than it should
      if (order.amntUsed >= order.maxUses) {
        return res.status(400).json({ 
          success: false, 
          message: "Ingresso já foi utilizado o número máximo de vezes" 
        });
      }

      if (order.status !== "paid" && order.status !== "courtesy") {
        return res.status(400).json({
          success: false,
          message: "Pagamento não confirmado.",
          error: "Pagamento não confirmado.",
        });
      }

      // Mark ticket as used
      await storage.updateOrder(order.id, { 
        qrCodeUsed: true,
        qrCodeUsedAt: new Date(),
        amntUsed: order.amntUsed + 1
      });

      // Get event info for response
      const event = await storage.getEvent(order.eventId);

      res.json({ 
        success: true, 
        message: "Ingresso verificado com sucesso",
        userName: "Participante Confirmado",
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

  app.post("/api/webhooks/asaas", async (req, res) => {
    try {
      const asaasToken = req.headers['asaas-access-token'] as string | undefined;
      
      if (!asaasService.validateWebhookSignature(asaasToken)) {
        console.warn("Invalid or missing Asaas webhook token received.");
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { event: eventType, payment } = req.body;
      
      console.log("Asaas webhook received and validated:", eventType, payment?.id);

      console.log("Full webhook payload:", JSON.stringify(req.body, null, 2));
      
      // Handle different payment events
      if (eventType === "PAYMENT_CONFIRMED" || eventType === "PAYMENT_RECEIVED") {
        const order = payment.externalReference 
            ? await storage.getOrder(payment.externalReference)
            : await storage.getOrderByAsaasPaymentId(payment.id);
        
        if (order && order.status !== "paid") {
          // Update order status
          await storage.updateOrder(order.id, { status: "paid" });
          
          // Get event and user details
          const event = await storage.getEvent(order.eventId);
          const user = await storage.getUser(order.userId);

          if (order.courtesyLinkId) {
          await storage.incrementCourtesyLinkUsage(order.courtesyLinkId);
          }
          
          if (event && user) {
            // Increment event attendees
            await storage.updateEvent(event.id, {
              currentAttendees: (event.currentAttendees || 0) + 1,
            });

            // === 🔄 Forward structured data to Make.com ===
          const makeWebhookUrl = "https://hook.us2.make.com/wrlqnqumlmgvfjicglpdrc3gv8lkbqce"; // replace this
          (async () => {
            try {
              await axios.post(makeWebhookUrl, {
                user: {
                  name: user.name,
                  email: user.email,
                },
                event: {
                  title: event.title,
                  date: event.date,
                  location: event.location,
                },
                order: {
                  id: order.id,
                  amount: order.amount || payment?.value || null,
                  status: "paid",
                  paymentMethod: payment?.billingType || "unknown",
                },
              });
              console.log("✅ Forwarded structured data to Make.com successfully");
            } catch (err) {
              console.error("❌ Failed to forward data to Make.com:", err);
            }
          })();
          // ==================================================

            // Send confirmation email with QR code ticket
            await emailService.sendTicketEmail(user!.email, {
              userName: user!.name,
              eventTitle: event.title,
              eventDate: event.date,
              eventLocation: event.location,
              qrCodeData: order.qrCodeData || '',
              orderId: order.id,
              qrCodeS3Url: order.qr_code_s3_url || '',
            });
          }
        }
      } else if (eventType === "PAYMENT_OVERDUE" || eventType === "PAYMENT_DELETED") {
        const order = await storage.getOrderByAsaasPaymentId(payment.id);
        
        if (order && order.status === "pending") {
          // Update order status to cancelled
          await storage.updateOrder(order.id, { status: "cancelled" });
        }
      }

      res.status(200).json({ received: true });
    } catch (error) {
      console.error("Webhook error:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  // Make user admin (development only - remove in production!)
  app.post("/api/make-admin/:userId", authenticateToken, async (req: any, res) => {
    try {
      // Only allow in development mode
      if (process.env.NODE_ENV === "production") {
        return res.status(403).json({ message: "Not available in production" });
      }

      const { userId } = req.params;
      
      // Update user to be admin
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
      res.status(500).json({ message: "Erro ao tornar usuário admin" });
    }
  });

  // User profile routes
  app.put("/api/profile", authenticateToken, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { currentPassword, ...updates } = req.body;
      
      // Define sensitive fields that require password verification
      const sensitiveFields = ['name', 'email', 'phone'];
      const hasChangedSensitiveField = sensitiveFields.some(field => 
        updates[field] !== undefined && updates[field] !== req.user[field]
      );
      
      // Require password for sensitive field changes
      if (hasChangedSensitiveField) {
        if (!currentPassword) {
          return res.status(400).json({ 
            message: "Senha atual é necessária para alterar informações sensíveis" 
          });
        }
        
        // Verify password
        const isValidPassword = await bcrypt.compare(currentPassword, req.user.password);
        if (!isValidPassword) {
          return res.status(401).json({ message: "Senha incorreta" });
        }
      }
      
      // Remove fields that shouldn't be updated via this endpoint
      delete updates.password;
      delete updates.cpf;
      delete updates.emailVerified;
      delete updates.id;
      delete updates.createdAt;
      delete updates.updatedAt;

      // Convert birthDate string to Date object if present
      if (updates.birthDate && typeof updates.birthDate === 'string') {
        // Handle Brazilian date format (dd/mm/yyyy)
        const [day, month, year] = updates.birthDate.split('/').map(Number);
        if (day && month && year) {
          updates.birthDate = new Date(year, month - 1, day);
        } else {
          // Try ISO format as fallback
          updates.birthDate = new Date(updates.birthDate);
        }
      }

      const updatedUser = await storage.updateUser(userId, updates);
      
      if (!updatedUser) {
        return res.status(404).json({ message: "Usuário não encontrado" });
      }

      const { password, ...userWithoutPassword } = updatedUser;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Update profile error:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  app.put("/api/profile/password", authenticateToken, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Senhas são obrigatórias" });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ message: "Nova senha deve ter pelo menos 6 caracteres" });
      }

      // Verify current password
      const isValidPassword = await bcrypt.compare(currentPassword, req.user.password);
      if (!isValidPassword) {
        return res.status(400).json({ message: "Senha atual incorreta" });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Update password
      await storage.updateUser(userId, { password: hashedPassword });

      res.json({ message: "Senha alterada com sucesso" });
    } catch (error) {
      console.error("Change password error:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  // Delete account endpoint
  app.delete("/api/profile", authenticateToken, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { password } = req.body;

      // Require password confirmation for security
      if (!password) {
        return res.status(400).json({ message: "Senha é obrigatória para confirmar exclusão" });
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, req.user.password);
      if (!isValidPassword) {
        return res.status(401).json({ message: "Senha incorreta" });
      }

      // Delete user account and all related data
      const deleted = await storage.deleteUser(userId);
      
      if (deleted) {
        res.json({ message: "Conta excluída com sucesso" });
      } else {
        res.status(404).json({ message: "Usuário não encontrado" });
      }
    } catch (error) {
      console.error("Delete account error:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  // Courtesy Links Routes
  app.post("/api/courtesy-links", authenticateToken, async (req: any, res) => {
    try {
      // Check if user is admin
      if (!req.user.isAdmin) {
        return res.status(403).json({ message: "Acesso negado. Apenas administradores podem criar links de cortesia." });
      }

      const { eventId, ticketCount, overridePrice } = req.body;

      if (!eventId || !ticketCount || ticketCount < 1) {
        return res.status(400).json({ message: "Dados inválidos. Forneça eventId e ticketCount." });
      }

      // Check if event exists
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ message: "Evento não encontrado" });
      }

      // Generate unique code
      const code = `CDPI${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

      // Create courtesy link
      const link = await storage.createCourtesyLink({
        code,
        eventId,
        ticketCount: parseInt(ticketCount),
        createdBy: req.user.id,
        isActive: true,
        overridePrice: overridePrice || null,
      });

      let finalUrl = "";
      if (link.overridePrice) {
        // If it has a price, it's a PROMO link. Point to the event page.
        finalUrl = `${req.protocol}://${req.get('host')}/event/${link.eventId}?promo=${link.code}`;
      } else {
        // Otherwise, it's a FREE courtesy link. Point to the redemption page.
        finalUrl = `${req.protocol}://${req.get('host')}/cortesia?code=${link.code}`;
      }

      res.status(201).json({
        ...link,
        redeemUrl: finalUrl
      });
    } catch (error) {
      console.error("Create courtesy link error:", error);
      res.status(500).json({ message: "Erro ao criar link de cortesia" });
    }
  });

  app.get("/api/courtesy-links", authenticateToken, async (req: any, res) => {
  try {
    // console.log("🔍 GET /api/courtesy-links - UserId:", req.user.id, "Page:", req.query.page);
    
    if (!req.user.isAdmin) {
      return res.status(403).json({ message: "Acesso negado" });
    }
    const userId = req.user.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = 10;
    const { links, total } = await storage.getCourtesyLinksByCreator(userId, page, limit);

    // Add event details to each link
      const linksWithDetails = await Promise.all(links.map(async (link) => {
        const event = await storage.getEvent(link.eventId);
        
        let finalUrl = "";
        if (link.overridePrice) {
          finalUrl = `${req.protocol}://${req.get('host')}/event/${link.eventId}?promo=${link.code}`;
        } else {
          finalUrl = `${req.protocol}://${req.get('host')}/cortesia?code=${link.code}`;
        }
        
        return {
          ...link,
          event,
          redeemUrl: finalUrl,
          remainingTickets: link.ticketCount - (link.usedCount || 0)
        };
      }));
    
    // console.log("📦 Found links:", linksWithDetails.length, "Total:", total); 
    
    res.json({
      links: linksWithDetails,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
    });
  } catch (error) {
    console.error("Get courtesy links error:", error);
    res.status(500).json({ message: "Erro ao buscar links de cortesia" });
  }
});

  app.get("/api/courtesy-links/:code", async (req, res) => {
    try {
      const { code } = req.params;
      
      const link = await storage.getCourtesyLinkByCode(code);
      if (!link) {
        return res.status(404).json({ message: "Link de cortesia não encontrado" });
      }

      if (!link.isActive) {
        return res.status(400).json({ message: "Link de cortesia inativo" });
      }

      const remainingTickets = link.ticketCount - (link.usedCount || 0);
      if (remainingTickets <= 0) {
        return res.status(400).json({ message: "Todos os ingressos deste link já foram resgatados" });
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

  app.post("/api/courtesy/redeem", authenticateToken, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { code, ...userData } = req.body;

      // Validate redemption data
      const validationResult = courtesyRedemptionSchema.safeParse(userData);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Dados inválidos", 
          errors: validationResult.error.errors 
        });
      }

      // Get courtesy link
      const link = await storage.getCourtesyLinkByCode(code);
      if (!link) {
        return res.status(404).json({ message: "Link de cortesia não encontrado" });
      }

      if (link.overridePrice) {
      return res.status(400).json({ message: "Este é um código de desconto e deve ser usado na página do evento, não no resgate de cortesia." });
      }

      if (!link.isActive) {
        return res.status(400).json({ message: "Link de cortesia inativo" });
      }

      // Check if there are remaining tickets
      const remainingTickets = link.ticketCount - (link.usedCount || 0);
      if (remainingTickets <= 0) {
        return res.status(400).json({ message: "Todos os ingressos deste link já foram resgatados" });
      }

      // Get event details
      const event = await storage.getEvent(link.eventId);
      if (!event) {
        return res.status(404).json({ message: "Evento não encontrado" });
      }

      // Check if CPF is already registered for this event
      const isCpfRegistered = await storage.isCpfAlreadyRegisteredForEvent(userData.cpf, link.eventId);
      if (isCpfRegistered) {
        return res.status(400).json({ message: "CPF já cadastrado para este evento" });
      }

      // Check if event is full
      if (event.maxAttendees && (event.currentAttendees || 0) >= event.maxAttendees) {
        return res.status(400).json({ message: "Evento lotado" });
      }

      // Update user information with courtesy data
      const birthDateObj = new Date(userData.birthDate);

      const newAttendee = await storage.createCourtesyAttendee({
      name: userData.name,
      email: userData.email,
      cpf: userData.cpf,
      phone: userData.phone,
      birthDate: birthDateObj,
      address: userData.address,
      partnerCompany: userData.partnerCompany,
      occupation: userData.occupation,
      eventTitle: event.title,
      });

      if (process.env.COURTESY_WEBHOOK_URL) {
        try {
          console.log("Sending courtesy attendee to automation webhook...");
          // Send the POST request, but don't wait for it to finish
          // This is "fire-and-forget"
          fetch(process.env.COURTESY_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newAttendee),
          });
          // Note: We don't use 'await' on fetch here.
          // This lets the redemption process continue immediately.
          
        } catch (webhookError) {
          // Log the error, but DO NOT stop the redemption.
          console.error("Failed to send data to courtesy webhook:", webhookError);
        }
      }

      // Create courtesy order
      const order = await storage.createOrder({
        userId, // The user who performed the redemption
        eventId: link.eventId,
        cpf: newAttendee.cpf,
        paymentMethod: "courtesy",
        amount: "0.00",
        status: "paid",
        courtesyLinkId: link.id,
        courtesyAttendeeId: newAttendee.id, // Link to the new attendee record
      });

      // Generate QR code for the ticket
      const qrCodeData = await qrCodeService.generateQRCode({
        orderId: order.id,
        eventId: event.id,
        userId: userId,
      });

      // Update order with QR code
      const updatedOrder = await storage.updateOrder(order.id, {
        qrCodeData,
      });

      // Increment courtesy link usage
      await storage.incrementCourtesyLinkUsage(link.id);

      // Update event attendees count
      await storage.updateEvent(event.id, {
        currentAttendees: (event.currentAttendees || 0) + 1
      });

      // Wait for S3 URL to be available with retry logic
      let finalOrderDetails = null;
      let retries = 0;
      const maxRetries = 100;
      
      while (retries < maxRetries) {
        finalOrderDetails = await storage.getOrder(order.id);
        
        if (finalOrderDetails?.qr_code_s3_url) {
          break; // S3 URL is available
        }
        
        // Wait before retrying (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 200 * Math.pow(1.5, retries)));
        retries++;
      }

      // Check if the order was fetched successfully before proceeding
      if (!finalOrderDetails) {
        console.error("Could not retrieve final order details for courtesy redemption:", order.id);
        // It's better to still send the response to the user even if the email fails.
        // The main redemption logic was successful.
        return res.status(201).json({
          message: "Cortesia resgatada com sucesso! Ocorreu um erro ao enviar o email do ingresso.",
          order: order, // Send back the initial order object
          qrCode: qrCodeData
        });
      }

      // Send confirmation email with ticket
      await emailService.sendTicketEmail(userData.email, {
        userName: newAttendee.name,
        eventTitle: event.title,
        eventDate: event.date,
        eventLocation: event.location,
        qrCodeData: qrCodeData,
        orderId: order.id,
        qrCodeS3Url: finalOrderDetails.qr_code_s3_url || '',
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

  function detectDelimiter(csvBuffer: Buffer): string {
  const sample = csvBuffer.toString('utf-8').split('\n')[0]; // Get first line
  
  const commaCount = (sample.match(/,/g) || []).length;
  const semicolonCount = (sample.match(/;/g) || []).length;
  const tabCount = (sample.match(/\t/g) || []).length;
  
  // Return the delimiter with the highest count
  if (semicolonCount > commaCount && semicolonCount > tabCount) {
    return ';';
  } else if (tabCount > commaCount && tabCount > semicolonCount) {
    return '\t';
  }
  
  return ','; // Default to comma
}

  app.post('/api/courtesy/mass-send', authenticateToken, upload.fields([
    { name: 'csvFile', maxCount: 1 },
    { name: 'attachment', maxCount: 1 }
  ]), async (req: any, res) => {
    if (!req.user.isAdmin) {
      return res.status(403).json({ message: 'Acesso negado.' });
    }
    if (!req.files?.csvFile) {
      return res.status(400).json({ message: 'Nenhum arquivo CSV enviado.' });
    }

    try {
      const csvBuffer = req.files.csvFile[0].buffer;
      const attachmentFile = req.files?.attachment ? req.files.attachment[0] : null;

      // 1. Prepare attachment data to be stored
      const attachmentData = attachmentFile ? {
        filename: attachmentFile.originalname,
        content: attachmentFile.buffer.toString('base64'),
        type: attachmentFile.mimetype
      } : null;

      // 2. Add the job to the database queue (you'll need to create this in 'storage')
      await storage.addMassSendJobToQueue({
        csvData: csvBuffer.toString('utf-8'), // Store CSV as text
        attachmentData: attachmentData ? JSON.stringify(attachmentData) : null,
        createdBy: req.user.id,
      });

      // 3. Respond IMMEDIATELY
      console.log('Mass send job has been queued.');
      res.status(202).json({ message: 'Processamento do CSV iniciado. Os e-mails serão enviados em segundo plano.' });

    } catch (error) {
      console.error('Error queuing CSV job:', error);
      res.status(500).json({ message: 'Erro ao enfileirar o processamento.' });
    }
  });

  /**
   * Certificates: PDF generation is delegated to AWS Lambda (`AWS_LAMBDA_ARN`, synchronous Invoke).
   * The IAM principal running this server needs `lambda:InvokeFunction` on that ARN.
   * Payload fields: templateS3Url, nomeCompleto, userId, eventId, outputBucket (`AWS_S3_BUCKET_NAME`).
   */
  const certificateTemplateReady = and(
    isNotNull(events.certificateTemplateUrl),
    sql`trim(${events.certificateTemplateUrl}) <> ''`,
  );

  app.get("/api/users/me/certificates", authenticateToken, async (req: any, res) => {
    try {
      const pageSize = 15;
      const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
      const offset = (page - 1) * pageSize;
      const userId = req.user.id as string;

      const [{ c: total }] = await db
        .select({
          c: sql<number>`count(distinct ${events.id})::int`,
        })
        .from(events)
        .innerJoin(
          orders,
          and(
            eq(orders.eventId, events.id),
            eq(orders.userId, userId),
            eq(orders.qrCodeUsed, true),
          ),
        )
        .where(certificateTemplateReady);

      const rows = await db
        .select({
          eventId: events.id,
          eventName: events.title,
          eventDate: events.date,
          certificateUrl: sql<string | null>`max(${certificates.certificateUrl})`,
        })
        .from(events)
        .innerJoin(
          orders,
          and(
            eq(orders.eventId, events.id),
            eq(orders.userId, userId),
            eq(orders.qrCodeUsed, true),
          ),
        )
        .leftJoin(
          certificates,
          and(eq(certificates.eventId, events.id), eq(certificates.userId, userId)),
        )
        .where(certificateTemplateReady)
        .groupBy(events.id, events.title, events.date)
        .orderBy(desc(events.date))
        .limit(pageSize)
        .offset(offset);

      const totalPages = total > 0 ? Math.ceil(total / pageSize) : 0;

      res.json({
        data: rows.map((row) => ({
          eventId: row.eventId,
          eventName: row.eventName,
          eventDate:
            row.eventDate instanceof Date
              ? row.eventDate.toISOString()
              : new Date(row.eventDate as string).toISOString(),
          certificateUrl: row.certificateUrl,
        })),
        pagination: {
          page,
          pageSize,
          total,
          totalPages,
        },
      });
    } catch (error) {
      console.error("GET /api/users/me/certificates:", error);
      res.status(500).json({ message: "Erro ao listar certificados" });
    }
  });

  app.post("/api/certificates/generate", authenticateToken, async (req: any, res) => {
    const userId = req.user.id as string;

    const parsed = generateCertificateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Dados inválidos",
        issues: parsed.error.flatten(),
      });
    }

    const { eventId, fullName, npsResponses } = parsed.data;

    try {
      const [existing] = await db
        .select({ id: certificates.id })
        .from(certificates)
        .where(and(eq(certificates.userId, userId), eq(certificates.eventId, eventId)))
        .limit(1);
      if (existing) {
        return res.status(409).json({ error: "Certificate already generated" });
      }

      const [eventRow] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
      if (!eventRow) {
        return res.status(400).json({ message: "Evento não encontrado" });
      }

      const templateUrl = eventRow.certificateTemplateUrl?.trim();
      if (!templateUrl) {
        return res.status(400).json({ message: "Evento sem template de certificado" });
      }

      const [eligible] = await db
        .select({ id: events.id })
        .from(events)
        .innerJoin(
          orders,
          and(
            eq(orders.eventId, events.id),
            eq(orders.userId, userId),
            eq(orders.qrCodeUsed, true),
          ),
        )
        .where(and(eq(events.id, eventId), certificateTemplateReady))
        .limit(1);

      if (!eligible) {
        return res.status(400).json({ message: "Você não está elegível para certificado neste evento" });
      }

      const outputBucket = process.env.AWS_S3_BUCKET_NAME?.trim();
      if (!outputBucket) {
        console.error("POST /api/certificates/generate: AWS_S3_BUCKET_NAME is missing");
        return res.status(500).json({ message: "Configuração de armazenamento ausente" });
      }

      let certificateUrl: string;
      try {
        certificateUrl = await invokeGenerateCertificatePdf({
          templateS3Url: templateUrl,
          nomeCompleto: fullName,
          userId,
          eventId,
          outputBucket,
        });
      } catch (lambdaErr: unknown) {
        console.error("Certificate Lambda:", lambdaErr);
        const msg = lambdaErr instanceof Error ? lambdaErr.message : String(lambdaErr);
        const errName =
          lambdaErr && typeof lambdaErr === "object" && lambdaErr !== null && "name" in lambdaErr
            ? String((lambdaErr as { name: string }).name)
            : "";
        const isIamInvokeDenied =
          errName === "AccessDeniedException" ||
          /not authorized to perform:\s*lambda:InvokeFunction/i.test(msg);
        if (isIamInvokeDenied) {
          return res.status(503).json({
            error: "PDF generation failed",
            detail:
              "Permissão AWS ausente: a identidade IAM das credenciais deste servidor (ex.: usuário da variável AWS_ACCESS_KEY_ID) precisa da ação lambda:InvokeFunction no recurso configurado em AWS_LAMBDA_ARN. No IAM, anexe uma política que permita invoke nessa função.",
          });
        }
        const isConfig = /AWS_LAMBDA_ARN|not configured/i.test(msg);
        return res.status(isConfig ? 500 : 502).json({
          error: "PDF generation failed",
          detail: msg,
        });
      }

      await db.insert(certificates).values({
        userId,
        eventId,
        certificateUrl,
        fullName,
        npsResponses: {
          overallRating: npsResponses.overallRating,
          wouldRecommend: npsResponses.wouldRecommend,
          highlights: npsResponses.highlights ?? "",
          improvements: npsResponses.improvements ?? "",
        },
      });

      return res.status(201).json({ certificateUrl });
    } catch (error: any) {
      const code = error?.code ?? error?.cause?.code;
      if (code === "23505") {
        return res.status(409).json({ error: "Certificate already generated" });
      }
      console.error("POST /api/certificates/generate:", error);
      return res.status(500).json({ message: "Erro ao gerar certificado" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
