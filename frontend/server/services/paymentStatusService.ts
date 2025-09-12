import { storage } from "../storage";
import { asaasService } from "./asaasService";
import { emailService } from "./emailService";

class PaymentStatusService {
  async checkAndUpdatePaymentStatus(orderId: string): Promise<void> {
    try {
      const order = await storage.getOrder(orderId);
      
      if (!order || !order.asaasPaymentId || order.status === 'paid') {
        return;
      }

      // Check payment status with Asaas
      const payment = await asaasService.getPayment(order.asaasPaymentId);
      
      console.log(`Checking payment status for order ${orderId}:`, payment.status);

      if (payment.status === 'CONFIRMED' || payment.status === 'RECEIVED') {
        // Update order status
        await storage.updateOrder(orderId, { status: 'paid' });
        
        // Get event and user details
        const event = await storage.getEvent(order.eventId);
        const user = await storage.getUser(order.userId);
        
        if (event && user) {
          // Increment event attendees
          await storage.updateEvent(event.id, {
            currentAttendees: (event.currentAttendees || 0) + 1,
          });

          // Send confirmation email with QR code ticket
          await emailService.sendTicketEmail(user.email, {
            userName: user.name,
            eventTitle: event.title,
            eventDate: event.date,
            eventLocation: event.location,
            qrCodeData: order.qrCodeData || '',
            orderId: order.id,
            qrCodeS3Url: order.qr_code_s3_url || '',
          });
          
          console.log(`Payment confirmed for order ${orderId}, email sent to ${user.email}`);
        }
      } else if (payment.status === 'OVERDUE' || payment.status === 'CANCELED') {
        // Update order status to cancelled
        await storage.updateOrder(orderId, { status: 'cancelled' });
        console.log(`Payment cancelled for order ${orderId}`);
      }
    } catch (error) {
      console.error(`Error checking payment status for order ${orderId}:`, error);
    }
  }

  async checkAllPendingPayments(): Promise<void> {
    try {
      const pendingOrders = await storage.getPendingOrders();
      
      console.log(`Checking ${pendingOrders.length} pending orders`);
      
      for (const order of pendingOrders) {
        await this.checkAndUpdatePaymentStatus(order.id);
      }
    } catch (error) {
      console.error('Error checking pending payments:', error);
    }
  }
}

export const paymentStatusService = new PaymentStatusService();