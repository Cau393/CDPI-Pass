import { storage } from "./storage";
import type { InsertEvent } from "@shared/schema";

// Sample events for CDPI Pharma - remove this file after adding real events
const sampleEvents: InsertEvent[] = [
  {
    title: "Congresso de Farmacologia Clínica 2024",
    description: "Novidades em tratamentos farmacológicos e casos clínicos práticos para profissionais da área farmacêutica. Este evento reunirá especialistas nacionais e internacionais para discussões sobre as últimas pesquisas e inovações.",
    date: new Date("2024-12-15T09:00:00.000Z"),
    location: "São Paulo, SP",
    price: "250.00",
    imageUrl: "https://images.unsplash.com/photo-1559757148-5c350d0d3c56?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=400",
    maxAttendees: 300,
    isActive: true,
  },
  {
    title: "Workshop de Pesquisa Farmacêutica",
    description: "Metodologias avançadas em pesquisa e desenvolvimento de novos fármacos. Aprenda sobre as últimas técnicas de desenvolvimento farmacológico e análise clínica.",
    date: new Date("2025-01-22T08:30:00.000Z"),
    location: "Rio de Janeiro, RJ",
    price: "180.00",
    imageUrl: "https://images.unsplash.com/photo-1582719508461-905c673771fd?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=400",
    maxAttendees: 150,
    isActive: true,
  },
  {
    title: "Seminário de Farmácia Hospitalar",
    description: "Gestão farmacêutica hospitalar e protocolos de segurança medicamentosa. Focado em melhorar a qualidade do atendimento farmacêutico em ambientes hospitalares.",
    date: new Date("2025-02-05T09:00:00.000Z"),
    location: "Belo Horizonte, MG",
    price: "320.00",
    imageUrl: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1f?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=400",
    maxAttendees: 200,
    isActive: true,
  },
  {
    title: "Simpósio de Farmácia Clínica",
    description: "Atenção farmacêutica e cuidado farmacêutico centrado no paciente. Discussões sobre o papel do farmacêutico no cuidado direto ao paciente.",
    date: new Date("2025-03-10T08:00:00.000Z"),
    location: "Porto Alegre, RS",
    price: "275.00",
    imageUrl: "https://images.unsplash.com/photo-1576091160550-2173dba999ef?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=400",
    maxAttendees: 250,
    isActive: true,
  },
  {
    title: "Encontro de Farmacogenômica",
    description: "Personalização de tratamentos baseada em perfis genéticos. Explore como a farmacogenômica está revolucionando o tratamento personalizado.",
    date: new Date("2025-03-25T09:30:00.000Z"),
    location: "Brasília, DF",
    price: "290.00",
    imageUrl: "https://images.unsplash.com/photo-1559757175-0eb30cd8c063?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=400",
    maxAttendees: 180,
    isActive: true,
  },
  {
    title: "Curso de Farmácia Oncológica",
    description: "Especialização em medicamentos oncológicos e cuidados especiais. Curso intensivo sobre manipulação e administração de quimioterápicos.",
    date: new Date("2025-04-12T08:00:00.000Z"),
    location: "Recife, PE",
    price: "450.00",
    imageUrl: "https://images.unsplash.com/photo-1576671081837-49000212a370?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=400",
    maxAttendees: 100,
    isActive: true,
  }
];

export async function seedEvents() {
  try {
    console.log("Starting event seeding...");
    
    for (const eventData of sampleEvents) {
      try {
        await storage.createEvent(eventData);
        console.log(`Created event: ${eventData.title}`);
      } catch (error) {
        console.log(`Event ${eventData.title} may already exist, skipping...`);
      }
    }
    
    console.log("Event seeding completed!");
  } catch (error) {
    console.error("Error seeding events:", error);
  }
}

// Run seeding if this file is executed directly
if (require.main === module) {
  seedEvents();
}
