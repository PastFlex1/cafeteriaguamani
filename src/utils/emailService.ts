/**
 * Servicio de envío de Comprobantes Electrónicos por SMTP
 * - Facturas Electrónicas SRI: Adjunta RIDE (.pdf) + XML Autorizado (.xml)
 * - Notas de Venta: Adjunta Nota de Venta (.pdf)
 */

import { CompanyConfig, ElectronicInvoice, Sale } from '../types';
import { generateSriAuthorizedXml } from './sriCalculations';
import {
  getInvoiceRidePdfBase64,
  getNotaVentaPdfBase64,
  saleToElectronicInvoice,
} from './sriPdfGenerator';

export interface SmtpAttachment {
  filename: string;
  contentType: string;
  contentBase64: string;
}

export interface SmtpSendPayload {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName?: string;
  fromEmail?: string;
  to: string;
  subject: string;
  html: string;
  attachments?: SmtpAttachment[];
}

export interface SmtpSendResult {
  success: boolean;
  message?: string;
  error?: string;
}

function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Envía el payload SMTP ya sea por Electron IPC o por el middleware Vite (/api/send-email)
 */
export async function sendRawSmtpEmail(payload: SmtpSendPayload): Promise<SmtpSendResult> {
  try {
    const winAny = window as any;
    if (winAny.sqliteApi && typeof winAny.sqliteApi.sendEmail === 'function') {
      return await winAny.sqliteApi.sendEmail(payload);
    }

    const res = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'No se pudo conectar con el servicio de correo SMTP.',
    };
  }
}

export function isSmtpConfigured(company?: CompanyConfig): boolean {
  if (!company) return false;
  return Boolean(
    company.smtpHost &&
      company.smtpHost.trim() &&
      company.smtpUser &&
      company.smtpUser.trim() &&
      company.smtpPass &&
      company.smtpPass.trim()
  );
}

/**
 * Envía una Factura Electrónica SRI con el RIDE (.pdf) y el XML Autorizado (.xml) adjuntos
 */
export async function sendInvoiceRideAndXmlEmail(
  invoice: ElectronicInvoice,
  company: CompanyConfig,
  recipientEmailOverride?: string
): Promise<SmtpSendResult> {
  const toEmail = (recipientEmailOverride || invoice.cliente?.email || '').trim();
  if (!toEmail || !toEmail.includes('@') || toEmail === 'consumidorfinal@cafeteria.com' || toEmail === 'no-email@cafeteria.com') {
    return {
      success: false,
      error: 'Ingrese un correo electrónico válido del cliente para enviar la Factura (RIDE + XML).',
    };
  }

  if (!isSmtpConfigured(company)) {
    return {
      success: false,
      error: 'Servidor SMTP no configurado. Ingrese su correo y Contraseña de Aplicación en la pestaña ⚙️ CONFIG. SRI.',
    };
  }

  // 1. Generar RIDE en PDF (Base64)
  const ridePdfBase64 = getInvoiceRidePdfBase64(invoice, company);

  // 2. Generar XML Autorizado SRI en Base64
  const authorizedXmlStr = generateSriAuthorizedXml(invoice, company);
  const xmlBase64 = utf8ToBase64(authorizedXmlStr);

  const nombreComercial = company.nombreComercial || company.razonSocial || 'CAFETERÍA';
  const safeNum = invoice.numeroComprobante.replace(/[^a-zA-Z0-9_-]/g, '_');

  const itemsRowsHtml = invoice.items
    .map((item) => {
      const pUnitSinIva =
        item.cantidad > 0
          ? (item.precioTotalSinImpuesto + (item.descuento || 0)) / item.cantidad
          : item.precioUnitario;
      return `
        <tr>
          <td style="padding:8px 10px;border-bottom:1px solid #e4e4e7;font-family:monospace;font-weight:bold;">${item.cantidad}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e4e4e7;">${item.descripcion}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e4e4e7;text-align:right;font-family:monospace;">$${pUnitSinIva.toFixed(2)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e4e4e7;text-align:right;font-family:monospace;">$${item.precioTotalSinImpuesto.toFixed(2)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e4e4e7;text-align:right;font-family:monospace;font-weight:bold;">$${item.valorTotal.toFixed(2)}</td>
        </tr>`;
    })
    .join('');

  const html = `
  <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:640px;margin:0 auto;background:#ffffff;border:3px solid #000000;border-radius:12px;overflow:hidden;">
    <div style="background:#fde047;border-bottom:3px solid #000000;padding:20px 24px;">
      <div style="font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:1px;color:#3f3f46;">COMPROBANTE ELECTRÓNICO AUTORIZADO SRI</div>
      <h1 style="margin:4px 0 0;font-size:22px;font-weight:900;color:#000000;text-transform:uppercase;">${nombreComercial}</h1>
      <div style="font-size:12px;font-weight:bold;color:#18181b;margin-top:4px;">R.U.C.: ${company.ruc || '1725403883001'} | Factura Nro. ${invoice.numeroComprobante}</div>
    </div>

    <div style="padding:24px;color:#18181b;">
      <p style="margin:0 0 16px;font-size:14px;">
        Estimado(a) <strong>${invoice.cliente?.razonSocial || 'Cliente'}</strong>,
      </p>
      <p style="margin:0 0 18px;font-size:13px;line-height:1.5;color:#3f3f46;">
        Adjunto a este correo encontrará su <strong>Factura Electrónica</strong> en formato <strong>RIDE (.PDF)</strong> y el archivo <strong>XML Autorizado (.XML)</strong> conforme a la normativa del Servicio de Rentas Internas (SRI).
      </p>

      <div style="background:#f4f4f5;border:2px solid #000000;border-radius:8px;padding:14px 16px;margin-bottom:20px;font-size:12px;">
        <div style="margin-bottom:6px;"><strong>Nro. Comprobante:</strong> <span style="font-family:monospace;">${invoice.numeroComprobante}</span></div>
        <div style="margin-bottom:6px;"><strong>Fecha de Emisión:</strong> ${invoice.fechaEmision}</div>
        <div style="margin-bottom:6px;"><strong>Identificación Cliente:</strong> ${invoice.cliente?.identificacion || '9999999999999'}</div>
        <div style="margin-bottom:6px;"><strong>Estado SRI:</strong> <span style="background:#86efac;padding:2px 6px;border-radius:4px;font-weight:bold;border:1px solid #000;">${invoice.estado || 'AUTORIZADO'}</span></div>
        <div style="word-break:break-all;"><strong>Clave de Acceso / Autorización:</strong><br/><span style="font-family:monospace;font-size:11px;">${invoice.claveAcceso}</span></div>
      </div>

      <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:18px;border:2px solid #000000;">
        <thead>
          <tr style="background:#000000;color:#ffffff;text-transform:uppercase;font-size:10px;">
            <th style="padding:8px 10px;text-align:left;">Cant.</th>
            <th style="padding:8px 10px;text-align:left;">Descripción</th>
            <th style="padding:8px 10px;text-align:right;">P. Unit (Sin IVA)</th>
            <th style="padding:8px 10px;text-align:right;">Subtotal</th>
            <th style="padding:8px 10px;text-align:right;">PVP Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRowsHtml}
        </tbody>
      </table>

      <div style="width:260px;margin-left:auto;border:2px solid #000000;border-radius:8px;padding:12px;background:#fefce8;font-size:12px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <span>Subtotal Sin IVA:</span>
          <strong style="font-family:monospace;float:right;">$${invoice.subtotalSinImpuestos.toFixed(2)}</strong>
        </div>
        ${
          invoice.totalDescuento > 0
            ? `<div style="display:flex;justify-content:space-between;margin-bottom:4px;color:#e11d48;">
                <span>Descuento:</span>
                <strong style="font-family:monospace;float:right;">-$${invoice.totalDescuento.toFixed(2)}</strong>
              </div>`
            : ''
        }
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
          <span>IVA (15% Desglosado):</span>
          <strong style="font-family:monospace;float:right;">$${invoice.totalIva.toFixed(2)}</strong>
        </div>
        <div style="border-top:2px solid #000000;padding-top:6px;font-size:15px;font-weight:900;">
          <span>VALOR TOTAL:</span>
          <span style="font-family:monospace;float:right;">$${invoice.importeTotal.toFixed(2)} USD</span>
        </div>
      </div>
    </div>

    <div style="background:#18181b;color:#a1a1aa;padding:14px 24px;font-size:11px;text-align:center;">
      ${nombreComercial} • ${company.dirEstablecimiento || company.dirMatriz || 'Ecuador'} • Tel: ${company.telefono || 'S/N'}
    </div>
  </div>`;

  return await sendRawSmtpEmail({
    host: company.smtpHost!,
    port: Number(company.smtpPort) || 465,
    secure: company.smtpSecure !== undefined ? company.smtpSecure : (Number(company.smtpPort) || 465) === 465,
    user: company.smtpUser!,
    pass: company.smtpPass!,
    fromName: company.smtpFromName || `${nombreComercial} - Facturación Electrónica`,
    fromEmail: company.smtpUser!,
    to: toEmail,
    subject: `Factura Electrónica Nro. ${invoice.numeroComprobante} - ${nombreComercial} (RIDE y XML Autorizado)`,
    html,
    attachments: [
      {
        filename: `RIDE_FACTURA_${safeNum}.pdf`,
        contentType: 'application/pdf',
        contentBase64: ridePdfBase64,
      },
      {
        filename: `XML_AUTORIZADO_${safeNum}_${invoice.claveAcceso}.xml`,
        contentType: 'application/xml',
        contentBase64: xmlBase64,
      },
    ],
  });
}

/**
 * Envía una Nota de Venta por correo con su PDF adjunto
 */
export async function sendNotaVentaEmail(
  sale: Sale,
  company: CompanyConfig,
  recipientEmailOverride?: string
): Promise<SmtpSendResult> {
  const toEmail = (recipientEmailOverride || sale.customer?.email || '').trim();
  if (!toEmail || !toEmail.includes('@') || toEmail === 'consumidorfinal@cafeteria.com' || toEmail === 'no-email@cafeteria.com') {
    return {
      success: false,
      error: 'Ingrese un correo electrónico válido del cliente para enviar la Nota de Venta.',
    };
  }

  if (!isSmtpConfigured(company)) {
    return {
      success: false,
      error: 'Servidor SMTP no configurado. Ingrese su correo y Contraseña de Aplicación en la pestaña ⚙️ CONFIG. SRI.',
    };
  }

  const notaPdfBase64 = getNotaVentaPdfBase64(sale, company);
  const invCalc = saleToElectronicInvoice(sale, company);
  const nombreComercial = company.nombreComercial || company.razonSocial || 'CAFETERÍA';
  const numNota = sale.invoiceNumber || sale.id;
  const safeNum = numNota.replace(/[^a-zA-Z0-9_-]/g, '_');

  const itemsRowsHtml = invCalc.items
    .map((item) => {
      const pUnitSinIva =
        item.cantidad > 0
          ? (item.precioTotalSinImpuesto + (item.descuento || 0)) / item.cantidad
          : item.precioUnitario;
      return `
        <tr>
          <td style="padding:8px 10px;border-bottom:1px solid #e4e4e7;font-family:monospace;font-weight:bold;">${item.cantidad}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e4e4e7;">${item.descripcion}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e4e4e7;text-align:right;font-family:monospace;">$${pUnitSinIva.toFixed(2)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e4e4e7;text-align:right;font-family:monospace;font-weight:bold;">$${item.valorTotal.toFixed(2)}</td>
        </tr>`;
    })
    .join('');

  const html = `
  <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:640px;margin:0 auto;background:#ffffff;border:3px solid #000000;border-radius:12px;overflow:hidden;">
    <div style="background:#67e8f9;border-bottom:3px solid #000000;padding:20px 24px;">
      <div style="font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:1px;color:#18181b;">COMPROBANTE DE COMPRA • NOTA DE VENTA</div>
      <h1 style="margin:4px 0 0;font-size:22px;font-weight:900;color:#000000;text-transform:uppercase;">${nombreComercial}</h1>
      <div style="font-size:12px;font-weight:bold;color:#18181b;margin-top:4px;">R.U.C.: ${company.ruc || '1725403883001'} | Nota de Venta Nro. ${numNota}</div>
    </div>

    <div style="padding:24px;color:#18181b;">
      <p style="margin:0 0 14px;font-size:14px;">
        Hola <strong>${sale.customer?.name || 'CONSUMIDOR FINAL'}</strong>,
      </p>
      <p style="margin:0 0 18px;font-size:13px;line-height:1.5;color:#3f3f46;">
        Gracias por su visita a <strong>${nombreComercial}</strong>. Adjunto en este correo encontrará el archivo PDF de su <strong>Nota de Venta Nro. ${numNota}</strong>.
      </p>

      <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:18px;border:2px solid #000000;">
        <thead>
          <tr style="background:#000000;color:#ffffff;text-transform:uppercase;font-size:10px;">
            <th style="padding:8px 10px;text-align:left;">Cant.</th>
            <th style="padding:8px 10px;text-align:left;">Producto</th>
            <th style="padding:8px 10px;text-align:right;">P. Unit (Sin IVA)</th>
            <th style="padding:8px 10px;text-align:right;">Total PVP</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRowsHtml}
        </tbody>
      </table>

      <div style="width:260px;margin-left:auto;border:2px solid #000000;border-radius:8px;padding:12px;background:#ecfeff;font-size:12px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <span>Subtotal (Sin IVA):</span>
          <strong style="font-family:monospace;float:right;">$${invCalc.subtotalSinImpuestos.toFixed(2)}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
          <span>IVA (15% Desglosado):</span>
          <strong style="font-family:monospace;float:right;">$${invCalc.totalIva.toFixed(2)}</strong>
        </div>
        <div style="border-top:2px solid #000000;padding-top:6px;font-size:15px;font-weight:900;">
          <span>TOTAL PAGADO:</span>
          <span style="font-family:monospace;float:right;">$${sale.total.toFixed(2)} USD</span>
        </div>
      </div>
    </div>

    <div style="background:#18181b;color:#a1a1aa;padding:14px 24px;font-size:11px;text-align:center;">
      ${nombreComercial} • ${company.dirEstablecimiento || company.dirMatriz || 'Ecuador'} • Tel: ${company.telefono || 'S/N'}
    </div>
  </div>`;

  return await sendRawSmtpEmail({
    host: company.smtpHost!,
    port: Number(company.smtpPort) || 465,
    secure: company.smtpSecure !== undefined ? company.smtpSecure : (Number(company.smtpPort) || 465) === 465,
    user: company.smtpUser!,
    pass: company.smtpPass!,
    fromName: company.smtpFromName || `${nombreComercial} - Comprobantes`,
    fromEmail: company.smtpUser!,
    to: toEmail,
    subject: `Nota de Venta Nro. ${numNota} - ${nombreComercial}`,
    html,
    attachments: [
      {
        filename: `NOTA_VENTA_${safeNum}.pdf`,
        contentType: 'application/pdf',
        contentBase64: notaPdfBase64,
      },
    ],
  });
}

/**
 * Envía automáticamente el comprobante correspondiente de una venta (Factura -> RIDE + XML, Nota de Venta -> PDF)
 */
export async function sendSaleComprobanteEmail(
  sale: Sale,
  company: CompanyConfig,
  recipientEmailOverride?: string
): Promise<SmtpSendResult> {
  if (sale.documentType === 'factura') {
    const invoice = saleToElectronicInvoice(sale, company);
    if (recipientEmailOverride) {
      invoice.cliente.email = recipientEmailOverride.trim();
    }
    return await sendInvoiceRideAndXmlEmail(invoice, company, recipientEmailOverride);
  } else {
    return await sendNotaVentaEmail(sale, company, recipientEmailOverride);
  }
}

/**
 * Envía un correo de prueba para verificar credenciales SMTP desde la pestaña CONFIG. SRI
 */
export async function sendTestSmtpEmail(
  company: CompanyConfig,
  testRecipient: string
): Promise<SmtpSendResult> {
  const nombreComercial = company.nombreComercial || company.razonSocial || 'CAFETERÍA';
  const html = `
  <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto;border:3px solid #000;border-radius:12px;overflow:hidden;">
    <div style="background:#86efac;border-bottom:3px solid #000;padding:18px 22px;">
      <h2 style="margin:0;font-size:18px;font-weight:900;color:#000;">✅ CONEXIÓN SMTP EXITOSA</h2>
      <div style="font-size:12px;font-weight:bold;color:#18181b;margin-top:4px;">${nombreComercial}</div>
    </div>
    <div style="padding:20px 22px;font-size:13px;color:#18181b;line-height:1.5;">
      <p>¡El servidor de correo SMTP ha sido configurado correctamente!</p>
      <p>A partir de ahora, el sistema podrá enviar directamente al correo de sus clientes:</p>
      <ul>
        <li><strong>Facturas Electrónicas SRI:</strong> Archivo PDF (RIDE) + Archivo XML Autorizado.</li>
        <li><strong>Notas de Venta:</strong> Comprobante en formato PDF con el desglose de la compra.</li>
      </ul>
      <p style="font-size:11px;color:#71717a;margin-top:16px;">Servidor: ${company.smtpHost}:${company.smtpPort || 465} (${company.smtpUser})</p>
    </div>
  </div>`;

  return await sendRawSmtpEmail({
    host: company.smtpHost || '',
    port: Number(company.smtpPort) || 465,
    secure: company.smtpSecure !== undefined ? company.smtpSecure : (Number(company.smtpPort) || 465) === 465,
    user: company.smtpUser || '',
    pass: company.smtpPass || '',
    fromName: company.smtpFromName || `${nombreComercial} - Facturación Electrónica`,
    fromEmail: company.smtpUser || '',
    to: testRecipient.trim(),
    subject: `✅ Prueba de Correo SMTP - ${nombreComercial}`,
    html,
  });
}

