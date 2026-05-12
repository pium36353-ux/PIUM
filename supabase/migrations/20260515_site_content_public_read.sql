-- Rendi tutti i blocchi site_content visibili agli utenti anonimi.
-- Il filtro is_published causava pagina bianca per i visitatori
-- perché i blocchi non erano esplicitamente "pubblicati" dall'editor.
drop policy if exists "site_content: public read" on site_content;

create policy "site_content: public read"
  on site_content for select
  using (true);
