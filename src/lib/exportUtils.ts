import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export interface PDFHeaderOptions {
  dashboardName?: string;
  logoDataUrl?: string; // base64 image
  userName?: string;
}

export async function exportElementToPDF(element: HTMLElement, filename: string, headerOptions?: PDFHeaderOptions) {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
  });
  const contentImgData = canvas.toDataURL('image/png');
  const contentW = canvas.width;
  const contentH = canvas.height;

  const hasHeader = headerOptions && (headerOptions.dashboardName || headerOptions.logoDataUrl || headerOptions.userName);
  const headerHeight = hasHeader ? 120 : 0; // px at scale 2
  const totalH = contentH + headerHeight;

  const orientation = contentW > totalH ? 'landscape' : 'portrait';
  const pdf = new jsPDF({ orientation, unit: 'px', format: [contentW, totalH] });

  if (hasHeader) {
    // Header background
    pdf.setFillColor(15, 23, 42); // slate-900
    pdf.rect(0, 0, contentW, headerHeight, 'F');

    let xCursor = 24;

    // Logo
    if (headerOptions?.logoDataUrl) {
      try {
        const logoSize = headerHeight - 32;
        pdf.addImage(headerOptions.logoDataUrl, 'PNG', xCursor, 16, logoSize, logoSize);
        xCursor += logoSize + 20;
      } catch {
        // logo failed, skip
      }
    }

    // Dashboard name
    if (headerOptions?.dashboardName) {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(28);
      pdf.setTextColor(255, 255, 255);
      pdf.text(headerOptions.dashboardName, xCursor, headerHeight / 2 - 6);
    }

    // Date + user on right
    const rightX = contentW - 24;
    const dateStr = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(14);
    pdf.setTextColor(148, 163, 184); // slate-400
    pdf.text(dateStr, rightX, headerHeight / 2 - 10, { align: 'right' });

    if (headerOptions?.userName) {
      pdf.setFontSize(13);
      pdf.setTextColor(203, 213, 225); // slate-300
      pdf.text(headerOptions.userName, rightX, headerHeight / 2 + 12, { align: 'right' });
    }

    // Separator line
    pdf.setDrawColor(59, 130, 246); // blue-500
    pdf.setLineWidth(2);
    pdf.line(24, headerHeight - 4, contentW - 24, headerHeight - 4);
  }

  pdf.addImage(contentImgData, 'PNG', 0, headerHeight, contentW, contentH);
  pdf.save(`${filename}.pdf`);
}

export async function exportElementToPNG(element: HTMLElement, filename: string) {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
  });
  const link = document.createElement('a');
  link.download = `${filename}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}
