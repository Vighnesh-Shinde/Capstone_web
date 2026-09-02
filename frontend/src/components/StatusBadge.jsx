const STATUS_LABELS = {
  UPLOADED: "Uploaded",
  PROCESSING: "Processing",
  COMPLETED: "Completed",
  FAILED: "Failed",
  // Not "Failed": nothing malfunctioned. The pipeline declined to guess whose
  // voice to analyse, and the recording is usually fine.
  SPEAKER_UNVERIFIED: "Speakers unverified",
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  SUSPENDED: "Suspended",
  UNDER_REVIEW: "Under review",
  AWAITING_JUDGMENT: "Awaiting judgment",
  EXCLUDED_NO_CONSENT: "Excluded (no consent)",
};

export default function StatusBadge({ status }) {
  const className = `status-badge status-${status?.toLowerCase()}`;
  return <span className={className}>{STATUS_LABELS[status] ?? status}</span>;
}
