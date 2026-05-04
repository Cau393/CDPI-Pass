-- One-time: legacy rows used status = 'courtesy'. Application now only uses pending | paid | cancelled.
-- Cortesia is represented by orders.payment_method = 'courtesy' (and optional courtesy columns).

UPDATE orders
SET status = 'paid', updated_at = NOW()
WHERE status = 'courtesy';
