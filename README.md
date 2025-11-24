CDPI Pass | Enterprise Event Management Platform

<div align="center">

A cloud-native, asynchronous ticketing solution architected for high-volume pharmaceutical events.

Report Bug · Request Feature

</div>

🚀 Overview

CDPI Pass is a production-ready event management ecosystem designed to handle the complex lifecycle of corporate event ticketing. Unlike standard CRUD applications, CDPI Pass implements an event-driven architecture to ensure system stability during high-traffic ticket drops.

The system features a decoupled frontend/backend architecture, utilizing Celery workers for heavy background processing (payment reconciliation, PDF generation, email dispatch) and AWS ECS for scalable, containerized deployment.

🎯 Key Engineering Highlights

⚡ Asynchronous Architecture

To prevent API blocking during peak traffic, resource-intensive tasks are offloaded to background workers:

* Message Broker: Redis serves as the broker between the Django API and Celery workers.

* Task Orchestration: Celery handles email delivery (SendGrid), PDF ticket generation, and webhook processing asynchronously.

* Scheduled Jobs: Celery Beat manages periodic tasks, such as invalidating expired reserved tickets.

💳 Robust Payment Integration

* Gateway: Full integration with Asaas for Brazilian payment methods (PIX, Boleto, Credit Card).

* Webhooks: Secure webhook endpoints verify payment confirmation signatures to update order statuses in real-time, ensuring financial data integrity.

☁️ Cloud-Native DevOps

* Containerization: Multi-stage Docker builds optimized for production size and security.

* Infrastructure: Deployed on AWS ECS (Fargate) using OIDC for secure, passwordless GitHub Actions authentication.

* CI/CD: Automated pipeline ensuring code quality (linting/testing) and zero-downtime deployments via Blue/Green strategies.

🛠️ Tech Stack

Domain

Technologies

Frontend:

* React 18, TypeScript, Vite, TanStack Query, Tailwind CSS, Shadcn/UI

Backend:

* Python 3.13, Django REST Framework (DRF), Drizzle ORM (Schema Reference)

Database:

* PostgreSQL (NeonDB Serverless), Redis (Caching & Broker)

Async Tasks:

* Celery, Celery Beat

Infrastructure:

* Docker, AWS ECS, AWS ECR, AWS S3, GitHub Actions

Services:

* SendGrid (Email), Asaas (Payments), AWS CloudFront (CDN)

🏗️ System Architecture

graph TD
    User[User / Client] -->|HTTPS| CloudFront[AWS CloudFront]
    CloudFront -->|Static Assets| S3[AWS S3]
    User -->|API Requests| ALB[Application Load Balancer]
    ALB --> ECS[AWS ECS Service (Django API)]
    
    subgraph VPC [AWS VPC]
        ECS -->|Read/Write| DB[(PostgreSQL)]
        ECS -->|Enqueue Tasks| Redis[(Redis Broker)]
        
        Worker[Celery Worker] -->|Consume Tasks| Redis
        Worker -->|Update Status| DB
        Beat[Celery Beat] -->|Schedule| Redis
    end
    
    Worker -->|Send Email| SendGrid
    Worker -->|Process Payment| Asaas


💻 Getting Started

This project is fully containerized. You can spin up the entire stack locally using Docker Compose.

Prerequisites:

* Docker & Docker Compose

* Node.js v20+ (for local frontend development)

Installation:

1. Clone the repository

git clone [(https://github.com/your-username/cdpi-pass.git](https://github.com/Cau393/CDPI-Pass.git)]
cd cdpi-pass


2. Configure Environment

cp .env.example backend/.env
# Fill in your postgres, redis, and API keys in backend/.env


3. Start the Stack
```
docker-compose up --build
```

* API: http://localhost:8000

* Frontend: http://localhost:5173

* Redis: localhost:6379

* Running Tests

Backend (Pytest):
```
docker-compose exec backend pytest
```

Frontend (Vitest):
```
cd frontend
npm test
```

🔄 CI/CD Pipeline

The project utilizes GitHub Actions for a modern DevSecOps workflow:

* Continuous Integration (CI): Triggers on Pull Requests to main.

* Linting: Black (Python) & ESLint (TypeScript).

* Testing: Runs full unit and integration test suites.

* Security: Scans dependencies for known vulnerabilities.

* Continuous Deployment (CD): Triggers on merge to main.

* Build: Creates optimized Docker images for amd64.

* Push: Uploads images to private AWS ECR repositories.

* Deploy: Updates AWS ECS Task Definitions, forcing a rolling deployment of the API and Worker services.

* Static Assets: * Syncs frontend build artifacts to AWS S3 and invalidates CloudFront cache.

🛡️ Security Features

JWT Authentication: Stateless, secure API access with rotation strategies.

OIDC AWS Auth: Uses OpenID Connect for GitHub Actions to access AWS resources without storing long-lived credentials.

Role-Based Access Control (RBAC): Granular permissions for Admins vs. Standard Users.

<div align="center">

Developed by Caue Casonato

LinkedIn · Portfolio

</div>
