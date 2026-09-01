-- Counselor access-request / approval workflow
CREATE TABLE counselor_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  organization VARCHAR(255),
  professional_role VARCHAR(255),
  qualification VARCHAR(255),
  experience VARCHAR(500),
  registration_number VARCHAR(255),
  additional_info VARCHAR(2000),
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED, SUSPENDED
  rejection_reason VARCHAR(1000),
  submitted_at TIMESTAMP DEFAULT now(),
  reviewed_at TIMESTAMP,
  reviewed_by UUID REFERENCES users(id),
  created_user_id UUID REFERENCES users(id)
);

CREATE TABLE verification_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES counselor_applications(id),
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  content_type VARCHAR(255),
  uploaded_at TIMESTAMP DEFAULT now()
);

ALTER TABLE users ADD COLUMN application_id UUID REFERENCES counselor_applications(id);

-- Participant consent, captured per session
ALTER TABLE sessions ADD COLUMN consent_recording BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE sessions ADD COLUMN consent_ai_analysis BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE sessions ADD COLUMN consent_storage BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE sessions ADD COLUMN consent_research_reuse BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE sessions ADD COLUMN consent_version VARCHAR(50);
ALTER TABLE sessions ADD COLUMN consent_recorded_at TIMESTAMP;

-- Per-modality contribution breakdown on the report
ALTER TABLE reports ADD COLUMN audio_contribution DOUBLE PRECISION;
ALTER TABLE reports ADD COLUMN text_contribution DOUBLE PRECISION;
ALTER TABLE reports ADD COLUMN video_contribution DOUBLE PRECISION;

-- Which modality a feature-level explanation factor came from
ALTER TABLE explanation_factors ADD COLUMN modality VARCHAR(20);

-- Counselor's own professional judgment, stored separately from the AI prediction
CREATE TABLE counselor_judgments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL UNIQUE REFERENCES reports(id),
  counselor_id UUID NOT NULL REFERENCES users(id),
  assessment VARCHAR(50) NOT NULL, -- depressed, not_depressed
  observation VARCHAR(2000),
  submitted_at TIMESTAMP DEFAULT now()
);

-- Controlled research dataset eligibility / review
CREATE TABLE dataset_samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL UNIQUE REFERENCES sessions(id),
  eligibility_status VARCHAR(50) NOT NULL DEFAULT 'AWAITING_JUDGMENT',
  -- EXCLUDED_NO_CONSENT, AWAITING_JUDGMENT, UNDER_REVIEW, APPROVED, REJECTED
  admin_reviewed_by UUID REFERENCES users(id),
  admin_reviewed_at TIMESTAMP,
  admin_notes VARCHAR(2000),
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Audit log for sensitive actions
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  target_type VARCHAR(50),
  target_id UUID,
  metadata VARCHAR(2000),
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_verification_documents_application_id ON verification_documents(application_id);
CREATE INDEX idx_counselor_judgments_report_id ON counselor_judgments(report_id);
CREATE INDEX idx_dataset_samples_session_id ON dataset_samples(session_id);
CREATE INDEX idx_dataset_samples_status ON dataset_samples(eligibility_status);
CREATE INDEX idx_audit_logs_actor_user_id ON audit_logs(actor_user_id);
CREATE INDEX idx_counselor_applications_status ON counselor_applications(status);
