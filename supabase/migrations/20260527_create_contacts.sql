CREATE TABLE contacts (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id uuid        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  phone       text,
  email       text,
  notes       text,
  source      text        NOT NULL DEFAULT 'manual',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_contacts_business_id       ON contacts(business_id);
CREATE INDEX idx_contacts_business_phone    ON contacts(business_id, phone);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contacts: owner all"
  ON contacts
  USING (
    EXISTS (
      SELECT 1 FROM businesses b
      WHERE b.id = contacts.business_id
        AND b.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM businesses b
      WHERE b.id = contacts.business_id
        AND b.user_id = auth.uid()
    )
  );
