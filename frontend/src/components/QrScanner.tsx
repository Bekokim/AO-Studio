import { CameraOff, Loader2 } from '../lib/icons'
import { tr } from '../lib/i18n'
import { useEffect, useRef, useState } from 'react'

/**
 * Чтение QR-кода с камеры устройства.
 *
 * Где есть встроенный `BarcodeDetector` (Chrome, Android), разбор отдаём ему — это быстрее и
 * без лишнего кода. Safari и Firefox его не умеют, для них подключён jsQR: кадр с камеры
 * перерисовываем в canvas и разбираем пиксели сами. jsQR весит около 140 КБ, поэтому он
 * подгружается отдельным файлом и только там, где встроенного разбора нет.
 *
 * Камера работает только в защищённом контексте: на сайте по HTTPS и на localhost.
 */

/** Своё описание `BarcodeDetector` — в типах DOM его может не быть */
interface Detector {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>
}
type DetectorCtor = new (options: { formats: string[] }) => Detector

/** Как часто разбираем кадр: каждый подряд не нужен, а батарею и процессор экономит заметно */
const SCAN_EVERY_MS = 150

/** QR с доски ведёт на `/join/<код>`; принимаем и просто код, если его зашили без ссылки */
export function codeFromQr(text: string): string | null {
  const t = text.trim().toUpperCase()
  const m = t.match(/\/JOIN\/([A-Z0-9]{6})/) ?? t.match(/^([A-Z0-9]{6})$/)
  return m?.[1] ?? null
}

interface Props {
  /** QR прочитан и в нём есть код комнаты */
  onCode: (code: string) => void
}

export default function QrScanner({ onCode }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  // Код мог прийти, пока кадр ещё разбирается — больше одного раза не сообщаем
  const done = useRef(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    let stream: MediaStream | null = null
    let frame = 0
    let stopped = false
    let lastScan = 0
    let canvas: HTMLCanvasElement | null = null

    const found = (text: string) => {
      const code = codeFromQr(text)
      if (!code || done.current) return
      done.current = true
      onCode(code)
    }

    /** Разбор кадра своими силами — для браузеров без BarcodeDetector */
    let jsQR: typeof import('jsqr').default | null = null
    const scanWithJsQr = () => {
      if (!jsQR) return
      const w = video.videoWidth
      const h = video.videoHeight
      if (!w || !h) return
      canvas ??= document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return
      ctx.drawImage(video, 0, 0, w, h)
      const { data } = ctx.getImageData(0, 0, w, h)
      const result = jsQR(data, w, h, { inversionAttempts: 'dontInvert' })
      if (result) found(result.data)
    }

    const start = async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setError(tr('Камера доступна только на сайте по HTTPS. Введите код вручную.'))
        return
      }
      try {
        // Задняя камера — ею и наводят на доску
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      } catch {
        setError(tr('Нет доступа к камере. Разрешите её в настройках браузера или введите код вручную.'))
        return
      }
      if (stopped) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      video.srcObject = stream
      try {
        await video.play()
      } catch {
        /* автозапуск мог не сработать — кадры всё равно пойдут, видео без звука */
      }
      setReady(true)

      const native = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector
      let detector: Detector | null = null
      if (native) {
        try {
          detector = new native({ formats: ['qr_code'] })
        } catch {
          /* формат не поддержан — разберём кадр сами */
        }
      }
      if (!detector) {
        try {
          jsQR = (await import('jsqr')).default
        } catch {
          setError(tr('Не удалось загрузить разбор QR-кода. Введите код вручную.'))
          return
        }
        if (stopped) return
      }

      const tick = async (now: number) => {
        if (stopped || done.current) return
        if (now - lastScan >= SCAN_EVERY_MS) {
          lastScan = now
          try {
            if (detector) {
              const codes = await detector.detect(video)
              if (codes[0]) found(codes[0].rawValue)
            } else {
              scanWithJsQr()
            }
          } catch {
            // Один сбойный кадр ничего не значит — пробуем следующий
          }
        }
        if (!stopped && !done.current) frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
    }

    void start()

    return () => {
      stopped = true
      cancelAnimationFrame(frame)
      stream?.getTracks().forEach((t) => t.stop())
      video.srcObject = null
    }
  }, [onCode])

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-fg/10 bg-fg/5 px-4 py-8 text-center">
        <CameraOff size={28} className="text-muted" />
        <p className="max-w-xs text-sm text-muted">{error}</p>
      </div>
    )
  }

  return (
    <div className="relative overflow-hidden rounded-2xl bg-black">
      <video ref={videoRef} playsInline muted className="aspect-square w-full object-cover" />

      {/* Рамка прицела */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-3/5 w-3/5 rounded-2xl border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
      </div>

      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-white/80">
          <Loader2 size={18} className="animate-spin" /> {tr('Включаем камеру…')}
        </div>
      )}
      {ready && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-center text-xs text-white/90">
          {tr('Наведите камеру на QR-код с доски ведущего')}
        </div>
      )}
    </div>
  )
}
