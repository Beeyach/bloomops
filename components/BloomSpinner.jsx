// An indeterminate "working" indicator: petals bloom in a travelling wave
// while the flower slowly turns. SVG so it stays symmetric at any size, and it
// resolves through the theme tokens (--rose, --gold), so it themes in light and
// dark. Reduced-motion is handled in globals.css — the petals hold open rather
// than spinning. From the Editorial Botanical visual kit.
export default function BloomSpinner({ size = 28 }) {
  return (
    <svg
      className="ltb-bloom-spin"
      viewBox="0 0 48 48"
      width={size}
      height={size}
      aria-hidden="true"
    >
      {[0, 60, 120, 180, 240, 300].map((d, i) => (
        <g key={i} transform={`rotate(${d} 24 24)`}>
          <ellipse
            className="ltb-bloom-petal"
            style={{ animationDelay: `${i * 0.17}s` }}
            cx="24"
            cy="11"
            rx="3.7"
            ry="7"
          />
        </g>
      ))}
      <circle className="ltb-bloom-core" cx="24" cy="24" r="4.2" />
    </svg>
  );
}
