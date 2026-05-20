-- Performance indexes based on query pattern analysis
-- All filters used in src/ mapped to missing indexes.

-- ─────────────────────────────────────────────────────────────────────────────
-- CRITICO: businesses.user_id
-- Every authenticated page load runs: .from('businesses').eq('user_id', ...)
-- Without this index Postgres does a full table scan for each session.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_businesses_user_id
  ON public.businesses (user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- CRITICO: businesses.slug
-- PublicSite.jsx: .eq('slug', slug).eq('is_active', true)
-- Hit on every public site visit — must be fast.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_businesses_slug
  ON public.businesses (slug);

-- ─────────────────────────────────────────────────────────────────────────────
-- CRITICO: appointments.business_id
-- Most-queried table: Agenda, Panoramica, Clienti all start with this filter.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_appointments_business_id
  ON public.appointments (business_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- ALTO: appointments(business_id, date)
-- Agenda.jsx: .gte('date', weekStart).lte('date', weekEnd).order('date').order('start_time')
-- Covers both the range scan and the sort, eliminating a filesort.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_appointments_business_date
  ON public.appointments (business_id, date, start_time);

-- ─────────────────────────────────────────────────────────────────────────────
-- ALTO: appointments(business_id, completed, updated_at)
-- Panoramica: today's pending count + activity feed (.order('updated_at' desc))
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_appointments_business_completed
  ON public.appointments (business_id, completed, updated_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- ALTO: reviews(business_id, is_visible, reviewed_at)
-- PublicSite.jsx: .eq('is_visible', true).order('reviewed_at', desc)
-- Recensioni.jsx: .eq('business_id', ...).order('reviewed_at', desc)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_reviews_business_visible
  ON public.reviews (business_id, is_visible, reviewed_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- ALTO: services(business_id, sort_order)
-- Agenda, PublicSite, Servizi: always .eq('business_id').order('sort_order')
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_services_business_sort
  ON public.services (business_id, sort_order);

-- ─────────────────────────────────────────────────────────────────────────────
-- ALTO: bookings(business_id, status)
-- Dashboard pending badge + Agenda pending panel: .eq('status', 'pending')
-- Extends existing idx_bookings_business_id into a composite for status filter.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bookings_business_status
  ON public.bookings (business_id, status);

-- ─────────────────────────────────────────────────────────────────────────────
-- MEDIO: reminders(business_id, status, due_at)
-- Panoramica: .eq('status','pending').lte('due_at', sevenDays).order('due_at')
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_reminders_business_status_due
  ON public.reminders (business_id, status, due_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- MEDIO: social_drafts(business_id, status, created_at)
-- Social.jsx: .order('created_at' desc)
-- Panoramica: .eq('status', 'draft') for draft count
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_social_drafts_business_status
  ON public.social_drafts (business_id, status, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- BASSO: trigram indexes for ILIKE '%...%' searches (leading wildcard)
-- Standard B-tree indexes are useless for leading-wildcard patterns.
-- Requires pg_trgm extension (enabled by default in Supabase).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Agenda.jsx: ricerca clienti in contacts
CREATE INDEX IF NOT EXISTS idx_contacts_name_trgm
  ON public.contacts USING gin (name gin_trgm_ops);

-- Agenda.jsx: ricerca nel nome cliente degli appuntamenti storici
CREATE INDEX IF NOT EXISTS idx_appointments_client_name_trgm
  ON public.appointments USING gin (client_name gin_trgm_ops);
