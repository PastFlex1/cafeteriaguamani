/**
 * Official SRI RIDE PDF Generator for Invoices (Facturas) & Credit Notes
 * Uses jsPDF to create standard Ecuadorian tax receipts
 */

import { jsPDF } from 'jspdf';
import { ElectronicInvoice, CompanyConfig, CreditNote, Sale, VatRateType, InvoiceItem } from '../types';
import { generateAccessKey } from './sriCalculations';

function formatDateDdMmYyyy(dateStr?: string): string {
  if (!dateStr) return '';
  if (dateStr.includes('-')) {
    const [y, m, d] = dateStr.split('T')[0].split('-');
    if (y && m && d) return `${d}/${m}/${y}`;
  }
  return dateStr;
}

function getFormaPagoSriLabel(code?: string): string {
  switch (code) {
    case '01':
      return '01 - SIN UTILIZACIÓN DEL SISTEMA FINANCIERO';
    case '16':
      return '16 - TARJETA DE DÉBITO';
    case '19':
      return '19 - TARJETA DE CRÉDITO';
    case '20':
      return '20 - OTROS CON UTILIZACIÓN DEL SISTEMA FINANCIERO';
    case '17':
      return '17 - DINERO ELECTRÓNICO';
    default:
      return `${code || '01'} - SIN UTILIZACIÓN DEL SISTEMA FINANCIERO`;
  }
}

function drawBarcodeOnPdf(doc: jsPDF, code: string, startX: number, startY: number, totalWidth: number, height: number): void {
  const clean = (code || '1808202601179322192700120020020000001535296382317').replace(/\D/g, '');
  const bars: { width: number; black: boolean }[] = [
    { width: 2, black: true },
    { width: 1, black: false },
    { width: 1, black: true },
    { width: 2, black: false },
  ];

  for (let i = 0; i < clean.length; i++) {
    const d = parseInt(clean[i], 10) || 0;
    const w1 = (d % 3) + 1;
    const s1 = ((d + 1) % 2) + 1;
    const w2 = ((d + 2) % 3) + 1;
    const s2 = (d % 2) + 1;
    bars.push({ width: w1, black: true });
    bars.push({ width: s1, black: false });
    bars.push({ width: w2, black: true });
    bars.push({ width: s2, black: false });
  }

  bars.push(
    { width: 2, black: true },
    { width: 1, black: false },
    { width: 2, black: true }
  );

  const totalUnits = bars.reduce((acc, b) => acc + b.width, 0);
  const unitW = totalWidth / totalUnits;
  let curX = startX;

  doc.setFillColor(0, 0, 0);
  bars.forEach((b) => {
    const w = b.width * unitW;
    if (b.black) {
      doc.rect(curX, startY, w, height, 'F');
    }
    curX += w;
  });
}

export function buildInvoiceRidePdfDoc(invoice: ElectronicInvoice, company: CompanyConfig): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  doc.setDrawColor(0, 0, 0);
  doc.setTextColor(0, 0, 0);
  doc.setLineWidth(0.3);

  const nombreComercial = company.nombreComercial || company.razonSocial || 'CAFETERÍA';
  const razonSocialEmisor = company.razonSocial || company.nombreComercial || 'CAFETERÍA';
  const dirMatriz = company.dirMatriz || 'Quito, Ecuador';
  const dirSucursal = company.dirEstablecimiento || company.dirMatriz || 'Quito, Ecuador';
  const fechaEmisionFormatted = formatDateDdMmYyyy(invoice.fechaEmision);
  const fechaAutorizacionFormatted = invoice.fechaAutorizacion
    ? invoice.fechaAutorizacion.replace(/^(\d{4})-(\d{2})-(\d{2})/, '$3/$2/$1')
    : `${fechaEmisionFormatted}, ${new Date().toLocaleTimeString('es-EC')}`;

  // =========================================================================
  // 1. SECCIÓN SUPERIOR: IZQUIERDA (LOGO + CUADRO EMISOR) Y DERECHA (CUADRO RUC / AUTORIZACIÓN / BARCODE)
  // =========================================================================

  // 1A. Área Superior Izquierda: Logo centrado (sin borde, y = 12..43)
  let logoRendered = false;
  if (company.logoUrl && company.logoUrl.startsWith('data:image/')) {
    try {
      const format = company.logoUrl.includes('image/png') ? 'PNG' : 'JPEG';
      doc.addImage(company.logoUrl, format, 32, 13, 48, 28, undefined, 'FAST');
      logoRendered = true;
    } catch {
      logoRendered = false;
    }
  }
  if (!logoRendered) {
    // Emblema estilizado + Nombre Comercial centrado como en el RIDE
    doc.setFillColor(225, 29, 116);
    doc.roundedRect(48, 14, 16, 16, 3, 3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(nombreComercial.charAt(0).toUpperCase(), 56, 24.5, { align: 'center' });

    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(nombreComercial.toUpperCase(), 56, 37, { align: 'center', maxWidth: 86 });
  }

  // 1B. Cuadro Inferior Izquierdo: Datos del Emisor (Redondeado, x=10, y=45, w=93, h=45)
  doc.setDrawColor(0, 0, 0);
  doc.roundedRect(10, 45, 93, 45, 3, 3);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(razonSocialEmisor.toUpperCase(), 14, 52.5, { maxWidth: 85 });

  if (nombreComercial) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text(nombreComercial.toUpperCase(), 14, 58, { maxWidth: 85 });
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('Dirección Matriz:', 14, 64);
  doc.text(dirMatriz.toUpperCase(), 14, 67.5, { maxWidth: 85 });

  doc.text('Dirección Sucursal:', 14, 74);
  doc.text(dirSucursal.toUpperCase(), 14, 77.5, { maxWidth: 85 });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text(`OBLIGADO A LLEVAR CONTABILIDAD: ${company.obligadoContabilidad || 'NO'}`, 14, 86.5);

  // 1C. Cuadro Superior Derecho: R.U.C., FACTURA, Autorización y Código de Barras (x=107, y=12, w=93, h=78)
  doc.roundedRect(107, 12, 93, 78, 3, 3);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`R.U.C.: ${company.ruc || '1725403883001'}`, 112, 21);

  doc.setFontSize(13);
  doc.text('FACTURA', 112, 30);

  doc.setFontSize(10);
  doc.text(`No. ${invoice.numeroComprobante}`, 112, 38);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('NÚMERO DE AUTORIZACIÓN:', 112, 46);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(invoice.numeroAutorizacion || invoice.claveAcceso, 112, 51, { maxWidth: 84 });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('FECHA Y HORA DE', 112, 57.5);
  doc.text('AUTORIZACIÓN:', 112, 61);
  doc.setFont('helvetica', 'normal');
  doc.text(fechaAutorizacionFormatted, 152, 60.5);

  doc.setFont('helvetica', 'bold');
  doc.text('AMBIENTE:', 112, 66.5);
  doc.setFont('helvetica', 'normal');
  doc.text(company.ambiente === '2' ? 'PRODUCCIÓN' : 'PRUEBAS', 152, 66.5);

  doc.setFont('helvetica', 'bold');
  doc.text('EMISIÓN:', 112, 72);
  doc.setFont('helvetica', 'normal');
  doc.text('NORMAL', 152, 72);

  // Código de barras de 49 dígitos + número centrado debajo
  drawBarcodeOnPdf(doc, invoice.claveAcceso, 112, 74.5, 83, 9.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.4);
  doc.text(invoice.claveAcceso, 153.5, 87.2, { align: 'center' });

  // =========================================================================
  // 2. SECCIÓN DATOS DEL CLIENTE (Cuadro Redondeado de Ancho Completo)
  // =========================================================================
  let y = 94;
  doc.roundedRect(10, y, 190, 24, 2.5, 2.5);

  doc.setFontSize(8);
  // Columna Izquierda
  doc.setFont('helvetica', 'normal');
  doc.text('Razón Social / Nombres y Apellidos:', 13, y + 6);
  doc.setFont('helvetica', 'bold');
  doc.text((invoice.cliente?.razonSocial || 'CONSUMIDOR FINAL').toUpperCase(), 65, y + 6, { maxWidth: 62 });

  doc.setFont('helvetica', 'normal');
  doc.text('Identificación:', 13, y + 11.5);
  doc.setFont('helvetica', 'bold');
  doc.text(invoice.cliente?.identificacion || '9999999999999', 65, y + 11.5);

  doc.setFont('helvetica', 'normal');
  doc.text('Fecha:', 13, y + 17);
  doc.setFont('helvetica', 'bold');
  doc.text(fechaEmisionFormatted, 65, y + 17);

  doc.setFont('helvetica', 'normal');
  doc.text('Dirección:', 13, y + 22);
  doc.text((invoice.cliente?.direccion || 'S/N').toUpperCase(), 65, y + 22, { maxWidth: 62 });

  // Columna Derecha (Placa / Matrícula y Guía)
  doc.setFont('helvetica', 'normal');
  doc.text('Placa / Matrícula:', 132, y + 6);
  doc.text('Guía:', 132, y + 11.5);

  y += 28;

  // =========================================================================
  // 3. TABLA DE DETALLES DE PRODUCTOS (10 COLUMNAS CON CUADRÍCULA COMPLETA)
  // =========================================================================
  const cols = [
    { x: 10, w: 16, l1: 'Cod.', l2: 'Principal' },
    { x: 26, w: 16, l1: 'Cod.', l2: 'Auxiliar' },
    { x: 42, w: 15, l1: 'Cantidad', l2: '' },
    { x: 57, w: 39, l1: 'Descripción', l2: '' },
    { x: 96, w: 22, l1: 'Detalle', l2: 'Adicional' },
    { x: 118, w: 17, l1: 'Precio', l2: 'Unitario' },
    { x: 135, w: 15, l1: 'Subsidio', l2: '' },
    { x: 150, w: 17, l1: 'Precio sin', l2: 'Subsidio' },
    { x: 167, w: 16, l1: 'Descuento', l2: '' },
    { x: 183, w: 17, l1: 'Precio', l2: 'Total' },
  ];

  const headerH = 9;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  cols.forEach((c) => {
    doc.rect(c.x, y, c.w, headerH);
    const centerX = c.x + c.w / 2;
    if (c.l2) {
      doc.text(c.l1, centerX, y + 3.8, { align: 'center' });
      doc.text(c.l2, centerX, y + 7.2, { align: 'center' });
    } else {
      doc.text(c.l1, centerX, y + 5.5, { align: 'center' });
    }
  });

  y += headerH;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  invoice.items.forEach((item) => {
    const pUnitSinIva = item.cantidad > 0
      ? (item.precioTotalSinImpuesto + (item.descuento || 0)) / item.cantidad
      : item.precioUnitario;
    const cod = '0101';
    const descLines = doc.splitTextToSize(String(item.descripcion || '').toUpperCase(), 36);
    const rowH = Math.max(8, descLines.length * 3.8 + 2.5);

    cols.forEach((c) => {
      doc.rect(c.x, y, c.w, rowH);
    });

    const textY = y + rowH / 2 + 1;
    doc.text(cod, 11.5, textY);
    doc.text(cod, 27.5, textY);
    doc.text(Number(item.cantidad).toFixed(2), 43.5, textY);
    doc.text(descLines, 58.5, y + 4.2);
    // Detalle adicional vacío (x=96)
    doc.text(`$${Number(pUnitSinIva).toFixed(2)}`, 119.5, textY);
    doc.text('0.00', 136.5, textY);
    doc.text('0.00', 151.5, textY);
    doc.text(`$${Number(item.descuento || 0).toFixed(2)}`, 168.5, textY);
    doc.text(`$${Number(item.precioTotalSinImpuesto).toFixed(2)}`, 184.5, textY);

    y += rowH;
  });

  y += 5;

  // =========================================================================
  // 4. SECCIÓN INFERIOR: IZQUIERDA (INFO ADICIONAL + FORMA DE PAGO) Y DERECHA (SUBTOTALES + SUBSIDIO)
  // =========================================================================
  const leftX = 10;
  const leftW = 110;
  const rightX = 126;
  const rightW = 74;
  const startBottomY = y;

  // 4A. Tabla Izquierda 1: Información Adicional
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.rect(leftX, startBottomY, leftW, 6);
  doc.text('Información Adicional', leftX + leftW / 2, startBottomY + 4.2, { align: 'center' });

  const hasPhone = Boolean(invoice.cliente?.telefono);
  const infoBodyH = hasPhone ? 13 : 9;
  doc.rect(leftX, startBottomY + 6, leftW, infoBodyH);
  doc.setFontSize(7.5);
  doc.text('email:', leftX + 3, startBottomY + 11.5);
  doc.text(invoice.cliente?.email || company.email || 'clientes@cafeteria.com', leftX + 35, startBottomY + 11.5);
  if (hasPhone) {
    doc.text('teléfono:', leftX + 3, startBottomY + 16.5);
    doc.text(invoice.cliente?.telefono || '', leftX + 35, startBottomY + 16.5);
  }

  // 4B. Tabla Izquierda 2: Forma de pago | Valor
  const fpStartY = startBottomY + 6 + infoBodyH + 4;
  const fpCol1W = 82;
  const fpCol2W = 28;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.rect(leftX, fpStartY, fpCol1W, 6);
  doc.rect(leftX + fpCol1W, fpStartY, fpCol2W, 6);
  doc.text('Forma de pago', leftX + fpCol1W / 2, fpStartY + 4.2, { align: 'center' });
  doc.text('Valor', leftX + fpCol1W + fpCol2W / 2, fpStartY + 4.2, { align: 'center' });

  const pagosList = invoice.pagos && invoice.pagos.length > 0
    ? invoice.pagos
    : [{ formaPago: '01', total: invoice.importeTotal }];

  doc.setFont('helvetica', 'normal');
  let fpRowY = fpStartY + 6;
  pagosList.forEach((p) => {
    doc.rect(leftX, fpRowY, fpCol1W, 8);
    doc.rect(leftX + fpCol1W, fpRowY, fpCol2W, 8);
    doc.text(getFormaPagoSriLabel(p.formaPago), leftX + 2.5, fpRowY + 5, { maxWidth: fpCol1W - 4 });
    doc.text(Number(p.total).toFixed(2), leftX + fpCol1W + fpCol2W - 2.5, fpRowY + 5, { align: 'right' });
    fpRowY += 8;
  });

  // 4C. Tabla Derecha: Subtotales, Impuestos y Valor Total (Filas con borde completo)
  let totY = startBottomY;
  const totRowH = 5;

  const drawTotalRow = (label: string, val: number, isBold = false) => {
    doc.rect(rightX, totY, rightW, totRowH);
    doc.setFont('helvetica', isBold ? 'bold' : 'normal');
    doc.setFontSize(7.5);
    doc.text(label, rightX + 2, totY + 3.6);
    doc.text(Number(val).toFixed(2), rightX + rightW - 2, totY + 3.6, { align: 'right' });
    totY += totRowH;
  };

  drawTotalRow('SUBTOTAL 15%', invoice.subtotal15 || 0);
  if (invoice.subtotal5 > 0) drawTotalRow('SUBTOTAL 8% / 5%', invoice.subtotal5 || 0);
  if (invoice.subtotal0 > 0) drawTotalRow('SUBTOTAL 0%', invoice.subtotal0 || 0);
  drawTotalRow('SUBTOTAL NO OBJETO DE IVA', invoice.subtotalNoObjeto || 0);
  drawTotalRow('SUBTOTAL EXENTO DE IVA', invoice.subtotalExento || 0);
  drawTotalRow('SUBTOTAL SIN IMPUESTOS', invoice.subtotalSinImpuestos || 0);
  drawTotalRow('TOTAL DESCUENTO', invoice.totalDescuento || 0);
  drawTotalRow('ICE', 0);
  drawTotalRow('IRBPNR', 0);
  drawTotalRow('IVA 15%', invoice.totalIva || 0);
  drawTotalRow('PROPINA', invoice.propina || 0);
  drawTotalRow('VALOR TOTAL', invoice.importeTotal || 0, true);

  // 4D. Cuadro Inferior Derecho: VALOR TOTAL SIN SUBSIDIO / AHORRO POR SUBSIDIO
  const subBoxY = totY + 2;
  doc.rect(rightX, subBoxY, rightW, 10);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('VALOR TOTAL SIN SUBSIDIO', rightX + 2, subBoxY + 4.2);
  doc.text('0.00', rightX + rightW - 2, subBoxY + 4.2, { align: 'right' });
  doc.text('AHORRO POR SUBSIDIO:', rightX + 2, subBoxY + 8.4);
  doc.text('0.00', rightX + rightW - 2, subBoxY + 8.4, { align: 'right' });

  return doc;
}

export function exportInvoiceRidePdf(invoice: ElectronicInvoice, company: CompanyConfig): void {
  const doc = buildInvoiceRidePdfDoc(invoice, company);
  doc.save(`RIDE_${invoice.numeroComprobante}_${invoice.claveAcceso.slice(0, 10)}.pdf`);
}

export function getInvoiceRidePdfBase64(invoice: ElectronicInvoice, company: CompanyConfig): string {
  const doc = buildInvoiceRidePdfDoc(invoice, company);
  const dataUri = doc.output('datauristring');
  return dataUri.split(',')[1] || '';
}

/**
 * Builds a clean PDF document for a Nota de Venta (Comprobante de Venta)
 */
export function buildNotaVentaPdfDoc(sale: Sale, company: CompanyConfig): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const invCalc = saleToElectronicInvoice(sale, company);
  let y = 14;

  // Header Box - Left: Emisor Info
  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.roundedRect(10, y, 95, 50, 2, 2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(company.razonSocial || 'CAFETERIA', 14, y + 8, { maxWidth: 87 });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  if (company.nombreComercial && company.nombreComercial !== company.razonSocial) {
    doc.text(`Nombre Comercial: ${company.nombreComercial}`, 14, y + 15, { maxWidth: 87 });
  }
  doc.text(`Matriz: ${company.dirMatriz || 'Quito, Ecuador'}`, 14, y + 21, { maxWidth: 87 });
  doc.text(`Sucursal: ${company.dirEstablecimiento || company.dirMatriz || 'Quito, Ecuador'}`, 14, y + 27, { maxWidth: 87 });
  doc.text(`Teléfono: ${company.telefono || 'S/N'}`, 14, y + 33);
  doc.text(`Email: ${company.email || 'S/N'}`, 14, y + 39);

  if (company.regimenTributario === 'RIMPE_NEGOCIO_POPULAR') {
    doc.setFont('helvetica', 'bold');
    doc.text('CONTRIBUYENTE NEGOCIO POPULAR - RÉGIMEN RIMPE', 14, y + 45);
  } else if (company.regimenTributario === 'RIMPE_EMPRENDEDOR') {
    doc.setFont('helvetica', 'bold');
    doc.text('CONTRIBUYENTE RÉGIMEN RIMPE', 14, y + 45);
  }

  // Header Box - Right: Nota de Venta Info
  doc.roundedRect(110, y, 90, 50, 2, 2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(`R.U.C.: ${company.ruc || '1725403883001'}`, 114, y + 9);

  doc.setFontSize(12);
  doc.text('NOTA DE VENTA', 114, y + 18);

  doc.setFontSize(10);
  const numNota = sale.invoiceNumber || `${company.codigoEstablecimiento || '001'}-${company.puntoEmision || '001'}-${String(company.secuencialNotaVenta || 1).padStart(9, '0')}`;
  doc.text(`No. ${numNota}`, 114, y + 26);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const fechaStr = sale.timestamp ? new Date(sale.timestamp).toLocaleString('es-EC') : new Date().toLocaleString('es-EC');
  doc.text(`FECHA DE EMISIÓN: ${fechaStr}`, 114, y + 34);
  doc.text(`ATENDIDO POR: ${sale.employeeName || 'Cajero'}`, 114, y + 40);
  doc.text(`ESTADO: ${sale.status === 'voided' ? 'ANULADA' : 'EMITIDA / PAGADA'}`, 114, y + 46);

  y += 54;

  // Client Info Box
  doc.roundedRect(10, y, 190, 22, 2, 2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(`Cliente / Razón Social:`, 14, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.text(sale.customer?.name || 'CONSUMIDOR FINAL', 52, y + 6);

  doc.setFont('helvetica', 'bold');
  doc.text(`Cédula / RUC:`, 140, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.text(sale.customer?.documentId || '9999999999', 165, y + 6);

  doc.setFont('helvetica', 'bold');
  doc.text(`Correo Electrónico:`, 14, y + 12);
  doc.setFont('helvetica', 'normal');
  doc.text(sale.customer?.email || 'S/N', 52, y + 12);

  doc.setFont('helvetica', 'bold');
  doc.text(`Teléfono:`, 140, y + 12);
  doc.setFont('helvetica', 'normal');
  doc.text(sale.customer?.phone || 'S/N', 165, y + 12);

  doc.setFont('helvetica', 'bold');
  doc.text(`Dirección:`, 14, y + 18);
  doc.setFont('helvetica', 'normal');
  doc.text(sale.customer?.address || 'Quito, Ecuador', 52, y + 18, { maxWidth: 140 });

  y += 26;

  // Table Header
  doc.setFillColor(240, 240, 240);
  doc.rect(10, y, 190, 6, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('Cant.', 14, y + 4.5);
  doc.text('Descripción', 35, y + 4.5);
  doc.text('P. Unit (Sin IVA)', 120, y + 4.5);
  doc.text('Descuento', 150, y + 4.5);
  doc.text('Total PVP', 176, y + 4.5);

  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  invCalc.items.forEach((item) => {
    const pUnitSinIva = item.cantidad > 0
      ? (item.precioTotalSinImpuesto + (item.descuento || 0)) / item.cantidad
      : item.precioUnitario;
    doc.text(Number(item.cantidad).toFixed(2), 14, y + 4.5);
    doc.text(String(item.descripcion).substring(0, 48), 35, y + 4.5);
    doc.text(`$${Number(pUnitSinIva).toFixed(2)}`, 120, y + 4.5);
    doc.text(`$${Number(item.descuento || 0).toFixed(2)}`, 150, y + 4.5);
    doc.text(`$${Number(item.valorTotal).toFixed(2)}`, 176, y + 4.5);

    doc.setDrawColor(220);
    doc.line(10, y + 6, 200, y + 6);
    y += 6;
  });

  y += 6;

  // Bottom Totals
  const leftX = 10;
  const rightX = 120;
  doc.setDrawColor(0);
  doc.roundedRect(leftX, y, 105, 34, 2, 2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Método de Pago', leftX + 4, y + 7);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const metodoLabel = sale.paymentMethod === 'efectivo'
    ? 'Efectivo'
    : sale.paymentMethod === 'transferencia'
    ? `Transferencia Bancaria ${sale.transferNumber ? `(#${sale.transferNumber})` : ''}`
    : 'Tarjeta';
  doc.text(`Forma de Pago: ${metodoLabel}`, leftX + 4, y + 14);
  if (sale.paymentMethod === 'efectivo' && sale.cashReceived !== undefined) {
    doc.text(`Efectivo Recibido: $${Number(sale.cashReceived).toFixed(2)} USD`, leftX + 4, y + 20);
    doc.text(`Cambio Entregado: $${Number(sale.changeGiven || 0).toFixed(2)} USD`, leftX + 4, y + 26);
  }

  doc.roundedRect(rightX, y, 80, 34, 2, 2);
  let totY = y + 7;
  const printRow = (label: string, val: number, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(8);
    doc.text(label, rightX + 4, totY);
    doc.text(`$${val.toFixed(2)}`, rightX + 60, totY);
    totY += 6;
  };

  printRow('SUBTOTAL (SIN IVA):', invCalc.subtotalSinImpuestos);
  if (invCalc.totalDescuento > 0) printRow('DESCUENTO:', invCalc.totalDescuento);
  printRow('IVA (15% DESGLOSADO):', invCalc.totalIva);

  doc.setFillColor(235, 235, 235);
  doc.rect(rightX + 1, totY - 2, 78, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('TOTAL PAGADO:', rightX + 4, totY + 3);
  doc.text(`$${Number(sale.total).toFixed(2)}`, rightX + 58, totY + 3);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.text(`Gracias por su compra en ${company.nombreComercial || company.razonSocial || 'nuestra cafetería'}.`, 10, 285);

  return doc;
}

export function exportNotaVentaPdf(sale: Sale, company: CompanyConfig): void {
  const doc = buildNotaVentaPdfDoc(sale, company);
  const numNota = (sale.invoiceNumber || sale.id).replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`NOTA_VENTA_${numNota}.pdf`);
}

export function getNotaVentaPdfBase64(sale: Sale, company: CompanyConfig): string {
  const doc = buildNotaVentaPdfDoc(sale, company);
  const dataUri = doc.output('datauristring');
  return dataUri.split(',')[1] || '';
}

/**
 * Converts a POS Sale into an ElectronicInvoice structure for RIDE visualization and PDF generation.
 */
export function saleToElectronicInvoice(sale: Sale, company: CompanyConfig): ElectronicInvoice {
  const estab = company.codigoEstablecimiento || '001';
  const pto = company.puntoEmision || '001';
  const secStr = (sale.invoiceNumber && sale.invoiceNumber.includes('-'))
    ? sale.invoiceNumber.split('-')[2]
    : String(company.secuencialFactura || 1).padStart(9, '0');
  const numeroComprobante = (sale.invoiceNumber && sale.invoiceNumber.includes('-'))
    ? sale.invoiceNumber
    : `${estab}-${pto}-${secStr}`;

  const fechaEmision = sale.timestamp ? new Date(sale.timestamp).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
  const claveAcceso = sale.accessKey || generateAccessKey({
    fechaEmision,
    tipoComprobante: '01',
    rucEmisor: company.ruc || '1725403883001',
    ambiente: company.ambiente || '1',
    establecimiento: estab,
    puntoEmision: pto,
    secuencial: secStr,
    tipoEmision: company.tipoEmision || '1',
  });

  let formaPagoSri = '01'; // Efectivo
  if (sale.paymentMethod === 'tarjeta') formaPagoSri = '19';
  if (sale.paymentMethod === 'transferencia') formaPagoSri = '20';

  const defaultRatePct = sale.taxRate !== undefined && sale.taxRate > 0
    ? Math.round(sale.taxRate * 100)
    : (company.tarifaIvaPredeterminada ?? 15);

  const invoiceItems: InvoiceItem[] = sale.items.map((it, idx) => {
    const itemRatePct = it.tarifaIva !== undefined ? it.tarifaIva : defaultRatePct;
    const itemRate = itemRatePct / 100;
    const itemBruto = it.price * it.quantity;
    const itemDiscount = it.discountPercent ? (itemBruto * it.discountPercent) / 100 : 0;
    const itemTotalConIva = Math.max(0, itemBruto - itemDiscount);
    // El IVA se desglosa del precio final (PVP), no se aumenta
    const itemSinImp = itemRate > 0 ? itemTotalConIva / (1 + itemRate) : itemTotalConIva;
    const itemVat = itemTotalConIva - itemSinImp;
    const tarifaIvaVal: VatRateType = itemRatePct >= 15 ? 15 : itemRatePct > 0 ? 5 : 0;

    return {
      id: `it-${idx}`,
      codigoPrincipal: '0101',
      descripcion: it.name,
      cantidad: it.quantity,
      precioUnitario: it.price,
      descuento: itemDiscount,
      tarifaIva: tarifaIvaVal,
      precioTotalSinImpuesto: itemSinImp,
      valorIva: itemVat,
      valorTotal: itemTotalConIva,
    };
  });

  const subtotal15 = invoiceItems.filter(i => i.tarifaIva === 15).reduce((acc, i) => acc + i.precioTotalSinImpuesto, 0);
  const subtotal5 = invoiceItems.filter(i => i.tarifaIva === 5).reduce((acc, i) => acc + i.precioTotalSinImpuesto, 0);
  const subtotal0 = invoiceItems.filter(i => i.tarifaIva === 0).reduce((acc, i) => acc + i.precioTotalSinImpuesto, 0);
  const taxableSinImp = subtotal15 + subtotal5 + subtotal0;
  const totalIvaDesglosado = invoiceItems.reduce((acc, i) => acc + i.valorIva, 0);
  const totalDescuentoCalc = invoiceItems.reduce((acc, i) => acc + (i.descuento || 0), 0);

  return {
    id: sale.id,
    tipoDocumento: '01',
    establecimiento: estab,
    puntoEmision: pto,
    secuencial: secStr,
    numeroComprobante,
    claveAcceso,
    fechaEmision,
    cliente: {
      identificacion: sale.customer?.documentId || '9999999999999',
      razonSocial: sale.customer?.name || 'CONSUMIDOR FINAL',
      direccion: sale.customer?.address || 'Quito, Ecuador',
      telefono: sale.customer?.phone || '',
      email: sale.customer?.email || '',
    },
    items: invoiceItems,
    subtotal15,
    subtotal5,
    subtotal0,
    subtotalNoObjeto: 0,
    subtotalExento: 0,
    totalDescuento: sale.discount !== undefined ? sale.discount : totalDescuentoCalc,
    subtotalSinImpuestos: taxableSinImp,
    totalIva: totalIvaDesglosado,
    propina: 0,
    importeTotal: sale.total,
    pagos: [
      {
        formaPago: formaPagoSri,
        total: sale.total,
        ...(sale.paymentMethod === 'transferencia' && sale.transferNumber ? { numeroTransferencia: sale.transferNumber } : {}),
      },
    ],
    estado: sale.status === 'voided' ? 'ANULADO' : 'AUTORIZADO',
    numeroAutorizacion: claveAcceso,
    fechaAutorizacion: sale.timestamp ? `${fechaEmision} ${new Date(sale.timestamp).toLocaleTimeString('es-EC')}` : `${fechaEmision} 12:00:00`,
    observaciones: `Factura POS emitida por ${sale.employeeName}`,
  };
}

/**
  * Generates and downloads the official SRI RIDE PDF directly from a POS Sale.
  */
export function exportSaleRidePdf(sale: Sale, company: CompanyConfig): void {
  const invoice = saleToElectronicInvoice(sale, company);
  exportInvoiceRidePdf(invoice, company);
}

