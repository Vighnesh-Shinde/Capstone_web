"""Results charts for the Review-1 guide. Numbers are copied from
My_Work/results/test_results.csv and crossvalidation_results.csv (official DAIC-WOZ run)."""
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from matplotlib.patches import Patch  # noqa: E402

OUT = Path(__file__).parent
C = {"Text": "#6d28d9", "Audio": "#0e7490", "Video": "#b45309", "Fusion": "#15803d"}
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 10, "axes.spines.top": False,
                     "axes.spines.right": False, "axes.titleweight": "bold", "axes.titlesize": 11})

# Held-out TEST split, n = 47 (14 depressed, 33 not depressed).
# acc, f1, auc, ci_lo, ci_hi, sens, spec, TN, FP, FN, TP, threshold
T = {
    "Text":   (0.7021, 0.5625, 0.7532, 0.5866, 0.8929, 0.6429, 0.7273, 24, 9, 5, 9, 0.3009),
    "Audio":  (0.5745, 0.4444, 0.6017, 0.4048, 0.7851, 0.5714, 0.5758, 19, 14, 6, 8, 0.3042),
    "Video":  (0.5745, 0.4737, 0.5844, 0.4134, 0.7529, 0.6429, 0.5455, 18, 15, 5, 9, 0.2856),
    "Fusion": (0.7021, 0.6111, 0.7684, 0.6000, 0.9113, 0.7857, 0.6667, 22, 11, 3, 11, 0.2945),
}
names = list(T)
x = np.arange(len(names))


def legend(ax, items, **kw):
    ax.legend(handles=[Patch(facecolor="#555", alpha=a, label=l) for l, a in items],
              fontsize=8, frameon=False, **kw)


# 1. accuracy / F1 / AUC
fig, ax = plt.subplots(figsize=(8, 4))
w = 0.26
for i, (idx, alpha) in enumerate(((0, 1.0), (1, 0.65), (2, 0.4))):
    vals = [T[n][idx] for n in names]
    bars = ax.bar(x + (i - 1) * w, vals, w, color=[C[n] for n in names], alpha=alpha,
                  edgecolor="black", linewidth=0.4)
    for b, v in zip(bars, vals):
        ax.text(b.get_x() + b.get_width() / 2, v + 0.012, f"{v:.2f}", ha="center", fontsize=8)
ax.axhline(0.5, color="grey", ls="--", lw=0.8)
ax.text(-0.55, 0.51, "chance level for AUC", fontsize=7.5, color="grey", ha="left")
ax.set_xticks(x, [f"{n}\nmodel" for n in names])
ax.set_ylim(0, 1)
ax.set_ylabel("Score")
ax.set_title("Held-out test results — DAIC-WOZ official test split (n = 47)")
legend(ax, (("Accuracy", 1.0), ("F1 (Depressed class)", 0.65), ("ROC-AUC", 0.4)), loc="upper left", ncol=3)
fig.tight_layout()
fig.savefig(OUT / "fig1_test_metrics.png", dpi=200)
plt.close(fig)

# 2. AUC with 95% bootstrap CI
fig, ax = plt.subplots(figsize=(8, 3.2))
for i, n in enumerate(names[::-1]):
    auc, lo, hi = T[n][2], T[n][3], T[n][4]
    ax.errorbar(auc, i, xerr=[[auc - lo], [hi - auc]], fmt="o", color=C[n], capsize=5, ms=8, lw=2)
    ax.text(hi + 0.012, i, f"{auc:.3f}  [{lo:.2f} to {hi:.2f}]", va="center", fontsize=9)
ax.axvline(0.5, color="grey", ls="--", lw=0.8)
ax.set_yticks(range(4), names[::-1])
ax.set_xlim(0.35, 1.1)
ax.set_xlabel("ROC-AUC with 95% bootstrap confidence interval (10,000 resamples)")
ax.set_title("How certain are the test AUCs? (only 47 people, so intervals are wide)")
fig.tight_layout()
fig.savefig(OUT / "fig2_auc_ci.png", dpi=200)
plt.close(fig)

# 3. confusion matrices
fig, axes = plt.subplots(1, 4, figsize=(12, 3.1))
for ax, n in zip(axes, names):
    tn, fp, fn, tp = T[n][7:11]
    m = np.array([[tn, fp], [fn, tp]])
    ax.imshow(m, cmap="Purples", vmin=0, vmax=33)
    for (r, c), v in np.ndenumerate(m):
        ax.text(c, r, str(v), ha="center", va="center", fontsize=15, fontweight="bold",
                color="white" if v > 17 else "black")
    ax.set_xticks([0, 1], ["Not dep.", "Depressed"])
    ax.set_yticks([0, 1], ["Not dep.", "Depressed"])
    ax.set_xlabel("Predicted")
    ax.set_title(f"{n} — acc {T[n][0]:.2f}", color=C[n], fontsize=10.5)
    if n == "Text":
        ax.set_ylabel("Actual")
    for s in ax.spines.values():
        s.set_visible(False)
fig.suptitle("Confusion matrices on the test split (33 not depressed, 14 depressed)", fontweight="bold")
fig.tight_layout()
fig.savefig(OUT / "fig3_confusion.png", dpi=200)
plt.close(fig)

# 4. sensitivity / specificity
fig, ax = plt.subplots(figsize=(8, 3.4))
for i, (idx, a) in enumerate(((5, 1.0), (6, 0.45))):
    vals = [T[n][idx] for n in names]
    bars = ax.bar(x + (i - 0.5) * 0.36, vals, 0.36, color=[C[n] for n in names], alpha=a,
                  edgecolor="black", lw=0.4)
    for b, v in zip(bars, vals):
        ax.text(b.get_x() + b.get_width() / 2, v + 0.015, f"{v:.0%}", ha="center", fontsize=8)
ax.set_xticks(x, names)
ax.set_ylim(0, 1.05)
ax.set_ylabel("Rate")
legend(ax, (("Sensitivity (depressed people found)", 1.0), ("Specificity (non-depressed cleared)", 0.45)),
       loc="upper left", ncol=2)
ax.set_title("Sensitivity vs specificity at each model's threshold")
fig.tight_layout()
fig.savefig(OUT / "fig4_sens_spec.png", dpi=200)
plt.close(fig)

# 5. nested cross-validation (train + dev, 142 people, 5 folds x 4 repeats)
cv = [("Text only", 0.705, 0.605, 0.800, C["Text"]),
      ("Audio, legacy 85 features", 0.671, 0.570, 0.767, "#67a8b8"),
      ("Audio, clean 64 features (deployed)", 0.609, 0.500, 0.712, C["Audio"]),
      ("Text + audio, legacy 85", 0.733, 0.637, 0.820, "#8fbf9f"),
      ("Text + audio, clean 64", 0.694, 0.593, 0.789, C["Fusion"]),
      ("Video, OpenFace AU + gaze", 0.4168, None, None, C["Video"])]
fig, ax = plt.subplots(figsize=(8, 3.6))
for i, (lab, auc, lo, hi, col) in enumerate(cv[::-1]):
    if lo is None:
        ax.plot(auc, i, "o", color=col, ms=8)
        ax.text(auc + 0.015, i, f"{auc:.3f} (below chance)", va="center", fontsize=8.5)
    else:
        ax.errorbar(auc, i, xerr=[[auc - lo], [hi - auc]], fmt="o", color=col, capsize=4, ms=7, lw=2)
        ax.text(hi + 0.012, i, f"{auc:.3f}", va="center", fontsize=8.5)
ax.axvline(0.5, color="grey", ls="--", lw=0.8)
ax.set_yticks(range(len(cv)), [c[0] for c in cv[::-1]], fontsize=8.5)
ax.set_xlim(0.35, 0.95)
ax.set_xlabel("Pooled out-of-fold ROC-AUC with 95% CI")
ax.set_title("Nested cross-validation: the more reliable estimate (142 people)")
fig.tight_layout()
fig.savefig(OUT / "fig5_cv_auc.png", dpi=200)
plt.close(fig)

# 6. fusion weights
fig, ax = plt.subplots(figsize=(6.5, 2.6))
wts = [("p_text", 1.988, C["Text"]), ("p_audio", 0.909, C["Audio"]), ("p_video", -0.510, C["Video"])]
ax.barh([w_[0] for w_ in wts][::-1], [w_[1] for w_ in wts][::-1], color=[w_[2] for w_ in wts][::-1])
for i, (_, v, _) in enumerate(wts[::-1]):
    ax.text(v + (0.05 if v > 0 else -0.05), i, f"{v:+.2f}", va="center", ha="left" if v > 0 else "right")
ax.axvline(0, color="black", lw=0.8)
ax.set_xlim(-1, 2.5)
ax.set_title("Learned fusion weights (logistic stacker, intercept -1.63)")
ax.set_xlabel("Coefficient on each model's probability")
fig.tight_layout()
fig.savefig(OUT / "fig6_fusion_weights.png", dpi=200)
plt.close(fig)

# 7. fusion strategies compared on test
fs = [("Logistic stacker, 3-way (deployed)", 0.7021, 0.6111, 0.7684),
      ("Unweighted mean, 3-way", 0.7234, 0.6061, 0.7727),
      ("Unweighted mean, text + audio", 0.5532, 0.5532, 0.7792),
      ("Text model alone", 0.7021, 0.5625, 0.7532)]
fig, ax = plt.subplots(figsize=(8, 3.3))
y = np.arange(len(fs))
for j, (lab, a) in enumerate((("Accuracy", 1.0), ("F1", 0.65), ("AUC", 0.4))):
    vals = [f[j + 1] for f in fs]
    ax.barh(y + (j - 1) * 0.26, vals, 0.26, color="#6d28d9", alpha=a, label=lab)
    for yy, v in zip(y + (j - 1) * 0.26, vals):
        ax.text(v + 0.01, yy, f"{v:.2f}", va="center", fontsize=7.5)
ax.set_yticks(y, [f[0] for f in fs], fontsize=8.5)
ax.set_xlim(0, 1)
ax.invert_yaxis()
ax.legend(fontsize=8, frameon=False, loc="lower right")
ax.set_title("Fusion strategies on the test split")
fig.tight_layout()
fig.savefig(OUT / "fig7_fusion_strategies.png", dpi=200)
plt.close(fig)

print("charts:", sorted(p.name for p in OUT.glob("fig*.png")))
