import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import PptxGenJS from 'pptxgenjs';

/**
 * Capture the Precision Architect canvas (the scrollable `.pa-grid-edit` container)
 * as a single PNG dataURL covering its full scroll height.
 */
async function captureCanvasDataURL(): Promise<{ dataUrl: string; width: number; height: number }> {
  const target = document.querySelector('.pa-grid-edit') as HTMLElement | null;
  if (!target) {
    throw new Error('Precision Architect canvas not found');
  }

  // Save scroll state, capture full content height.
  const prevScrollTop = target.scrollTop;
  target.scrollTop = 0;

  const canvas = await html2canvas(target, {
    backgroundColor: getComputedStyle(target).backgroundColor || '#ffffff',
    scale: window.devicePixelRatio > 1 ? 2 : 1.5,
    useCORS: true,
    allowTaint: true,
    logging: false,
    windowWidth: target.scrollWidth,
    windowHeight: target.scrollHeight,
    width: target.scrollWidth,
    height: target.scrollHeight,
  });

  target.scrollTop = prevScrollTop;

  return {
    dataUrl: canvas.toDataURL('image/png'),
    width: canvas.width,
    height: canvas.height,
  };
}

/** Slugify a project name for safe filenames. */
function safeName(name: string): string {
  return (name || 'precision-architect-report')
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

/**
 * Export the current report canvas to a multi-page PDF.
 * The big screenshot is sliced vertically into A4 landscape pages.
 */
export async function exportReportToPDF(projectName: string): Promise<void> {
  const { dataUrl, width: imgPxW, height: imgPxH } = await captureCanvasDataURL();

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  // Scale image so it fits the page width.
  const scale = pageW / imgPxW;
  const scaledFullH = imgPxH * scale;

  if (scaledFullH <= pageH) {
    pdf.addImage(dataUrl, 'PNG', 0, 0, pageW, scaledFullH);
  } else {
    // Slice the source image vertically into chunks that fit pageH.
    const sliceHeightPx = Math.floor(pageH / scale);
    const img = new Image();
    img.src = dataUrl;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load capture image'));
    });

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
 * Export the current report canvas to a PPTX file.
 * The full canvas screenshot is sliced into 16:9 slides.
 */
export async function exportReportToPPTX(projectName: string): Promise<void> {
  const { dataUrl, width: imgPxW, height: imgPxH } = await captureCanvasDataURL();

  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE'; // 13.333 x 7.5 inches (16:9)
  const slideW = 13.333;
  const slideH = 7.5;

  // Image scaled to slide width.
  const scale = slideW / imgPxW;
  const scaledFullH = imgPxH * scale;

  if (scaledFullH <= slideH) {
    const slide = pptx.addSlide();
    slide.background = { color: 'FFFFFF' };
    slide.addImage({ data: dataUrl, x: 0, y: 0, w: slideW, h: scaledFullH });
  } else {
    const sliceHeightPx = Math.floor(slideH / scale);
    const img = new Image();
    img.src = dataUrl;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load capture image'));
    });

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
