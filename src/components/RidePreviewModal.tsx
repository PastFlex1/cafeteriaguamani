import React, { useState, useEffect, useRef } from 'react';
import { Printer, Download, Receipt, Mail, CheckCircle2, AlertTriangle } from 'lucide-react';
import { CompanyConfig, ElectronicInvoice } from '../types';
import { generateSriAuthorizedXml } from '../utils/sriCalculations';
import { exportInvoiceRidePdf } from '../utils/sriPdfGenerator';
import { sendInvoiceRideAndXmlEmail } from '../utils/emailService';

interface RidePreviewModalProps {
  invoice: ElectronicInvoice;
  company: CompanyConfig;
  onClose: () => void;
  onViewTicket?: () => void;
  documentLabel?: string;
  autoPrintThermal?: boolean;
}

/**
 * Genera barras estilo Code-128 deterministas a partir de los 49 dígitos de la Clave de Acceso
 */
function renderBarcodeBars(code: string) {
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
  let currentX = 0;

  return (
    <svg
      viewBox={`0 0 ${totalUnits} 42`}
      className="w-full h-11 preserve-3d"
      preserveAspectRatio="none"
    >
      {bars.map((b, idx) => {
        const x = currentX;
        currentX += b.width;
        if (!b.black) return null;
        return <rect key={idx} x={x} y={0} width={b.width} height={42} fill="#000000" />;
      })}
    </svg>
  );
}

function formatDateDdMmYyyy(dateStr?: string): string {
  if (!dateStr) return '';
  if (dateStr.includes('-')) {
    const [y, m, d] = dateStr.split('T')[0].split('-');
    if (y && m && d) return `${d}/${m}/${y}`;
  }
  return dateStr;
}

function getFormaPagoLabel(code?: string): string {
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

export default function RidePreviewModal({
  invoice,
  company,
  onClose,
  onViewTicket,
  documentLabel = 'FACTURA',
  autoPrintThermal = false,
}: RidePreviewModalProps) {
  const initialEmail =
    invoice.cliente?.email &&
    invoice.cliente.email !== 'consumidorfinal@cafeteria.com' &&
    invoice.cliente.email !== 'no-email@cafeteria.com' &&
    invoice.cliente.email !== 'cliente@factura.com'
      ? invoice.cliente.email
      : '';
  const [recipientEmail, setRecipientEmail] = useState(initialEmail);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailFeedback, setEmailFeedback] = useState<{ success: boolean; message: string } | null>(null);
  const isPrintingRef = useRef(false);

  const handleThermalPrint = () => {
    if (isPrintingRef.current) return;
    isPrintingRef.current = true;
    window.print();
    setTimeout(() => {
      isPrintingRef.current = false;
    }, 1200);
  };

  useEffect(() => {
    if (autoPrintThermal) {
      const t = setTimeout(() => {
        handleThermalPrint();
      }, 250);
      return () => clearTimeout(t);
    }
  }, [autoPrintThermal]);

  const handleDownloadXml = () => {
    const xml = generateSriAuthorizedXml(invoice, company);
    const blob = new Blob([xml], { type: 'application/xml;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `XML_AUTORIZADO_${invoice.numeroComprobante}_${invoice.claveAcceso}.xml`;
    link.click();
  };

  const handleDownloadRide = () => {
    exportInvoiceRidePdf(invoice, company);
  };

  const handleSendEmail = async () => {
    setIsSendingEmail(true);
    setEmailFeedback(null);
    const res = await sendInvoiceRideAndXmlEmail(invoice, company, recipientEmail);
    setIsSendingEmail(false);
    setEmailFeedback({
      success: res.success,
      message: res.success
        ? res.message || `¡RIDE PDF y XML Autorizado enviados a ${recipientEmail}!`
        : res.error || 'No se pudo enviar el correo.',
    });
  };

  const nombreComercial = company.nombreComercial || company.razonSocial || 'MI CAFETERÍA';
  const razonSocialEmisor = company.razonSocial || company.nombreComercial || 'MI CAFETERÍA';
  const dirMatriz = company.dirMatriz || 'Quito, Ecuador';
  const dirSucursal = company.dirEstablecimiento || company.dirMatriz || 'Quito, Ecuador';
  const fechaEmisionFormatted = formatDateDdMmYyyy(invoice.fechaEmision);
  const fechaAutorizacionFormatted = invoice.fechaAutorizacion
    ? invoice.fechaAutorizacion.replace(/^(\d{4})-(\d{2})-(\d{2})/, '$3/$2/$1')
    : `${fechaEmisionFormatted}, ${new Date().toLocaleTimeString('es-EC')}`;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 animate-fade-in">
      <div className="bg-white border-4 border-black rounded-2xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] w-full max-w-4xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
        {/* Barra Superior del Modal */}
        <div className="bg-pink-400 border-b-4 border-black px-5 py-3 flex items-center justify-between text-black shrink-0">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 stroke-[3]" />
            <h3 className="font-black uppercase tracking-wider text-xs sm:text-sm">
              Vista Previa RIDE Oficial SRI • {invoice.numeroComprobante}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white border-2 border-black hover:bg-zinc-200 text-black flex items-center justify-center font-black cursor-pointer shadow-[2px_2px_0px_0px_#000]"
          >
            ✕
          </button>
        </div>

        {/* Documento RIDE Formato Oficial SRI Ecuador */}
        <div className="p-4 sm:p-7 overflow-y-auto max-h-[74vh] bg-white text-black font-sans text-[11px] leading-snug space-y-3">
          {/* 1. SECCIÓN SUPERIOR: IZQUIERDA (LOGO + CUADRO EMISOR) Y DERECHA (CUADRO RUC / AUTORIZACIÓN / CÓDIGO DE BARRAS) */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-stretch">
            {/* Columna Izquierda: Logo arriba + Cuadro redondeado de Emisor abajo */}
            <div className="md:col-span-6 flex flex-col justify-between gap-2">
              {/* Área de Logo centrada */}
              <div className="flex flex-col items-center justify-center py-2 min-h-[95px]">
                {company.logoUrl ? (
                  <img
                    src={company.logoUrl}
                    alt={nombreComercial}
                    className="max-h-24 max-w-[240px] object-contain"
                  />
                ) : (
                  <div className="flex flex-col items-center text-center">
                    <div className="w-14 h-14 rounded-xl bg-pink-500 border-2 border-black flex items-center justify-center text-white font-black text-2xl shadow-[2px_2px_0px_0px_#000] mb-1">
                      {nombreComercial.charAt(0).toUpperCase()}
                    </div>
                    <div className="font-black text-lg tracking-tight uppercase text-black leading-none">
                      {nombreComercial}
                    </div>
                  </div>
                )}
              </div>

              {/* Cuadro Redondeado de Datos del Emisor */}
              <div className="border border-black rounded-xl p-3.5 flex flex-col justify-between space-y-2">
                <div className="space-y-1">
                  <p className="font-bold text-xs uppercase text-black leading-tight">
                    {razonSocialEmisor}
                  </p>
                  {nombreComercial && (
                    <p className="font-bold text-xs uppercase text-black leading-tight">
                      {nombreComercial}
                    </p>
                  )}
                </div>

                <div className="space-y-1 text-[10.5px]">
                  <div>
                    <p className="text-zinc-800">Dirección Matriz:</p>
                    <p className="uppercase">{dirMatriz}</p>
                  </div>
                  <div>
                    <p className="text-zinc-800">Dirección Sucursal:</p>
                    <p className="uppercase">{dirSucursal}</p>
                  </div>
                  {company.contribuyenteEspecial && (
                    <p>
                      <span>Contribuyente Especial Nro: </span>
                      <strong className="uppercase">{company.contribuyenteEspecial}</strong>
                    </p>
                  )}
                  {company.agenteRetencion && (
                    <p>
                      <span>Agente de Retención Resolución Nro: </span>
                      <strong className="uppercase">{company.agenteRetencion}</strong>
                    </p>
                  )}
                </div>

                <div className="pt-1 space-y-0.5">
                  <p className="font-bold text-[10.5px] uppercase">
                    OBLIGADO A LLEVAR CONTABILIDAD: {company.obligadoContabilidad || 'NO'}
                  </p>
                  {company.regimenTributario === 'RIMPE_EMPRENDEDOR' && (
                    <p className="font-bold text-[10px] uppercase">CONTRIBUYENTE RÉGIMEN RIMPE</p>
                  )}
                  {company.regimenTributario === 'RIMPE_NEGOCIO_POPULAR' && (
                    <p className="font-bold text-[10px] uppercase">
                      CONTRIBUYENTE NEGOCIO POPULAR - RÉGIMEN RIMPE
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Columna Derecha: Cuadro Redondeado R.U.C., FACTURA, Autorización y Código de Barras */}
            <div className="md:col-span-6 border border-black rounded-xl p-4 flex flex-col justify-between space-y-2.5">
              <div className="space-y-1.5">
                <p className="font-bold text-sm sm:text-base text-black">
                  R.U.C.: {company.ruc || '1725403883001'}
                </p>
                <p className="font-bold text-base sm:text-lg uppercase text-black tracking-wide">
                  {documentLabel}
                </p>
                <p className="font-bold text-xs sm:text-sm text-black">
                  No. {invoice.numeroComprobante}
                </p>
              </div>

              <div className="space-y-1">
                <p className="font-bold text-[10.5px] uppercase text-black">
                  NÚMERO DE AUTORIZACIÓN:
                </p>
                <p className="font-mono text-[10px] break-all text-black leading-tight">
                  {invoice.numeroAutorizacion || invoice.claveAcceso}
                </p>
              </div>

              <div className="grid grid-cols-12 gap-y-1.5 text-[10.5px] items-center">
                <div className="col-span-6 font-bold uppercase leading-tight">
                  FECHA Y HORA DE<br />AUTORIZACIÓN:
                </div>
                <div className="col-span-6 text-black">
                  {fechaAutorizacionFormatted}
                </div>

                <div className="col-span-6 font-bold uppercase">AMBIENTE:</div>
                <div className="col-span-6 uppercase">
                  {company.ambiente === '2' ? 'PRODUCCIÓN' : 'PRUEBAS'}
                </div>

                <div className="col-span-6 font-bold uppercase">EMISIÓN:</div>
                <div className="col-span-6 uppercase">NORMAL</div>
              </div>

              {/* Código de Barras de Clave de Acceso */}
              <div className="pt-2">
                <div className="w-full px-1">{renderBarcodeBars(invoice.claveAcceso)}</div>
                <p className="text-center font-mono text-[9.5px] tracking-tight mt-0.5 break-all">
                  {invoice.claveAcceso}
                </p>
              </div>
            </div>
          </div>

          {/* 2. SECCIÓN DATOS DEL CLIENTE (Cuadro Redondeado de Ancho Completo) */}
          <div className="border border-black rounded-xl p-3 grid grid-cols-1 sm:grid-cols-12 gap-y-1 gap-x-4 text-[11px]">
            <div className="sm:col-span-8 grid grid-cols-12 gap-y-1 items-baseline">
              <span className="col-span-5 text-zinc-800">Razón Social / Nombres y Apellidos:</span>
              <span className="col-span-7 font-bold uppercase">{invoice.cliente?.razonSocial || 'CONSUMIDOR FINAL'}</span>

              <span className="col-span-5 text-zinc-800">Identificación:</span>
              <span className="col-span-7 font-bold">{invoice.cliente?.identificacion || '9999999999999'}</span>

              <span className="col-span-5 text-zinc-800">Fecha:</span>
              <span className="col-span-7 font-bold">{fechaEmisionFormatted}</span>

              <span className="col-span-5 text-zinc-800">Dirección:</span>
              <span className="col-span-7 uppercase">{invoice.cliente?.direccion || 'S/N'}</span>
            </div>

            <div className="sm:col-span-4 grid grid-cols-12 gap-y-1 items-baseline content-start">
              <span className="col-span-6 text-zinc-800">Placa / Matrícula:</span>
              <span className="col-span-6"></span>

              <span className="col-span-6 text-zinc-800">Guía:</span>
              <span className="col-span-6"></span>
            </div>
          </div>

          {/* 3. TABLA DE DETALLES / PRODUCTOS CON BORDES COMPLETOS */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-black text-[10px]">
              <thead>
                <tr className="font-bold text-center text-black">
                  <th className="border border-black px-1.5 py-1.5 w-14">Cod.<br />Principal</th>
                  <th className="border border-black px-1.5 py-1.5 w-14">Cod.<br />Auxiliar</th>
                  <th className="border border-black px-1.5 py-1.5 w-14">Cantidad</th>
                  <th className="border border-black px-2 py-1.5 text-left">Descripción</th>
                  <th className="border border-black px-1.5 py-1.5 w-20">Detalle<br />Adicional</th>
                  <th className="border border-black px-1.5 py-1.5 w-16">Precio<br />Unitario</th>
                  <th className="border border-black px-1.5 py-1.5 w-14">Subsidio</th>
                  <th className="border border-black px-1.5 py-1.5 w-16">Precio sin<br />Subsidio</th>
                  <th className="border border-black px-1.5 py-1.5 w-16">Descuento</th>
                  <th className="border border-black px-1.5 py-1.5 w-16">Precio<br />Total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((it, i) => {
                  const pUnitSinIva =
                    it.cantidad > 0
                      ? (it.precioTotalSinImpuesto + (it.descuento || 0)) / it.cantidad
                      : it.precioUnitario;
                  const cod = '0101';
                  return (
                    <tr key={i} className="text-black">
                      <td className="border border-black px-1.5 py-1.5 text-left font-mono">{cod}</td>
                      <td className="border border-black px-1.5 py-1.5 text-left font-mono">{cod}</td>
                      <td className="border border-black px-1.5 py-1.5 text-left font-mono">
                        {Number(it.cantidad).toFixed(2)}
                      </td>
                      <td className="border border-black px-2 py-1.5 text-left uppercase">
                        {it.descripcion}
                      </td>
                      <td className="border border-black px-1.5 py-1.5 text-left"></td>
                      <td className="border border-black px-1.5 py-1.5 text-left font-mono">
                        ${pUnitSinIva.toFixed(2)}
                      </td>
                      <td className="border border-black px-1.5 py-1.5 text-left font-mono">0.00</td>
                      <td className="border border-black px-1.5 py-1.5 text-left font-mono">0.00</td>
                      <td className="border border-black px-1.5 py-1.5 text-left font-mono">
                        ${Number(it.descuento || 0).toFixed(2)}
                      </td>
                      <td className="border border-black px-1.5 py-1.5 text-left font-mono">
                        ${Number(it.precioTotalSinImpuesto).toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 4. SECCIÓN INFERIOR: IZQUIERDA (INFO ADICIONAL + FORMA DE PAGO) Y DERECHA (TABLA DE SUBTOTALES + SUBSIDIO) */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start pt-1">
            {/* Izquierda: Información Adicional y Forma de Pago */}
            <div className="md:col-span-7 space-y-3">
              {/* Tabla Información Adicional */}
              <table className="w-full border-collapse border border-black text-[10.5px]">
                <thead>
                  <tr>
                    <th colSpan={2} className="border border-black py-1 px-2 text-center font-normal">
                      Información Adicional
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border-t border-black py-1.5 px-2.5 w-28">email:</td>
                    <td className="border-t border-black py-1.5 px-2.5">
                      {invoice.cliente?.email || company.email || 'clientes@cafeteria.com'}
                    </td>
                  </tr>
                  {invoice.cliente?.telefono && (
                    <tr>
                      <td className="border-t border-black py-1 px-2.5">teléfono:</td>
                      <td className="border-t border-black py-1 px-2.5">{invoice.cliente.telefono}</td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Tabla Forma de Pago */}
              <table className="w-full border-collapse border border-black text-[10.5px]">
                <thead>
                  <tr className="font-bold text-center">
                    <th className="border border-black py-1 px-2">Forma de pago</th>
                    <th className="border border-black py-1 px-2 w-24">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {(invoice.pagos && invoice.pagos.length > 0
                    ? invoice.pagos
                    : [{ formaPago: '01', total: invoice.importeTotal }]
                  ).map((p, idx) => (
                    <tr key={idx}>
                      <td className="border border-black py-1.5 px-2.5 uppercase">
                        {getFormaPagoLabel(p.formaPago)}
                      </td>
                      <td className="border border-black py-1.5 px-2.5 text-right font-mono">
                        {Number(p.total).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Derecha: Tabla de Subtotales/IVA y Cuadro de Subsidio */}
            <div className="md:col-span-5 space-y-2">
              <table className="w-full border-collapse border border-black text-[10px]">
                <tbody>
                  <tr className="border border-black">
                    <td className="py-0.5 px-2 uppercase">SUBTOTAL 15%</td>
                    <td className="py-0.5 px-2 text-right font-mono w-20">
                      {Number(invoice.subtotal15 || 0).toFixed(2)}
                    </td>
                  </tr>
                  {invoice.subtotal5 > 0 && (
                    <tr className="border border-black">
                      <td className="py-0.5 px-2 uppercase">SUBTOTAL 8% / 5%</td>
                      <td className="py-0.5 px-2 text-right font-mono">
                        {Number(invoice.subtotal5 || 0).toFixed(2)}
                      </td>
                    </tr>
                  )}
                  {invoice.subtotal0 > 0 && (
                    <tr className="border border-black">
                      <td className="py-0.5 px-2 uppercase">SUBTOTAL 0%</td>
                      <td className="py-0.5 px-2 text-right font-mono">
                        {Number(invoice.subtotal0 || 0).toFixed(2)}
                      </td>
                    </tr>
                  )}
                  <tr className="border border-black">
                    <td className="py-0.5 px-2 uppercase">SUBTOTAL NO OBJETO DE IVA</td>
                    <td className="py-0.5 px-2 text-right font-mono">
                      {Number(invoice.subtotalNoObjeto || 0).toFixed(2)}
                    </td>
                  </tr>
                  <tr className="border border-black">
                    <td className="py-0.5 px-2 uppercase">SUBTOTAL EXENTO DE IVA</td>
                    <td className="py-0.5 px-2 text-right font-mono">
                      {Number(invoice.subtotalExento || 0).toFixed(2)}
                    </td>
                  </tr>
                  <tr className="border border-black">
                    <td className="py-0.5 px-2 uppercase">SUBTOTAL SIN IMPUESTOS</td>
                    <td className="py-0.5 px-2 text-right font-mono">
                      {Number(invoice.subtotalSinImpuestos || 0).toFixed(2)}
                    </td>
                  </tr>
                  <tr className="border border-black">
                    <td className="py-0.5 px-2 uppercase">TOTAL DESCUENTO</td>
                    <td className="py-0.5 px-2 text-right font-mono">
                      {Number(invoice.totalDescuento || 0).toFixed(2)}
                    </td>
                  </tr>
                  <tr className="border border-black">
                    <td className="py-0.5 px-2 uppercase">ICE</td>
                    <td className="py-0.5 px-2 text-right font-mono">0.00</td>
                  </tr>
                  <tr className="border border-black">
                    <td className="py-0.5 px-2 uppercase">IRBPNR</td>
                    <td className="py-0.5 px-2 text-right font-mono">0.00</td>
                  </tr>
                  <tr className="border border-black">
                    <td className="py-0.5 px-2 uppercase">IVA 15%</td>
                    <td className="py-0.5 px-2 text-right font-mono">
                      {Number(invoice.totalIva || 0).toFixed(2)}
                    </td>
                  </tr>
                  <tr className="border border-black">
                    <td className="py-0.5 px-2 uppercase">PROPINA</td>
                    <td className="py-0.5 px-2 text-right font-mono">
                      {Number(invoice.propina || 0).toFixed(2)}
                    </td>
                  </tr>
                  <tr className="border border-black font-bold">
                    <td className="py-1 px-2 uppercase">VALOR TOTAL</td>
                    <td className="py-1 px-2 text-right font-mono">
                      {Number(invoice.importeTotal || 0).toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Cuadro de Subsidio */}
              <div className="border border-black p-2 text-[10px] font-bold space-y-0.5">
                <div className="flex justify-between">
                  <span>VALOR TOTAL SIN SUBSIDIO</span>
                  <span className="font-mono">0.00</span>
                </div>
                <div className="flex justify-between">
                  <span>AHORRO POR SUBSIDIO:</span>
                  <span className="font-mono">0.00</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Barra de envío directo por SMTP (RIDE PDF + XML Autorizado) */}
        <div className="bg-emerald-100 border-t-3 border-black px-5 py-2.5 space-y-2 shrink-0">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="flex items-center gap-1.5 text-[11px] font-black uppercase text-black shrink-0">
              <Mail className="w-4 h-4 stroke-[2.5]" />
              <span>Enviar RIDE + XML al Cliente:</span>
            </div>
            <input
              type="email"
              placeholder="correo@cliente.com"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              className="flex-1 bg-white border-2 border-black rounded-lg px-3 py-1.5 text-xs font-bold text-black focus:outline-none"
            />
            <button
              type="button"
              disabled={isSendingEmail}
              onClick={handleSendEmail}
              className="px-4 py-1.5 bg-emerald-400 hover:bg-emerald-500 border-2 border-black rounded-lg text-xs font-black uppercase tracking-wider cursor-pointer shadow-[2px_2px_0px_0px_#000] flex items-center justify-center gap-1.5 text-black shrink-0"
            >
              {isSendingEmail ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  <span>Enviando SMTP...</span>
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4 stroke-[2.5]" />
                  <span>Enviar RIDE + XML</span>
                </>
              )}
            </button>
          </div>
          {emailFeedback && (
            <div
              className={`flex items-center gap-1.5 text-[11px] font-black px-2.5 py-1 rounded border border-black ${
                emailFeedback.success ? 'bg-lime-300 text-black' : 'bg-rose-200 text-rose-950'
              }`}
            >
              {emailFeedback.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-900 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-800 shrink-0" />
              )}
              <span>{emailFeedback.message}</span>
            </div>
          )}
        </div>

        {/* Botones Inferiores del Modal */}
        <div className="bg-zinc-100 border-t-4 border-black px-5 py-3 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadXml}
              className="px-3.5 py-2 bg-cyan-300 hover:bg-cyan-400 border-2 border-black rounded-lg text-xs font-black uppercase tracking-wider cursor-pointer shadow-[2px_2px_0px_0px_#000] flex items-center gap-1.5"
            >
              <Download className="w-4 h-4 stroke-[2.5]" />
              <span>Descargar XML</span>
            </button>
            {onViewTicket && (
              <button
                type="button"
                onClick={onViewTicket}
                className="px-3.5 py-2 bg-white hover:bg-zinc-200 border-2 border-black rounded-lg text-xs font-black uppercase tracking-wider cursor-pointer shadow-[2px_2px_0px_0px_#000] flex items-center gap-1.5 text-black"
              >
                <Receipt className="w-4 h-4 stroke-[2.5]" />
                <span>Ver Ticket POS</span>
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleThermalPrint}
              className="px-4 py-2 bg-lime-300 hover:bg-lime-400 border-2 border-black rounded-lg text-xs font-black uppercase tracking-wider cursor-pointer shadow-[2px_2px_0px_0px_#000] flex items-center gap-1.5 text-black"
            >
              <Printer className="w-4 h-4 stroke-[2.5]" />
              <span>Imprimir en Térmica (80mm)</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadRide}
              className="px-4 py-2 bg-yellow-300 hover:bg-yellow-400 border-2 border-black rounded-lg text-xs font-black uppercase tracking-wider cursor-pointer shadow-[2px_2px_0px_0px_#000] flex items-center gap-1.5 text-black"
            >
              <Download className="w-4 h-4 stroke-[2.5]" />
              <span>Descargar RIDE PDF</span>
            </button>
          </div>
        </div>

        {/* ================================================================= */}
        {/* FORMATO TICKET 80MM PARA IMPRESORA TÉRMICA (SOLO EN @MEDIA PRINT) */}
        {/* ================================================================= */}
        <div className="hidden printable-ticket font-retro-mono text-black text-xs leading-snug space-y-2.5 p-2">
          {/* Datos del Emisor */}
          <div className="text-center space-y-0.5 border-b-2 border-dashed border-black pb-2">
            <h4 className="font-black uppercase text-sm">{nombreComercial}</h4>
            <p className="font-bold uppercase text-[11px]">{razonSocialEmisor}</p>
            <p className="font-bold text-[11px]">R.U.C.: {company.ruc || '1725403883001'}</p>
            <p className="uppercase text-[10px]">Matriz: {dirMatriz}</p>
            <p className="uppercase text-[10px]">Sucursal: {dirSucursal}</p>
            <p className="font-bold uppercase text-[10px]">
              OBLIGADO A LLEVAR CONTABILIDAD: {company.obligadoContabilidad || 'NO'}
            </p>
          </div>

          {/* Datos Tributarios de la Factura SRI */}
          <div className="space-y-0.5 border-b-2 border-dashed border-black pb-2 text-[10px]">
            <p className="font-black text-center uppercase text-xs">
              *** {documentLabel} ELECTRÓNICA ***
            </p>
            <div className="flex justify-between font-bold">
              <span>No.:</span>
              <span>{invoice.numeroComprobante}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-bold">AMBIENTE:</span>
              <span>{company.ambiente === '2' ? 'PRODUCCIÓN' : 'PRUEBAS'}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-bold">EMISIÓN:</span>
              <span>NORMAL</span>
            </div>
            <div className="pt-0.5">
              <p className="font-bold">FECHA Y HORA AUTORIZACIÓN:</p>
              <p>{fechaAutorizacionFormatted}</p>
            </div>
            <div className="pt-0.5">
              <p className="font-bold">NÚMERO DE AUTORIZACIÓN / CLAVE DE ACCESO:</p>
              <p className="break-all font-bold text-[9.5px]">{invoice.claveAcceso}</p>
            </div>
          </div>

          {/* Datos del Cliente */}
          <div className="space-y-0.5 border-b-2 border-dashed border-black pb-2 text-[10px]">
            <div>
              <span className="font-bold">CLIENTE: </span>
              <span className="uppercase font-bold">
                {invoice.cliente?.razonSocial || 'CONSUMIDOR FINAL'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>
                <strong>RUC/CI:</strong> {invoice.cliente?.identificacion || '9999999999999'}
              </span>
              <span>
                <strong>FECHA:</strong> {fechaEmisionFormatted}
              </span>
            </div>
            <div>
              <span className="font-bold">DIRECCIÓN: </span>
              <span className="uppercase">{invoice.cliente?.direccion || 'S/N'}</span>
            </div>
            {invoice.cliente?.email && (
              <div>
                <span className="font-bold">EMAIL: </span>
                <span>{invoice.cliente.email}</span>
              </div>
            )}
          </div>

          {/* Detalle de Productos */}
          <div className="border-b-2 border-dashed border-black pb-2 space-y-1 text-[10px]">
            <div className="flex justify-between font-black border-b border-dashed border-black pb-0.5">
              <span className="w-12">COD</span>
              <span className="w-10 text-center">CANT</span>
              <span className="flex-1 px-1">DESCRIPCIÓN</span>
              <span className="w-14 text-right">P.UNIT</span>
              <span className="w-14 text-right">TOTAL</span>
            </div>
            {invoice.items.map((it, idx) => {
              const pUnitSinIva =
                it.cantidad > 0
                  ? (it.precioTotalSinImpuesto + (it.descuento || 0)) / it.cantidad
                  : it.precioUnitario;
              return (
                <div key={idx} className="flex justify-between items-start font-bold">
                  <span className="w-12">0101</span>
                  <span className="w-10 text-center">{Number(it.cantidad).toFixed(2)}</span>
                  <span className="flex-1 px-1 uppercase break-words">{it.descripcion}</span>
                  <span className="w-14 text-right">${pUnitSinIva.toFixed(2)}</span>
                  <span className="w-14 text-right">
                    ${Number(it.precioTotalSinImpuesto).toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Subtotales, IVA y Valor Total */}
          <div className="border-b-2 border-dashed border-black pb-2 space-y-0.5 text-[10px]">
            <div className="flex justify-between">
              <span>SUBTOTAL 15%:</span>
              <span>${Number(invoice.subtotal15 || 0).toFixed(2)}</span>
            </div>
            {invoice.subtotal5 > 0 && (
              <div className="flex justify-between">
                <span>SUBTOTAL 8% / 5%:</span>
                <span>${Number(invoice.subtotal5 || 0).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>SUBTOTAL 0%:</span>
              <span>${Number(invoice.subtotal0 || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>SUBTOTAL SIN IMPUESTOS:</span>
              <span>${Number(invoice.subtotalSinImpuestos || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>TOTAL DESCUENTO:</span>
              <span>${Number(invoice.totalDescuento || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>IVA 15%:</span>
              <span>${Number(invoice.totalIva || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-black text-xs pt-1 border-t border-dashed border-black">
              <span>VALOR TOTAL:</span>
              <span>${Number(invoice.importeTotal || 0).toFixed(2)} USD</span>
            </div>
          </div>

          {/* Forma de Pago y Pie */}
          <div className="space-y-1 text-[10px]">
            <div>
              <p className="font-bold uppercase">FORMA DE PAGO:</p>
              {(invoice.pagos && invoice.pagos.length > 0
                ? invoice.pagos
                : [{ formaPago: '01', total: invoice.importeTotal }]
              ).map((p, i) => (
                <div key={i} className="flex justify-between">
                  <span className="uppercase">{getFormaPagoLabel(p.formaPago)}</span>
                  <span className="font-bold">${Number(p.total).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="text-center pt-2 border-t border-dashed border-black">
              <p className="font-black uppercase">¡GRACIAS POR SU COMPRA!</p>
              <p className="text-[9px] uppercase">Comprobante Electrónico SRI</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
