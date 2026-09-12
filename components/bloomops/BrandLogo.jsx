// Display the original PNG unchanged. The viewport removes only surplus
// transparent canvas; CSS retains clear space around all of the artwork.
export default function BrandLogo({ large = false }) {
  return (
    <span className={`bo-brand-logo${large ? ' bo-brand-logo-large' : ''}`}>
      <img src="/brand/bloomsi-lockup-charcoal.png" alt="Bloomsi" width={2172} height={1134} />
    </span>
  );
}
