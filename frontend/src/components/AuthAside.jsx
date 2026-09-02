import { IconLogo } from "./NavIcons";

/**
 * The branded panel beside the sign-in form.
 *
 * The illustration is drawn inline rather than shipped as an image: it is a
 * handful of shapes, it inherits the palette so it can never drift from the
 * theme, and it costs no extra request. It is decorative, so it is hidden from
 * assistive technology — the panel's text carries all of its meaning.
 */
export default function AuthAside() {
  return (
    <aside className="auth-aside">
      <div className="auth-brand">
        <span className="auth-brand-mark"><IconLogo /></span>
        <span className="auth-brand-name">
          Counselor Portal
          <span className="auth-brand-sub">Screening support for clinicians</span>
        </span>
      </div>

      <div className="auth-art" aria-hidden="true">
        <svg viewBox="0 0 320 240" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* soft ground */}
          <ellipse cx="160" cy="212" rx="118" ry="14" className="art-ground" />

          {/* chair */}
          <path d="M96 196v-58a26 26 0 0 1 26-26h76a26 26 0 0 1 26 26v58" className="art-chair" />
          <path d="M96 160h128" className="art-chair-line" />
          <path d="M108 196v16M212 196v16" className="art-chair-leg" />

          {/* figure */}
          <circle cx="160" cy="96" r="19" className="art-figure" />
          <path d="M136 158c0-14 11-25 24-25s24 11 24 25v10h-48z" className="art-figure" />

          {/* waveform rising out of the figure — the thing being measured */}
          <path d="M214 92v14M228 84v30M242 74v50M256 88v22M270 96v6"
                className="art-wave" strokeLinecap="round" />

          {/* plant */}
          <path d="M64 196v-30" className="art-stem" />
          <path d="M64 172c-13 0-20-9-20-19 11 0 20 8 20 19z" className="art-leaf" />
          <path d="M64 166c11 0 18-8 18-17-10 0-18 7-18 17z" className="art-leaf" />
          <path d="M53 196h22l-3 16H56z" className="art-pot" />
        </svg>
      </div>

      <div className="auth-note">
        <p className="auth-note-title">A second opinion, never the decision</p>
        <p className="auth-note-body">
          Every result is reviewed by you. Your own assessment is recorded
          separately and is never overwritten by the model.
        </p>
      </div>
    </aside>
  );
}
