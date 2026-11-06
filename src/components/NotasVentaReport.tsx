/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  Receipt, 
  Search, 
  Download, 
  CreditCard, 
  Eye, 
  CheckCircle, 
  Ban, 
  X,
  User,
  Clock,
  Calendar,
  Layers,
  ArrowUpRight
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { Sale } from '../types';
import RetroSelect from './RetroSelect';
import { formatNum } from '../utils';

interface NotasVentaReportProps {
  sales: Sale[];
  filterPeriod: string;
}

export default function NotasVentaReport({ sales, filterPeriod }: NotasVentaReportProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPayment, setFilterPayment] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

  // Filtered sales
  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      // Payment filter
      if (filterPayment !== 'all' && sale.paymentMethod !== filterPayment) return false;
      // Status filter
      if (filterStatus !== 'all' && sale.status !== filterStatus) return false;
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const numMatch = (sale.invoiceNumber || '').toLowerCase().includes(q);
        const clientMatch = 
          (sale.customer?.name || '').toLowerCase().includes(q) || 
          (sale.customer?.documentId || '').includes(q);
        const empMatch = (sale.employeeName || '').toLowerCase().includes(q);
        const itemMatch = sale.items?.some(it => it.name.toLowerCase().includes(q));
        if (!numMatch && !clientMatch && !empMatch && !itemMatch) return false;
      }
      return true;
    });
  }, [sales, filterPayment, filterStatus, searchQuery]);

  // Reset page when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterPayment, filterStatus, filterPeriod]);

  // Metrics
  const completedSales = useMemo(() => filteredSales.filter(s => s.status === 'completed'), [filteredSales]);
  const totalRecaudado = useMemo(() => completedSales.reduce((acc, s) => acc + s.total, 0), [completedSales]);
  const totalEfectivo = useMemo(() => completedSales.filter(s => s.paymentMethod === 'efectivo').reduce((acc, s) => acc + s.total, 0), [completedSales]);
  const totalTarjeta = useMemo(() => completedSales.filter(s => s.paymentMethod === 'tarjeta').reduce((acc, s) => acc + s.total, 0), [completedSales]);
  const totalTransferencia = useMemo(() => completedSales.filter(s => s.paymentMethod === 'transferencia').reduce((acc, s) => acc + s.total, 0), [completedSales]);
  const countEfectivo = useMemo(() => completedSales.filter(s => s.paymentMethod === 'efectivo').length, [completedSales]);
  const countTarjeta = useMemo(() => completedSales.filter(s => s.paymentMethod === 'tarjeta').length, [completedSales]);
  const countTransferencia = useMemo(() => completedSales.filter(s => s.paymentMethod === 'transferencia').length, [completedSales]);
  const totalDescuentos = useMemo(() => completedSales.reduce((acc, s) => acc + (s.discount || 0), 0), [completedSales]);
  const ticketPromedio = completedSales.length > 0 ? totalRecaudado / completedSales.length : 0;
  const voidedCount = useMemo(() => filteredSales.filter(s => s.status === 'voided').length, [filteredSales]);

  // PDF Export
  const downloadPdf = () => {
    const doc = new jsPDF();
    const businessName = localStorage.getItem('caf_business_name') || 'moccapricho';

    // Header banner
    doc.setFillColor(31, 41, 55);
    doc.rect(0, 0, 210, 38, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text(`REPORTE DE NOTAS DE VENTA - ${businessName.toUpperCase()}`, 15, 16);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text('AUDITORÍA DE COMPROBANTES Y TICKETS DE VENTA EN PUNTO DE VENTA (POS)', 15, 23);
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
    doc.text('TOTAL RECAUDADO', 18, y + 5);
    doc.text('NOTAS PAGADAS', 63, y + 5);
    doc.text('PAGOS EFECTIVO', 108, y + 5);
    doc.text('TARJETA / TRANSF.', 153, y + 5);

    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text(`$${formatNum(totalRecaudado)}`, 18, y + 12);
    doc.text(`${completedSales.length} notas`, 63, y + 12);
    doc.text(`$${formatNum(totalEfectivo)}`, 108, y + 12);
    doc.text(`$${formatNum(totalTarjeta + totalTransferencia)}`, 153, y + 12);

    y += 26;

    // Table Header
    doc.setFillColor(31, 41, 55);
    doc.rect(15, y, 180, 8, 'F');
    doc.rect(15, y, 180, 8, 'D');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text('N° NOTA', 18, y + 5.5);
    doc.text('FECHA / HORA', 46, y + 5.5);
    doc.text('CLIENTE', 82, y + 5.5);
    doc.text('MÉTODO', 125, y + 5.5);
    doc.text('ESTADO', 152, y + 5.5);
    doc.text('TOTAL', 190, y + 5.5, { align: 'right' });

    y += 8;

    let rowsOnPage = 0;
    filteredSales.forEach((sale, idx) => {
      if (rowsOnPage >= 14) {
        doc.addPage();
        rowsOnPage = 0;
        y = 20;

        doc.setFillColor(31, 41, 55);
        doc.rect(15, y, 180, 8, 'F');
        doc.rect(15, y, 180, 8, 'D');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(255, 255, 255);
        doc.text('N° NOTA', 18, y + 5.5);
        doc.text('FECHA / HORA', 46, y + 5.5);
        doc.text('CLIENTE', 82, y + 5.5);
        doc.text('MÉTODO', 125, y + 5.5);
        doc.text('ESTADO', 152, y + 5.5);
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
      doc.setFontSize(7.5);
      doc.setTextColor(0, 0, 0);
      doc.text(sale.invoiceNumber || `#${sale.id.slice(0, 6)}`, 18, y + 5.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      const d = new Date(sale.timestamp);
      doc.text(
        `${d.toLocaleDateString('es-ES')} ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`,
        46,
        y + 5.5
      );

      let clientStr = sale.customer?.name || 'CONSUMIDOR FINAL';
      if (clientStr.length > 22) clientStr = clientStr.substring(0, 20) + '...';
      doc.text(clientStr.toUpperCase(), 82, y + 5.5);

      doc.text(sale.paymentMethod.toUpperCase(), 125, y + 5.5);

      if (sale.status === 'completed') {
        doc.setTextColor(16, 120, 80);
        doc.text('PAGADA', 152, y + 5.5);
      } else {
        doc.setTextColor(180, 30, 30);
        doc.text('ANULADA', 152, y + 5.5);
      }

      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'bold');
      doc.text(`$${formatNum(sale.total)}`, 190, y + 5.5, { align: 'right' });

      y += 8;
      rowsOnPage++;
    });

    doc.save(`reporte_notas_venta_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  // Pagination
  const ITEMS_PER_PAGE = 10;
  const totalPages = Math.max(1, Math.ceil(filteredSales.length / ITEMS_PER_PAGE));
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedSales = filteredSales.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  return (
    <div className="space-y-6">
      {/* Title & Actions Bar */}
      <div className="bg-white border-4 border-black rounded-xl p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 stroke-[2.5]" />
            <h2 className="font-retro-heavy text-base uppercase text-black">
              📜 REPORTE CONSOLIDADO DE NOTAS DE VENTA
            </h2>
          </div>
          <p className="text-xs font-bold text-zinc-600 mt-0.5 uppercase">
            Auditoría de tickets y comprobantes emitidos en el Punto de Venta
          </p>
        </div>

        <button
          onClick={downloadPdf}
          className="flex items-center gap-2 bg-yellow-300 hover:bg-yellow-400 text-black border-3 border-black rounded-lg px-4 py-2.5 text-xs font-black uppercase tracking-wider cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5"
          title="Descargar informe de notas de venta en PDF"
        >
          <Download className="w-4 h-4 stroke-[3]" />
          <span>DESCARGAR REPORTE (PDF)</span>
        </button>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* Total Recaudado */}
        <div className="bg-[#bae6fd] border-3 border-black rounded-xl p-4 sm:p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest text-black font-black font-retro-mono">
              TOTAL RECAUDADO
            </span>
            <div className="w-8 h-8 rounded border-2 border-black bg-white text-black flex items-center justify-center">
              <ArrowUpRight className="w-4 h-4 stroke-[2.5]" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl sm:text-3xl font-retro-heavy text-black">${formatNum(totalRecaudado)}</h3>
            <p className="text-[10px] font-bold text-zinc-700 uppercase mt-1">
              {completedSales.length} notas pagadas
              {voidedCount > 0 && ` • ${voidedCount} anuladas`}
            </p>
          </div>
        </div>

        {/* Total Notas Emitidas */}
        <div className="bg-[#fbcfe8] border-3 border-black rounded-xl p-4 sm:p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest text-black font-black font-retro-mono">
              COMPROBANTES TOTALES
            </span>
            <div className="w-8 h-8 rounded border-2 border-black bg-white text-black flex items-center justify-center">
              <Receipt className="w-4 h-4 stroke-[2.5]" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl sm:text-3xl font-retro-heavy text-black">{filteredSales.length}</h3>
            <p className="text-[10px] font-bold text-zinc-700 uppercase mt-1">
              Ticket Promedio: ${formatNum(ticketPromedio)}
            </p>
          </div>
        </div>

        {/* Desglose por Forma de Pago */}
        <div className="bg-[#fef08a] border-3 border-black rounded-xl p-4 sm:p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest text-black font-black font-retro-mono">
              FORMAS DE PAGO
            </span>
            <div className="w-8 h-8 rounded border-2 border-black bg-white text-black flex items-center justify-center">
              <CreditCard className="w-4 h-4 stroke-[2.5]" />
            </div>
          </div>
          <div className="mt-2 text-xs font-bold text-black space-y-1 font-retro-mono">
            <div className="flex justify-between">
              <span>💵 Efectivo ({countEfectivo}):</span>
              <span className="font-black">${formatNum(totalEfectivo)}</span>
            </div>
            <div className="flex justify-between">
              <span>💳 Tarjeta ({countTarjeta}):</span>
              <span className="font-black">${formatNum(totalTarjeta)}</span>
            </div>
            <div className="flex justify-between">
              <span>📱 Transfer. ({countTransferencia}):</span>
              <span className="font-black">${formatNum(totalTransferencia)}</span>
            </div>
          </div>
        </div>

        {/* Descuentos & Promedios */}
        <div className="bg-[#d9f99d] border-3 border-black rounded-xl p-4 sm:p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest text-black font-black font-retro-mono">
              DESCUENTOS APLICADOS
            </span>
            <div className="w-8 h-8 rounded border-2 border-black bg-white text-black flex items-center justify-center">
              <CheckCircle className="w-4 h-4 stroke-[2.5]" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl sm:text-3xl font-retro-heavy text-black">${formatNum(totalDescuentos)}</h3>
            <p className="text-[10px] font-bold text-zinc-700 uppercase mt-1">
              Descuentos comerciales en caja
            </p>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border-4 border-black rounded-xl p-4 sm:p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3.5 items-end">
        {/* Search */}
        <div className="lg:col-span-6 space-y-1.5">
          <label className="block text-[11px] font-black uppercase tracking-wider text-black">
            Buscar Nota de Venta
          </label>
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5 stroke-[2.5]" />
            <input
              type="text"
              placeholder="N° nota (#00001), cliente, cédula, cajero o producto..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border-3 border-black bg-pink-50 rounded-lg text-xs font-bold text-black focus:outline-none focus:bg-white font-retro-mono"
            />
          </div>
        </div>

        {/* Payment Filter */}
        <div className="lg:col-span-3 space-y-1.5">
          <label className="block text-[11px] font-black uppercase tracking-wider text-black">
            Método de Pago
          </label>
          <RetroSelect
            value={filterPayment}
            onChange={setFilterPayment}
            dense
            options={[
              { value: 'all', label: 'TODOS LOS PAGOS' },
              { value: 'efectivo', label: '💵 EFECTIVO' },
              { value: 'tarjeta', label: '💳 TARJETA' },
              { value: 'transferencia', label: '📱 TRANSFERENCIA' },
            ]}
          />
        </div>

        {/* Status Filter */}
        <div className="lg:col-span-3 space-y-1.5">
          <label className="block text-[11px] font-black uppercase tracking-wider text-black">
            Estado
          </label>
          <RetroSelect
            value={filterStatus}
            onChange={setFilterStatus}
            dense
            options={[
              { value: 'all', label: 'TODOS LOS ESTADOS' },
              { value: 'completed', label: '✅ PAGADA / COMPLETADA' },
              { value: 'voided', label: '🚫 ANULADA' },
            ]}
          />
        </div>
      </div>

      {/* Table of Notas de Venta */}
      <div className="bg-white border-4 border-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse min-w-[850px]">
            <thead className="bg-yellow-300 border-b-3 border-black text-black font-black uppercase text-[11px]">
              <tr>
                <th className="p-3">N° Nota</th>
                <th className="p-3">Fecha & Hora</th>
                <th className="p-3">Cliente</th>
                <th className="p-3">Cajero</th>
                <th className="p-3 text-center">Método</th>
                <th className="p-3 text-center">Ítems</th>
                <th className="p-3 text-right">Descuento</th>
                <th className="p-3 text-right">Total ($)</th>
                <th className="p-3 text-center">Estado</th>
                <th className="p-3 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-dashed divide-black/15 font-bold text-black">
              {paginatedSales.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-10 text-center text-zinc-500 uppercase font-black">
                    No se encontraron notas de venta para los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                paginatedSales.map((sale) => {
                  const isCompleted = sale.status === 'completed';
                  const date = new Date(sale.timestamp);
                  const itemCount = sale.items?.reduce((acc, it) => acc + it.quantity, 0) || 0;

                  return (
                    <tr key={sale.id} className="hover:bg-cyan-50/60 transition-colors">
                      {/* N° Nota */}
                      <td className="p-3 font-retro-mono font-black text-black">
                        {sale.invoiceNumber || `#${sale.id.slice(0, 6)}`}
                      </td>

                      {/* Fecha y Hora */}
                      <td className="p-3 font-retro-mono text-[11px]">
                        {date.toLocaleDateString('es-ES')} {date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                      </td>

                      {/* Cliente */}
                      <td className="p-3">
                        <p className="font-black text-black uppercase truncate max-w-[170px]" title={sale.customer?.name || 'CONSUMIDOR FINAL'}>
                          {sale.customer?.name || 'CONSUMIDOR FINAL'}
                        </p>
                        <span className="text-[10px] text-zinc-500 font-retro-mono">
                          {sale.customer?.documentId || '9999999999'}
                        </span>
                      </td>

                      {/* Cajero */}
                      <td className="p-3 text-[11px] uppercase">
                        {sale.employeeName || 'Caja Principal'}
                      </td>

                      {/* Método */}
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded border border-black text-[10px] font-black uppercase ${
                          sale.paymentMethod === 'efectivo'
                            ? 'bg-lime-200 text-lime-950'
                            : sale.paymentMethod === 'tarjeta'
                            ? 'bg-cyan-200 text-cyan-950'
                            : 'bg-purple-200 text-purple-950'
                        }`}>
                          {sale.paymentMethod}
                        </span>
                      </td>

                      {/* Ítems */}
                      <td className="p-3 text-center font-retro-mono">
                        {itemCount} uds.
                      </td>

                      {/* Descuento */}
                      <td className="p-3 text-right font-retro-mono text-zinc-600">
                        {sale.discount && sale.discount > 0 ? `-$${formatNum(sale.discount)}` : '$0,00'}
                      </td>

                      {/* Total */}
                      <td className="p-3 text-right font-retro-mono font-black text-sm text-black">
                        ${formatNum(sale.total)}
                      </td>

                      {/* Estado */}
                      <td className="p-3 text-center">
                        {isCompleted ? (
                          <span className="inline-flex items-center gap-1 bg-lime-300 text-black border border-black rounded px-1.5 py-0.5 text-[10px] font-black uppercase">
                            <CheckCircle className="w-3 h-3 stroke-[3]" />
                            <span>Pagada</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-rose-300 text-black border border-black rounded px-1.5 py-0.5 text-[10px] font-black uppercase">
                            <Ban className="w-3 h-3 stroke-[3]" />
                            <span>Anulada</span>
                          </span>
                        )}
                      </td>

                      {/* Acción */}
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => setSelectedSale(sale)}
                          className="px-2.5 py-1 bg-black text-white hover:bg-zinc-800 rounded border border-black text-[10px] font-black uppercase shadow-[1px_1px_0px_0px_#000] cursor-pointer inline-flex items-center gap-1 active:translate-y-0.5"
                          title="Ver detalle del comprobante"
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
        {filteredSales.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between border-t-3 border-black p-4 bg-zinc-50 text-xs font-bold text-black gap-3">
            <div className="uppercase font-black text-[10px] tracking-wider text-zinc-700">
              Mostrando {startIndex + 1}-{Math.min(startIndex + ITEMS_PER_PAGE, filteredSales.length)} de {filteredSales.length} notas de venta
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

      {/* Sale Detail Modal */}
      {selectedSale && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white border-4 border-black rounded-2xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
            {/* Modal Header */}
            <div className="bg-yellow-300 border-b-4 border-black p-4 flex items-center justify-between">
              <div>
                <h3 className="font-retro-heavy text-base uppercase text-black flex items-center gap-2">
                  <Receipt className="w-5 h-5 stroke-[2.5]" />
                  <span>Nota de Venta {selectedSale.invoiceNumber || `#${selectedSale.id.slice(0, 6)}`}</span>
                </h3>
                <p className="text-[10px] font-bold text-zinc-800 uppercase mt-0.5">
                  Fecha: {new Date(selectedSale.timestamp).toLocaleString('es-ES')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSale(null)}
                className="w-8 h-8 rounded-lg bg-white border-2 border-black hover:bg-rose-200 text-black flex items-center justify-center font-black cursor-pointer shadow-[2px_2px_0px_0px_#000]"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs font-bold text-black">
              {/* Customer and Cashier info */}
              <div className="bg-zinc-50 border-2 border-black p-3.5 rounded-xl space-y-2">
                <div className="flex justify-between items-center border-b border-black/20 pb-1.5">
                  <span className="text-zinc-500 uppercase text-[10px]">Cliente:</span>
                  <span className="font-black uppercase">{selectedSale.customer?.name || 'CONSUMIDOR FINAL'}</span>
                </div>
                <div className="flex justify-between items-center border-b border-black/20 pb-1.5">
                  <span className="text-zinc-500 uppercase text-[10px]">Cédula / RUC:</span>
                  <span className="font-retro-mono">{selectedSale.customer?.documentId || '9999999999'}</span>
                </div>
                <div className="flex justify-between items-center border-b border-black/20 pb-1.5">
                  <span className="text-zinc-500 uppercase text-[10px]">Atendido por:</span>
                  <span className="uppercase">{selectedSale.employeeName || 'Caja Principal'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500 uppercase text-[10px]">Estado:</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border border-black ${
                    selectedSale.status === 'completed' ? 'bg-lime-300 text-black' : 'bg-rose-300 text-black'
                  }`}>
                    {selectedSale.status === 'completed' ? 'PAGADA' : 'ANULADA'}
                  </span>
                </div>
              </div>

              {/* Items Table */}
              <div>
                <h4 className="font-black uppercase text-xs mb-2">Detalle de Productos:</h4>
                <div className="border-2 border-black rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-pink-100 border-b-2 border-black text-[10px] uppercase font-black">
                      <tr>
                        <th className="p-2">Cant.</th>
                        <th className="p-2">Producto</th>
                        <th className="p-2 text-right">P. Unit.</th>
                        <th className="p-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 font-bold">
                      {selectedSale.items?.map((it, idx) => (
                        <tr key={idx} className="hover:bg-zinc-50">
                          <td className="p-2 font-retro-mono">{it.quantity}x</td>
                          <td className="p-2 uppercase">{it.name}</td>
                          <td className="p-2 text-right font-retro-mono">${formatNum(it.price)}</td>
                          <td className="p-2 text-right font-retro-mono font-black">${formatNum(it.price * it.quantity)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totals Summary */}
              <div className="bg-yellow-50 border-2 border-black p-3.5 rounded-xl space-y-1.5 font-retro-mono">
                <div className="flex justify-between">
                  <span className="font-bold">Subtotal:</span>
                  <span>${formatNum(selectedSale.subtotal || selectedSale.total + (selectedSale.discount || 0))}</span>
                </div>
                {selectedSale.discount && selectedSale.discount > 0 ? (
                  <div className="flex justify-between text-rose-600">
                    <span className="font-bold">Descuento:</span>
                    <span>-${formatNum(selectedSale.discount)}</span>
                  </div>
                ) : null}
                {selectedSale.tax && selectedSale.tax > 0 ? (
                  <div className="flex justify-between text-amber-900 font-bold">
                    <span>IVA Feriado ({Math.round((selectedSale.taxRate || 0.08) * 100)}%):</span>
                    <span>+${formatNum(selectedSale.tax)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between text-base font-black border-t-2 border-black pt-1.5 text-black">
                  <span>TOTAL COBRADO:</span>
                  <span className="text-emerald-800">${formatNum(selectedSale.total)}</span>
                </div>
                <div className="flex justify-between text-[11px] pt-1 text-zinc-600 font-bold">
                  <span>Método de Pago:</span>
                  <span className="uppercase text-black">{selectedSale.paymentMethod}</span>
                </div>
                {selectedSale.paymentMethod === 'efectivo' && selectedSale.cashReceived !== undefined && (
                  <div className="flex justify-between text-[11px] text-zinc-600">
                    <span>Efectivo Recibido:</span>
                    <span>${formatNum(selectedSale.cashReceived)} (Cambio: ${formatNum(selectedSale.changeGiven || 0)})</span>
                  </div>
                )}
                {selectedSale.paymentMethod === 'transferencia' && selectedSale.transferNumber && (
                  <div className="flex justify-between text-[11px] text-zinc-600">
                    <span>N° Transferencia / Comprobante:</span>
                    <span className="text-black font-black">{selectedSale.transferNumber}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-zinc-100 border-t-3 border-black p-3.5 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedSale(null)}
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
