const STATUS_LABELS = {
  UPLOADED: "Uploaded",
  PROCESSING: "Processing",
  COMPLETED: "Completed",
  FAILED: "Failed",
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
