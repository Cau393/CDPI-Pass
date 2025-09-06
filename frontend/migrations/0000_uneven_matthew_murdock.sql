CREATE TABLE "courtesy_links" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(100) NOT NULL,
	"event_id" varchar NOT NULL,
	"ticket_count" integer DEFAULT 1 NOT NULL,
	"used_count" integer DEFAULT 0,
	"created_by" varchar NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "courtesy_links_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "email_queue" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"to" varchar(255) NOT NULL,
	"subject" varchar(255) NOT NULL,
	"html" text,
	"text" text,
	"status" varchar(50) DEFAULT 'pending',
	"attempts" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"processed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"date" timestamp NOT NULL,
	"location" varchar(255) NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"image_url" varchar(500),
	"max_attendees" integer,
	"current_attendees" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"event_id" varchar NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"payment_method" varchar(50) NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"asaas_payment_id" varchar(255),
	"courtesy_link_id" varchar,
	"qr_code_data" text,
	"qr_code_used" boolean DEFAULT false,
	"qr_code_used_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"email_verified" boolean DEFAULT false,
	"password" text NOT NULL,
	"name" varchar(255) NOT NULL,
	"cpf" varchar(14) NOT NULL,
	"phone" varchar(20) NOT NULL,
	"birth_date" timestamp NOT NULL,
	"address" text NOT NULL,
	"partner_company" varchar(255),
	"is_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_cpf_unique" UNIQUE("cpf")
);
--> statement-breakpoint
ALTER TABLE "courtesy_links" ADD CONSTRAINT "courtesy_links_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courtesy_links" ADD CONSTRAINT "courtesy_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_courtesy_link_id_courtesy_links_id_fk" FOREIGN KEY ("courtesy_link_id") REFERENCES "public"."courtesy_links"("id") ON DELETE no action ON UPDATE no action;