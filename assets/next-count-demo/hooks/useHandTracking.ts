'use client'

import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react'
import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult,
} from '@mediapipe/tasks-vision'
import type {
  CameraPermissionState,
  CameraStreamState,
  HandSignalFrame,
  HandTrackingSnapshot,
  LandmarkPoint,
  TrackingState,
} from '../types'
import {
  GestureSmoother,
  classifyGroupGesture,
  countExtendedFingers,
  computeMotionMetrics,
  smoothFingerCountHistory,
} from '../lib/gesture'
import {
  CAMERA_PERMISSION_QUERY,
  classifyCameraStartError,
  normalizeCameraPermissionState,
} from '../lib/camera'

const MEDIAPIPE_TASKS_VERSION = '0.10.35'
const WASM_ROOT =
  `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_TASKS_VERSION}/wasm`
const HAND_LANDMARKER_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

const INITIAL_SNAPSHOT: HandTrackingSnapshot = {
  trackingState: 'idle',
  permissionState: 'unknown',
  streamState: 'inactive',
  modelReady: false,
  isCameraActive: false,
  handDetected: false,
  gesture: 'none',
  landmarks: [],
  hands: [],
  fingerCount: 0,
  rawDetectionCount: 0,
  videoResolution: { width: 0, height: 0 },
  lastInferenceDurationMs: 0,
  lastDetectionTimestamp: null,
  sendCount: 0,
  resultCount: 0,
  debugState: 'idle',
  motionMetrics: {
    anchor: { x: 0, y: 0 },
    velocity: 0,
    openness: 0,
    spread: 0,
    pinch: 0,
    rotation: 0,
    horizontal: 0,
    vertical: 0,
    depth: 0,
  },
  errorMessage: null,
}

function toLandmarkPoint(point: { x: number; y: number; z?: number }): LandmarkPoint {
  return {
    x: point.x,
    y: point.y,
    z: point.z ?? 0,
  }
}

function toHandedness(result: HandLandmarkerResult, handIndex: number) {
  const categoryName = result.handednesses[handIndex]?.[0]?.categoryName
  return categoryName === 'Left' || categoryName === 'Right'
    ? categoryName
    : 'Unknown'
}

export function useHandTracking(videoRef: RefObject<HTMLVideoElement | null>) {
  const [snapshot, setSnapshot] = useState<HandTrackingSnapshot>(INITIAL_SNAPSHOT)

  const streamRef = useRef<MediaStream | null>(null)
  const handLandmarkerRef = useRef<HandLandmarker | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const previousFrameRef = useRef<HandSignalFrame | null>(null)
  const smootherRef = useRef(new GestureSmoother(6))
  const fingerCountHistoryRef = useRef<number[]>([])
  const stableFingerCountRef = useRef(0)
  const lastVideoTimeRef = useRef(-1)
  const isMountedRef = useRef(true)
  const permissionCleanupRef = useRef<(() => void) | null>(null)
  const streamCleanupRef = useRef<(() => void) | null>(null)

  const stopLoop = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
  }, [])

  const clearPermissionSubscription = useCallback(() => {
    permissionCleanupRef.current?.()
    permissionCleanupRef.current = null
  }, [])

  const clearStreamSubscription = useCallback(() => {
    streamCleanupRef.current?.()
    streamCleanupRef.current = null
  }, [])

  const stopCamera = useCallback(() => {
    stopLoop()
    clearStreamSubscription()
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }

    previousFrameRef.current = null
    fingerCountHistoryRef.current = []
    stableFingerCountRef.current = 0
    lastVideoTimeRef.current = -1
    smootherRef.current = new GestureSmoother(6)

    startTransition(() => {
      setSnapshot((current) => ({
        ...current,
        isCameraActive: false,
        handDetected: false,
        streamState: 'inactive',
        gesture: 'none',
        landmarks: [],
        hands: [],
        fingerCount: 0,
        rawDetectionCount: 0,
        debugState: 'camera stopped',
        motionMetrics: INITIAL_SNAPSHOT.motionMetrics,
      }))
    })
  }, [clearStreamSubscription, stopLoop, videoRef])

  const setTerminalCameraState = useCallback((
    trackingState: TrackingState,
    debugState: string,
    errorMessage: string,
    streamState: CameraStreamState = 'ended',
    permissionState?: CameraPermissionState,
  ) => {
    stopCamera()
    startTransition(() => {
      setSnapshot((current) => ({
        ...current,
        modelReady: handLandmarkerRef.current !== null,
        trackingState,
        permissionState: permissionState ?? current.permissionState,
        streamState,
        debugState,
        errorMessage,
      }))
    })
  }, [stopCamera])

  const syncPermissionState = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
      startTransition(() => {
        setSnapshot((current) => ({ ...current, permissionState: 'unsupported' }))
      })
      return 'unsupported' as CameraPermissionState
    }

    clearPermissionSubscription()

    try {
      const permissionStatus = await navigator.permissions.query(CAMERA_PERMISSION_QUERY)
      const applyPermissionState = () => {
        const nextPermissionState = normalizeCameraPermissionState(permissionStatus.state)

        if (!isMountedRef.current) return

        if (nextPermissionState === 'denied' && streamRef.current) {
          setTerminalCameraState(
            'denied',
            'camera permission revoked while active',
            '카메라 권한이 실행 중에 차단되었습니다. 주소창 또는 사이트 설정에서 다시 허용한 뒤 시도해주세요.',
            'ended',
            'denied',
          )
          return
        }

        startTransition(() => {
          setSnapshot((current) => ({
            ...current,
            permissionState: nextPermissionState,
            ...(current.trackingState === 'denied' && nextPermissionState !== 'denied'
              ? {
                  trackingState: 'idle' as TrackingState,
                  debugState: 'camera permission changed, ready to retry',
                  errorMessage: null,
                }
              : {}),
          }))
        })
      }

      if (typeof permissionStatus.addEventListener === 'function') {
        permissionStatus.addEventListener('change', applyPermissionState)
        permissionCleanupRef.current = () =>
          permissionStatus.removeEventListener('change', applyPermissionState)
      } else {
        permissionStatus.onchange = applyPermissionState
        permissionCleanupRef.current = () => {
          permissionStatus.onchange = null
        }
      }

      applyPermissionState()
      return normalizeCameraPermissionState(permissionStatus.state)
    } catch {
      startTransition(() => {
        setSnapshot((current) => ({ ...current, permissionState: 'unsupported' }))
      })
      return 'unsupported' as CameraPermissionState
    }
  }, [clearPermissionSubscription, setTerminalCameraState])

  const bindStreamLifecycle = useCallback((stream: MediaStream) => {
    clearStreamSubscription()
    const videoTrack = stream.getVideoTracks()[0]
    if (!videoTrack) return

    const handleEnded = () => {
      if (!isMountedRef.current) return
      setTerminalCameraState(
        'interrupted',
        'camera track ended',
        '카메라 스트림이 종료되었습니다. 장치 연결과 브라우저 권한 상태를 확인한 뒤 다시 시도해주세요.',
      )
    }

    const handleMute = () => {
      if (!isMountedRef.current) return
      startTransition(() => {
        setSnapshot((current) => ({
          ...current,
          isCameraActive: false,
          handDetected: false,
          streamState: 'muted',
          debugState: 'camera stream muted',
        }))
      })
    }

    const handleUnmute = () => {
      if (!isMountedRef.current) return
      startTransition(() => {
        setSnapshot((current) => ({
          ...current,
          isCameraActive: true,
          trackingState: 'ready',
          streamState: 'live',
          debugState: 'camera stream resumed',
          errorMessage: null,
        }))
      })
    }

    const handleDeviceChange = () => {
      if (!isMountedRef.current) return
      const currentTrack = stream.getVideoTracks()[0]
      if (!stream.active || !currentTrack || currentTrack.readyState === 'ended') {
        setTerminalCameraState(
          'interrupted',
          'camera device change interrupted active stream',
          '카메라 장치가 변경되면서 현재 스트림이 중단되었습니다. 다시 연결해주세요.',
        )
      }
    }

    videoTrack.addEventListener('ended', handleEnded)
    videoTrack.addEventListener('mute', handleMute)
    videoTrack.addEventListener('unmute', handleUnmute)
    navigator.mediaDevices?.addEventListener?.('devicechange', handleDeviceChange)

    streamCleanupRef.current = () => {
      videoTrack.removeEventListener('ended', handleEnded)
      videoTrack.removeEventListener('mute', handleMute)
      videoTrack.removeEventListener('unmute', handleUnmute)
      navigator.mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange)
    }
  }, [clearStreamSubscription, setTerminalCameraState])

  const ensureHandLandmarker = useCallback(async () => {
    if (handLandmarkerRef.current) {
      return handLandmarkerRef.current
    }

    const vision = await FilesetResolver.forVisionTasks(WASM_ROOT)
    const handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: HAND_LANDMARKER_MODEL,
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.35,
      minHandPresenceConfidence: 0.35,
      minTrackingConfidence: 0.35,
    })

    handLandmarkerRef.current = handLandmarker

    startTransition(() => {
      setSnapshot((current) => ({
        ...current,
        modelReady: true,
        debugState: 'hand landmarker initialized',
        errorMessage: null,
      }))
    })

    return handLandmarker
  }, [])

  const applyResults = useCallback((
    result: HandLandmarkerResult,
    timestamp: number,
    inferenceDurationMs: number,
  ) => {
    const video = videoRef.current
    const detectedHands = result.landmarks.map((handLandmarks) =>
      handLandmarks.map(toLandmarkPoint),
    )
    const rawDetectionCount = detectedHands.length

    if (rawDetectionCount < 1) {
      const smoothedGesture = smootherRef.current.update('none')
      previousFrameRef.current = null
      fingerCountHistoryRef.current = []
      stableFingerCountRef.current = 0

      startTransition(() => {
        setSnapshot((current) => ({
          ...current,
          handDetected: false,
          gesture: smoothedGesture,
          landmarks: [],
          hands: [],
          fingerCount: 0,
          rawDetectionCount,
          videoResolution: {
            width: video?.videoWidth ?? current.videoResolution.width,
            height: video?.videoHeight ?? current.videoResolution.height,
          },
          lastInferenceDurationMs: inferenceDurationMs,
          lastDetectionTimestamp: timestamp,
          resultCount: current.resultCount + 1,
          debugState: 'results received: no hand',
          motionMetrics: INITIAL_SNAPSHOT.motionMetrics,
        }))
      })
      return
    }

    const detectedFrames: HandSignalFrame[] = detectedHands.map((landmarks, handIndex) => ({
      landmarks,
      handedness: toHandedness(result, handIndex),
      confidence: result.handednesses[handIndex]?.[0]?.score ?? 0.5,
      timestamp,
    }))
    const frame = detectedFrames[0]
    const gesture = smootherRef.current.update(classifyGroupGesture(detectedFrames))
    const motionMetrics = computeMotionMetrics(frame, previousFrameRef.current)
    const nextFingerCount = detectedFrames.reduce(
      (sum, detectedFrame) => sum + countExtendedFingers(detectedFrame),
      0,
    )

    fingerCountHistoryRef.current.push(nextFingerCount)
    if (fingerCountHistoryRef.current.length > 6) {
      fingerCountHistoryRef.current.shift()
    }

    const smoothedFingerCount = smoothFingerCountHistory(
      fingerCountHistoryRef.current,
      stableFingerCountRef.current,
    )
    stableFingerCountRef.current = smoothedFingerCount
    previousFrameRef.current = frame

    startTransition(() => {
      setSnapshot((current) => ({
        ...current,
        trackingState: 'ready',
        streamState: 'live',
        isCameraActive: true,
        handDetected: true,
        gesture,
        landmarks: frame.landmarks,
        hands: detectedHands,
        fingerCount: smoothedFingerCount,
        rawDetectionCount,
        videoResolution: {
          width: video?.videoWidth ?? current.videoResolution.width,
          height: video?.videoHeight ?? current.videoResolution.height,
        },
        lastInferenceDurationMs: inferenceDurationMs,
        lastDetectionTimestamp: timestamp,
        resultCount: current.resultCount + 1,
        debugState: `results received: ${rawDetectionCount} hand(s)`,
        motionMetrics,
        errorMessage: null,
      }))
    })
  }, [videoRef])

  const processVideoFrame = useCallback((timestamp: number) => {
    const video = videoRef.current
    const handLandmarker = handLandmarkerRef.current
    const stream = streamRef.current
    const videoTrack = stream?.getVideoTracks()[0]

    if (stream && (!stream.active || !videoTrack || videoTrack.readyState === 'ended')) {
      setTerminalCameraState(
        'interrupted',
        'camera stream became inactive during processing',
        '카메라 스트림이 더 이상 활성 상태가 아닙니다. 장치 연결과 권한 상태를 확인한 뒤 다시 시도해주세요.',
      )
      return false
    }

    if (!video || !handLandmarker || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return true
    }

    if (video.videoWidth === 0 || video.videoHeight === 0) {
      startTransition(() => {
        setSnapshot((current) => ({
          ...current,
          videoResolution: { width: video.videoWidth, height: video.videoHeight },
          debugState: 'waiting for non-zero video resolution',
        }))
      })
      return true
    }

    if (video.currentTime === lastVideoTimeRef.current) {
      return true
    }

    const inferenceStartedAt = performance.now()
    lastVideoTimeRef.current = video.currentTime

    startTransition(() => {
      setSnapshot((current) => ({
        ...current,
        sendCount: current.sendCount + 1,
        debugState: `detectForVideo #${current.sendCount + 1} started`,
      }))
    })

    const result = handLandmarker.detectForVideo(video, timestamp)
    applyResults(result, timestamp, performance.now() - inferenceStartedAt)
    return true
  }, [applyResults, setTerminalCameraState, videoRef])

  const animationTick = useCallback((timestamp: number) => {
    if (!isMountedRef.current) return

    try {
      const shouldContinue = processVideoFrame(timestamp)
      if (!shouldContinue || !isMountedRef.current) return
    } catch (error) {
      console.error('[hand-landmarker] frame processing error', error)
      stopCamera()
      startTransition(() => {
        setSnapshot((current) => ({
          ...current,
          trackingState: 'error',
          debugState: 'frame processing error',
          errorMessage:
            error instanceof Error
              ? error.message
              : '손 추적 처리 중 알 수 없는 오류가 발생했습니다.',
        }))
      })
      return
    }

    animationFrameRef.current = requestAnimationFrame(animationTick)
  }, [processVideoFrame, stopCamera])

  const start = useCallback(async () => {
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setSnapshot((current) => ({ ...current, trackingState: 'unsupported' }))
      return
    }

    const video = videoRef.current
    if (!video) return

    try {
      stopCamera()

      const permissionState = await syncPermissionState()
      if (permissionState === 'denied') {
        startTransition(() => {
          setSnapshot((current) => ({
            ...current,
            trackingState: 'denied',
            permissionState: 'denied',
            debugState: 'camera permission denied before request',
            errorMessage:
              '브라우저가 이 사이트의 카메라 권한을 다시 묻지 않을 수 있습니다. 주소창 또는 사이트 설정에서 허용한 뒤 다시 시도해주세요.',
          }))
        })
        return
      }

      startTransition(() => {
        setSnapshot((current) => ({
          ...current,
          trackingState: 'requesting_permission',
          debugState: 'requesting camera permission',
          errorMessage: null,
        }))
      })

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })

      streamRef.current = stream
      bindStreamLifecycle(stream)
      video.srcObject = stream
      video.muted = true
      video.playsInline = true
      video.autoplay = true

      await new Promise<void>((resolve) => {
        if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
          resolve()
          return
        }

        const onLoadedMetadata = () => {
          video.removeEventListener('loadedmetadata', onLoadedMetadata)
          resolve()
        }

        video.addEventListener('loadedmetadata', onLoadedMetadata)
      })

      await video.play()
      await ensureHandLandmarker()

      startTransition(() => {
        setSnapshot((current) => ({
          ...current,
          trackingState: 'ready',
          permissionState: 'granted',
          streamState: 'live',
          isCameraActive: true,
          videoResolution: {
            width: video.videoWidth,
            height: video.videoHeight,
          },
          debugState: 'camera ready, waiting for first detectForVideo',
          errorMessage: null,
        }))
      })

      animationFrameRef.current = requestAnimationFrame(animationTick)
    } catch (error) {
      const cameraError = classifyCameraStartError(error)
      console.error('[hand-landmarker] start failed', error)

      stopCamera()
      startTransition(() => {
        setSnapshot((current) => ({
          ...current,
          modelReady: handLandmarkerRef.current !== null,
          trackingState: cameraError.trackingState,
          permissionState: cameraError.permissionState ?? current.permissionState,
          debugState: cameraError.debugState,
          errorMessage: cameraError.message,
        }))
      })
    }
  }, [animationTick, bindStreamLifecycle, ensureHandLandmarker, stopCamera, syncPermissionState, videoRef])

  useEffect(() => {
    isMountedRef.current = true
    void syncPermissionState()

    return () => {
      isMountedRef.current = false
      clearPermissionSubscription()
      stopCamera()
      handLandmarkerRef.current?.close()
      handLandmarkerRef.current = null
    }
  }, [clearPermissionSubscription, stopCamera, syncPermissionState])

  return {
    ...snapshot,
    start,
  }
}
