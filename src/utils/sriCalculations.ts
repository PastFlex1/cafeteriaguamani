/**
 * SRI Calculations, Access Key Generator and XML Schemas (v2.1 Off-line)
 * Ecuador SRI Electronic Invoicing
 */

import { ElectronicInvoice, CompanyConfig, CreditNote, InvoiceItem } from '../types';

export const DEFAULT_CONSUMIDOR_FINAL = {
  id: 'cf-9999999999999',
  identificacion: '9999999999999',
  tipoIdentificacion: '07',
  razonSocial: 'CONSUMIDOR FINAL',
  direccion: 'S/N',
  telefono: '9999999999',
  email: 'consumidorfinal@cafeteria.com',
};

export const SRI_FORMAS_PAGO = [
  { codigo: '01', nombre: 'Sin utilización del sistema financiero (Efectivo)' },
  { codigo: '16', nombre: 'Tarjeta de Débito' },
  { codigo: '19', nombre: 'Tarjeta de Crédito' },
  { codigo: '20', nombre: 'Otros con utilización del sistema financiero (Transferencia / Depósito)' },
  { codigo: '17', nombre: 'Dinero Electrónico' },
  { codigo: '18', nombre: 'Tarjeta Prepago' },
  { codigo: '15', nombre: 'Compensación de deudas' },
  { codigo: '21', nombre: 'Endoso de títulos' },
];

/**
 * Escapes characters for XML compliance
 */
export function escapeXml(unsafe?: string | number | null): string {
  if (unsafe === undefined || unsafe === null) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Calculates Modulo 11 for Ecuador SRI 48-digit string to obtain check digit (49th digit)
 */
export function calcularModulo11(clave48: string): number {
  let factor = 2;
  let total = 0;
  for (let i = clave48.length - 1; i >= 0; i--) {
    const digit = parseInt(clave48.charAt(i), 10);
    total += digit * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const residuo = total % 11;
  let digitoVerificador = 11 - residuo;
  if (digitoVerificador === 11) return 0;
  if (digitoVerificador === 10) return 1;
  return digitoVerificador;
}

/**
 * Generates the official 49-digit SRI Access Key (Clave de Acceso)
 */
export function generateAccessKey(params: {
  fechaEmision: string; // YYYY-MM-DD
  tipoComprobante: string; // '01' Factura, '04' Nota de Crédito
  rucEmisor: string;
  ambiente: '1' | '2';
  establecimiento: string;
  puntoEmision: string;
  secuencial: string;
  codigoNumerico?: string;
  tipoEmision?: '1';
}): string {
  // 1. Fecha: ddmmyyyy
  let fechaStr = '01012026';
  if (params.fechaEmision && params.fechaEmision.includes('-')) {
    const [y, m, d] = params.fechaEmision.split('-');
    fechaStr = `${d.padStart(2, '0')}${m.padStart(2, '0')}${y}`;
  }

  // 2. Tipo Comprobante (2 digits)
  const tipoComp = (params.tipoComprobante || '01').padStart(2, '0');

  // 3. RUC (13 digits)
  const ruc = (params.rucEmisor || '9999999999001').padEnd(13, '0').slice(0, 13);

  // 4. Ambiente (1 digit: 1 Pruebas, 2 Producción)
  const amb = params.ambiente === '2' ? '2' : '1';

  // 5. Serie: estab (3) + ptoEmi (3)
  const estab = (params.establecimiento || '001').padStart(3, '0').slice(0, 3);
  const pto = (params.puntoEmision || '001').padStart(3, '0').slice(0, 3);
  const serie = `${estab}${pto}`;

  // 6. Secuencial (9 digits)
  const sec = (params.secuencial || '1').padStart(9, '0').slice(0, 9);

  // 7. Código numérico (8 digits)
  const codNum = (params.codigoNumerico || '12345678').padStart(8, '0').slice(0, 8);

  // 8. Tipo Emisión (1 digit: 1 Normal)
  const tipoEmi = params.tipoEmision || '1';

  const clave48 = `${fechaStr}${tipoComp}${ruc}${amb}${serie}${sec}${codNum}${tipoEmi}`;
  const digitoVerificador = calcularModulo11(clave48);

  return `${clave48}${digitoVerificador}`;
}

/**
 * Generates official SRI Factura XML (v2.1.0 Offline)
 */
export function generateSriInvoiceXml(invoice: ElectronicInvoice, company: CompanyConfig): string {
  let fechaFormatted = '01/01/2026';
  if (invoice.fechaEmision && invoice.fechaEmision.includes('-')) {
    const [y, m, d] = invoice.fechaEmision.split('-');
    fechaFormatted = `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
  }

  const cliente = invoice.cliente || DEFAULT_CONSUMIDOR_FINAL;
  let tipoIdComprador = '07';
  if (cliente.tipoIdentificacion) {
    tipoIdComprador = cliente.tipoIdentificacion;
  } else if (cliente.identificacion.length === 13 && cliente.identificacion !== '9999999999999') {
    tipoIdComprador = '04'; // RUC
  } else if (cliente.identificacion.length === 10) {
    tipoIdComprador = '05'; // Cédula
  } else if (cliente.identificacion === '9999999999999') {
    tipoIdComprador = '07'; // Consumidor Final
  } else {
    tipoIdComprador = '06'; // Pasaporte / Identificación del exterior
  }

  // Calculate grouped taxes for <totalConImpuestos>
  const totalImpuestosXml: string[] = [];
  if (invoice.subtotal15 > 0) {
    totalImpuestosXml.push(`
      <totalImpuesto>
        <codigo>2</codigo>
        <codigoPorcentaje>4</codigoPorcentaje>
        <baseImponible>${invoice.subtotal15.toFixed(2)}</baseImponible>
        <valor>${(invoice.subtotal15 * 0.15).toFixed(2)}</valor>
      </totalImpuesto>`);
  }
  if (invoice.subtotal5 > 0) {
    totalImpuestosXml.push(`
      <totalImpuesto>
        <codigo>2</codigo>
        <codigoPorcentaje>5</codigoPorcentaje>
        <baseImponible>${invoice.subtotal5.toFixed(2)}</baseImponible>
        <valor>${(invoice.subtotal5 * 0.05).toFixed(2)}</valor>
      </totalImpuesto>`);
  }
  if (invoice.subtotal0 > 0) {
    totalImpuestosXml.push(`
      <totalImpuesto>
        <codigo>2</codigo>
        <codigoPorcentaje>0</codigoPorcentaje>
        <baseImponible>${invoice.subtotal0.toFixed(2)}</baseImponible>
        <valor>0.00</valor>
      </totalImpuesto>`);
  }
  if (invoice.subtotalNoObjeto > 0) {
    totalImpuestosXml.push(`
      <totalImpuesto>
        <codigo>2</codigo>
        <codigoPorcentaje>6</codigoPorcentaje>
        <baseImponible>${invoice.subtotalNoObjeto.toFixed(2)}</baseImponible>
        <valor>0.00</valor>
      </totalImpuesto>`);
  }
  if (invoice.subtotalExento > 0) {
    totalImpuestosXml.push(`
      <totalImpuesto>
        <codigo>2</codigo>
        <codigoPorcentaje>7</codigoPorcentaje>
        <baseImponible>${invoice.subtotalExento.toFixed(2)}</baseImponible>
        <valor>0.00</valor>
      </totalImpuesto>`);
  }

  // Items details
  const detallesXml = invoice.items.map((item: InvoiceItem) => {
    let codPorc = '4';
    let tarifa = '15.00';
    if (item.tarifaIva === 5) {
      codPorc = '5';
      tarifa = '5.00';
    } else if (item.tarifaIva === 0) {
      codPorc = '0';
      tarifa = '0.00';
    } else if (item.tarifaIva === 'NO_OBJETO') {
      codPorc = '6';
      tarifa = '0.00';
    } else if (item.tarifaIva === 'EXENTO') {
      codPorc = '7';
      tarifa = '0.00';
    }

    const cleanCod = '0101';

    return `
    <detalle>
      <codigoPrincipal>${cleanCod}</codigoPrincipal>
      <codigoAuxiliar>${cleanCod}</codigoAuxiliar>
      <descripcion>${escapeXml(item.descripcion)}</descripcion>
      <cantidad>${Number(item.cantidad).toFixed(2)}</cantidad>
      <precioUnitario>${Number(item.precioUnitario).toFixed(2)}</precioUnitario>
      <descuento>${Number(item.descuento || 0).toFixed(2)}</descuento>
      <precioTotalSinImpuesto>${Number(item.precioTotalSinImpuesto).toFixed(2)}</precioTotalSinImpuesto>
      <impuestos>
        <impuesto>
          <codigo>2</codigo>
          <codigoPorcentaje>${codPorc}</codigoPorcentaje>
          <tarifa>${tarifa}</tarifa>
          <baseImponible>${Number(item.precioTotalSinImpuesto).toFixed(2)}</baseImponible>
          <valor>${Number(item.valorIva).toFixed(2)}</valor>
        </impuesto>
      </impuestos>
    </detalle>`;
  }).join('');

  // Payments details
  const pagosXml = (invoice.pagos && invoice.pagos.length > 0 ? invoice.pagos : [
    { formaPago: '01', total: invoice.importeTotal, plazo: 0, unidadTiempo: 'DIAS' }
  ]).map(p => `
      <pago>
        <formaPago>${p.formaPago}</formaPago>
        <total>${Number(p.total).toFixed(2)}</total>
        <plazo>${p.plazo || 0}</plazo>
        <unidadTiempo>${p.unidadTiempo || 'DIAS'}</unidadTiempo>
      </pago>`).join('');

  // Info Tributaria regimes
  const regimenMicro = company.regimenTributario === 'RIMPE_EMPRENDEDOR'
    ? '<regimenMicroempresas>CONTRIBUYENTE RÉGIMEN RIMPE</regimenMicroempresas>'
    : '';
  const contribRimpe = company.regimenTributario === 'RIMPE_NEGOCIO_POPULAR'
    ? '<contribuyenteRimpe>CONTRIBUYENTE NEGOCIO POPULAR - RÉGIMEN RIMPE</contribuyenteRimpe>'
    : '';
  const agenteRet = company.agenteRetencion
    ? `<agenteRetencion>${escapeXml(company.agenteRetencion)}</agenteRetencion>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<factura id="comprobante" version="2.1.0">
  <infoTributaria>
    <ambiente>${company.ambiente || '1'}</ambiente>
    <tipoEmision>1</tipoEmision>
    <razonSocial>${escapeXml(company.razonSocial)}</razonSocial>
    <nombreComercial>${escapeXml(company.nombreComercial || company.razonSocial)}</nombreComercial>
    <ruc>${escapeXml(company.ruc)}</ruc>
    <claveAcceso>${invoice.claveAcceso}</claveAcceso>
    <codDoc>01</codDoc>
    <estab>${escapeXml(invoice.establecimiento)}</estab>
    <ptoEmi>${escapeXml(invoice.puntoEmision)}</ptoEmi>
    <secuencial>${escapeXml(invoice.secuencial)}</secuencial>
    <dirMatriz>${escapeXml(company.dirMatriz || 'QUITO, ECUADOR')}</dirMatriz>
    ${regimenMicro}
    ${contribRimpe}
    ${agenteRet}
  </infoTributaria>
  <infoFactura>
    <fechaEmision>${fechaFormatted}</fechaEmision>
    <dirEstablecimiento>${escapeXml(company.dirEstablecimiento || company.dirMatriz || 'QUITO, ECUADOR')}</dirEstablecimiento>
    ${company.contribuyenteEspecial ? `<contribuyenteEspecial>${escapeXml(company.contribuyenteEspecial)}</contribuyenteEspecial>` : ''}
    <obligadoContabilidad>${company.obligadoContabilidad || 'NO'}</obligadoContabilidad>
    <tipoIdentificacionComprador>${tipoIdComprador}</tipoIdentificacionComprador>
    <razonSocialComprador>${escapeXml(cliente.razonSocial)}</razonSocialComprador>
    <identificacionComprador>${escapeXml(cliente.identificacion)}</identificacionComprador>
    <direccionComprador>${escapeXml(cliente.direccion || 'S/N')}</direccionComprador>
    <totalSinImpuestos>${invoice.subtotalSinImpuestos.toFixed(2)}</totalSinImpuestos>
    <totalDescuento>${invoice.totalDescuento.toFixed(2)}</totalDescuento>
    <totalConImpuestos>${totalImpuestosXml.join('')}
    </totalConImpuestos>
    <propina>${(invoice.propina || 0).toFixed(2)}</propina>
    <importeTotal>${invoice.importeTotal.toFixed(2)}</importeTotal>
    <moneda>DOLAR</moneda>
    <pagos>${pagosXml}
    </pagos>
  </infoFactura>
  <detalles>${detallesXml}
  </detalles>
  <infoAdicional>
    <campoAdicional nombre="Email">${escapeXml(cliente.email || 'no-email@cafeteria.com')}</campoAdicional>
    <campoAdicional nombre="Telefono">${escapeXml(cliente.telefono || '999999999')}</campoAdicional>
    <campoAdicional nombre="Observaciones">${escapeXml(invoice.observaciones || 'Consumo Cafetería')}</campoAdicional>
  </infoAdicional>
</factura>`;
}

/**
 * Generates the official SRI Authorized XML wrapper (<autorizacion>) containing the signed/authorized <factura>
 */
export function generateSriAuthorizedXml(invoice: ElectronicInvoice, company: CompanyConfig): string {
  const innerXml = invoice.xml || generateSriInvoiceXml(invoice, company);
  const ambienteStr = company.ambiente === '2' ? 'PRODUCCION' : 'PRUEBAS';
  const fechaAut = invoice.fechaAutorizacion || `${invoice.fechaEmision} ${new Date().toLocaleTimeString('es-EC')}`;
  const numAut = invoice.numeroAutorizacion || invoice.claveAcceso;

  return `<?xml version="1.0" encoding="UTF-8"?>
<autorizacion>
  <estado>${invoice.estado || 'AUTORIZADO'}</estado>
  <numeroAutorizacion>${escapeXml(numAut)}</numeroAutorizacion>
  <fechaAutorizacion>${escapeXml(fechaAut)}</fechaAutorizacion>
  <ambiente>${ambienteStr}</ambiente>
  <comprobante><![CDATA[${innerXml}]]></comprobante>
  <mensajes/>
</autorizacion>`;
}

/**
 * Generates official SRI Nota de Crédito XML (v1.1.0 Offline)
 */
export function generateSriCreditNoteXml(creditNote: CreditNote, company: CompanyConfig): string {
  let fechaFormatted = '01/01/2026';
  if (creditNote.fechaEmision && creditNote.fechaEmision.includes('-')) {
    const [y, m, d] = creditNote.fechaEmision.split('-');
    fechaFormatted = `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
  }

  let fechaDocModFormatted = '01/01/2026';
  if (creditNote.documentoModificado?.fechaEmision && creditNote.documentoModificado.fechaEmision.includes('-')) {
    const [y, m, d] = creditNote.documentoModificado.fechaEmision.split('-');
    fechaDocModFormatted = `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
  }

  const cliente = creditNote.cliente || DEFAULT_CONSUMIDOR_FINAL;
  const tipoIdComprador = cliente.tipoIdentificacion || (cliente.identificacion.length === 13 ? '04' : '05');

  return `<?xml version="1.0" encoding="UTF-8"?>
<notaCredito id="comprobante" version="1.1.0">
  <infoTributaria>
    <ambiente>${company.ambiente || '1'}</ambiente>
    <tipoEmision>1</tipoEmision>
    <razonSocial>${escapeXml(company.razonSocial)}</razonSocial>
    <nombreComercial>${escapeXml(company.nombreComercial || company.razonSocial)}</nombreComercial>
    <ruc>${escapeXml(company.ruc)}</ruc>
    <claveAcceso>${creditNote.claveAcceso}</claveAcceso>
    <codDoc>04</codDoc>
    <estab>${escapeXml(creditNote.establecimiento)}</estab>
    <ptoEmi>${escapeXml(creditNote.puntoEmision)}</ptoEmi>
    <secuencial>${escapeXml(creditNote.secuencial)}</secuencial>
    <dirMatriz>${escapeXml(company.dirMatriz || 'QUITO, ECUADOR')}</dirMatriz>
  </infoTributaria>
  <infoNotaCredito>
    <fechaEmision>${fechaFormatted}</fechaEmision>
    <dirEstablecimiento>${escapeXml(company.dirEstablecimiento || company.dirMatriz || 'QUITO, ECUADOR')}</dirEstablecimiento>
    <tipoIdentificacionComprador>${tipoIdComprador}</tipoIdentificacionComprador>
    <razonSocialComprador>${escapeXml(cliente.razonSocial)}</razonSocialComprador>
    <identificacionComprador>${escapeXml(cliente.identificacion)}</identificacionComprador>
    <obligadoContabilidad>${company.obligadoContabilidad || 'NO'}</obligadoContabilidad>
    <codDocModificado>${creditNote.documentoModificado.tipo || '01'}</codDocModificado>
    <numDocModificado>${creditNote.documentoModificado.numero}</numDocModificado>
    <fechaEmisionDocSustento>${fechaDocModFormatted}</fechaEmisionDocSustento>
    <totalSinImpuestos>${creditNote.subtotalSinImpuestos.toFixed(2)}</totalSinImpuestos>
    <valorModificacion>${creditNote.valorModificacion.toFixed(2)}</valorModificacion>
    <moneda>DOLAR</moneda>
    <motivo>${escapeXml(creditNote.motivo || 'Anulación de Factura')}</motivo>
  </infoNotaCredito>
</notaCredito>`;
}
