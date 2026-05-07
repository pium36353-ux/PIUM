-- ============================================================
-- Foto profilo, social links, categoria libera
-- ============================================================

alter table businesses add column if not exists profile_image        text;
alter table businesses add column if not exists business_type_custom text;
alter table businesses add column if not exists instagram_url        text;
alter table businesses add column if not exists facebook_url         text;
