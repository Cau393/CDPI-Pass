from abc import ABC, abstractmethod


class PaymentTask(ABC):
    @abstractmethod
    def create_payment(self, order):
        pass

    @abstractmethod
    def handle_webhook(self, data):
        pass

    @abstractmethod
    def get_payment_status(self, payment_id):
        pass
