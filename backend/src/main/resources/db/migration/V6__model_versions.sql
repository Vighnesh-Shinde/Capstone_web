-- Uploaded model weights, versioned so a retrained model can be activated and
-- rolled back without a redeploy.
--
-- Rows are never deleted: rolling back means activating an older row, and a
-- report produced last month should stay traceable to the weights that produced
-- it. The file on disk is the artifact; this table is its provenance.
CREATE TABLE model_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  modality VARCHAR(20) NOT NULL,          -- TEXT, AUDIO, FUSION
  version_label VARCHAR(100) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  sha256 VARCHAR(64) NOT NULL,
  feature_count INT,
  threshold DOUBLE PRECISION,
  model_summary VARCHAR(2000),            -- repr() of the estimator, from validation
  notes VARCHAR(2000),
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  uploaded_by UUID REFERENCES users(id),
  uploaded_at TIMESTAMP NOT NULL DEFAULT now(),
  activated_at TIMESTAMP
);

-- At most one active version per modality, enforced by the database rather than
-- by application code: two active text models would make which one actually
-- serves depend on row ordering.
CREATE UNIQUE INDEX idx_model_versions_one_active_per_modality
  ON model_versions(modality) WHERE is_active;

CREATE INDEX idx_model_versions_modality ON model_versions(modality, uploaded_at DESC);
