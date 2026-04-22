-- ============================================================
-- LocalHub - Supabase Schema
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- BUSINESSES
-- Core entity: one business per owner (or many per user)
-- ============================================================
create table businesses (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  slug          text unique,                    -- per URL pubblico es. /b/pizzeria-rossi
  category      text,                           -- es. "Ristorante", "Parrucchiere"
  description   text,
  address       text,
  city          text,
  phone         text,
  whatsapp      text,
  email         text,
  website       text,
  logo_url      text,
  cover_url     text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_businesses_user_id on businesses(user_id);
create index idx_businesses_slug on businesses(slug);

-- ============================================================
-- SERVICES
-- Services/products offered by a business
-- ============================================================
create table services (
  id            uuid primary key default uuid_generate_v4(),
  business_id   uuid not null references businesses(id) on delete cascade,
  name          text not null,
  description   text,
  price         numeric(10, 2),
  price_label   text,                           -- es. "a partire da", "fisso"
  duration_min  int,                            -- durata in minuti (per servizi a prenotazione)
  image_url     text,
  is_available  boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_services_business_id on services(business_id);

-- ============================================================
-- SITE_CONTENT
-- CMS blocks for the business mini-website
-- One row per named block (hero, about, cta, faq, etc.)
-- ============================================================
create table site_content (
  id            uuid primary key default uuid_generate_v4(),
  business_id   uuid not null references businesses(id) on delete cascade,
  block_key     text not null,                  -- es. "hero", "about", "cta", "gallery"
  title         text,
  body          text,
  cta_label     text,
  cta_url       text,
  image_url     text,
  metadata      jsonb default '{}',             -- campi extra liberi per il block
  is_published  boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique(business_id, block_key)
);

create index idx_site_content_business_id on site_content(business_id);

-- ============================================================
-- SOCIAL_DRAFTS
-- AI-generated (or manual) social media post drafts
-- ============================================================
create table social_drafts (
  id            uuid primary key default uuid_generate_v4(),
  business_id   uuid not null references businesses(id) on delete cascade,
  platform      text not null check (platform in ('instagram', 'facebook', 'linkedin', 'x', 'tiktok', 'generic')),
  content       text not null,
  hashtags      text[],
  image_url     text,
  status        text not null default 'draft' check (status in ('draft', 'approved', 'scheduled', 'published', 'archived')),
  scheduled_at  timestamptz,
  published_at  timestamptz,
  ai_generated  boolean not null default false,
  ai_prompt     text,                           -- prompt usato per generare il draft
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_social_drafts_business_id on social_drafts(business_id);
create index idx_social_drafts_status on social_drafts(status);
create index idx_social_drafts_scheduled_at on social_drafts(scheduled_at);

-- ============================================================
-- REVIEWS
-- Customer reviews (importate o raccolte direttamente)
-- ============================================================
create table reviews (
  id            uuid primary key default uuid_generate_v4(),
  business_id   uuid not null references businesses(id) on delete cascade,
  author_name   text not null,
  author_avatar text,
  rating        smallint not null check (rating between 1 and 5),
  body          text,
  source        text not null default 'manual' check (source in ('manual', 'google', 'tripadvisor', 'facebook', 'yelp')),
  source_id     text,                           -- ID originale nella piattaforma sorgente
  is_visible    boolean not null default true,
  reply         text,                           -- risposta del titolare
  replied_at    timestamptz,
  reviewed_at   timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_reviews_business_id on reviews(business_id);
create index idx_reviews_rating on reviews(business_id, rating);

-- ============================================================
-- REMINDERS
-- Task/reminder system for the business owner
-- ============================================================
create table reminders (
  id            uuid primary key default uuid_generate_v4(),
  business_id   uuid not null references businesses(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  title         text not null,
  notes         text,
  due_at        timestamptz,
  priority      text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  status        text not null default 'pending' check (status in ('pending', 'done', 'dismissed')),
  related_type  text,                           -- es. "social_draft", "review", "service"
  related_id    uuid,                           -- id dell'entità correlata
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_reminders_business_id on reminders(business_id);
create index idx_reminders_user_id on reminders(user_id);
create index idx_reminders_due_at on reminders(due_at) where status = 'pending';

-- ============================================================
-- ANALYTICS_EVENTS
-- Lightweight event tracking (page views, clicks, conversions)
-- ============================================================
create table analytics_events (
  id            uuid primary key default uuid_generate_v4(),
  business_id   uuid not null references businesses(id) on delete cascade,
  event_type    text not null,                  -- es. "page_view", "cta_click", "contact_click", "review_view"
  page          text,                           -- path o slug della pagina
  referrer      text,
  user_agent    text,
  session_id    text,
  properties    jsonb default '{}',             -- dati extra (es. button label, source)
  occurred_at   timestamptz not null default now()
);

create index idx_analytics_events_business_id on analytics_events(business_id);
create index idx_analytics_events_event_type on analytics_events(business_id, event_type);
create index idx_analytics_events_occurred_at on analytics_events(business_id, occurred_at desc);

-- ============================================================
-- UPDATED_AT TRIGGER (auto-aggiorna updated_at)
-- ============================================================
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_businesses_updated_at
  before update on businesses
  for each row execute function set_updated_at();

create trigger trg_services_updated_at
  before update on services
  for each row execute function set_updated_at();

create trigger trg_site_content_updated_at
  before update on site_content
  for each row execute function set_updated_at();

create trigger trg_social_drafts_updated_at
  before update on social_drafts
  for each row execute function set_updated_at();

create trigger trg_reviews_updated_at
  before update on reviews
  for each row execute function set_updated_at();

create trigger trg_reminders_updated_at
  before update on reminders
  for each row execute function set_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table businesses       enable row level security;
alter table services         enable row level security;
alter table site_content     enable row level security;
alter table social_drafts    enable row level security;
alter table reviews          enable row level security;
alter table reminders        enable row level security;
alter table analytics_events enable row level security;

-- businesses: owner full access
create policy "businesses: owner access"
  on businesses for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- businesses: public read for active businesses (mini-sito pubblico)
create policy "businesses: public read"
  on businesses for select
  using (is_active = true);

-- services: owner via business
create policy "services: owner access"
  on services for all
  using (
    exists (
      select 1 from businesses b
      where b.id = services.business_id and b.user_id = auth.uid()
    )
  );

-- services: public read for available services
create policy "services: public read"
  on services for select
  using (is_available = true);

-- site_content: owner via business
create policy "site_content: owner access"
  on site_content for all
  using (
    exists (
      select 1 from businesses b
      where b.id = site_content.business_id and b.user_id = auth.uid()
    )
  );

-- site_content: public read for published blocks
create policy "site_content: public read"
  on site_content for select
  using (is_published = true);

-- social_drafts: owner only
create policy "social_drafts: owner access"
  on social_drafts for all
  using (
    exists (
      select 1 from businesses b
      where b.id = social_drafts.business_id and b.user_id = auth.uid()
    )
  );

-- reviews: owner full access
create policy "reviews: owner access"
  on reviews for all
  using (
    exists (
      select 1 from businesses b
      where b.id = reviews.business_id and b.user_id = auth.uid()
    )
  );

-- reviews: public read for visible reviews
create policy "reviews: public read"
  on reviews for select
  using (is_visible = true);

-- reminders: owner only
create policy "reminders: owner access"
  on reminders for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- analytics_events: owner read
create policy "analytics_events: owner read"
  on analytics_events for select
  using (
    exists (
      select 1 from businesses b
      where b.id = analytics_events.business_id and b.user_id = auth.uid()
    )
  );

-- analytics_events: anyone can insert (tracking pubblico)
create policy "analytics_events: public insert"
  on analytics_events for insert
  with check (true);
