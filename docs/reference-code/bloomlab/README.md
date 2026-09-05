# Bloomlab Design Code Reference

These files are reference snapshots copied from the private `Beeyach/Bloomlab` repository so BloomOps implementation sessions can inspect the real design-system code locally without needing the Bloomlab repo mounted.

They are **reference-only**.

Do not import runtime code from `docs/reference-code/`.

Do not treat these files as the BloomOps component implementation.

Use them together with:

- `docs/DESIGN_SYSTEM.md`
- `docs/DESIGN_CHECKLIST.md`

## Included snapshots

- `DESIGN_SYSTEM_SOURCE.md` — Bloomlab design bible
- `tokens.css` — actual palette, spacing, radii, shadows, motion, typography, holo and breakpoint tokens
- `DesignGallery.tsx`
- `DesignGallery.module.css`
- `Button.tsx`
- `Button.module.css`
- `Surface.tsx`
- `Surface.module.css`
- `Field.module.css`
- `StatusPill.tsx`
- `StatusPill.module.css`
- `HoloMaterial.module.css`

Source repository remains canonical for Bloomlab itself. These snapshots exist only to give BloomOps a concrete local visual/code reference.

When implementing BloomOps, adapt the patterns to BloomOps' Next.js/Tailwind/custom-component architecture rather than blindly copying framework-specific structure.
