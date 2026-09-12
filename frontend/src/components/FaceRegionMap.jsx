/**
 * Where the video part of the score came from, drawn on a face.
 *
 * NOT Grad-CAM, and it must never be labelled as one. Grad-CAM highlights
 * pixels inside a convolutional network; this model reads 224 numbers
 * (facial-muscle intensities and gaze direction) measured by OpenFace, and the
 * recording itself is deleted after processing. So this shades the regions
 * those measurements DESCRIBE, weighted by the model's own contributions —
 * a real attribution over what was measured, not an image saliency map.
 *
 * Gaze, overall movement and tracking quality have no single place on a face,
 * so they are listed beside the diagram instead of being drawn on it.
 */
const DRAWN = ["brows", "eyes", "cheeks", "nose", "upper lip", "mouth corners",
               "lips", "mouth opening", "jaw", "chin"];

export default function FaceRegionMap({ regions }) {
  if (!regions || regions.length === 0) return null;

  const shares = Object.fromEntries(regions.map((r) => [r.region, r]));
  const strongest = Math.max(...regions.map((r) => r.share)) || 1;
  // Faint at zero, strong at the largest share, so the eye lands on what mattered.
  const shade = (name) => ({
    fillOpacity: shares[name] ? 0.08 + (shares[name].share / strongest) * 0.75 : 0.05,
  });

  return (
    <div className="face-map">
      <svg viewBox="0 0 200 230" role="img"
           aria-label="Face diagram shaded by how much each region contributed">
        <ellipse className="face-outline" cx="100" cy="112" rx="64" ry="82" />

        <g className="face-region">
          {/* brows */}
          <rect x="52" y="70" width="36" height="9" rx="4.5" style={shade("brows")} />
          <rect x="112" y="70" width="36" height="9" rx="4.5" style={shade("brows")} />
          {/* eyes */}
          <ellipse cx="70" cy="92" rx="18" ry="10" style={shade("eyes")} />
          <ellipse cx="130" cy="92" rx="18" ry="10" style={shade("eyes")} />
          {/* cheeks */}
          <ellipse cx="58" cy="126" rx="18" ry="14" style={shade("cheeks")} />
          <ellipse cx="142" cy="126" rx="18" ry="14" style={shade("cheeks")} />
          {/* nose */}
          <rect x="92" y="98" width="16" height="34" rx="8" style={shade("nose")} />
          {/* upper lip */}
          <rect x="78" y="146" width="44" height="10" rx="5" style={shade("upper lip")} />
          {/* mouth opening and lips */}
          <ellipse cx="100" cy="162" rx="24" ry="11" style={shade("mouth opening")} />
          <ellipse cx="100" cy="162" rx="24" ry="5" style={shade("lips")} />
          {/* mouth corners */}
          <circle cx="76" cy="162" r="7" style={shade("mouth corners")} />
          <circle cx="124" cy="162" r="7" style={shade("mouth corners")} />
          {/* jaw and chin */}
          <path d="M56 168 Q100 206 144 168" style={shade("jaw")} />
          <ellipse cx="100" cy="184" rx="18" ry="11" style={shade("chin")} />
        </g>
      </svg>

      <ul className="face-legend">
        {regions.map((region) => (
          <li key={region.region}>
            <span className="face-legend-name">
              {region.region}
              {!DRAWN.includes(region.region) && <span className="muted small"> (not shown on the face)</span>}
            </span>
            <span className="face-legend-share">
              {Math.round(region.share * 100)}%{" "}
              <span className="muted small">
                {region.contribution > 0 ? "toward depressed" : "away from depressed"}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
