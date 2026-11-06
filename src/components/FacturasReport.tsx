/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  FileText, 
  Search, 
  Download, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Eye, 
  Copy, 
  Check, 
  ShieldCheck, 
  Building2,
  DollarSign,
  ArrowUpRight
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { ElectronicInvoice } from '../types';
import RetroSelect from './RetroSelect';
import { formatNum } from '../utils';

interface FacturasReportProps {
  invoices: ElectronicInvoice[];
  filterPeriod: string;
}

export default function FacturasReport({ invoices, filterPeriod }: FacturasReportProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTax, setFilterTax] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedInvoice, setSelectedInvoice] = useState<ElectronicInvoice | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  // Filtered invoices
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      // Status filter
      if (filterStatus !== 'all' && inv.estado !== filterStatus) return false;
      // Tax filter
      if (filterTax === 'iva15' && (!inv.subtotal15 || inv.subtotal15 <= 0)) return false;
      if (filterTax === 'iva0' && (!inv.subtotal0 || inv.subtotal0 <= 0)) return false;
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const numMatch = (inv.numeroComprobante || '').toLowerCase().includes(q) || (inv.secuencial || '').includes(q);
        const rucMatch = (inv.cliente?.identificacion || '').toLowerCase().includes(q);
        const nameMatch = (inv.cliente?.razonSocial || '').toLowerCase().includes(q);
        const keyMatch = (inv.claveAcceso || '').toLowerCase().includes(q);
        if (!numMatch && !rucMatch && !nameMatch && !keyMatch) return false;
      }
      return true;
    });
  }, [invoices, filterStatus, filterTax, searchQuery]);

  // Reset page when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterTax, filterStatus, filterPeriod]);

  // Metrics (excluding ANULADO for totals)
  const validInvoices = useMemo(() => filteredInvoices.filter(i => i.estado !== 'ANULADO'), [filteredInvoices]);
  const totalFacturado = useMemo(() => validInvoices.reduce((acc, i) => acc + i.importeTotal, 0), [validInvoices]);
  const totalIva = useMemo(() => validInvoices.reduce((acc, i) => acc + i.totalIva, 0), [validInvoices]);
  const totalSubtotal15 = useMemo(() => validInvoices.reduce((acc, i) => acc + (i.subtotal15 || 0), 0), [validInvoices]);
  const totalSubtotal0 = useMemo(() => validInvoices.reduce((acc, i) => acc + (i.subtotal0 || 0), 0), [validInvoices]);
  const totalDescuentos = useMemo(() => validInvoices.reduce((acc, i) => acc + (i.totalDescuento || 0), 0), [validInvoices]);

  const autorizadasCount = useMemo(() => filteredInvoices.filter(i => i.estado === 'AUTORIZADO').length, [filteredInvoices]);
  const pendientesCount = useMemo(() => filteredInvoices.filter(i => i.estado === 'PENDIENTE').length, [filteredInvoices]);
  const anuladasCount = useMemo(() => filteredInvoices.filter(i => i.estado === 'ANULADO').length, [filteredInvoices]);

  // Copy Clave Acceso
  const handleCopyClave = (clave: string) => {
    navigator.clipboard.writeText(clave);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  // PDF Export
  const downloadPdf = () => {
    const doc = new jsPDF();
    const businessName = localStorage.getItem('caf_business_name') || 'moccapricho';

    // Header banner
    doc.setFillColor(15, 23, 42); // Slate 900
    doc.rect(0, 0, 210, 38, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text(`REPORTE FISCAL DE FACTURAS SRI - ${businessName.toUpperCase()}`, 15, 16);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text('COMPROBANTES ELECTRÓNICOS Y CONTROL TRIBUTARIO (SRI ECUADOR)', 15, 23);
    doc.text(`Generado: ${new Date().toLocaleString('es-ES')} | Periodo: ${filterPeriod.toUpperCase()}`, 15, 30);

    let y = 48;

    // KPI Boxes
    doc.setFillColor(243, 244, 246);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.4);

    doc.rect(15, y, 42, 18, 'F');
    doc.rect(15, y, 42, 18, 'D');
    doc.rect(60, y, 42, 18, 'F');
    doc.rect(60, y, 42, 18, 'D');
    doc.rect(105, y, 42, 18, 'F');
    doc.rect(105, y, 42, 18, 'D');
    doc.rect(150, y, 45, 18, 'F');
    doc.rect(150, y, 45, 18, 'D');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text('TOTAL FACTURADO', 18, y + 5);
    doc.text('TOTAL IVA GENERADO', 63, y + 5);
    doc.text('BASE GRAVADA 15%', 108, y + 5);
    doc.text('BASE TARIFA 0%', 153, y + 5);

    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text(`$${formatNum(totalFacturado)}`, 18, y + 12);
    doc.text(`$${formatNum(totalIva)}`, 63, y + 12);
    doc.text(`$${formatNum(totalSubtotal15)}`, 108, y + 12);
    doc.text(`$${formatNum(totalSubtotal0)}`, 153, y + 12);

    y += 26;

    // Table Header
    doc.setFillColor(15, 23, 42);
    doc.rect(15, y, 180, 8, 'F');
    doc.rect(15, y, 180, 8, 'D');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text('N° FACTURA', 18, y + 5.5);
    doc.text('FECHA', 50, y + 5.5);
    doc.text('RUC / CÉDULA', 72, y + 5.5);
    doc.text('CLIENTE', 104, y + 5.5);
    doc.text('BASE 15%', 142, y + 5.5, { align: 'right' });
    doc.text('IVA', 165, y + 5.5, { align: 'right' });
    doc.text('TOTAL', 190, y + 5.5, { align: 'right' });

    y += 8;

    let rowsOnPage = 0;
    filteredInvoices.forEach((inv, idx) => {
      if (rowsOnPage >= 14) {
        doc.addPage();
        rowsOnPage = 0;
        y = 20;

        doc.setFillColor(15, 23, 42);
        doc.rect(15, y, 180, 8, 'F');
        doc.rect(15, y, 180, 8, 'D');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(255, 255, 255);
        doc.text('N° FACTURA', 18, y + 5.5);
        doc.text('FECHA', 50, y + 5.5);
        doc.text('RUC / CÉDULA', 72, y + 5.5);
        doc.text('CLIENTE', 104, y + 5.5);
        doc.text('BASE 15%', 142, y + 5.5, { align: 'right' });
        doc.text('IVA', 165, y + 5.5, { align: 'right' });
        doc.text('TOTAL', 190, y + 5.5, { align: 'right' });
        y += 8;
      }

      if (idx % 2 === 0) {
        doc.setFillColor(249, 250, 251);
        doc.rect(15, y, 180, 8, 'F');
      }
      doc.setDrawColor(220, 220, 222);
      doc.rect(15, y, 180, 8, 'D');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(0, 0, 0);
      doc.text(inv.numeroComprobante || inv.secuencial, 18, y + 5.5);

      doc.setFont('helvetica', 'normal');
      doc.text(inv.fechaEmision, 50, y + 5.5);
      doc.text(inv.cliente.identificacion || '9999999999999', 72, y + 5.5);

      let nameTrunc = inv.cliente.razonSocial || 'CONSUMIDOR FINAL';
      if (nameTrunc.length > 20) nameTrunc = nameTrunc.substring(0, 18) + '...';
      doc.text(nameTrunc.toUpperCase(), 104, y + 5.5);

      doc.text(`$${formatNum(inv.subtotal15 || 0)}`, 142, y + 5.5, { align: 'right' });
      doc.text(`$${formatNum(inv.totalIva || 0)}`, 165, y + 5.5, { align: 'right' });

      doc.setFont('helvetica', 'bold');
      doc.text(`$${formatNum(inv.importeTotal || 0)}`, 190, y + 5.5, { align: 'right' });

      y += 8;
      rowsOnPage++;
    });

    doc.save(`reporte_facturas_sri_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  // Pagination
  const ITEMS_PER_PAGE = 10;
  const totalPages = Math.max(1, Math.ceil(filteredInvoices.length / ITEMS_PER_PAGE));
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedInvoices = filteredInvoices.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  return (
    <div className="space-y-6">
      {/* Title & Actions Bar */}
      <div className="bg-white border-4 border-black rounded-xl p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 stroke-[2.5]" />
            <h2 className="font-retro-heavy text-base uppercase text-black">
              🧾 REPORTE TRIBUTARIO DE FACTURAS SRI
            </h2>
          </div>
          <p className="text-xs font-bold text-zinc-600 mt-0.5 uppercase">
            Control fiscal de facturación electrónica, bases imponibles y crédito tributario
          </p>
        </div>

        <button
          onClick={downloadPdf}
          className="flex items-center gap-2 bg-cyan-300 hover:bg-cyan-400 text-black border-3 border-black rounded-lg px-4 py-2.5 text-xs font-black uppercase tracking-wider cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5"
          title="Descargar informe fiscal en formato PDF"
        >
          <Download className="w-4 h-4 stroke-[3]" />
          <span>DESCARGAR REPORTE (PDF)</span>
        </button>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* Total Facturado */}
        <div className="bg-[#bae6fd] border-3 border-black rounded-xl p-4 sm:p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest text-black font-black font-retro-mono">
              TOTAL FACTURADO (SRI)
            </span>
            <div className="w-8 h-8 rounded border-2 border-black bg-white text-black flex items-center justify-center">
              <DollarSign className="w-4 h-4 stroke-[2.5]" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl sm:text-3xl font-retro-heavy text-black">${formatNum(totalFacturado)}</h3>
            <p className="text-[10px] font-bold text-zinc-700 uppercase mt-1">
              {validInvoices.length} facturas válidas
              {anuladasCount > 0 && ` • ${anuladasCount} anuladas`}
            </p>
          </div>
        </div>

        {/* Total IVA */}
        <div className="bg-[#fbcfe8] border-3 border-black rounded-xl p-4 sm:p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest text-black font-black font-retro-mono">
              TOTAL IVA RECAUDADO
            </span>
            <div className="w-8 h-8 rounded border-2 border-black bg-white text-black flex items-center justify-center">
              <ArrowUpRight className="w-4 h-4 stroke-[2.5]" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl sm:text-3xl font-retro-heavy text-black">${formatNum(totalIva)}</h3>
            <p className="text-[10px] font-bold text-zinc-700 uppercase mt-1">
              Tarifa vigente 15% / 5%
            </p>
          </div>
        </div>

        {/* Bases Imponibles */}
        <div className="bg-[#ccfbf1] border-3 border-black rounded-xl p-4 sm:p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest text-black font-black font-retro-mono">
              BASES IMPONIBLES
            </span>
            <div className="w-8 h-8 rounded border-2 border-black bg-white text-black flex items-center justify-center">
              <Building2 className="w-4 h-4 stroke-[2.5]" />
            </div>
          </div>
          <div className="mt-2 text-xs font-bold text-black space-y-1 font-retro-mono">
            <div className="flex justify-between">
              <span>Gravada 15%:</span>
              <span className="font-black">${formatNum(totalSubtotal15)}</span>
            </div>
            <div className="flex justify-between">
              <span>Tarifa 0%:</span>
              <span className="font-black">${formatNum(totalSubtotal0)}</span>
            </div>
            <div className="flex justify-between text-zinc-600">
              <span>Descuentos:</span>
              <span>-${formatNum(totalDescuentos)}</span>
            </div>
          </div>
        </div>

        {/* Estados SRI */}
        <div className="bg-[#fef08a] border-3 border-black rounded-xl p-4 sm:p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest text-black font-black font-retro-mono">
              ESTADOS COMPROBANTES
            </span>
            <div className="w-8 h-8 rounded border-2 border-black bg-white text-black flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 stroke-[2.5]" />
            </div>
          </div>
          <div className="mt-2 text-xs font-bold text-black space-y-1 font-retro-mono">
            <div className="flex justify-between items-center">
              <span className="text-emerald-800">✅ Autorizadas:</span>
              <span className="font-black">{autorizadasCount}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-amber-800">⏳ Pendientes:</span>
              <span className="font-black">{pendientesCount}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-rose-800">🚫 Anuladas:</span>
              <span className="font-black">{anuladasCount}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border-4 border-black rounded-xl p-4 sm:p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3.5 items-end">
        {/* Search */}
        <div className="lg:col-span-6 space-y-1.5">
          <label className="block text-[11px] font-black uppercase tracking-wider text-black">
            Buscar Factura SRI
          </label>
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5 stroke-[2.5]" />
            <input
              type="text"
              placeholder="N° factura (001-001...), RUC / Cédula, cliente o clave SRI..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border-3 border-black bg-pink-50 rounded-lg text-xs font-bold text-black focus:outline-none focus:bg-white font-retro-mono"
            />
          </div>
        </div>

        {/* Tarifa Filter */}
        <div className="lg:col-span-3 space-y-1.5">
          <label className="block text-[11px] font-black uppercase tracking-wider text-black">
            Tarifa IVA
          </label>
          <RetroSelect
            value={filterTax}
            onChange={setFilterTax}
            dense
            options={[
              { value: 'all', label: 'TODAS LAS TARIFAS' },
              { value: 'iva15', label: 'TARIFAS CON IVA 15%' },
              { value: 'iva0', label: 'TARIFA 0% / EXENTO' },
            ]}
          />
        </div>

        {/* Status Filter */}
        <div className="lg:col-span-3 space-y-1.5">
          <label className="block text-[11px] font-black uppercase tracking-wider text-black">
            Estado SRI
          </label>
          <RetroSelect
            value={filterStatus}
            onChange={setFilterStatus}
            dense
            options={[
              { value: 'all', label: 'TODOS LOS ESTADOS' },
              { value: 'AUTORIZADO', label: '✅ AUTORIZADO' },
              { value: 'PENDIENTE', label: '⏳ PENDIENTE' },
              { value: 'ANULADO', label: '🚫 ANULADO' },
            ]}
          />
        </div>
      </div>

      {/* Table of Invoices */}
      <div className="bg-white border-4 border-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse min-w-[850px]">
            <thead className="bg-yellow-300 border-b-3 border-black text-black font-black uppercase text-[11px]">
              <tr>
                <th className="p-3">N° Factura</th>
                <th className="p-3">Fecha</th>
                <th className="p-3">RUC / Cédula</th>
                <th className="p-3">Cliente / Razón Social</th>
                <th className="p-3 text-right">Base 15% ($)</th>
                <th className="p-3 text-right">Base 0% ($)</th>
                <th className="p-3 text-right">IVA ($)</th>
                <th className="p-3 text-right">Total ($)</th>
                <th className="p-3 text-center">Estado SRI</th>
                <th className="p-3 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-dashed divide-black/15 font-bold text-black">
              {paginatedInvoices.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-10 text-center text-zinc-500 uppercase font-black">
                    No se encontraron facturas emitidas para los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                paginatedInvoices.map((inv) => {
                  return (
                    <tr key={inv.id} className="hover:bg-cyan-50/60 transition-colors">
                      {/* N° Factura */}
                      <td className="p-3 font-retro-mono font-black text-black">
                        {inv.numeroComprobante || inv.secuencial}
                      </td>

                      {/* Fecha */}
                      <td className="p-3 font-retro-mono text-[11px]">
                        {inv.fechaEmision}
                      </td>

                      {/* RUC / Cédula */}
                      <td className="p-3 font-retro-mono text-zinc-600">
                        {inv.cliente.identificacion || '9999999999999'}
                      </td>

                      {/* Cliente */}
                      <td className="p-3">
                        <p className="font-black text-black uppercase truncate max-w-[170px]" title={inv.cliente.razonSocial}>
                          {inv.cliente.razonSocial || 'CONSUMIDOR FINAL'}
                        </p>
                      </td>

                      {/* Base 15% */}
                      <td className="p-3 text-right font-retro-mono">
                        ${formatNum(inv.subtotal15 || 0)}
                      </td>

                      {/* Base 0% */}
                      <td className="p-3 text-right font-retro-mono text-zinc-600">
                        ${formatNum(inv.subtotal0 || 0)}
                      </td>

                      {/* IVA */}
                      <td className="p-3 text-right font-retro-mono font-black text-pink-700">
                        ${formatNum(inv.totalIva || 0)}
                      </td>

                      {/* Total */}
                      <td className="p-3 text-right font-retro-mono font-black text-sm text-black">
                        ${formatNum(inv.importeTotal || 0)}
                      </td>

                      {/* Estado SRI */}
                      <td className="p-3 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black uppercase border border-black ${
                          inv.estado === 'AUTORIZADO'
                            ? 'bg-lime-300 text-black'
                            : inv.estado === 'PENDIENTE'
                            ? 'bg-amber-300 text-black'
                            : 'bg-rose-300 text-black'
                        }`}>
                          {inv.estado === 'AUTORIZADO' ? (
                            <CheckCircle2 className="w-3 h-3 stroke-[3]" />
                          ) : inv.estado === 'PENDIENTE' ? (
                            <Clock className="w-3 h-3 stroke-[3]" />
                          ) : (
                            <AlertCircle className="w-3 h-3 stroke-[3]" />
                          )}
                          <span>{inv.estado}</span>
                        </span>
                      </td>

                      {/* Acción */}
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => setSelectedInvoice(inv)}
                          className="px-2.5 py-1 bg-black text-white hover:bg-zinc-800 rounded border border-black text-[10px] font-black uppercase shadow-[1px_1px_0px_0px_#000] cursor-pointer inline-flex items-center gap-1 active:translate-y-0.5"
                          title="Ver detalle de la factura fiscal"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Ver</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {filteredInvoices.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between border-t-3 border-black p-4 bg-zinc-50 text-xs font-bold text-black gap-3">
            <div className="uppercase font-black text-[10px] tracking-wider text-zinc-700">
              Mostrando {startIndex + 1}-{Math.min(startIndex + ITEMS_PER_PAGE, filteredInvoices.length)} de {filteredInvoices.length} facturas
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(1)}
                className="px-2.5 py-1.5 border-2 border-black bg-white rounded-md text-[10px] font-black uppercase shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] hover:bg-yellow-100 disabled:opacity-40 disabled:hover:bg-white active:translate-y-0.5 disabled:active:translate-y-0 cursor-pointer disabled:cursor-not-allowed"
              >
                « Primera
              </button>
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="px-2.5 py-1.5 border-2 border-black bg-white rounded-md text-[10px] font-black uppercase shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] hover:bg-yellow-100 disabled:opacity-40 disabled:hover:bg-white active:translate-y-0.5 disabled:active:translate-y-0 cursor-pointer disabled:cursor-not-allowed"
              >
                ‹ Anterior
              </button>

              <span className="font-retro-mono bg-yellow-200 border-2 border-black px-2.5 py-1 rounded text-[10px] font-black">
                PÁG {currentPage} / {totalPages}
              </span>

              <button
                type="button"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                className="px-2.5 py-1.5 border-2 border-black bg-white rounded-md text-[10px] font-black uppercase shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] hover:bg-yellow-100 disabled:opacity-40 disabled:hover:bg-white active:translate-y-0.5 disabled:active:translate-y-0 cursor-pointer disabled:cursor-not-allowed"
              >
                Siguiente ›
              </button>
              <button
                type="button"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(totalPages)}
                className="px-2.5 py-1.5 border-2 border-black bg-white rounded-md text-[10px] font-black uppercase shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] hover:bg-yellow-100 disabled:opacity-40 disabled:hover:bg-white active:translate-y-0.5 disabled:active:translate-y-0 cursor-pointer disabled:cursor-not-allowed"
              >
                Última »
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Invoice Detail Modal */}
      {selectedInvoice && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white border-4 border-black rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
            {/* Modal Header */}
            <div className="bg-yellow-300 border-b-4 border-black p-4 flex items-center justify-between">
              <div>
                <h3 className="font-retro-heavy text-base uppercase text-black flex items-center gap-2">
                  <FileText className="w-5 h-5 stroke-[2.5]" />
                  <span>Factura {selectedInvoice.numeroComprobante || selectedInvoice.secuencial}</span>
                </h3>
                <p className="text-[10px] font-bold text-zinc-800 uppercase mt-0.5">
                  Fecha de Emisión: {selectedInvoice.fechaEmision}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedInvoice(null)}
                className="w-8 h-8 rounded-lg bg-white border-2 border-black hover:bg-rose-200 text-black flex items-center justify-center font-black cursor-pointer shadow-[2px_2px_0px_0px_#000]"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs font-bold text-black">
              {/* Clave de Acceso SRI */}
              <div className="bg-cyan-50 border-2 border-black p-3.5 rounded-xl space-y-1.5">
                <span className="text-zinc-600 uppercase text-[10px] font-black block">
                  Clave de Acceso SRI (49 Dígitos):
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-retro-mono text-[11px] font-bold text-black break-all select-all flex-1">
                    {selectedInvoice.claveAcceso}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyClave(selectedInvoice.claveAcceso)}
                    className="px-2.5 py-1.5 bg-yellow-300 hover:bg-yellow-400 border border-black rounded text-[10px] font-black uppercase cursor-pointer flex items-center gap-1 shrink-0"
                    title="Copiar Clave de Acceso"
                  >
                    {copiedKey ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey ? 'Copiado' : 'Copiar'}</span>
                  </button>
                </div>
              </div>

              {/* Customer Info */}
              <div className="bg-zinc-50 border-2 border-black p-3.5 rounded-xl space-y-2">
                <div className="flex justify-between items-center border-b border-black/20 pb-1.5">
                  <span className="text-zinc-500 uppercase text-[10px]">Cliente / Razón Social:</span>
                  <span className="font-black uppercase">{selectedInvoice.cliente.razonSocial}</span>
                </div>
                <div className="flex justify-between items-center border-b border-black/20 pb-1.5">
                  <span className="text-zinc-500 uppercase text-[10px]">RUC / Cédula:</span>
                  <span className="font-retro-mono">{selectedInvoice.cliente.identificacion}</span>
                </div>
                <div className="flex justify-between items-center border-b border-black/20 pb-1.5">
                  <span className="text-zinc-500 uppercase text-[10px]">Dirección:</span>
                  <span>{selectedInvoice.cliente.direccion || 'S/N'}</span>
                </div>
                <div className="flex justify-between items-center border-b border-black/20 pb-1.5">
                  <span className="text-zinc-500 uppercase text-[10px]">Email:</span>
                  <span>{selectedInvoice.cliente.email || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500 uppercase text-[10px]">Estado Fiscal:</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border border-black ${
                    selectedInvoice.estado === 'AUTORIZADO'
                      ? 'bg-lime-300 text-black'
                      : selectedInvoice.estado === 'PENDIENTE'
                      ? 'bg-amber-300 text-black'
                      : 'bg-rose-300 text-black'
                  }`}>
                    {selectedInvoice.estado}
                  </span>
                </div>
              </div>

              {/* Items Table */}
              <div>
                <h4 className="font-black uppercase text-xs mb-2">Detalle de Bienes y Servicios:</h4>
                <div className="border-2 border-black rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-pink-100 border-b-2 border-black text-[10px] uppercase font-black">
                      <tr>
                        <th className="p-2">Código</th>
                        <th className="p-2">Descripción</th>
                        <th className="p-2 text-center">Cant.</th>
                        <th className="p-2 text-right">P. Unit.</th>
                        <th className="p-2 text-center">Tarifa</th>
                        <th className="p-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 font-bold">
                      {selectedInvoice.items?.map((it, idx) => (
                        <tr key={idx} className="hover:bg-zinc-50">
                          <td className="p-2 font-retro-mono text-[10px]">{it.codigoPrincipal}</td>
                          <td className="p-2 uppercase">{it.descripcion}</td>
                          <td className="p-2 text-center font-retro-mono">{it.cantidad}</td>
                          <td className="p-2 text-right font-retro-mono">${formatNum(it.precioUnitario)}</td>
                          <td className="p-2 text-center font-retro-mono">{it.tarifaIva}%</td>
                          <td className="p-2 text-right font-retro-mono font-black">${formatNum(it.valorTotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totals Summary */}
              <div className="bg-yellow-50 border-2 border-black p-3.5 rounded-xl space-y-1.5 font-retro-mono">
                <div className="flex justify-between">
                  <span>Subtotal Gravado 15%:</span>
                  <span>${formatNum(selectedInvoice.subtotal15 || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Subtotal Tarifa 0%:</span>
                  <span>${formatNum(selectedInvoice.subtotal0 || 0)}</span>
                </div>
                {selectedInvoice.totalDescuento > 0 && (
                  <div className="flex justify-between text-rose-600">
                    <span>Descuento:</span>
                    <span>-${formatNum(selectedInvoice.totalDescuento)}</span>
                  </div>
                )}
                <div className="flex justify-between text-pink-700 font-black">
                  <span>IVA 15%:</span>
                  <span>${formatNum(selectedInvoice.totalIva || 0)}</span>
                </div>
                <div className="flex justify-between text-base font-black border-t-2 border-black pt-1.5 text-black">
                  <span>IMPORTE TOTAL:</span>
                  <span className="text-emerald-800">${formatNum(selectedInvoice.importeTotal)}</span>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-zinc-100 border-t-3 border-black p-3.5 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedInvoice(null)}
                className="px-4 py-2 bg-black text-white hover:bg-zinc-800 rounded-lg text-xs font-black uppercase tracking-wider cursor-pointer shadow-[2px_2px_0px_0px_#000]"
              >
                Cerrar Detalle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
