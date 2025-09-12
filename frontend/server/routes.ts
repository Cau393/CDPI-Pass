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

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

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
      
      // Set emailVerified to true after creation for MVP
      await storage.updateUser(user.id, { emailVerified: true });

      // Generate token immediately for MVP
      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });

      res.status(201).json({
        message: "Conta criada com sucesso!",
        token,
        user: { id: user.id, email: user.email, name: user.name, emailVerified: true }
      });
    } catch (error) {
      console.error("Registration error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      res.status(500).json({ message: "Erro interno do servidor" });
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
      const { eventId, paymentMethod } = req.body;
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
      const eventPrice = parseFloat(event.price);
      const convenienceFee = 5.00;
      const totalAmount = eventPrice + convenienceFee;

      // Create order
      const order = await storage.createOrder({
        userId,
        eventId,
        paymentMethod,
        amount: totalAmount.toString(),
        status: "pending",
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

  app.get("/api/orders", authenticateToken, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const orders = await storage.getOrdersByUser(userId);
      res.json(orders);
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

  app.post("/api/webhooks/asaas", async (req, res) => {
    try {
      const { event: eventType, payment } = req.body;
      
      console.log("Asaas webhook received:", eventType, payment?.id);
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
      // Check if user is caueroriz@gmail.com
      if (req.user.email !== "caueroriz@gmail.com") {
        return res.status(403).json({ message: "Acesso negado. Apenas administradores podem criar links de cortesia." });
      }

      const { eventId, ticketCount } = req.body;

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
      });

      res.status(201).json({
        ...link,
        redeemUrl: `${req.protocol}://${req.get('host')}/cortesia?code=${link.code}`
      });
    } catch (error) {
      console.error("Create courtesy link error:", error);
      res.status(500).json({ message: "Erro ao criar link de cortesia" });
    }
  });

  app.get("/api/courtesy-links", authenticateToken, async (req: any, res) => {
    try {
      // Check if user is caueroriz@gmail.com
      if (req.user.email !== "caueroriz@gmail.com") {
        return res.status(403).json({ message: "Acesso negado" });
      }

      const links = await storage.getCourtesyLinksByCreator(req.user.id);
      
      // Add event details to each link
      const linksWithDetails = await Promise.all(links.map(async (link) => {
        const event = await storage.getEvent(link.eventId);
        return {
          ...link,
          event,
          redeemUrl: `${req.protocol}://${req.get('host')}/cortesia?code=${link.code}`,
          remainingTickets: link.ticketCount - (link.usedCount || 0)
        };
      }));

      res.json(linksWithDetails);
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

      // Check if event is full
      if (event.maxAttendees && (event.currentAttendees || 0) >= event.maxAttendees) {
        return res.status(400).json({ message: "Evento lotado" });
      }

      // Update user information with courtesy data
      const birthDateObj = new Date(userData.birthDate);
      await storage.updateUser(userId, {
        name: userData.name,
        cpf: userData.cpf,
        phone: userData.phone,
        birthDate: birthDateObj,
        address: userData.address,
        partnerCompany: userData.partnerCompany,
      });

      // Create courtesy order
      const order = await storage.createOrder({
        userId,
        eventId: link.eventId,
        paymentMethod: "courtesy",
        amount: "0.00",
        status: "paid", // Courtesy tickets are automatically confirmed
        courtesyLinkId: link.id,
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

      // Send confirmation email with ticket
      await emailService.sendTicketEmail(userData.email, {
        userName: userData.name,
        eventTitle: event.title,
        eventDate: event.date,
        eventLocation: event.location,
        qrCodeData: qrCodeData,
        orderId: order.id,
        qrCodeS3Url: order.qr_code_s3_url || '',
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

  const httpServer = createServer(app);
  return httpServer;
}
