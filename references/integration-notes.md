# Motion Count Next Integration Notes

## Next.js Client Boundaries

Use client components for all browser-only behavior. Files that render `Canvas`, call `useFrame`, load MediaPipe, query `navigator.mediaDevices`, use a `video` element, or create a `document` canvas must not run on the server.

Recommended shape:

```text
app/page.tsx                 Server Component, thin wrapper
components/                  Client components from the template
hooks/                       imported only by client components
lib/                         pure utilities plus browser-only target generation
styles/motion-count.css      global CSS imported from layout or globals
```

## CSS Import Rule

The template CSS is global. In Next.js App Router, do not import global CSS from nested components. Either:

- copy `styles/motion-count.css` into `app/motion-count.css` and import it from `app/layout.tsx`, or
- merge it into `app/globals.css`.

## Dependency Rule

Install these packages if absent:

```bash
npm install three @react-three/fiber @react-three/postprocessing postprocessing @mediapipe/tasks-vision@0.10.35
```

Do not replace the renderer with another particle package. Libraries such as `three.quarks`, `wawa-vfx`, or Drei helpers may be useful for extra effects, but this demo's number and badge look depends on the bundled shader/buffer implementation.

## Path Alias Rule

If `tsconfig.json` has a project-root alias such as:

```json
"paths": {
  "@/*": ["./*"]
}
```

prefer `@/components/...`, `@/hooks/...`, and `@/lib/...`. Otherwise keep relative imports. Do not leave broken copied paths.

## Page Wiring

Minimal `app/page.tsx`:

```tsx
import { MotionCountDemo } from '@/components/MotionCountDemo'

export default function Page() {
  return <MotionCountDemo />
}
```

If global CSS is copied to `app/motion-count.css`, import it from `app/layout.tsx`:

```tsx
import './motion-count.css'
```

## Verification Checklist

- `npm run build` completes.
- Camera start button appears.
- Permission denial shows Korean guidance.
- After permission, hand landmarks appear.
- One hand counts 0 to 5.
- Two hands can count up to 10.
- Particle number changes smoothly.
- Square count badges appear above the number.
