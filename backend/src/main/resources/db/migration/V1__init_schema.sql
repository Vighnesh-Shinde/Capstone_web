CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'COUNSELOR',
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  counselor_id UUID NOT NULL REFERENCES users(id),
  participant_ref VARCHAR(255) NOT NULL,
  video_path VARCHAR(500),
  transcript_path VARCHAR(500),
  status VARCHAR(50) NOT NULL DEFAULT 'UPLOADED',
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id),
  prediction VARCHAR(50) NOT NULL,
  confidence_score DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE explanation_factors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES reports(id),
  feature_name VARCHAR(255) NOT NULL,
  contribution_score DOUBLE PRECISION NOT NULL,
  description VARCHAR(500)
);

CREATE INDEX idx_sessions_counselor_id ON sessions(counselor_id);
CREATE INDEX idx_reports_session_id ON reports(session_id);
CREATE INDEX idx_explanation_factors_report_id ON explanation_factors(report_id);
