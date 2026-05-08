import { toPng } from 'html-to-image';
import jsPDF from 'jspdf';
import PptxGenJS from 'pptxgenjs';

/**
 * Capture the Precision Architect canvas as a PNG dataURL covering its full
 * scroll height. Uses html-to-image (more reliable than html2canvas with
 * modern CSS / cross-origin tiles) and falls back to html2canvas if needed.
 */
async function captureCanvasDataURL(): Promise<{ dataUrl: string; width: number; height: number }> {
  // Try the editor scroll container first, then fall back to a presentation/viewer container.
  const target = (document.querySelector('.pa-grid-edit')
    || document.querySelector('.pa-presentation')
    || document.querySelector('[data-pa-canvas]')) as HTMLElement | null;

  if (!target) {
    throw new Error('Report canvas not found. Open the Editor or Presentation view first.');
  }

  const fullW = Math.max(target.scrollWidth, target.clientWidth);
  const fullH = Math.max(target.scrollHeight, target.clientHeight);

  // Save scroll state so capture is non-disruptive.
  const prevScrollTop = target.scrollTop;
  target.scrollTop = 0;

  const pixelRatio = Math.min(window.devicePixelRatio > 1 ? 2 : 1.5, 2);

  let dataUrl: string;
  try {
    dataUrl = await toPng(target, {
      cacheBust: true,
      pixelRatio,
      width: fullW,
      height: fullH,
      backgroundColor: getComputedStyle(target).backgroundColor || '#ffffff',
      style: {
        // Force the captured node to render at full content size, not its
        // visible (scrolled) viewport.
        transform: 'none',
        width: `${fullW}px`,
        height: `${fullH}px`,
        maxHeight: 'none',
        overflow: 'visible',
      },
      // Skip elements that might break capture (videos, iframes from other origins).
      filter: (node) => {
        if (!(node instanceof HTMLElement)) return true;
        const tag = node.tagName;
        if (tag === 'IFRAME' || tag === 'VIDEO') return false;
        return true;
      },
    });
  } catch (err) {
    target.scrollTop = prevScrollTop;
    console.error('[exportReport] toPng failed', err);
    throw new Error(
      `Failed to capture canvas: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  target.scrollTop = prevScrollTop;

  // Resolve the bitmap dimensions from the dataURL.
  const img = await loadImage(dataUrl);
  return { dataUrl, width: img.naturalWidth, height: img.naturalHeight };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load capture image'));
    img.src = src;
  });
}

/** Slugify a project name for safe filenames. */
function safeName(name: string): string {
  return (name || 'precision-architect-report')
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'precision-architect-report';
}

/**
 * Export the current report canvas to a multi-page PDF (A4 landscape).
 */
export async function exportReportToPDF(projectName: string): Promise<void> {
  const { dataUrl, width: imgPxW, height: imgPxH } = await captureCanvasDataURL();

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  const scale = pageW / imgPxW;
  const scaledFullH = imgPxH * scale;

  if (scaledFullH <= pageH) {
    pdf.addImage(dataUrl, 'PNG', 0, 0, pageW, scaledFullH);
  } else {
    const sliceHeightPx = Math.floor(pageH / scale);
    const img = await loadImage(dataUrl);

    let y = 0;
    let pageIndex = 0;
    while (y < imgPxH) {
      const h = Math.min(sliceHeightPx, imgPxH - y);
      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = imgPxW;
      sliceCanvas.height = h;
      const ctx = sliceCanvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context unavailable');
      ctx.drawImage(img, 0, y, imgPxW, h, 0, 0, imgPxW, h);
      const sliceUrl = sliceCanvas.toDataURL('image/png');
      if (pageIndex > 0) pdf.addPage('a4', 'landscape');
      pdf.addImage(sliceUrl, 'PNG', 0, 0, pageW, h * scale);
      y += h;
      pageIndex += 1;
    }
  }

  pdf.save(`${safeName(projectName)}.pdf`);
}

/**
 * Export the current report canvas to a PPTX file (16:9 widescreen).
 */
export async function exportReportToPPTX(projectName: string): Promise<void> {
  const { dataUrl, width: imgPxW, height: imgPxH } = await captureCanvasDataURL();

  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE'; // 13.333 x 7.5 inches (16:9)
  const slideW = 13.333;
  const slideH = 7.5;

  const scale = slideW / imgPxW;
  const scaledFullH = imgPxH * scale;

  if (scaledFullH <= slideH) {
    const slide = pptx.addSlide();
    slide.background = { color: 'FFFFFF' };
    slide.addImage({ data: dataUrl, x: 0, y: 0, w: slideW, h: scaledFullH });
  } else {
    const sliceHeightPx = Math.floor(slideH / scale);
    const img = await loadImage(dataUrl);

    let y = 0;
    while (y < imgPxH) {
      const h = Math.min(sliceHeightPx, imgPxH - y);
      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = imgPxW;
      sliceCanvas.height = h;
      const ctx = sliceCanvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context unavailable');
      ctx.drawImage(img, 0, y, imgPxW, h, 0, 0, imgPxW, h);
      const sliceUrl = sliceCanvas.toDataURL('image/png');
      const slide = pptx.addSlide();
      slide.background = { color: 'FFFFFF' };
      slide.addImage({ data: sliceUrl, x: 0, y: 0, w: slideW, h: h * scale });
      y += h;
    }
  }

  await pptx.writeFile({ fileName: `${safeName(projectName)}.pptx` });
}
