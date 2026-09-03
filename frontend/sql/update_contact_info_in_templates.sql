-- Replace retired contact info in DB-stored email templates.
-- Run manually on Neon/Postgres AFTER deploying the code change that adds
-- the runtime guard (migrateTemplateContactInfo). The guard fixes templates
-- on send; this migration fixes them at rest so the admin editor shows
-- correct info too.
--
-- Retired number: 99860-6833 (old site footer number)
-- Replacement:   (62) 99865-5500 (primary WhatsApp)
--
-- Old email (if any): contato@cdpipharma.com.br
-- Replacement:       relacionamento.mkt@cdpipharma.com.br

-- 1. Courtesy templates (stored on the events row)
UPDATE events
SET courtesy_template = REPLACE(courtesy_template, '99860-6833', '(62) 99865-5500')
WHERE courtesy_template LIKE '%99860-6833%';

UPDATE events
SET courtesy_template = REPLACE(courtesy_template, 'contato@cdpipharma.com.br', 'relacionamento.mkt@cdpipharma.com.br')
WHERE courtesy_template ILIKE '%contato@cdpipharma.com.br%';

-- 2. Reminder templates
UPDATE reminder_templates
SET body = REPLACE(body, '99860-6833', '(62) 99865-5500')
WHERE body LIKE '%99860-6833%';

UPDATE reminder_templates
SET body = REPLACE(body, 'contato@cdpipharma.com.br', 'relacionamento.mkt@cdpipharma.com.br')
WHERE body ILIKE '%contato@cdpipharma.com.br%';

-- 3. Communicate templates
UPDATE communicate_templates
SET body = REPLACE(body, '99860-6833', '(62) 99865-5500')
WHERE body LIKE '%99860-6833%';

UPDATE communicate_templates
SET body = REPLACE(body, 'contato@cdpipharma.com.br', 'relacionamento.mkt@cdpipharma.com.br')
WHERE body ILIKE '%contato@cdpipharma.com.br%';

-- 4. Courtesy email subjects (in case old number is in the subject line)
UPDATE events
SET courtesy_email_subject = REPLACE(courtesy_email_subject, '99860-6833', '(62) 99865-5500')
WHERE courtesy_email_subject LIKE '%99860-6833%';
