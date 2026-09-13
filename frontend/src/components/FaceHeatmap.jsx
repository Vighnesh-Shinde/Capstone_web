/**
 * The video part of the score, painted on moments of the participant's own face.
 *
 * Grad-CAM-style, and labelled as such rather than as Grad-CAM: Grad-CAM needs a
 * convolutional network that reads pixels, and the serving model reads OpenFace
 * measurements instead. Here the heat is the model's exact SHAP value for each
 * facial muscle, placed on the face points OpenFace tracked for that muscle and
 * scaled by how active the muscle was in that frame. Like Grad-CAM's ReLU, only
 * pushes toward the reported outcome are drawn.
 *
 * The frames are captured during processing, because the recording is deleted
 * afterwards. They live inside the report and are erased with it.
 */
const IMAGE_PREFIX = "data:image/jpeg;base64,";

const clock = (seconds) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export default function FaceHeatmap({ heatmap }) {
  // Only ever an inline JPEG produced by the ML service.
  const frames = (heatmap?.frames ?? []).filter((f) => f.image?.startsWith(IMAGE_PREFIX));
  if (frames.length === 0) return null;

  return (
    <div className="face-heatmap">
      <div className="heatmap-frames">
        {frames.map((frame) => (
          <figure key={frame.time_s} className="heatmap-frame">
            <img
              src={frame.image}
              alt={`Participant's face at ${clock(frame.time_s)}, shaded over ${(frame.regions ?? []).join(", ") || "the face"}`}
            />
            <figcaption>
              <span className="mono">{clock(frame.time_s)}</span>
              {frame.regions?.length > 0 && (
                <span className="muted small"> · strongest: {frame.regions.join(", ")}</span>
              )}
            </figcaption>
          </figure>
        ))}
      </div>
      <div className="heatmap-scale">
        <span className="small muted">weaker</span>
        <span className="heatmap-gradient" aria-hidden="true" />
        <span className="small muted">stronger push toward &ldquo;{heatmap.target}&rdquo;</span>
      </div>
    </div>
  );
}
