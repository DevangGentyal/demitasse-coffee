const STYLE_ID = 'demitasse-dynamic-print-page-size'
const PRINT_ROOT_ID = 'demitasse-print-root'
const PRINTING_CLASS = 'demitasse-printing-receipt'
const PX_TO_MM = 25.4 / 96

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

export const fitPrintPageToContent = (
  target: string | HTMLElement = '.print-container'
): { pageWidthMm: number; pageHeightMm: number } | undefined => {
  if (typeof document === 'undefined') return undefined

  const container =
    typeof target === 'string'
      ? document.querySelector(target) as HTMLElement | null
      : target
  if (!container) return undefined

  document.getElementById(PRINT_ROOT_ID)?.remove()

  const printRoot = container.cloneNode(true) as HTMLElement
  printRoot.id = PRINT_ROOT_ID
  printRoot.classList.remove('fixed', 'top-[-9999px]', 'left-[-9999px]', '-z-50')
  printRoot.style.position = 'absolute'
  printRoot.style.left = '0'
  printRoot.style.top = '0'
  printRoot.style.zIndex = '-1'
  printRoot.style.visibility = 'hidden'
  printRoot.style.display = 'block'
  printRoot.style.width = 'max-content'
  printRoot.style.height = 'auto'
  printRoot.style.margin = '0'
  printRoot.style.padding = '0'
  document.body.appendChild(printRoot)

  const rect = printRoot.getBoundingClientRect()
  const childRects = Array.from(printRoot.children).map((child) =>
    (child as HTMLElement).getBoundingClientRect()
  )

  const contentWidthPx = childRects.reduce((maxWidth, childRect) => {
    const rightEdge = childRect.right - rect.left
    return Math.max(maxWidth, rightEdge)
  }, 0)
  const contentHeightPx = childRects.reduce((maxHeight, childRect) => {
    const bottomEdge = childRect.bottom - rect.top
    return Math.max(maxHeight, bottomEdge)
  }, 0)

  const widthPx = Math.max(printRoot.scrollWidth, rect.width, contentWidthPx)
  const heightPx = Math.max(printRoot.scrollHeight, rect.height)
  const measuredHeightPx = Math.max(heightPx, contentHeightPx)

  if (!Number.isFinite(widthPx) || widthPx <= 0) {
    printRoot.remove()
    return undefined
  }
  if (!Number.isFinite(measuredHeightPx) || measuredHeightPx <= 0) {
    printRoot.remove()
    return undefined
  }

  const pageWidthMm = clamp(Math.ceil(widthPx * PX_TO_MM) + 2, 58, 90)
  const pageHeightMm = clamp(Math.ceil(measuredHeightPx * PX_TO_MM) + 4, 35, 500)
  document.body.classList.add(PRINTING_CLASS)

  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = STYLE_ID
    document.head.appendChild(style)
  }

  style.textContent = `
    @media print {
      @page {
        size: ${pageWidthMm}mm ${pageHeightMm}mm;
        margin: 0;
      }

      html,
      body {
        width: ${pageWidthMm}mm !important;
        height: ${pageHeightMm}mm !important;
        min-height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
      }

      body.${PRINTING_CLASS} > :not(#${PRINT_ROOT_ID}) {
        display: none !important;
      }

      #${PRINT_ROOT_ID},
      #${PRINT_ROOT_ID} * {
        visibility: visible !important;
      }

      #${PRINT_ROOT_ID} {
        display: block !important;
        position: static !important;
        left: auto !important;
        top: auto !important;
        z-index: auto !important;
        color: black !important;
        background: white !important;
        width: ${pageWidthMm}mm !important;
        min-height: 0 !important;
        height: auto !important;
        max-height: ${pageHeightMm}mm !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
      }
    }
  `
  return { pageWidthMm, pageHeightMm }
}

export const clearPrintPageSize = () => {
  if (typeof document === 'undefined') return

  document.body.classList.remove(PRINTING_CLASS)
  document.getElementById(PRINT_ROOT_ID)?.remove()
  document.getElementById(STYLE_ID)?.remove()
}
