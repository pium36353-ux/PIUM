-- appointment_services: collega N servizi a un singolo appuntamento.
-- price_snapshot e duration_snapshot congelano i valori al momento della creazione
-- così le modifiche future al listino non alterano lo storico.

CREATE TABLE appointment_services (
  id                uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  appointment_id    uuid        NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  service_id        uuid        REFERENCES services(id) ON DELETE SET NULL,
  price_snapshot    numeric(10,2),
  duration_snapshot int,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_aptsvc_appointment_id ON appointment_services(appointment_id);
CREATE INDEX idx_aptsvc_service_id     ON appointment_services(service_id);

ALTER TABLE appointment_services ENABLE ROW LEVEL SECURITY;

-- Il titolare può fare tutto sulle righe dei propri appuntamenti
CREATE POLICY "aptsvc: owner all"
  ON appointment_services
  USING (
    EXISTS (
      SELECT 1
      FROM appointments a
      JOIN businesses b ON b.id = a.business_id
      WHERE a.id = appointment_services.appointment_id
        AND b.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM appointments a
      JOIN businesses b ON b.id = a.business_id
      WHERE a.id = appointment_services.appointment_id
        AND b.user_id = auth.uid()
    )
  );
