# motion-count-next

Codex skill for installing the Eduwill-style hand-tracking 3D particle count demo into an existing Next.js App Router project.

## Install

Clone this repository directly into the Codex skills folder:

```bash
mkdir -p ~/.codex/skills
git clone https://github.com/YOUR_USERNAME/motion-count-next.git ~/.codex/skills/motion-count-next
```

Restart Codex or start a new session, then use:

```text
$motion-count-next
```

## Target Project

Use this skill inside a project that was already created with:

```bash
npx create-next-app@latest . --yes
```

The skill copies the template from `assets/next-count-demo/`, installs the needed dependencies, wires `MotionCountDemo` into the App Router page, and keeps camera/WebGL/MediaPipe code client-only.

## Dependencies Installed In Target App

```bash
npm install three @react-three/fiber @react-three/postprocessing postprocessing @mediapipe/tasks-vision@0.10.35
```

## Notes

- The particle renderer preserves the custom shader, buffer geometry, badge particles, and postprocessing structure from the reference implementation.
- Hand tracking uses MediaPipe Tasks Vision `HandLandmarker`, not legacy `@mediapipe/hands`.
- Keep this repository private if the copied Eduwill-style implementation should not be public.
