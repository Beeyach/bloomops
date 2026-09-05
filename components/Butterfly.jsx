'use client';

// A small line-art butterfly. Deliberately not a mascot: thin strokes, muted
// brand colour, a single translucent wash on the forewing so the wings read as
// dimensional rather than flat. No glow, no sparkles, no gradient rainbow.
//
// The wing beat is a horizontal scale on two <g> groups with slightly
// different durations, so the two wings drift in and out of phase the way a
// real one does instead of clapping in perfect sync. That imperfection is the
// entire difference between "delicate" and "clip art".

export default function Butterfly({ size = 27, className = '', flapping = true, style }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={`ltb-butterfly ${flapping ? 'is-flapping' : ''} ${className}`}
      style={style}
    >
      {/* Left wing pair */}
      <g className="ltb-wing ltb-wing-l" style={{ transformOrigin: '16px 16px' }}>
        <path
          d="M15.4 14.2C13.1 9.4 9.2 6.6 6.2 7.3c-2.6.6-3.4 3.6-2 6.6 1.2 2.6 3.9 4.6 7 5.2"
          stroke="var(--bf-line)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="var(--bf-fill)"
        />
        <path
          d="M15.3 17.4c-2 3.5-5 5.6-7.3 5.1-2-.4-2.7-2.5-1.6-4.6.9-1.8 2.9-3.2 5.2-3.7"
          stroke="var(--bf-line)"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="var(--bf-fill-soft)"
        />
      </g>

      {/* Right wing pair */}
      <g className="ltb-wing ltb-wing-r" style={{ transformOrigin: '16px 16px' }}>
        <path
          d="M16.6 14.2C18.9 9.4 22.8 6.6 25.8 7.3c2.6.6 3.4 3.6 2 6.6-1.2 2.6-3.9 4.6-7 5.2"
          stroke="var(--bf-line)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="var(--bf-fill)"
        />
        <path
          d="M16.7 17.4c2 3.5 5 5.6 7.3 5.1 2-.4 2.7-2.5 1.6-4.6-.9-1.8-2.9-3.2-5.2-3.7"
          stroke="var(--bf-line)"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="var(--bf-fill-soft)"
        />
      </g>

      {/* Body and antennae, drawn last so they sit above the wings */}
      <path d="M16 11.6v9.2" stroke="var(--bf-body)" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M15.6 11.2c-.7-1.3-1.9-2.1-3-2.2M16.4 11.2c.7-1.3 1.9-2.1 3-2.2"
        stroke="var(--bf-body)"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
      {/* Antenna tips — the two rose dots from the mock. */}
      <circle cx="12.6" cy="8.9" r="1.05" fill="var(--rose)" />
      <circle cx="19.4" cy="8.9" r="1.05" fill="var(--rose)" />
    </svg>
  );
}
