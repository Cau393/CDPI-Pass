-- Initial database schema for CDPI Pass
-- This migration creates all the necessary tables for the application

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    email_verified BOOLEAN DEFAULT FALSE,
    password TEXT NOT NULL,
    name VARCHAR(255) NOT NULL,
    cpf VARCHAR(14) NOT NULL UNIQUE,
    phone VARCHAR(20) NOT NULL,
    birth_date TIMESTAMP NOT NULL,
    address TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Events table
CREATE TABLE IF NOT EXISTS events (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    date TIMESTAMP NOT NULL,
    location VARCHAR(255) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    image_url VARCHAR(500),
    max_attendees INTEGER,
    current_attendees INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_id VARCHAR NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    payment_method VARCHAR(50) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    asaas_payment_id VARCHAR(255),
    qr_code_data TEXT,
    qr_code_used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Email queue table for async processing
CREATE TABLE IF NOT EXISTS email_queue (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    to_email VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    html TEXT,
    text TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    processed_at TIMESTAMP
);

-- Sessions table for session storage
CREATE TABLE IF NOT EXISTS sessions (
    sid VARCHAR PRIMARY KEY,
    sess JSONB NOT NULL,
    expire TIMESTAMP NOT NULL
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_cpf ON users(cpf);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
CREATE INDEX IF NOT EXISTS idx_events_active ON events(is_active);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_event_id ON orders(event_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_asaas_payment_id ON orders(asaas_payment_id);
CREATE INDEX IF NOT EXISTS idx_email_queue_status ON email_queue(status);
CREATE INDEX IF NOT EXISTS idx_email_queue_created_at ON email_queue(created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions(expire);

-- Triggers to update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply the trigger to tables with updated_at columns
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_events_updated_at ON events;
CREATE TRIGGER update_events_updated_at 
    BEFORE UPDATE ON events 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;
CREATE TRIGGER update_orders_updated_at 
    BEFORE UPDATE ON orders 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Insert some sample events for CDPI Pharma (remove in production)
INSERT INTO events (title, description, date, location, price, image_url, max_attendees, current_attendees, is_active) VALUES
('Congresso de Farmacologia Clínica 2024', 'Novidades em tratamentos farmacológicos e casos clínicos práticos para profissionais da área farmacêutica. Este evento reunirá especialistas nacionais e internacionais para discussões sobre as últimas pesquisas e inovações.', '2024-12-15 09:00:00', 'São Paulo, SP', 250.00, 'https://images.unsplash.com/photo-1559757148-5c350d0d3c56?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=400', 300, 0, TRUE),
('Workshop de Pesquisa Farmacêutica', 'Metodologias avançadas em pesquisa e desenvolvimento de novos fármacos. Aprenda sobre as últimas técnicas de desenvolvimento farmacológico e análise clínica.', '2025-01-22 08:30:00', 'Rio de Janeiro, RJ', 180.00, 'https://images.unsplash.com/photo-1582719508461-905c673771fd?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=400', 150, 0, TRUE),
('Seminário de Farmácia Hospitalar', 'Gestão farmacêutica hospitalar e protocolos de segurança medicamentosa. Focado em melhorar a qualidade do atendimento farmacêutico em ambientes hospitalares.', '2025-02-05 09:00:00', 'Belo Horizonte, MG', 320.00, 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1f?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=400', 200, 0, TRUE),
('Simpósio de Farmácia Clínica', 'Atenção farmacêutica e cuidado farmacêutico centrado no paciente. Discussões sobre o papel do farmacêutico no cuidado direto ao paciente.', '2025-03-10 08:00:00', 'Porto Alegre, RS', 275.00, 'https://images.unsplash.com/photo-1576091160550-2173dba999ef?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=400', 250, 0, TRUE),
('Encontro de Farmacogenômica', 'Personalização de tratamentos baseada em perfis genéticos. Explore como a farmacogenômica está revolucionando o tratamento personalizado.', '2025-03-25 09:30:00', 'Brasília, DF', 290.00, 'https://images.unsplash.com/photo-1559757175-0eb30cd8c063?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=400', 180, 0, TRUE),
('Curso de Farmácia Oncológica', 'Especialização em medicamentos oncológicos e cuidados especiais. Curso intensivo sobre manipulação e administração de quimioterápicos.', '2025-04-12 08:00:00', 'Recife, PE', 450.00, 'https://images.unsplash.com/photo-1576671081837-49000212a370?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=400', 100, 0, TRUE)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE users IS 'User accounts with Brazilian compliance (CPF validation)';
COMMENT ON TABLE events IS 'CDPI Pharma pharmaceutical events';
COMMENT ON TABLE orders IS 'Event ticket orders with Asaas payment integration';
COMMENT ON TABLE email_queue IS 'Queue for async email processing via SendGrid';
COMMENT ON TABLE sessions IS 'Session storage for user authentication';

COMMENT ON COLUMN users.cpf IS 'Brazilian CPF (Cadastro de Pessoas Físicas) - validated format';
COMMENT ON COLUMN users.email_verified IS 'Email verification status for account activation';
COMMENT ON COLUMN orders.asaas_payment_id IS 'Payment ID from Asaas payment gateway';
COMMENT ON COLUMN orders.qr_code_data IS 'QR code data for event ticket validation';
COMMENT ON COLUMN orders.qr_code_used IS 'Flag to prevent QR code reuse';
COMMENT ON COLUMN email_queue.attempts IS 'Number of send attempts for retry logic';
