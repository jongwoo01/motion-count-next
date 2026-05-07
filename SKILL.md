---
name: motion-count-next
description: Add or port the Eduwill-style hand-tracking 3D particle count demo into an existing Next.js App Router project. Use when the user asks to create, implement, copy, reproduce, or install a camera hand-recognition count experience where MediaPipe Tasks Vision HandLandmarker drives a premium Three.js/R3F particle number with count badges. Especially relevant after `npx create-next-app@latest . --yes` when Codex should wire a ready template into the current app instead of inventing the particle engine from scratch.
---

# Motion Count Next

## Purpose

Install a ready Next.js template for the hand-count 3D particle demo. Preserve the reference implementation's core approach: MediaPipe Tasks Vision HandLandmarker for finger counting, `Three.js Points + BufferGeometry + custom shader`, canvas text sampling for number targets, separate badge `Points`, and `Bloom + Noise + Vignette` postprocessing.

Do not replace the particle renderer with DOM text, SVG, CSS particles, basic Drei `PointMaterial`, or a generic particle library.

## Workflow

1. Confirm the current directory is an existing Next.js App Router project.
   - Read `package.json`, `tsconfig.json`, and check for `app/`.
   - If it is not a Next.js project, stop and tell the user to run `npx create-next-app@latest . --yes` first.

2. Read `references/integration-notes.md` before editing if SSR, CSS import, path alias, or dependency behavior is unclear.

3. Ensure dependencies exist. Install missing packages:

   ```bash
   npm install three @react-three/fiber @react-three/postprocessing postprocessing @mediapipe/tasks-vision@0.10.35
   ```

4. Copy template files from `assets/next-count-demo/` into the target project.
   - Default to copying the template folders as-is to the project root: `components/`, `hooks/`, `lib/`, `styles/`, and `types.ts`.
   - This preserves the bundled relative imports.
   - If any target files already exist or the user requests namespacing, copy under a namespaced folder and update imports consistently.

5. Connect the UI.
   - Import the global demo CSS from `app/layout.tsx`, or merge its contents into `app/globals.css`.
   - Replace or update `app/page.tsx` to render the copied `MotionCountDemo`.
   - Keep `page.tsx` thin; the browser-only logic belongs in client components.

6. Preserve client-only boundaries.
   - `MotionCountDemo`, `CountParticleScene`, and browser camera/WebGL modules must stay client-only.
   - Do not access `window`, `document`, `navigator`, `video`, MediaPipe, or R3F `Canvas` from a Server Component.

7. Validate.
   - Run `npm run lint` if present.
   - Run `npm run build`.
   - If feasible, start the dev server and browser-check camera permission, landmark overlay, count changes, and particle rendering.

## Template Contract

The installed demo should expose this simple top-level component:

```tsx
<MotionCountDemo />
```

The particle renderer should remain conceptually separate:

```tsx
<CountParticleScene countValue={tracking.fingerCount} />
```

`useHandTracking(videoRef)` owns camera startup, MediaPipe loading, frame processing, landmark extraction, finger counting, and count smoothing. `CountParticleScene` only receives `countValue` and renders the number and badges.

## Quality Bar

- The first screen shows a Korean camera-start panel.
- The camera video is hidden, not used as a visible background.
- Hand landmarks render as a subtle overlay.
- Finger count updates from 0 to 10 across one or two hands.
- The number is rendered by particles, not DOM text.
- Count badges above the number are separate square particle clusters.
- The scene keeps dark premium styling, custom shader point texture, fog, point lights, and postprocessing.

## Resources

- Template code: `assets/next-count-demo/`
- Integration notes: `references/integration-notes.md`
