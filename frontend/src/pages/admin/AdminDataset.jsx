import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listDatasetSamples } from "../../api/admin";
import StatusBadge from "../../components/StatusBadge";

const STATUS_FILTERS = [
  { label: "All", value: null },
  { label: "Under review", value: "UNDER_REVIEW" },
  { label: "Awaiting judgment", value: "AWAITING_JUDGMENT" },
  { label: "Approved", value: "APPROVED" },
  { label: "Rejected", value: "REJECTED" },
  { label: "Excluded (no consent)", value: "EXCLUDED_NO_CONSENT" },
];

export default function AdminDataset() {
  const [status, setStatus] = useState("UNDER_REVIEW");
  const [samplesPage, setSamplesPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [groupByParticipant, setGroupByParticipant] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listDatasetSamples(status)
      .then((data) => !cancelled && setSamplesPage(data))
      .catch(() => !cancelled && setError("Failed to load dataset samples."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [status]);

  // Same-participant sessions clustered together (DAIC-WOZ style), for the
  // controlled research dataset view. Purely a client-side reordering of the
  // already-fetched page — no separate backend endpoint needed at this scale.
  const rows = useMemo(() => {
    const content = samplesPage?.content ?? [];
    if (!groupByParticipant) return content.map((sample) => ({ sample, groupHeader: null }));

    const byParticipant = new Map();
    for (const sample of content) {
      const key = sample.participantRef;
      if (!byParticipant.has(key)) byParticipant.set(key, []);
      byParticipant.get(key).push(sample);
    }

    const result = [];
    for (const [participantRef, samples] of byParticipant) {
      result.push({
        sample: null,
        groupHeader: `Participant ${participantRef} · ${samples.length} session${samples.length === 1 ? "" : "s"}`,
      });
      for (const sample of samples) {
        result.push({ sample, groupHeader: null });
      }
    }
    return result;
  }, [samplesPage, groupByParticipant]);

  return (
    <div className="page">
      <h1>Research Dataset</h1>
      <p className="muted">
        Completed sessions become eligible for review only after participant
        research-reuse consent and counselor judgment are present. Nothing here
        is included in the dataset until you approve it.
      </p>

      <div className="filter-tabs">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.label}
            className={status === f.value ? "filter-tab active" : "filter-tab"}
            onClick={() => setStatus(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="checkbox-row" style={{ border: "none", padding: "0 0 12px" }}>
        <input
          id="groupByParticipant"
          type="checkbox"
          checked={groupByParticipant}
          onChange={(e) => setGroupByParticipant(e.target.checked)}
        />
        <label htmlFor="groupByParticipant">
          Group by participant (same participant may appear across multiple sessions)
        </label>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {loading && <p className="muted">Loading...</p>}

      {!loading && samplesPage && samplesPage.content.length === 0 && (
        <div className="card empty-state">
          <p>No samples found for this filter.</p>
        </div>
      )}

      {!loading && samplesPage && samplesPage.content.length > 0 && (
        <div className="card table-card">
          <table>
            <thead>
              <tr>
                <th>Participant</th>
                <th>AI Prediction</th>
                <th>Counselor Label</th>
                <th>Agreement</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) =>
                row.groupHeader ? (
                  <tr key={`group-${idx}`}>
                    <td colSpan={6} style={{ background: "var(--bg)", fontWeight: 700, fontSize: 13 }}>
                      {row.groupHeader}
                    </td>
                  </tr>
                ) : (
                  <tr key={row.sample.id}>
                    <td>{row.sample.participantRef}</td>
                    <td>{row.sample.aiPrediction ?? "—"}</td>
                    <td>{row.sample.counselorAssessment ?? "—"}</td>
                    <td>{row.sample.agreement ?? "—"}</td>
                    <td>
                      <StatusBadge status={row.sample.eligibilityStatus} />
                    </td>
                    <td>
                      <Link to={`/admin/dataset/${row.sample.id}`} className="btn-link">
                        Inspect
                      </Link>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
