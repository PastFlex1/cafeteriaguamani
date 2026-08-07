/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Receipt, 
  Search, 
  Calendar, 
  User, 
  CreditCard, 
  Printer, 
  ChevronRight, 
  AlertTriangle,
  X,
  FileText,
  Trash2,
  Ban
} from 'lucide-react';
import { Sale, MenuItem, Ingredient, Employee } from '../types';
import RetroSelect from './RetroSelect';
import RetroDatePicker from './RetroDatePicker';
import { formatNum } from '../utils';

interface SalesViewProps {
  sales: Sale[];
  menuItems: MenuItem[];
  ingredients: Ingredient[];
  employees: Employee[];
  onVoidSale: (saleId: string) => void;
  onDeleteSale: (saleId: string) => void;
}

export default function SalesView({
  sales,
  menuItems,
  ingredients,
  employees,
  onVoidSale,
  onDeleteSale
}: SalesViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPayment, setFilterPayment] = useState<string>('all');
  const [filterEmployee, setFilterEmployee] = useState<string>('all');
  const [filterPeriod, setFilterPeriod] = useState<'today' | '7d' | '30d' | 'custom' | 'all'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [confirmVoidId, setConfirmVoidId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(1);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterPayment, filterEmployee, filterPeriod, startDate, endDate]);

  // Helper to detect ingredient shortages for current menuItems
  const hasIngredientShortage = (item: MenuItem): boolean => {
    if (item.category === 'combos') {
      if (!item.ingredients || item.ingredients.length === 0) return false;
      return item.ingredients.some((req) => {
        const component = menuItems.find((m) => m.id === req.ingredientId);
        if (!component) return true;
        return hasIngredientShortage(component);
      });
    }

    if (!item.ingredients || item.ingredients.length === 0) return false;

    return item.ingredients.some((req) => {
      const ingredient = ingredients.find((ing) => ing.id === req.ingredientId);
      if (!ingredient) return true;
      return ingredient.stock <= 0 || ingredient.stock < req.quantity;
    });
  };

  const checkWithinPeriod = (timestampStr: string) => {
    const itemDate = new Date(timestampStr);
    
    if (filterPeriod === 'today') {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      return itemDate >= startOfToday;
    }
    
    if (filterPeriod === '7d') {
      const limitDate = new Date();
      limitDate.setDate(limitDate.getDate() - 7);
      return itemDate >= limitDate;
    }
    
    if (filterPeriod === '30d') {
      const limitDate = new Date();
      limitDate.setDate(limitDate.getDate() - 30);
      return itemDate >= limitDate;
    }
    
    if (filterPeriod === 'custom') {
      if (!startDate && !endDate) return true;
      let startMatch = true;
      let endMatch = true;
      if (startDate) {
        const start = new Date(startDate + 'T00:00:00');
        startMatch = itemDate >= start;
      }
      if (endDate) {
        const end = new Date(endDate + 'T23:59:59');
        endMatch = itemDate <= end;
      }
      return startMatch && endMatch;
    }
    
    return true; // 'all'
  };

  // Filter and search sales
  const filteredSales = sales.filter((sale) => {
    // Search query match (invoice number, customer name, document id, ID)
    const matchesSearch = 
      sale.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (sale.invoiceNumber && sale.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (sale.customer && sale.customer.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (sale.customer && sale.customer.documentId.toLowerCase().includes(searchQuery.toLowerCase())) ||
      sale.employeeName.toLowerCase().includes(searchQuery.toLowerCase());

    // Payment method match
    const matchesPayment = filterPayment === 'all' || sale.paymentMethod === filterPayment;

    // Employee match
    const matchesEmployee = filterEmployee === 'all' || sale.employeeId === filterEmployee;

    // Date/period match
    const matchesDate = checkWithinPeriod(sale.timestamp);

    return matchesSearch && matchesPayment && matchesEmployee && matchesDate;
  });

  const handlePrint = () => {
    window.print();
  };

  const taxRate = 0.0; // 0% IVA

  return (
    <div className="space-y-8" id="sales-registry-container">
      {/* Search and Filters Card */}
      <div className="bg-white border-4 border-black rounded-xl p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col gap-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b-2 border-dashed border-zinc-200 pb-3">
          <div>
            <h2 className="font-retro-heavy text-base uppercase text-black flex items-center gap-2">
              <Receipt className="w-5 h-5 stroke-[2.5]" />
              🧾 REGISTRO DE NOTAS DE VENTA
            </h2>
            <p className="text-xs font-bold text-zinc-600 mt-0.5 uppercase">Búsqueda, visualización y reimpresión de comprobantes</p>
          </div>
          <div className="text-right text-xs font-black uppercase text-black bg-yellow-100 border-2 border-black px-3 py-1 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
            Total notas: {filteredSales.length}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4">
          {/* Search bar */}
          <div className="lg:col-span-4 space-y-1">
            <label className="block text-[11px] font-black uppercase tracking-wider text-black">Buscar</label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-black stroke-[2.5]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Nº factura, cliente o cajero..."
                className="w-full pl-9 pr-3 py-2 border-3 border-black bg-pink-50 rounded-lg text-xs font-extrabold text-black focus:outline-none focus:bg-white placeholder-zinc-500"
              />
            </div>
          </div>

          {/* Payment method */}
          <div className="lg:col-span-2 space-y-1">
            <label className="block text-[11px] font-black uppercase tracking-wider text-black">Pago</label>
            <RetroSelect
              value={filterPayment}
              onChange={setFilterPayment}
              dense
              options={[
                { value: 'all', label: 'TODOS' },
                { value: 'efectivo', label: 'EFECTIVO' },
                { value: 'tarjeta', label: 'TARJETA' },
                { value: 'transferencia', label: 'TRANSF.' },
              ]}
            />
          </div>

          {/* Employee */}
          <div className="lg:col-span-3 space-y-1">
            <label className="block text-[11px] font-black uppercase tracking-wider text-black">Cajero</label>
            <RetroSelect
              value={filterEmployee}
              onChange={setFilterEmployee}
              dense
              options={[
                { value: 'all', label: 'TODOS' },
                ...employees.map(emp => ({ value: emp.id, label: emp.name.toUpperCase() }))
              ]}
            />
          </div>

          {/* Period */}
          <div className="lg:col-span-3 space-y-1">
            <label className="block text-[11px] font-black uppercase tracking-wider text-black">Período</label>
            <RetroSelect
              value={filterPeriod}
              onChange={(val) => {
                setFilterPeriod(val as any);
                if (val !== 'custom') {
                  setStartDate('');
                  setEndDate('');
                }
              }}
              dense
              options={[
                { value: 'all', label: 'TODO EL TIEMPO' },
                { value: 'today', label: 'HOY' },
                { value: '7d', label: 'ÚLTIMOS 7 DÍAS' },
                { value: '30d', label: 'ÚLTIMOS 30 DÍAS' },
                { value: 'custom', label: 'RANGO CUSTOM' },
              ]}
            />
          </div>
        </div>

        {filterPeriod === 'custom' && (
          <div className="flex flex-wrap items-center gap-4 bg-pink-100 border-3 border-black p-3.5 rounded-xl shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] self-start animate-fade-in">
            <RetroDatePicker
              value={startDate}
              onChange={setStartDate}
              label="Desde"
            />
            <RetroDatePicker
              value={endDate}
              onChange={setEndDate}
              label="Hasta"
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Sales List Table */}
        <div className={`bg-white border-4 border-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] overflow-hidden flex flex-col justify-between ${
          selectedSale ? 'lg:col-span-7' : 'lg:col-span-12'
        }`}>
          <div>
            <div className="bg-lime-300 border-b-4 border-black p-4">
              <h3 className="font-retro-heavy text-xs uppercase text-black">📔 REGISTRO HISTÓRICO</h3>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-yellow-50 border-b-3 border-black text-[10px] font-black uppercase tracking-wider text-black">
                    <th className="p-3">Factura</th>
                    <th className="p-3">Fecha y Hora</th>
                    <th className="p-3">Cliente</th>
                    <th className="p-3">Cajero</th>
                    <th className="p-3">Pago</th>
                    <th className="p-3 text-right">Total</th>
                    <th className="p-3 text-center">Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-dashed divide-black/15 text-xs font-bold text-black">
                  {(() => {
                    const ITEMS_PER_PAGE = 10;
                    const totalPages = Math.max(1, Math.ceil(filteredSales.length / ITEMS_PER_PAGE));
                    const paginatedSales = filteredSales.slice(
                      (currentPage - 1) * ITEMS_PER_PAGE,
                      currentPage * ITEMS_PER_PAGE
                    );
                    
                    return (
                      <>
                        {paginatedSales.map((sale) => {
                          const isSelected = selectedSale?.id === sale.id;
                          const isVoided = sale.status === 'voided';
                          return (
                            <tr 
                              key={sale.id} 
                              onClick={() => setSelectedSale(sale)}
                              className={`cursor-pointer transition-colors ${
                                isSelected ? 'bg-cyan-100' : 'hover:bg-cyan-50/50'
                              } ${isVoided ? 'opacity-65 bg-red-50/20' : ''}`}
                            >
                              <td className="p-3">
                                <span className={`font-retro-mono border px-1.5 py-0.5 rounded ${
                                  isVoided 
                                    ? 'bg-red-100 border-red-400 text-red-700 line-through' 
                                    : 'bg-zinc-100 border-black text-black'
                                }`}>
                                  {sale.invoiceNumber || sale.id.substring(0, 8).toUpperCase()}
                                </span>
                              </td>
                              <td className="p-3">
                                {new Date(sale.timestamp).toLocaleString('es-ES', { 
                                  year: 'numeric', 
                                  month: '2-digit', 
                                  day: '2-digit',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </td>
                              <td className="p-3 truncate max-w-[120px]">
                                {sale.customer ? (
                                  <div className="text-[11px]">
                                    <p className={`uppercase font-black truncate ${isVoided ? 'line-through text-zinc-500' : ''}`}>{sale.customer.name}</p>
                                    <p className="text-[9px] text-zinc-500 font-retro-mono">{sale.customer.documentId}</p>
                                  </div>
                                ) : (
                                  <span className="text-zinc-400 italic">Consumidor Final</span>
                                )}
                              </td>
                              <td className="p-3 uppercase text-[10px] truncate max-w-[80px]">
                                {sale.employeeName}
                              </td>
                              <td className="p-3">
                                <span className={`text-[9px] font-black uppercase border border-black px-1.5 py-0.5 rounded ${
                                  isVoided ? 'bg-zinc-100 border-zinc-300 text-zinc-400 line-through' :
                                  sale.paymentMethod === 'efectivo' ? 'bg-emerald-100 border-emerald-400 text-emerald-800' :
                                  sale.paymentMethod === 'tarjeta' ? 'bg-blue-100 border-blue-400 text-blue-800' :
                                  'bg-pink-100 border-pink-400 text-pink-800'
                                }`}>
                                  {sale.paymentMethod}
                                </span>
                              </td>
                              <td className="p-3 text-right font-retro-mono font-black">
                                <div className="flex flex-col items-end">
                                  <span className={isVoided ? 'line-through text-red-500' : ''}>
                                    ${formatNum(sale.total)}
                                  </span>
                                  {isVoided && (
                                    <span className="text-[8px] bg-red-100 text-red-700 border border-red-400 font-black px-1 rounded uppercase mt-0.5 animate-pulse">
                                      ANULADA
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="p-3 text-center">
                                <button className="bg-white hover:bg-zinc-100 border-2 border-black rounded p-1 shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5">
                                  <ChevronRight className="w-3.5 h-3.5 text-black" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}

                        {filteredSales.length === 0 && (
                          <tr>
                            <td colSpan={7} className="p-12 text-center text-zinc-500 font-black uppercase">
                              No se encontraron notas de venta registradas.
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })()}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {filteredSales.length > 0 && (() => {
              const ITEMS_PER_PAGE = 10;
              const totalPages = Math.max(1, Math.ceil(filteredSales.length / ITEMS_PER_PAGE));
              const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
              const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, filteredSales.length);

              return (
                <div className="flex flex-col sm:flex-row items-center justify-between border-t-3 border-black p-4 bg-zinc-50 text-xs font-bold text-black gap-3">
                  <div className="uppercase font-black text-[10px] tracking-wider text-zinc-700">
                    Mostrando {startIndex + 1}-{endIndex} de {filteredSales.length} notas de venta
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage(1)}
                      className="px-2.5 py-1.5 border-2 border-black bg-white rounded-md text-[10px] font-black uppercase shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] hover:bg-yellow-100 disabled:opacity-40 disabled:hover:bg-white active:translate-y-0.5 disabled:active:translate-y-0 cursor-pointer disabled:cursor-not-allowed"
                    >
                      « Primera
                    </button>
                    <button
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
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      className="px-2.5 py-1.5 border-2 border-black bg-white rounded-md text-[10px] font-black uppercase shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] hover:bg-yellow-100 disabled:opacity-40 disabled:hover:bg-white active:translate-y-0.5 disabled:active:translate-y-0 cursor-pointer disabled:cursor-not-allowed"
                    >
                      Siguiente ›
                    </button>
                    <button
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage(totalPages)}
                      className="px-2.5 py-1.5 border-2 border-black bg-white rounded-md text-[10px] font-black uppercase shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] hover:bg-yellow-100 disabled:opacity-40 disabled:hover:bg-white active:translate-y-0.5 disabled:active:translate-y-0 cursor-pointer disabled:cursor-not-allowed"
                    >
                      Última »
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
          
          <div className="bg-yellow-100 p-3.5 border-t-3 border-black text-center text-[10px] text-black font-black uppercase tracking-wide">
            💡 SELECCIONA UNA NOTA DE VENTA PARA VISUALIZAR EL TICKET DETALLADO Y PODER REIMPRIMIRLO
          </div>
        </div>

        {/* Selected Sale Detail Thermal Receipt */}
        {selectedSale && (
          <div className="lg:col-span-5 space-y-6 animate-fade-in">
            <div className="bg-white border-4 border-black rounded-xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] overflow-hidden flex flex-col">
              <div className="bg-pink-300 border-b-4 border-black p-4 flex items-center justify-between">
                <h3 className="font-retro-heavy text-xs uppercase text-black flex items-center gap-1.5">
                  <FileText className="w-4 h-4 stroke-[2.5]" />
                  DETALLE DE NOTA
                </h3>
                <button 
                  onClick={() => setSelectedSale(null)}
                  className="bg-white hover:bg-zinc-100 border-2 border-black rounded p-1 shadow-[2px_2px_0px_0px_#000] active:translate-y-0.5 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5 text-black" />
                </button>
              </div>

              {/* Printable Area Wrapper */}
              <div className="p-5 bg-zinc-50 border-b-4 border-black">
                <div 
                  className="bg-white border-3 border-black p-5 font-retro-mono text-xs text-black leading-relaxed space-y-4 max-h-[440px] overflow-y-auto shadow-inner printable-ticket"
                  id="sales-ticket-print-area"
                >
                  {/* Ticket Header */}
                  <div className="text-center space-y-1.5 border-b-2 border-dashed border-black/40 pb-4">
                    <h4 className="font-retro-heavy text-base uppercase tracking-tight">MOCCAPRICHO</h4>
                    <p className="text-[10px] font-bold">RUC: 1725403883001</p>
                    <p className="text-[10px] font-semibold leading-snug uppercase">GUAMANÍ - VICTORIA CENTRAL / PEDRO VICENTE MALDONADO ESQ S59D / S59-190 / S59D</p>
                    
                    <div className="pt-2 text-[10px] text-left space-y-1 font-bold">
                      <div className="flex justify-between">
                        <span>Nº NOTA:</span>
                        <span className="font-black bg-yellow-100 border border-black px-1 rounded">
                          {selectedSale.invoiceNumber || selectedSale.id}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>FECHA:</span>
                        <span>{new Date(selectedSale.timestamp).toLocaleString('es-ES')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>CAJERO:</span>
                        <span className="uppercase">{selectedSale.employeeName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>PAGO:</span>
                        <span className="font-extrabold bg-cyan-200 border border-black px-1 rounded uppercase">
                          {selectedSale.paymentMethod}
                        </span>
                      </div>
                      {selectedSale.transferNumber && (
                        <div className="flex justify-between">
                          <span>Nº REF:</span>
                          <span className="font-extrabold bg-pink-100 border border-pink-300 px-1 rounded uppercase">
                            {selectedSale.transferNumber}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Customer Information */}
                  {selectedSale.customer && (
                    <div className="border-b-2 border-dashed border-black/40 pb-3 text-[10px] space-y-0.5">
                      <p className="font-black text-[11px] mb-1 text-center bg-zinc-100 py-0.5 border border-black uppercase">DATOS DEL CLIENTE</p>
                      <div className="flex justify-between">
                        <span>RAZÓN SOC:</span>
                        <span className="font-extrabold uppercase truncate max-w-[150px]">{selectedSale.customer.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>RUC/C.I.:</span>
                        <span className="font-extrabold">{selectedSale.customer.documentId}</span>
                      </div>
                      {selectedSale.customer.phone && (
                        <div className="flex justify-between">
                          <span>TELÉFONO:</span>
                          <span className="font-extrabold">{selectedSale.customer.phone}</span>
                        </div>
                      )}
                      {selectedSale.customer.address && (
                        <div className="flex justify-between">
                          <span>DIRECCIÓN:</span>
                          <span className="font-extrabold uppercase truncate max-w-[150px]">{selectedSale.customer.address}</span>
                        </div>
                      )}
                      {selectedSale.customer.email && (
                        <div className="flex justify-between">
                          <span>EMAIL:</span>
                          <span className="font-semibold text-[9px] truncate max-w-[150px]">{selectedSale.customer.email}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Sale Items Table */}
                  <div className="space-y-2 border-b-2 border-dashed border-black/40 pb-4">
                    <div className="flex justify-between text-[10px] font-black border-b border-black pb-1 uppercase">
                      <span className="w-1/2">CONCEPTO</span>
                      <span className="w-1/6 text-center">CANT</span>
                      <span className="w-1/3 text-right">TOTAL</span>
                    </div>
                    
                    {selectedSale.items.map((it, idx) => {
                      const menuItem = menuItems.find(m => m.id === it.menuItemId);
                      const isShortage = menuItem ? hasIngredientShortage(menuItem) : false;
                      
                      return (
                        <div key={idx} className="space-y-1 py-1 border-b border-dashed border-zinc-100 last:border-0">
                          <div className="flex justify-between text-[10px] text-black font-bold">
                            <span className="w-1/2 truncate uppercase">
                              {it.name}
                              {it.discountPercent && it.discountPercent > 0 ? ` (-${it.discountPercent}%)` : ''}
                            </span>
                            <span className="w-1/6 text-center">{it.quantity}</span>
                            <span className="w-1/3 text-right">
                              {it.discountPercent && it.discountPercent > 0 ? (
                                <span>
                                  <span className="line-through text-zinc-400 text-[8px] mr-1">
                                    ${formatNum(it.price * it.quantity)}
                                  </span>
                                  ${formatNum((it.price * it.quantity) * (1 - it.discountPercent / 100))}
                                </span>
                              ) : (
                                `$${formatNum(it.price * it.quantity)}`
                              )}
                            </span>
                          </div>
                          {isShortage && (
                            <div className="bg-red-50 text-red-600 text-[8px] p-1 border border-red-200 rounded font-bold uppercase text-left leading-normal">
                              ⚠️ A ESTE PRODUCTO LE FALTAN INGREDIENTES. POR FAVOR, VERIFICA QUE EL STOCK ESTÉ LLENO.
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Calculations */}
                  <div className="space-y-1 text-right text-[10px] text-black font-bold">
                    <div className="flex justify-between">
                      <span>SUBTOTAL (SIN IVA):</span>
                      <span>${formatNum(selectedSale.total)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>IVA (0%):</span>
                      <span>$0.00</span>
                    </div>
                    <div className="flex justify-between text-xs font-black border-t border-black pt-1">
                      <span>TOTAL A PAGAR:</span>
                      <span>${formatNum(selectedSale.total)} USD</span>
                    </div>
                    {selectedSale.paymentMethod === 'efectivo' && (
                      <div className="pt-2 text-[10px] border-t border-dashed border-black/20 space-y-1">
                        <div className="flex justify-between text-zinc-600">
                          <span>EFECTIVO ENTREGADO:</span>
                          <span>${formatNum(selectedSale.cashReceived || 0)} USD</span>
                        </div>
                        <div className="flex justify-between text-emerald-700 font-extrabold">
                          <span>CAMBIO ENTREGADO:</span>
                          <span>${formatNum(selectedSale.changeGiven || 0)} USD</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Ticket Footer */}
                  <div className="text-center pt-4 border-t-2 border-dashed border-black/40 text-[9px] font-bold space-y-1">
                    <p className="uppercase font-extrabold">¡GRACIAS POR TU VISITA!</p>
                    <p className="uppercase">DOCUMENTO SIN VALIDEZ TRIBUTARIA</p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="bg-pink-100 p-4 border-t-3 border-black flex flex-wrap gap-3 justify-between items-center">
                {/* Left side: Void and Delete actions */}
                <div className="flex flex-wrap gap-2.5 items-center">
                  {selectedSale.status !== 'voided' ? (
                    confirmVoidId === selectedSale.id ? (
                      <div className="flex items-center gap-1.5 bg-yellow-100 border-2 border-black p-1 rounded-lg shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)]">
                        <span className="text-[9px] font-black uppercase text-black px-1">¿ANULAR NOTA?</span>
                        <button
                          onClick={() => {
                            onVoidSale(selectedSale.id);
                            setSelectedSale({ ...selectedSale, status: 'voided' });
                            setConfirmVoidId(null);
                          }}
                          className="bg-red-500 hover:bg-red-600 text-white border-2 border-black rounded px-2 py-0.5 text-[9px] font-black uppercase cursor-pointer transition-colors"
                        >
                          SÍ, ANULAR
                        </button>
                        <button
                          onClick={() => setConfirmVoidId(null)}
                          className="bg-zinc-200 hover:bg-zinc-300 text-black border-2 border-black rounded px-2 py-0.5 text-[9px] font-black uppercase cursor-pointer transition-colors"
                        >
                          NO
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setConfirmVoidId(selectedSale.id);
                          setConfirmDeleteId(null);
                        }}
                        className="flex items-center gap-1.5 bg-yellow-400 hover:bg-yellow-500 text-black border-3 border-black rounded-lg px-3.5 py-2 text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-[2.5px_2.5px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] active:translate-x-[1px] active:translate-y-[1px]"
                      >
                        <Ban className="w-4 h-4 stroke-[2.5]" />
                        ANULAR VENTA
                      </button>
                    )
                  ) : (
                    <span className="text-[9px] bg-red-100 text-red-700 border border-red-300 font-black px-2.5 py-1.5 rounded uppercase flex items-center gap-1.5 animate-pulse">
                      <Ban className="w-3.5 h-3.5" /> NOTA ANULADA (STOCK RESTAURADO)
                    </span>
                  )}

                  {confirmDeleteId === selectedSale.id ? (
                    <div className="flex items-center gap-1.5 bg-red-50 border-2 border-black p-1 rounded-lg shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)]">
                      <span className="text-[9px] font-black uppercase text-red-600 px-1">¿ELIMINAR DEFINITIVO?</span>
                      <button
                        onClick={() => {
                          onDeleteSale(selectedSale.id);
                          setSelectedSale(null);
                          setConfirmDeleteId(null);
                        }}
                        className="bg-red-600 hover:bg-red-700 text-white border-2 border-black rounded px-2 py-0.5 text-[9px] font-black uppercase cursor-pointer transition-colors"
                      >
                        ELIMINAR
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="bg-zinc-200 hover:bg-zinc-300 text-black border-2 border-black rounded px-2 py-0.5 text-[9px] font-black uppercase cursor-pointer transition-colors"
                      >
                        NO
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setConfirmDeleteId(selectedSale.id);
                        setConfirmVoidId(null);
                      }}
                      className="flex items-center gap-1.5 bg-red-500 hover:bg-red-600 text-white border-3 border-black rounded-lg px-3.5 py-2 text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-[2.5px_2.5px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] active:translate-x-[1px] active:translate-y-[1px]"
                    >
                      <Trash2 className="w-4 h-4" />
                      ELIMINAR
                    </button>
                  )}
                </div>

                {/* Right side: Reprint */}
                <button
                  onClick={handlePrint}
                  className="flex items-center gap-2 bg-lime-300 hover:bg-lime-400 text-black border-3 border-black rounded-lg px-4 py-2.5 text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-[2.5px_2.5px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] active:translate-x-[1px] active:translate-y-[1px]"
                >
                  <Printer className="w-4 h-4 stroke-[2.5]" />
                  REIMPRIMIR NOTA
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
