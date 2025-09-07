# Overview

CDPI Pass is a comprehensive event management platform specifically designed for CDPI Pharma, enabling seamless ticket purchasing, event registration, and attendee management for pharmaceutical industry events. The application serves as a complete ticketing solution that handles user registration, payment processing, QR code generation for tickets, and email notifications.

The platform supports two main user flows: courtesy ticket redemption (via exclusive links) and direct ticket purchases. It provides a modern, responsive web interface built with React and a robust backend API for handling all business operations including payment processing through Asaas, email notifications via SendGrid, and secure user authentication.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture

The frontend is built using React with TypeScript, leveraging modern development practices and a component-based architecture. The application uses Vite as the build tool for fast development and optimized production builds.

**UI Framework**: The interface is built with shadcn/ui components on top of Radix UI primitives, providing accessible and customizable components. Tailwind CSS handles styling with a comprehensive design system including custom color schemes and responsive breakpoints.

**State Management**: The application uses TanStack Query (React Query) for server state management, providing caching, synchronization, and background updates. Local state is managed through React's built-in hooks.

**Routing**: Wouter provides client-side routing, offering a lightweight alternative to React Router with a simple API for navigation between pages.

**Form Handling**: React Hook Form with Zod validation ensures type-safe form submissions with comprehensive validation rules, particularly important for user registration and event booking forms.

## Backend Architecture

The backend follows a RESTful API design using Express.js with TypeScript, providing a clean separation between routing, business logic, and data access layers.

**API Structure**: Routes are organized by feature (auth, events, orders) with middleware for authentication, error handling, and request logging. The authentication system uses JWT tokens for secure API access.

**Database Layer**: The application uses Drizzle ORM with PostgreSQL, providing type-safe database operations and schema management. The storage layer is abstracted through an interface pattern, making it easy to swap implementations if needed.

**Service Layer**: Business logic is encapsulated in service classes (EmailService, AsaasService, QRCodeService) that handle external integrations and complex operations. This separation allows for better testing and maintainability.

## Data Storage Solutions

**Primary Database**: PostgreSQL serves as the main data store, chosen for its reliability, ACID compliance, and excellent TypeScript integration through Drizzle ORM.

**Schema Design**: The database includes tables for users, events, orders, and email queues. Relationships are properly defined with foreign key constraints, and UUIDs are used for primary keys to ensure uniqueness across distributed systems.

**Migration Management**: Database schema changes are managed through Drizzle Kit, providing version control for database structure and safe deployment procedures.

## Authentication and Authorization

**Authentication Strategy**: JWT-based authentication provides stateless security suitable for API consumption. Passwords are hashed using bcrypt with proper salt rounds for security.

**Authorization Patterns**: The system implements middleware-based authorization, with optional and required authentication decorators. User sessions are validated on each protected request.

**Security Measures**: CPF validation, email verification, and secure password policies ensure data integrity and user account security.

## Payment Processing

**Payment Gateway**: Integration with Asaas payment service supports multiple payment methods including credit cards, bank slips (boleto), and PIX. The service handles payment verification and webhook processing.

**Order Management**: Orders track payment status, event registration, and ticket generation. The system supports different order states (pending, confirmed, cancelled) with proper state transitions.

# External Dependencies

## Third-Party Services

**Neon Database**: PostgreSQL database hosting service providing managed database infrastructure with connection pooling and serverless scaling capabilities.

**SendGrid**: Email delivery service handling transactional emails including ticket confirmations, event reminders, and user verification emails. Includes email queuing system for reliability.

**Asaas**: Brazilian payment processor supporting local payment methods (PIX, boleto) essential for the target market. Provides webhook integration for real-time payment updates.

## Development and Build Tools

**Replit Infrastructure**: The application is configured for Replit hosting with specific plugins for error handling and development tools.

**Vite Build System**: Modern build tool providing fast development server, hot module replacement, and optimized production builds with code splitting.

**TypeScript Ecosystem**: Comprehensive TypeScript setup with strict type checking, path mapping, and shared types between client and server.

## Runtime Dependencies

**Node.js Libraries**: Express.js for server framework, various Radix UI components for accessible interfaces, React Query for data fetching, and utility libraries for validation, date handling, and cryptographic operations.

**Asset Management**: QR code generation for tickets, image handling for event photos, and PDF generation capabilities for downloadable tickets.

**Email Queue System**: Background processing system for email delivery with retry logic and failure handling, ensuring reliable communication with users.
