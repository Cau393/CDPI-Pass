import axios from "axios";
import rateLimit from 'express-rate-limit';
import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { 
  insertUserSchema, 
  loginSchema, 
  insertOrderSchema,
  courtesyRedemptionSchema,
  type User 
} from "@shared/schema";
import { validateCpf, validateEmail, formatCpf, formatPhone } from "./utils/validation";
import { emailService } from "./services/emailService";
import { asaasService } from "./services/asaasService";
import { qrCodeService } from "./services/qrCodeService";
import { requireEmailVerification } from "./middleware/auth"; 
import multer from 'multer';
import csv from 'csv-parser';
import { parse } from 'csv-parse/sync';
import { Readable } from 'stream';

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
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many requests from this IP, please try again after 15 minutes',
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
            status: paymentData.status,
            value: paymentData.value,
          }
        };

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
      const payment = await asaasService.getPayment(order.asaasPaymentId);
      
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
  // Reset ticket - Admin only
  app.post("/api/reset-ticket/:orderId", authenticateToken, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      // Check if user is admin
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Acesso negado. Apenas administradores." });
      }
      
      const { orderId } = req.params;
      const order = await storage.getOrder(orderId);
      
      if (!order) {
        return res.status(404).json({ message: "Pedido não encontrado" });
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

      // Check if ticket was already used
      if (order.qrCodeUsed) {
        return res.status(400).json({ 
          success: false, 
          message: "Ingresso já foi utilizado" 
        });
      }

      // Check if order is paid
      if (order.status !== 'paid') {
        return res.status(400).json({ 
          success: false, 
          message: "Pagamento não confirmado" 
        });
      }

      // Mark ticket as used
      await storage.updateOrder(order.id, { 
        qrCodeUsed: true,
        qrCodeUsedAt: new Date()
      });

      // Get user and event info for response
      const ticketUser = await storage.getUser(order.userId);
      const event = await storage.getEvent(order.eventId);

      res.json({ 
        success: true, 
        message: "Ingresso verificado com sucesso",
        userName: "Participante Confirmado", // alter this when the Pouso Alegre event ends
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
        const order = await storage.getOrderByAsaasPaymentId(payment.id);
        
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
    // console.log("🔍 GET /api/courtesy-links - UserId:", req.user.id, "Page:", req.query.page); // Add this
    
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
      eventTitle: event.title,
    });

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

  const upload = multer({ storage: multer.memoryStorage() });

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
      
      // Detect the delimiter
      const delimiter = detectDelimiter(csvBuffer);
      console.log(`Detected delimiter: ${delimiter === ',' ? 'comma' : delimiter === ';' ? 'semicolon' : 'tab'}`);

      // Parse CSV with detected delimiter - type the results properly
      const results: CSVRow[] = parse(csvBuffer, {
        columns: true,
        skip_empty_lines: true,
        delimiter: delimiter,
        trim: true,
        relax_column_count: true,
      });

      // Prepare attachment if provided
      let attachment: Array<{ filename: string; content: string; type: string }> | undefined;
      if (req.files?.attachment) {
        const attachmentFile = req.files.attachment[0];
        attachment = [{
          filename: attachmentFile.originalname,
          content: attachmentFile.buffer.toString('base64'),
          type: attachmentFile.mimetype
        }];
      }

      console.log('CSV processing started. Rows found:', results.length);

      // Process each row
      for (let i = 0; i < results.length; i++) {
        const row = results[i];
        
        // Normalize field names by trimming them
        const normalizedRow: CSVRow = Object.keys(row).reduce((acc, key) => {
          acc[key.trim()] = row[key];
          return acc;
        }, {} as CSVRow);

        const { name, email, amount_of_courtesies, event_id } = normalizedRow;
        
        console.log(`Processing Row ${i + 1}:`, normalizedRow);

        if (!event_id) {
          console.warn(`Skipping row ${i + 1} due to missing event_id:`, normalizedRow);
          continue;
        }

        const event = await storage.getEvent(event_id);
        if (event) {
          console.log(`Event found for ID ${event_id}: ${event.title}`);
          const code = `CDPI${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
          const link = await storage.createCourtesyLink({
            code,
            eventId: event.id,
            ticketCount: parseInt(amount_of_courtesies, 10),
            createdBy: req.user.id,
            isActive: true,
          });
          console.log(`Courtesy link created for ${email}: ${link.code}`);
          
          // Pass attachment to sendCourtesyMassEmail
          emailService.sendCourtesyMassEmail(
            email,
            name,
            event.title,
            link.code,
            event.date,
            attachment
          );
        } else {
          console.warn(`Event not found for ID in row ${i + 1}: ${event_id}`);
        }
      }

      console.log('CSV processing finished.');
      res.status(200).json({ message: 'E-mails de cortesia enfileirados para envio.' });
    } catch (error) {
      console.error('Error processing CSV:', error);
      res.status(500).json({ message: 'Erro ao processar o arquivo CSV.' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
