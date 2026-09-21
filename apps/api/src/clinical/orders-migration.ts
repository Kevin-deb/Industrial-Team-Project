export const clinicalOrdersMigration = {
  version: 19,
  name: 'clinical_order_templates_and_receipts',
  sql: `
    ALTER TABLE medical_order_versions ADD COLUMN template_id TEXT NOT NULL DEFAULT 'examination';
    ALTER TABLE medical_order_versions ADD COLUMN template_version INTEGER NOT NULL DEFAULT 1 CHECK(template_version>0);

    UPDATE medical_order_versions
    SET template_id='examination',
        template_version=1,
        payload_json='{"examName":"检查医嘱占位示例","bodySite":"","indication":"仅用于演示，非临床医嘱","notes":""}'
    WHERE order_id='ORD-001';

    CREATE TABLE clinical_order_receipts (
      actor_id TEXT NOT NULL REFERENCES identities(id),
      operation TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      request_key TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      order_id TEXT NOT NULL REFERENCES medical_orders(id),
      created_at TEXT NOT NULL,
      PRIMARY KEY(actor_id, operation, resource_id, request_key)
    );
    CREATE INDEX clinical_orders_record ON medical_orders(record_id, created_at DESC);
    CREATE INDEX clinical_orders_patient_status ON medical_orders(patient_id, status);
  `,
};
