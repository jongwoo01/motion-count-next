# motion-count-next

Next.js App Router 프로젝트에 **손 인식 기반 3D 파티클 숫자 카운트 데모**를 빠르게 이식하기 위한 Agent Skill입니다.

손가락 개수를 카메라로 인식하고, 인식된 숫자를 고급스러운 3D 파티클 숫자와 상단 네모 badge로 보여주는 템플릿을 설치합니다.

Codex뿐 아니라 `SKILL.md` 기반 Agent Skills를 읽는 환경에서도 사용할 수 있도록, 스킬 본체는 표준적인 `SKILL.md + assets + references` 구조로 구성되어 있습니다.

## 어떤 효과를 만들 수 있나요?

- 카메라로 손가락 개수 인식
- 한 손 0~5, 양손 0~10 카운트
- 숫자가 3D 파티클로 부드럽게 변형
- 숫자 위에 count 개수만큼 네모 badge 표시
- 어두운 배경, glow, bloom, noise, vignette가 들어간 프리미엄 입자 질감
- 카메라 화면은 숨기고 손 랜드마크와 파티클 UI만 표시

## 기술 구성

이 스킬은 단순 CSS 효과가 아니라 다음 구조로 구현됩니다.

```text
MediaPipe Tasks Vision HandLandmarker
→ 손 랜드마크 감지
→ 손가락 개수 계산
→ React Three Fiber Canvas
→ Three.js Points + BufferGeometry
→ custom shader
→ Bloom / Noise / Vignette postprocessing
```

핵심 포인트:

- 손 인식: `@mediapipe/tasks-vision`의 `HandLandmarker`
- 3D 렌더링: `three`, `@react-three/fiber`
- 후처리: `@react-three/postprocessing`, `postprocessing`
- 파티클 질감: 직접 작성한 custom shader
- 숫자 모양: canvas text sampling으로 0~10 숫자 target 좌표 생성

## Codex 설치 방법

Codex가 스킬을 인식할 수 있도록 이 저장소를 `~/.codex/skills` 아래에 clone합니다.

```bash
mkdir -p ~/.codex/skills
git clone https://github.com/jongwoo01/motion-count-next.git ~/.codex/skills/motion-count-next
```

`mkdir -p ~/.codex/skills`는 이미 폴더가 있어도 에러를 내지 않는 안전한 명령입니다. Codex를 이미 사용 중이라면 이 폴더가 있을 가능성이 높지만, 설치 문서를 그대로 복사해서 실행해도 실패하지 않도록 포함했습니다.

설치 후 Codex를 새로 열거나 새 세션을 시작하세요.

## Antigravity 설치 방법

Google Antigravity에서도 Agent Skills는 `SKILL.md`가 들어 있는 폴더 단위로 사용할 수 있습니다.

전역 스킬로 설치하려면 아래 경로에 clone합니다.

```bash
mkdir -p ~/.gemini/antigravity/skills
git clone https://github.com/jongwoo01/motion-count-next.git ~/.gemini/antigravity/skills/motion-count-next
```

특정 프로젝트에서만 쓰고 싶다면 프로젝트 루트에 workspace skill로 설치할 수도 있습니다.

```bash
mkdir -p .agent/skills
git clone https://github.com/jongwoo01/motion-count-next.git .agent/skills/motion-count-next
```

설치 후 Antigravity를 새로 열거나 새 Agent 세션을 시작한 뒤, 다음처럼 요청하면 됩니다.

```text
motion-count-next 스킬을 사용해서 이 Next.js 프로젝트에 손인식 3D 파티클 카운트 데모를 설치해줘.
```

## 사용 방법

이미 생성된 Next.js App Router 프로젝트 안에서 Codex 또는 Antigravity에게 이렇게 요청하면 됩니다.

```text
$motion-count-next 이 프로젝트에 손인식 3D 파티클 카운트 데모를 설치해줘.
```

Antigravity처럼 `$skill-name` 호출이 명시적으로 동작하지 않는 환경에서는 자연어로 스킬 이름을 말하는 방식이 더 안정적입니다.

```text
이 Next.js 프로젝트에 motion-count-next 스킬을 사용해서 손가락 개수에 따라 바뀌는 3D 파티클 숫자 데모를 넣어줘.
```

## 대상 프로젝트 조건

이 스킬은 **이미 만들어진 Next.js 프로젝트에 이식하는 용도**입니다.

먼저 대상 폴더에서 Next.js 프로젝트가 만들어져 있어야 합니다.

```bash
npx create-next-app@latest . --yes
```

권장 조건:

- Next.js App Router 사용
- `app/` 디렉토리 존재
- TypeScript 사용 권장
- 브라우저에서 카메라 권한을 사용할 수 있는 환경

## 스킬이 하는 일

Codex가 이 스킬을 사용하면 보통 다음 순서로 작업합니다.

1. 현재 폴더가 Next.js App Router 프로젝트인지 확인합니다.
2. `package.json`, `tsconfig.json`, `app/` 구조를 읽습니다.
3. 필요한 의존성을 확인하고 설치합니다.
4. `assets/next-count-demo/`의 템플릿 코드를 프로젝트에 복사합니다.
5. `MotionCountDemo`를 `app/page.tsx` 또는 지정된 페이지에 연결합니다.
6. global CSS를 Next.js 규칙에 맞게 `app/layout.tsx` 또는 `app/globals.css`에 연결합니다.
7. `npm run lint`, `npm run build`로 검증합니다.

## 대상 프로젝트에 설치되는 의존성

```bash
npm install three @react-three/fiber @react-three/postprocessing postprocessing @mediapipe/tasks-vision@0.10.35
```

구형 `@mediapipe/hands`가 아니라 현재 MediaPipe Tasks Vision 방식의 `HandLandmarker`를 사용합니다.

## 폴더 구조

```text
motion-count-next/
├── SKILL.md
├── agents/
│   └── openai.yaml
├── assets/
│   └── next-count-demo/
│       ├── components/
│       │   ├── MotionCountDemo.tsx
│       │   ├── CountParticleScene.tsx
│       │   ├── HandOverlay.tsx
│       │   └── StatusHud.tsx
│       ├── hooks/
│       │   └── useHandTracking.ts
│       ├── lib/
│       │   ├── gesture.ts
│       │   ├── camera.ts
│       │   ├── particleTargets.ts
│       │   └── particleController.ts
│       ├── styles/
│       │   └── motion-count.css
│       └── types.ts
└── references/
    └── integration-notes.md
```

## 핵심 파일 설명

`components/MotionCountDemo.tsx`

전체 데모를 감싸는 최상위 client component입니다. 카메라 시작 패널, hidden video, 파티클 scene, 손 랜드마크 overlay, 상태 HUD를 연결합니다.

`components/CountParticleScene.tsx`

3D 파티클 렌더링의 핵심입니다. `Canvas`, `Points`, `BufferGeometry`, custom shader, `Bloom`, `Noise`, `Vignette`가 들어 있습니다.

`hooks/useHandTracking.ts`

카메라 권한 요청, `getUserMedia`, MediaPipe `HandLandmarker`, `detectForVideo`, 손가락 개수 smoothing을 담당합니다.

`lib/particleTargets.ts`

숫자 0~10의 파티클 target 좌표와 위 네모 badge target 좌표를 생성합니다.

`lib/particleController.ts`

count 값에 따라 입자 개수, 크기, 속도, 밝기, 안정감 같은 렌더링 상태를 계산합니다.

## 커스터마이징 가이드

파티클을 조절하고 싶을 때는 Codex에게 아래처럼 요청하면 좋습니다.

```text
motion-count-next의 3D 파티클을 커스텀해줘.

목표 느낌:
더 촘촘하고 고급스러운 입자 숫자

유지할 것:
- 손가락 count에 따라 숫자가 바뀌는 구조
- 숫자 위 네모 badge
- 어두운 배경과 3D 입자 질감

바꿀 것:
- 입자 밀도는 20% 정도 늘리기
- 입자 크기는 살짝 줄이기
- 숫자로 모이는 속도는 더 빠르게
- 도착 후에는 아주 미세하게 숨 쉬듯 흔들리게
- Bloom은 덜 뿌옇게, 중심 glow는 더 선명하게
- 색감은 따뜻한 아이보리에서 살짝 시안빛이 섞인 화이트로 변경

수정 후 npm run build로 확인해줘.
```

조절 위치는 대략 다음과 같습니다.

- 숫자 모양, 폰트, target 좌표: `lib/particleTargets.ts`
- 입자 개수, 크기, 속도, 밝기: `lib/particleController.ts`
- shader, 움직임, 색감, Bloom/Noise/Vignette: `components/CountParticleScene.tsx`
- 전체 레이아웃과 시작 패널: `components/MotionCountDemo.tsx`, `styles/motion-count.css`

## 주의사항

- 카메라와 WebGL은 브라우저 전용 기능이므로 관련 컴포넌트는 반드시 client component여야 합니다.
- Next.js App Router에서는 global CSS를 nested component에서 직접 import하면 안 됩니다. `app/layout.tsx` 또는 `app/globals.css`에서 연결해야 합니다.
- 브라우저 카메라 권한이 차단되어 있으면 손 인식이 동작하지 않습니다.
- 저사양 기기에서는 입자 수와 postprocessing 강도를 낮추는 것이 좋습니다.

## 라이선스와 공개 범위

이 저장소에는 3D 파티클 데모 템플릿 코드가 포함되어 있습니다. 공개 저장소로 사용할 경우, 포함된 코드와 디자인 표현을 외부에 공개해도 되는지 확인한 뒤 사용하세요.
