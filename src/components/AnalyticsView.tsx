/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  DollarSign, 
  Percent, 
  Trash2, 
  ArrowUpRight, 
  ArrowDownRight, 
  Activity,
  Sparkles,
  ShieldAlert,
  CheckCircle,
  Clock,
  Award,
  Download
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { Sale, Expense, Shift } from '../types';
import RetroSelect from './RetroSelect';
import RetroDatePicker from './RetroDatePicker';
import { formatNum } from '../utils';

interface AnalyticsViewProps {
  sales: Sale[];
  expenses: Expense[];
  shifts?: Shift[];
  onAddExpense: (expense: Omit<Expense, 'id' | 'timestamp'>) => void;
  onRemoveExpense: (expenseId: string) => void;
}

export default function AnalyticsView({
  sales,
  expenses,
  shifts = [],
  onAddExpense,
  onRemoveExpense,
}: AnalyticsViewProps) {
  const [filterPeriod, setFilterPeriod] = useState<'today' | '7d' | '30d' | 'custom' | 'all'>('today');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCat, setExpenseCat] = useState<'insumos' | 'servicios' | 'renta' | 'otros'>('insumos');
  
  // Ledger view filters
  const [ledgerType, setLedgerType] = useState<'all' | 'income' | 'expense'>('all');
  const [ledgerCurrentPage, setLedgerCurrentPage] = useState(1);

  React.useEffect(() => {
    setLedgerCurrentPage(1);
  }, [ledgerType, filterPeriod, startDate, endDate]);

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

  const activeSales = sales.filter(s => s.status === 'completed' && checkWithinPeriod(s.timestamp));
  const activeExpenses = expenses.filter(e => checkWithinPeriod(e.timestamp));
  const activeShifts = (shifts || []).filter(s => checkWithinPeriod(s.startTime));

  // Calculate shift discrepancies within the selected period (netted per shift)
  let cashShortages = 0;
  let cashSurpluses = 0;

  activeShifts.forEach(s => {
    if (s.status === 'closed') {
      const cashDiff = (s.cashEndActual ?? 0) - (s.cashEndExpected ?? 0);
      const transferDiff = (s.transfersActual ?? 0) - (s.transfersExpected ?? 0);
      const netShiftDiff = cashDiff + transferDiff;

      if (netShiftDiff < -0.01) {
        cashShortages += Math.abs(netShiftDiff);
      } else if (netShiftDiff > 0.01) {
        cashSurpluses += netShiftDiff;
      }
    }
  });

  const totalDiscrepanciesLosses = cashShortages;
  const totalDiscrepanciesGains = cashSurpluses;

  // Financial calculations
  const totalSalesRevenue = activeSales.reduce((sum, s) => sum + s.total, 0);
  const totalInsumosCost = activeSales.reduce((sum, s) => sum + s.cost, 0);
  const totalOperationalExpenses = activeExpenses.reduce((sum, e) => sum + e.amount, 0);
  
  // Total revenue is sales + net shift surpluses
  const totalRevenue = totalSalesRevenue + totalDiscrepanciesGains;

  // Total expenses include manual operational expenses and net shift shortages (avoiding double-counting with recipe costs)
  const totalExpensesCombined = totalOperationalExpenses + totalDiscrepanciesLosses;
  
  // Net profit is total revenues minus total expenses
  const netProfit = totalRevenue - totalExpensesCombined;
  const profitMarginPercentage = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
  
  const totalTransactions = activeSales.length;
  const averageTicket = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

  // Render dynamic data for performance trend charts matching the selected period
  const getWeeklyTrendData = () => {
    const trend: { [key: string]: { total: number; cost: number; dateLabel: string } } = {};
    
    if (filterPeriod === 'today') {
      const slots = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00'];
      slots.forEach(slot => {
        trend[slot] = { total: 0, cost: 0, dateLabel: slot };
      });
    } else if (filterPeriod === '7d') {
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateString = d.toISOString().split('T')[0];
        const dayName = d.toLocaleDateString('es-ES', { weekday: 'short' });
        trend[dateString] = { total: 0, cost: 0, dateLabel: dayName };
      }
    } else if (filterPeriod === '30d') {
      for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateString = d.toISOString().split('T')[0];
        const dayLabel = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
        trend[dateString] = { total: 0, cost: 0, dateLabel: dayLabel };
      }
    } else if (filterPeriod === 'custom' && startDate && endDate) {
      const start = new Date(startDate + 'T12:00:00');
      const end = new Date(endDate + 'T12:00:00');
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const limit = Math.min(diffDays, 60);
      
      for (let i = 0; i <= limit; i++) {
        const d = new Date(start.getTime());
        d.setDate(d.getDate() + i);
        const dateString = d.toISOString().split('T')[0];
        const dayLabel = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
        trend[dateString] = { total: 0, cost: 0, dateLabel: dayLabel };
      }
    } else {
      // 'all' or fallback
      let oldestDate = new Date();
      oldestDate.setDate(oldestDate.getDate() - 30);
      
      const allTimestamps = [
        ...sales.map(s => s.timestamp),
        ...expenses.map(e => e.timestamp)
      ].filter(Boolean);
      
      if (allTimestamps.length > 0) {
        const minTime = Math.min(...allTimestamps.map(t => new Date(t).getTime()));
        oldestDate = new Date(minTime);
      }
      
      const today = new Date();
      const diffTime = Math.abs(today.getTime() - oldestDate.getTime());
      const diffDays = Math.min(Math.ceil(diffTime / (1000 * 60 * 60 * 24)), 30);
      
      for (let i = diffDays; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateString = d.toISOString().split('T')[0];
        const dayLabel = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
        trend[dateString] = { total: 0, cost: 0, dateLabel: dayLabel };
      }
    }

    const getTrendKey = (timestampStr: string) => {
      if (filterPeriod === 'today') {
        const dateObj = new Date(timestampStr);
        const hour = dateObj.getHours();
        if (hour < 10) return '08:00';
        if (hour < 12) return '10:00';
        if (hour < 14) return '12:00';
        if (hour < 16) return '14:00';
        if (hour < 18) return '16:00';
        if (hour < 20) return '18:00';
        if (hour < 22) return '20:00';
        return '22:00';
      }
      return timestampStr.split('T')[0];
    };

    // Populate from real sales list
    sales.forEach(sale => {
      if (sale.status !== 'completed') return;
      const trendKey = getTrendKey(sale.timestamp);
      if (trend[trendKey]) {
        trend[trendKey].total += sale.total;
      }
    });

    // Populate from operational expenses
    expenses.forEach(expense => {
      const trendKey = getTrendKey(expense.timestamp);
      if (trend[trendKey]) {
        trend[trendKey].cost += expense.amount;
      }
    });

    // Populate from shift discrepancies (shortages add to cost, surpluses add to total)
    (shifts || []).forEach(shift => {
      if (shift.status === 'closed') {
        const dateStr = (shift.endTime || shift.startTime);
        const trendKey = getTrendKey(dateStr);
        if (trend[trendKey]) {
          const cashDiff = (shift.cashEndActual ?? 0) - (shift.cashEndExpected ?? 0);
          const transferDiff = (shift.transfersActual ?? 0) - (shift.transfersExpected ?? 0);
          const netShiftDiff = cashDiff + transferDiff;

          if (netShiftDiff < -0.01) {
            trend[trendKey].cost += Math.abs(netShiftDiff);
          } else if (netShiftDiff > 0.01) {
            trend[trendKey].total += netShiftDiff;
          }
        }
      }
    });

    return Object.values(trend);
  };

  const weeklyTrend = getWeeklyTrendData();

  // Category sales breakdown
  const getCategorySalesBreakdown = () => {
    const breakdown: { [key: string]: number } = {
      cafes: 0,
      bebidas_frias: 0,
      reposteria: 0,
      alimentos: 0,
    };

    let cachedMenuItems: any[] = [];
    try {
      const stored = localStorage.getItem('caf_menu_items');
      if (stored) {
        cachedMenuItems = JSON.parse(stored);
      }
    } catch (e) {
      console.warn("Failed to parse cached menu items", e);
    }

    activeSales.forEach(sale => {
      sale.items.forEach(item => {
        const menuItem = cachedMenuItems.find(m => m.id === item.menuItemId);
        const category = menuItem?.category;

        if (category === 'cafes' || category === 'cafe_caliente' || category === 'tes_infusiones') {
          breakdown.cafes += item.price * item.quantity;
        } else if (
          category === 'bebidas_frias' || 
          category === 'bebidas_frias_frappes' || 
          category === 'zumos_jugos' || 
          category === 'bebidas_envasadas' || 
          category === 'bebidas_alcoholicas'
        ) {
          breakdown.bebidas_frias += item.price * item.quantity;
        } else if (category === 'reposteria') {
          breakdown.reposteria += item.price * item.quantity;
        } else if (category === 'alimentos') {
          breakdown.alimentos += item.price * item.quantity;
        } else {
          const lowerName = item.name?.toLowerCase() || '';
          if (
            item.menuItemId.includes('espresso') || 
            item.menuItemId.includes('americano') || 
            item.menuItemId.includes('cappuccino') || 
            item.menuItemId.includes('macchiato') ||
            lowerName.includes('café') ||
            lowerName.includes('cafe') ||
            lowerName.includes('té') ||
            lowerName.includes('te') ||
            lowerName.includes('infusión') ||
            lowerName.includes('infusion')
          ) {
            breakdown.cafes += item.price * item.quantity;
          } else if (
            item.menuItemId.includes('iced') || 
            item.menuItemId.includes('latte') ||
            lowerName.includes('frappé') ||
            lowerName.includes('frappe') ||
            lowerName.includes('jugo') ||
            lowerName.includes('sumo') ||
            lowerName.includes('envasada') ||
            lowerName.includes('cerveza') ||
            lowerName.includes('vino')
          ) {
            breakdown.bebidas_frias += item.price * item.quantity;
          } else if (item.menuItemId.includes('croissant') || item.menuItemId.includes('tart') || item.menuItemId.includes('reposteria')) {
            breakdown.reposteria += item.price * item.quantity;
          } else {
            breakdown.alimentos += item.price * item.quantity;
          }
        }
      });
    });

    return breakdown;
  };

  const categorySales = getCategorySalesBreakdown();
  const maxCategorySale = Math.max(...Object.values(categorySales), 1);

  // Top 5 Best Selling Products
  const getTopProducts = () => {
    const productSales: { [name: string]: { name: string; quantity: number; revenue: number } } = {};
    
    activeSales.forEach(sale => {
      sale.items.forEach(item => {
        const name = item.name || 'Producto General';
        if (!productSales[name]) {
          productSales[name] = { name, quantity: 0, revenue: 0 };
        }
        productSales[name].quantity += item.quantity;
        productSales[name].revenue += item.price * item.quantity;
      });
    });
    
    return Object.values(productSales)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);
  };

  const topProducts = getTopProducts();
  const maxProductQty = Math.max(...topProducts.map(p => p.quantity), 1);

  const handleExpenseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(expenseAmount);
    if (!expenseDesc || isNaN(amount) || amount <= 0) return;

    onAddExpense({
      description: expenseDesc,
      category: expenseCat,
      amount,
    });

    setExpenseDesc('');
    setExpenseAmount('');
    setExpenseCat('insumos');
  };

  // Combine sales, expenses, and shift discrepancies into a single ledger timeline
  const getGeneralLedger = () => {
    const ledger: {
      id: string;
      timestamp: string;
      type: 'income' | 'expense';
      description: string;
      category: string;
      amount: number;
    }[] = [];

    activeSales.forEach(s => {
      ledger.push({
        id: s.id,
        timestamp: s.timestamp,
        type: 'income',
        description: `Venta POS (${s.items.length} prod. - ${s.paymentMethod})`,
        category: 'Ventas',
        amount: s.total
      });
    });

    activeExpenses.forEach(e => {
      ledger.push({
        id: e.id,
        timestamp: e.timestamp,
        type: 'expense',
        description: e.description,
        category: e.category,
        amount: e.amount
      });
    });

    activeShifts.forEach(s => {
      if (s.status === 'closed') {
        const cashDiff = (s.cashEndActual ?? 0) - (s.cashEndExpected ?? 0);
        const transferDiff = (s.transfersActual ?? 0) - (s.transfersExpected ?? 0);
        const netShiftDiff = cashDiff + transferDiff;

        if (netShiftDiff < -0.01) {
          ledger.push({
            id: `shift_net_adj_${s.id}`,
            timestamp: s.endTime || s.startTime,
            type: 'expense',
            description: `Faltante Arqueo de Caja (Turno: ${s.employeeName})`,
            category: 'Ajuste de Arqueo',
            amount: Math.abs(netShiftDiff)
          });
        } else if (netShiftDiff > 0.01) {
          ledger.push({
            id: `shift_net_adj_${s.id}`,
            timestamp: s.endTime || s.startTime,
            type: 'income',
            description: `Sobrante Arqueo de Caja (Turno: ${s.employeeName})`,
            category: 'Ajuste de Arqueo',
            amount: netShiftDiff
          });
        }
      }
    });

    return ledger.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  };

  const fullLedger = getGeneralLedger().filter(item => {
    if (ledgerType === 'all') return true;
    if (ledgerType === 'income') return item.type === 'income';
    return item.type === 'expense';
  });

  const downloadSalesReportPDF = () => {
    const doc = new jsPDF();
    
    // Header banner
    doc.setFillColor(31, 41, 55); // Dark neutral grey
    doc.rect(0, 0, 210, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('REPORTE CONTABLE Y DE VENTAS', 15, 18);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('SISTEMA CENTRAL DE CONTROL Y AUDITORÍA - CAFETERÍA POS', 15, 25);
    doc.text(`Generado: ${new Date().toLocaleString('es-ES')}`, 15, 31);
    
    // Brand signature at top right
    doc.setFont('helvetica', 'bold');
    doc.text('CAFETERÍA POS', 150, 18);
    doc.setFont('helvetica', 'normal');
    doc.text('FINANCIAL REPORT v1.2', 150, 25);

    let y = 52;

    // Subheader: Period details
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text('PERÍODO REPORTADO:', 15, y);
    y += 6;
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(80, 80, 80);
    
    let periodText = '';
    if (filterPeriod === 'today') periodText = 'HOY (VENTAS DEL DÍA)';
    else if (filterPeriod === '7d') periodText = 'ÚLTIMOS 7 DÍAS';
    else if (filterPeriod === '30d') periodText = 'ÚLTIMOS 30 DÍAS';
    else if (filterPeriod === 'custom') periodText = `RANGO PERSONALIZADO: Desde ${startDate || 'Apertura'} hasta ${endDate || 'Cierre'}`;
    else periodText = 'TODO EL HISTORIAL ACUMULADO';
    
    doc.text(periodText.toUpperCase(), 18, y);
    y += 12;

    // Financial KPI box grid (6 boxes, laid out as a table or 3 cols x 2 rows)
    // We have 180mm width. Columns can be 58mm wide with 3mm gaps.
    // Col 1: 15 to 73. Col 2: 76 to 134. Col 3: 137 to 195.
    
    // Row 1 box height = 24
    doc.setFillColor(243, 244, 246); // bg-gray-100
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.4);
    
    // Draw Row 1 Boxes
    doc.rect(15, y, 56, 22, 'F');
    doc.rect(15, y, 56, 22, 'D');
    doc.rect(75, y, 56, 22, 'F');
    doc.rect(75, y, 56, 22, 'D');
    doc.rect(135, y, 60, 22, 'F');
    doc.rect(135, y, 60, 22, 'D');
    
    // Row 1 Content
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 100, 100);
    doc.text('INGRESOS NETOS', 18, y + 6);
    doc.text('EGRESOS TOTALES', 78, y + 6);
    doc.text('UTILIDAD NETA', 138, y + 6);
    
    doc.setFontSize(12.5);
    doc.setTextColor(0, 0, 0);
    doc.text(`$${formatNum(totalRevenue)}`, 18, y + 14);
    doc.text(`$${formatNum(totalExpensesCombined)}`, 78, y + 14);
    
    // Profit color coding
    if (netProfit >= 0) {
      doc.setTextColor(16, 120, 80); // green
      doc.text(`+$${formatNum(netProfit)}`, 138, y + 14);
    } else {
      doc.setTextColor(180, 30, 30); // red
      doc.text(`-$${formatNum(Math.abs(netProfit))}`, 138, y + 14);
    }
    
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text(`${totalTransactions} transacciones${totalDiscrepanciesGains > 0 ? ` | Sobrante: $${formatNum(totalDiscrepanciesGains, 1)}` : ''}`, 18, y + 19);
    doc.text(`Gastos Op: $${formatNum(totalOperationalExpenses, 1)} | Receta: $${formatNum(totalInsumosCost, 1)}${totalDiscrepanciesLosses > 0 ? ` | Faltante: $${formatNum(totalDiscrepanciesLosses, 1)}` : ''}`, 78, y + 19);
    doc.text('Ingresos menos Egresos', 138, y + 19);
    
    y += 26;

    // Draw Row 2 Boxes
    doc.setFillColor(243, 244, 246);
    doc.rect(15, y, 56, 22, 'F');
    doc.rect(15, y, 56, 22, 'D');
    doc.rect(75, y, 56, 22, 'F');
    doc.rect(75, y, 56, 22, 'D');
    doc.rect(135, y, 60, 22, 'F');
    doc.rect(135, y, 60, 22, 'D');

    // Row 2 Content
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 100, 100);
    doc.text('MARGEN DE UTILIDAD', 18, y + 6);
    doc.text('TICKET PROMEDIO', 78, y + 6);
    doc.text('TRANSACCIONES', 138, y + 6);

    doc.setFontSize(12.5);
    doc.setTextColor(0, 0, 0);
    
    // Margin color coding
    if (profitMarginPercentage >= 0) {
      doc.setTextColor(16, 120, 80);
    } else {
      doc.setTextColor(180, 30, 30);
    }
    doc.text(`${formatNum(profitMarginPercentage)}%`, 18, y + 14);
    doc.setTextColor(0, 0, 0);
    
    doc.text(`$${formatNum(averageTicket)}`, 78, y + 14);
    doc.text(`${totalTransactions} Ventas`, 138, y + 14);

    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text('Rentabilidad neta', 18, y + 19);
    doc.text('Monto prom. por ticket', 78, y + 19);
    doc.text('Aprobadas en caja', 138, y + 19);

    y += 33;

    // Side-by-side breakdowns: Category sales vs Top Products
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('VENTAS POR CATEGORÍA:', 15, y);
    doc.text('TOP 5 PRODUCTOS MÁS VENDIDOS:', 105, y);
    
    y += 5;
    
    // Box for Categories
    doc.setFillColor(250, 250, 251);
    doc.rect(15, y, 80, 38, 'F');
    doc.rect(15, y, 80, 38, 'D');
    
    // Box for Top Products
    doc.rect(105, y, 90, 38, 'F');
    doc.rect(105, y, 90, 38, 'D');
    
    // Render categories data inside left box
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(50, 50, 50);
    
    let catY = y + 7;
    const catKeys = [
      { label: 'CAFÉS', val: categorySales.cafes },
      { label: 'BEBIDAS FRÍAS', val: categorySales.bebidas_frias },
      { label: 'REPOSTERÍA', val: categorySales.reposteria },
      { label: 'ALIMENTOS / OTROS', val: categorySales.alimentos }
    ];
    
    catKeys.forEach(cat => {
      doc.setFont('helvetica', 'bold');
      doc.text(cat.label, 18, catY);
      doc.setFont('helvetica', 'normal');
      doc.text(`$${formatNum(cat.val)}`, 85, catY, { align: 'right' });
      catY += 7.5;
    });

    // Render top products inside right box
    let prodY = y + 7;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    if (topProducts.length === 0) {
      doc.setTextColor(120, 120, 120);
      doc.text('Sin registros de ventas en este período.', 108, prodY);
    } else {
      topProducts.forEach((prod, idx) => {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(40, 40, 40);
        let nameTrunc = `${idx + 1}. ${prod.name}`;
        if (nameTrunc.length > 22) nameTrunc = nameTrunc.substring(0, 20) + '..';
        doc.text(nameTrunc.toUpperCase(), 108, prodY);
        
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(80, 80, 80);
        doc.text(`(${prod.quantity} u.)`, 160, prodY);
        
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text(`$${formatNum(prod.revenue)}`, 190, prodY, { align: 'right' });
        
        prodY += 6.5;
      });
    }

    y += 48;

    // Section 3: Ledger / Diario de Caja
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('LIBRO DIARIO DE CAJA Y CONTABILIDAD (MOVIMIENTOS)', 15, y);
    y += 5;

    // Table Header for Ledger
    doc.setFillColor(31, 41, 55); // Dark background
    doc.rect(15, y, 180, 8, 'F');
    doc.rect(15, y, 180, 8, 'D');
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text('Fecha / Hora', 17, y + 5.5);
    doc.text('Tipo', 50, y + 5.5);
    doc.text('Categoría', 72, y + 5.5);
    doc.text('Descripción / Detalle', 104, y + 5.5);
    doc.text('Monto', 184, y + 5.5);

    y += 8;

    // Render ledger items
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    
    let rowsOnCurrentPage = 0;
    fullLedger.forEach((item, index) => {
      // Check pagination boundary: 10 rows per page in PDF tables
      if (rowsOnCurrentPage >= 10) {
        doc.addPage();
        rowsOnCurrentPage = 0;
        
        // Page header continuation
        doc.setFillColor(31, 41, 55);
        doc.rect(0, 0, 210, 16, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.text('LIBRO DIARIO DE CAJA (CONTINUACIÓN)', 15, 11);
        
        y = 25;
        
        // Table Header on new page
        doc.setFillColor(31, 41, 55);
        doc.rect(15, y, 180, 8, 'F');
        doc.rect(15, y, 180, 8, 'D');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text('Fecha / Hora', 17, y + 5.5);
        doc.text('Tipo', 50, y + 5.5);
        doc.text('Categoría', 72, y + 5.5);
        doc.text('Descripción / Detalle', 104, y + 5.5);
        doc.text('Monto', 184, y + 5.5);
        
        y += 8;
      }

      // Zebra background striping
      if (index % 2 === 0) {
        doc.setFillColor(249, 250, 251);
        doc.rect(15, y, 180, 9, 'F');
      }
      doc.setDrawColor(220, 220, 222);
      doc.rect(15, y, 180, 9, 'D');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(0, 0, 0);

      // Date Format: DD/MM/AAAA HH:MM
      let dateFormatted = '';
      try {
        const d = new Date(item.timestamp);
        dateFormatted = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
      } catch {
        dateFormatted = item.timestamp.replace('T', ' ').substring(0, 16);
      }
      doc.text(dateFormatted, 17, y + 6);

      // Type (Ingreso / Egreso) with custom bold coloring
      doc.setFont('helvetica', 'bold');
      if (item.type === 'income') {
        doc.setTextColor(16, 120, 80); // green
        doc.text('INGRESO (+)', 50, y + 6);
      } else {
        doc.setTextColor(180, 30, 30); // red
        doc.text('EGRESO (-)', 50, y + 6);
      }
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');

      // Category
      doc.text(item.category.toUpperCase(), 72, y + 6);

      // Description (truncate if too long)
      let descTrunc = item.description;
      if (descTrunc.length > 44) {
        descTrunc = descTrunc.substring(0, 42) + '...';
      }
      doc.text(descTrunc, 104, y + 6);

      // Amount
      doc.setFont('helvetica', 'bold');
      if (item.type === 'income') {
        doc.text(`$${formatNum(item.amount)}`, 190, y + 6, { align: 'right' });
      } else {
        doc.setTextColor(180, 30, 30);
        doc.text(`$${formatNum(item.amount)}`, 190, y + 6, { align: 'right' });
      }
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');

      y += 9;
      rowsOnCurrentPage++;
    });

    // Signature footer
    if (y > 255) {
      doc.addPage();
      y = 20;
    }

    y += 12;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.4);
    doc.line(15, y, 195, y);
    
    y += 5;
    doc.setFontSize(7.5);
    doc.setTextColor(120, 120, 120);
    doc.text('Este reporte consolidado y libro diario financiero es un registro fidedigno generado automáticamente por el POS.', 15, y);
    doc.text('Los montos de egresos reflejan costos directos declarados e insumos calculados por las ventas registradas.', 15, y + 4);

    doc.save(`Reporte_Ventas_POS_${new Date().toISOString().substring(0, 10)}.pdf`);
  };

  return (
    <div className="space-y-8" id="analytics-container">
      {/* Header filter options */}
      <div className="bg-white border-4 border-black rounded-xl p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-retro-heavy text-base uppercase text-black">📈 MONITOREO DE CAJA Y CONTABILIDAD</h2>
          <p className="text-xs font-bold text-zinc-600 mt-0.5 uppercase">Auditoría financiera y márgenes netos en tiempo real</p>
          <button
            onClick={downloadSalesReportPDF}
            className="mt-3.5 flex items-center gap-2 bg-black hover:bg-neutral-800 text-white border-2 border-black rounded-lg px-4 py-2 text-xs font-retro-heavy uppercase tracking-wider transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(240,240,240,1)] active:translate-y-0.5"
            title="Descargar reporte completo de ventas y contabilidad en formato PDF"
          >
            <Download className="w-4 h-4 stroke-[3]" />
            DESCARGAR REPORTE (PDF)
          </button>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="flex flex-wrap gap-2">
            {(['today', '7d', '30d', 'custom', 'all'] as const).map((period) => (
              <button
                key={period}
                onClick={() => setFilterPeriod(period)}
                className={`px-4.5 py-2.5 border-3 border-black rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                  filterPeriod === period
                    ? 'bg-fuchsia-400 text-black shadow-[2px_2px_0px_0px_#000] translate-x-[-1px] translate-y-[-1px]'
                    : 'bg-white text-black hover:bg-yellow-100 shadow-[2px_2px_0px_0px_#000] active:translate-y-0.5'
                }`}
              >
                {period === 'today' ? 'Hoy' : period === '7d' ? '7 Días' : period === '30d' ? '30 Días' : period === 'custom' ? 'Rango' : 'Todo'}
              </button>
            ))}
          </div>

          {filterPeriod === 'custom' && (
            <div className="flex flex-wrap items-center gap-3.5 bg-pink-100 border-3 border-black p-2.5 rounded-xl shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
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
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5" id="analytics-kpi-cards">
        {/* Total revenue */}
        <div className="bg-[#bae6fd] border-3 border-black rounded-xl p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest text-black font-black font-retro-mono">INGRESOS NETOS</span>
            <div className="w-8 h-8 rounded border-2 border-black bg-white text-black flex items-center justify-center">
              <ArrowUpRight className="w-4 h-4 stroke-[2.5]" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-retro-heavy text-black">${formatNum(totalRevenue)}</h3>
            <p className="text-[10px] font-bold text-zinc-700 uppercase mt-1">
              {totalTransactions} ventas aprobadas
              {totalDiscrepanciesGains > 0 && ` | Sobrante: $${formatNum(totalDiscrepanciesGains, 1)}`}
            </p>
          </div>
        </div>

        {/* Expenses */}
        <div className="bg-[#fecdd3] border-3 border-black rounded-xl p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest text-black font-black font-retro-mono">EGRESOS TOTALES</span>
            <div className="w-8 h-8 rounded border-2 border-black bg-white text-black flex items-center justify-center">
              <ArrowDownRight className="w-4 h-4 stroke-[2.5]" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-retro-heavy text-black">${formatNum(totalExpensesCombined)}</h3>
            <p className="text-[10px] font-bold text-zinc-700 uppercase mt-1">
              Gastos Op: ${formatNum(totalOperationalExpenses, 1)} | Receta: ${formatNum(totalInsumosCost, 1)}
              {totalDiscrepanciesLosses > 0 && ` | Faltante: $${formatNum(totalDiscrepanciesLosses, 1)}`}
            </p>
          </div>
        </div>

        {/* Net Profit */}
        <div className={`border-3 border-black rounded-xl p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between ${
          netProfit >= 0 ? 'bg-[#d9f99d]' : 'bg-red-300'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest text-black font-black font-retro-mono">UTILIDAD NETA</span>
            <div className="w-8 h-8 rounded border-2 border-black bg-white text-black flex items-center justify-center">
              <DollarSign className="w-4 h-4 stroke-[2.5]" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-retro-heavy text-black">
              ${formatNum(netProfit)}
            </h3>
            <p className="text-[10px] font-bold text-zinc-700 uppercase mt-1">Ingresos menos Egresos</p>
          </div>
        </div>

        {/* Profit Margin */}
        <div className="bg-[#f5d0fe] border-3 border-black rounded-xl p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest text-black font-black font-retro-mono">TICKET PROMEDIO</span>
            <div className="w-8 h-8 rounded border-2 border-black bg-white text-black flex items-center justify-center">
              <Percent className="w-4 h-4 stroke-[2.5]" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-retro-heavy text-black">{formatNum(profitMarginPercentage, 1)}%</h3>
            <p className="text-[10px] font-bold text-zinc-700 uppercase mt-1">Venta prom: ${formatNum(averageTicket)} USD</p>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8" id="analytics-charts-grid">
        
        {/* Trend line chart */}
        <div className="lg:col-span-8 bg-white border-4 border-black rounded-xl p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b-2 border-dashed border-zinc-200 pb-3">
            <div>
              <h3 className="font-retro-heavy text-xs uppercase text-black">🎮 CURVA DE DESEMPEÑO DIARIO</h3>
              <p className="text-[10px] sm:text-xs font-bold text-zinc-600 uppercase mt-0.5">
                {filterPeriod === 'today' ? 'Rendimiento por hora de hoy' : 
                 filterPeriod === '7d' ? 'Comparativa de los últimos 7 días' : 
                 filterPeriod === '30d' ? 'Comparativa de los últimos 30 días' : 
                 filterPeriod === 'custom' ? 'Comparativa del rango seleccionado' : 
                 'Historial de rendimiento completo'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 bg-zinc-100 border-2 border-black px-2.5 py-1.5 rounded-lg shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] text-[10px] font-black uppercase">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-sky-400 border-2 border-black inline-block"></span>
                <span className="text-sky-700">Ingresos</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-rose-400 border-2 border-black inline-block"></span>
                <span className="text-rose-700">Egresos</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-emerald-500 border-2 border-black inline-block"></span>
                <span className="text-emerald-700 font-extrabold bg-emerald-50/80 px-1 rounded border border-emerald-300">Ganancias (Utilidad)</span>
              </div>
            </div>
          </div>

          {/* SVG Line Chart with a 90s grid style */}
          <div className="h-64 w-full relative pt-4 bg-[#f8fafc] border-3 border-black rounded-lg p-2 overflow-hidden shadow-inner flex flex-col justify-between">
            <div className="flex-1 relative h-[180px]">
              {weeklyTrend.length === 0 ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <p className="text-xs font-black uppercase text-zinc-400">Sin datos en este rango</p>
                </div>
              ) : (
                <svg className="w-full h-full" viewBox="0 0 500 200" preserveAspectRatio="none">
                  <defs>
                    <pattern id="chartGridPattern" width="20" height="20" patternUnits="userSpaceOnUse">
                      <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e2e8f0" strokeWidth="1" />
                    </pattern>
                  </defs>

                  {/* Grid Background */}
                  <rect width="100%" height="100%" fill="url(#chartGridPattern)" />

                  {(() => {
                    const totalItems = weeklyTrend.length;
                    const getX = (idx: number) => {
                      if (totalItems <= 1) return 250;
                      return (idx / (totalItems - 1)) * 500;
                    };
                    const maxVal = Math.max(...weeklyTrend.map(i => Math.max(i.total, i.cost, Math.abs(i.total - i.cost))), 100);
                    const showValues = totalItems <= 8;
                    
                    const clampY = (val: number) => {
                      const computed = 180 - (val / maxVal) * 140;
                      return Math.max(5, Math.min(195, computed));
                    };

                    return (
                      <>
                        {/* Area paths */}
                        {/* Ingresos Area */}
                        <path
                          d={`
                            M 0,180
                            ${weeklyTrend.map((t, idx) => {
                              const x = getX(idx);
                              const y = clampY(t.total);
                              return `L ${x},${y}`;
                            }).join(' ')}
                            L 500,180 Z
                          `}
                          fill="#e0f2fe"
                          fillOpacity="0.3"
                        />

                        {/* Egresos Area */}
                        <path
                          d={`
                            M 0,180
                            ${weeklyTrend.map((t, idx) => {
                              const x = getX(idx);
                              const y = clampY(t.cost);
                              return `L ${x},${y}`;
                            }).join(' ')}
                            L 500,180 Z
                          `}
                          fill="#ffe4e6"
                          fillOpacity="0.2"
                        />

                        {/* Ganancias Area */}
                        <path
                          d={`
                            M 0,180
                            ${weeklyTrend.map((t, idx) => {
                              const x = getX(idx);
                              const y = clampY(t.total - t.cost);
                              return `L ${x},${y}`;
                            }).join(' ')}
                            L 500,180 Z
                          `}
                          fill="#d1fae5"
                          fillOpacity="0.4"
                        />

                        {/* Line paths */}
                        {/* Ingresos Line */}
                        <path
                          d={weeklyTrend.map((t, idx) => {
                            const x = getX(idx);
                            const y = clampY(t.total);
                            return `${idx === 0 ? 'M' : 'L'} ${x},${y}`;
                          }).join(' ')}
                          fill="none"
                          stroke="#0ea5e9"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />

                        {/* Egresos Line */}
                        <path
                          d={weeklyTrend.map((t, idx) => {
                            const x = getX(idx);
                            const y = clampY(t.cost);
                            return `${idx === 0 ? 'M' : 'L'} ${x},${y}`;
                          }).join(' ')}
                          fill="none"
                          stroke="#f43f5e"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />

                        {/* Ganancias Line */}
                        <path
                          d={weeklyTrend.map((t, idx) => {
                            const x = getX(idx);
                            const y = clampY(t.total - t.cost);
                            return `${idx === 0 ? 'M' : 'L'} ${x},${y}`;
                          }).join(' ')}
                          fill="none"
                          stroke="#10b981"
                          strokeWidth="4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />

                        {/* Data points */}
                        {weeklyTrend.map((t, idx) => {
                          const x = getX(idx);
                          const yIngresos = clampY(t.total);
                          const yEgresos = clampY(t.cost);
                          const yGanancias = clampY(t.total - t.cost);
                          const profit = t.total - t.cost;
                          return (
                            <g key={idx}>
                              {/* Ingresos dot */}
                              <circle
                                cx={x}
                                cy={yIngresos}
                                r="4"
                                fill="#0ea5e9"
                                stroke="#000"
                                strokeWidth="1.5"
                              />
                              {showValues && (
                                <text
                                  x={x}
                                  y={yIngresos - 7}
                                  textAnchor="middle"
                                  fill="#0369a1"
                                  fontSize="8"
                                  fontWeight="bold"
                                  className="font-retro-mono"
                                >
                                  ${formatNum(t.total, 0)}
                                </text>
                              )}

                              {/* Egresos dot */}
                              <circle
                                cx={x}
                                cy={yEgresos}
                                r="4"
                                fill="#f43f5e"
                                stroke="#000"
                                strokeWidth="1.5"
                              />
                              {showValues && (
                                <text
                                  x={x}
                                  y={yEgresos + 11}
                                  textAnchor="middle"
                                  fill="#be123c"
                                  fontSize="8"
                                  fontWeight="bold"
                                  className="font-retro-mono"
                                >
                                  ${formatNum(t.cost, 0)}
                                </text>
                              )}

                              {/* Ganancias dot */}
                              <circle
                                cx={x}
                                cy={yGanancias}
                                r="5.5"
                                fill="#10b981"
                                stroke="#000"
                                strokeWidth="2"
                              />
                              {showValues && (
                                <text
                                  x={x}
                                  y={yGanancias - 7}
                                  textAnchor="middle"
                                  fill="#047857"
                                  fontSize="8.5"
                                  fontWeight="extrabold"
                                  className="font-retro-mono"
                                >
                                  ${formatNum(profit, 0)}
                                </text>
                              )}
                            </g>
                          );
                        })}
                      </>
                    );
                  })()}
                </svg>
              )}
            </div>

            {/* X-axis Labels */}
            <div className="relative h-6 text-[10px] text-black font-retro-mono font-black uppercase mt-1 pt-1.5 border-t-2 border-dashed border-black/30 w-full">
              {weeklyTrend.map((t, idx) => {
                const totalItems = weeklyTrend.length;
                const shouldShowLabel = 
                  totalItems <= 8 || 
                  idx === 0 || 
                  idx === totalItems - 1 || 
                  (totalItems <= 15 && idx % 2 === 0) || 
                  (totalItems > 15 && idx % 5 === 0);
                
                if (!shouldShowLabel) return null;
                
                const leftPercent = totalItems <= 1 ? 50 : (idx / (totalItems - 1)) * 100;
                return (
                  <span
                    key={idx}
                    style={{
                      left: `${leftPercent}%`,
                      transform: `translateX(-${leftPercent}%)`
                    }}
                    className="absolute top-1.5 capitalize whitespace-nowrap"
                  >
                    {t.dateLabel}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right column: Sales by Category & Top 5 Best Sellers */}
        <div className="lg:col-span-4 space-y-6 flex flex-col justify-between">
          {/* Sales by Category */}
          <div className="bg-white border-4 border-black rounded-xl p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] space-y-5">
            <div>
              <h3 className="font-retro-heavy text-xs uppercase text-black">🍹 VENTAS POR RUBRO</h3>
              <p className="text-xs font-bold text-zinc-600 uppercase mt-0.5">Distribución de demanda total</p>
            </div>

            <div className="space-y-4 pt-1.5 font-bold text-black text-xs">
              {[
                { id: 'cafes', label: 'Cafés Finos Calientes', color: 'bg-lime-300' },
                { id: 'bebidas_frias', label: 'Bebidas Frías', color: 'bg-cyan-300' },
                { id: 'reposteria', label: 'Pastelería Gourmet', color: 'bg-pink-300' },
                { id: 'alimentos', label: 'Comidas / Baguettes', color: 'bg-yellow-300' },
              ].map((cat) => {
                const amount = categorySales[cat.id] || 0;
                const percentage = (amount / maxCategorySale) * 100;
                return (
                  <div key={cat.id} className="space-y-1.5">
                    <div className="flex justify-between text-xs font-black">
                      <span className="uppercase">{cat.label}</span>
                      <span className="font-retro-mono text-black">${formatNum(amount)}</span>
                    </div>
                    <div className="w-full bg-[#f1f5f9] h-4 rounded-md overflow-hidden border-2 border-black shadow-[1.5px_1.5px_0px_0px_#000]">
                      <div 
                        className={`${cat.color} h-full border-r-2 border-black transition-all duration-500`}
                        style={{ width: `${Math.max(percentage, 3)}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top 5 Products Ranking */}
          <div className="bg-white border-4 border-black rounded-xl p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] space-y-5">
            <div className="flex items-center justify-between gap-1.5">
              <div>
                <h3 className="font-retro-heavy text-xs uppercase text-black">🏆 TOP 5 MÁS VENDIDOS</h3>
                <p className="text-xs font-bold text-zinc-600 uppercase mt-0.5">Ranking de volumen de salida</p>
              </div>
              <Award className="w-5 h-5 text-yellow-500 stroke-[2.5] shrink-0" />
            </div>

            <div className="space-y-3.5 pt-1 text-black text-xs font-bold">
              {topProducts.length === 0 ? (
                <div className="text-center py-6 text-zinc-500 border-2 border-dashed border-zinc-200 rounded-lg uppercase text-[10px]">
                  Sin registros en este período
                </div>
              ) : (
                topProducts.map((prod, idx) => {
                  const percentage = (prod.quantity / maxProductQty) * 100;
                  const medalColors = [
                    'bg-[#fde047] text-black border-yellow-600', // Gold
                    'bg-[#e2e8f0] text-black border-slate-400', // Silver
                    'bg-[#f59e0b] text-white border-amber-600', // Bronze
                    'bg-zinc-100 text-zinc-700 border-black',    // 4th
                    'bg-zinc-100 text-zinc-700 border-black'     // 5th
                  ];
                  return (
                    <div key={prod.name} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className={`w-5 h-5 flex items-center justify-center rounded-full border-2 text-[10px] font-black shrink-0 ${medalColors[idx]}`}>
                            {idx + 1}
                          </span>
                          <span className="uppercase truncate tracking-tight text-[11px] font-black">{prod.name}</span>
                        </div>
                        <div className="font-retro-mono text-right shrink-0 flex items-center gap-1.5">
                          <span className="bg-zinc-100 border-2 border-black px-1.5 py-0.5 rounded text-[9px] font-black">{prod.quantity} u.</span>
                          <span className="text-zinc-600 text-[10px] font-extrabold">${formatNum(prod.revenue, 1)}</span>
                        </div>
                      </div>
                      <div className="pl-6.5">
                        <div className="w-full bg-[#f1f5f9] h-3 rounded overflow-hidden border-2 border-black shadow-[1px_1px_0px_0px_#000]">
                          <div 
                            className="bg-emerald-400 h-full border-r-2 border-black transition-all duration-500"
                            style={{ width: `${Math.max(percentage, 3)}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Manual Expense Logger & Ledger Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8" id="analytics-journal-row">
        
        {/* Left Column: Expense Form + Shift Audit Summary */}
        <div className="lg:col-span-4 space-y-8">
          {/* Record Manual Expense Form */}
          <div className="bg-white border-4 border-black rounded-xl p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] space-y-4">
            <div>
              <h3 className="font-retro-heavy text-xs uppercase text-black">🧾 ASIENTO DE GASTO</h3>
              <p className="text-xs font-bold text-zinc-600 uppercase mt-0.5">Amortizaciones, servicios o salarios</p>
            </div>

            <form onSubmit={handleExpenseSubmit} className="space-y-4 text-xs font-bold text-black">
              <div>
                <label className="block font-black uppercase tracking-wide mb-1.5">Descripción del Gasto</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Pago de Internet mensual, Servilletas..."
                  value={expenseDesc}
                  onChange={(e) => setExpenseDesc(e.target.value)}
                  className="w-full border-3 border-black bg-pink-50 rounded-lg p-2.5 focus:outline-none focus:bg-white text-black font-extrabold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block font-black uppercase tracking-wide mb-1.5">Monto (USD)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-black font-black">$</span>
                    <input
                      type="number"
                      step="0.01"
                      required
                      placeholder="0.00"
                      value={expenseAmount}
                      onChange={(e) => setExpenseAmount(e.target.value)}
                      className="w-full pl-7 pr-2.5 py-2.5 border-3 border-black bg-pink-50 rounded-lg focus:outline-none focus:bg-white font-retro-mono font-black text-black"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-black uppercase tracking-wide mb-1.5">Categoría</label>
                    <RetroSelect
                      value={expenseCat}
                      onChange={(val) => setExpenseCat(val as any)}
                      options={[
                        { value: 'insumos', label: 'Insumos (Faltas)' },
                        { value: 'servicios', label: 'Servicios (Luz, Internet)' },
                        { value: 'renta', label: 'Arrendamiento' },
                        { value: 'otros', label: 'Otros Gastos' },
                      ]}
                    />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-lime-300 hover:bg-lime-400 text-black border-3 border-black rounded-lg py-3.5 text-xs font-black shadow-[3px_3px_0px_0px_#000] active:translate-y-0.5 cursor-pointer uppercase tracking-wider"
              >
                REGISTRAR GASTO
              </button>
            </form>
          </div>

          {/* Resumen de Auditoría de Turnos */}
          <div className="bg-[#fef08a] border-4 border-black rounded-xl p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] space-y-3.5">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-black stroke-[2.5]" />
              <h3 className="font-retro-heavy text-xs uppercase text-black">🛡️ CONTROL DE ARQUEOS</h3>
            </div>
            <p className="text-[10px] text-zinc-700 font-bold uppercase leading-tight">Consolidado de descuadres e integridad del dinero en el periodo seleccionado</p>

            <div className="space-y-2.5 pt-1">
              <div className="flex justify-between items-center bg-white border-2 border-black p-2 rounded shadow-[2px_2px_0px_0px_#000] text-xs font-bold">
                <span className="text-zinc-600 uppercase">TURNOS AUDITADOS:</span>
                <span className="font-retro-mono bg-zinc-100 px-1.5 py-0.5 border border-black rounded text-black">{activeShifts.filter(s => s.status === 'closed').length} turnos</span>
              </div>

              <div className="flex justify-between items-center bg-white border-2 border-black p-2 rounded shadow-[2px_2px_0px_0px_#000] text-xs font-bold">
                <span className="text-red-700 uppercase">FALTANTES TOTALES:</span>
                <span className="font-retro-mono text-red-600 bg-red-50 px-1.5 py-0.5 border border-red-200 rounded">-${formatNum(totalDiscrepanciesLosses)}</span>
              </div>

              <div className="flex justify-between items-center bg-white border-2 border-black p-2 rounded shadow-[2px_2px_0px_0px_#000] text-xs font-bold">
                <span className="text-lime-700 uppercase">SOBRANTES TOTALES:</span>
                <span className="font-retro-mono text-lime-600 bg-lime-50 px-1.5 py-0.5 border border-lime-200 rounded">+${formatNum(totalDiscrepanciesGains)}</span>
              </div>

              <div className="flex justify-between items-center bg-white border-2 border-black p-2 rounded shadow-[2px_2px_0px_0px_#000] text-xs font-bold">
                <span className="text-black uppercase">BALANCE NETO CAJA:</span>
                <span className={`font-retro-mono px-1.5 py-0.5 border-2 border-black rounded shadow-[1px_1px_0px_0px_#000] ${
                  totalDiscrepanciesGains - totalDiscrepanciesLosses >= 0
                    ? 'text-black bg-lime-200'
                    : 'text-black bg-red-200'
                }`}>
                  {totalDiscrepanciesGains - totalDiscrepanciesLosses >= 0 ? '+' : ''}
                  ${formatNum(totalDiscrepanciesGains - totalDiscrepanciesLosses)}
                </span>
              </div>
            </div>
            
            <div className="text-[9px] text-zinc-700 font-bold leading-relaxed uppercase border-t border-dashed border-black/20 pt-2">
              * Cualquier descuadre de efectivo físico o transferencias se sincroniza con el libro contable de forma automática para reflejar el dinero real.
            </div>
          </div>
        </div>

        {/* Ledger general journal */}
        <div className="lg:col-span-8 bg-white border-4 border-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] overflow-hidden flex flex-col justify-between" id="analytics-ledger">
          <div>
            <div className="border-b-4 border-black p-5 bg-pink-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-black">
              <div>
                <h3 className="font-retro-heavy text-base uppercase">📔 LIBRO DIARIO CONTABLE</h3>
                <p className="text-xs font-bold uppercase text-black/80 mt-0.5">Flujo unificado de cobros y egresos comerciales</p>
              </div>

              {/* Ledger filters */}
              <div className="flex gap-1.5 bg-white p-1 rounded-lg border-2 border-black shadow-[1.5px_1.5px_0px_0px_#000]">
                {(['all', 'income', 'expense'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setLedgerType(type)}
                    className={`px-3 py-1 rounded text-[9px] font-black tracking-widest uppercase transition-all cursor-pointer ${
                      ledgerType === type
                        ? 'bg-fuchsia-400 text-black border border-black'
                        : 'text-black hover:bg-zinc-100'
                    }`}
                  >
                    {type === 'all' ? 'Todo' : type === 'income' ? 'Cobros' : 'Egresos'}
                  </button>
                ))}
              </div>
            </div>

            {/* Ledger Transactions list */}
            <div className="divide-y-2 divide-dashed divide-black/20 px-1 bg-yellow-50/10">
              {(() => {
                const ITEMS_PER_PAGE = 10;
                const paginatedLedger = fullLedger.slice(
                  (ledgerCurrentPage - 1) * ITEMS_PER_PAGE,
                  ledgerCurrentPage * ITEMS_PER_PAGE
                );

                return (
                  <>
                    {paginatedLedger.map((item) => {
                      const isIncome = item.type === 'income';
                      return (
                        <div key={item.id} className="p-4 flex items-center justify-between gap-4 text-xs font-bold text-black hover:bg-cyan-50/40 transition-colors">
                          <div className="flex items-center gap-3">
                            {/* Icon dot */}
                            <span className={`w-3 h-3 rounded-full border border-black ${isIncome ? 'bg-lime-400' : 'bg-red-400'}`}></span>
                            <div>
                              <p className="font-black text-black text-sm uppercase">{item.description}</p>
                              <p className="text-[10px] text-zinc-500 font-retro-mono font-bold uppercase tracking-wider mt-0.5">
                                {item.category.toUpperCase()} • {new Date(item.timestamp).toLocaleString('es-ES')}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className={`font-retro-mono font-black text-sm px-2 py-0.5 rounded border-2 border-black shadow-[1.5px_1.5px_0px_0px_#000] ${
                              isIncome ? 'bg-lime-200 text-black' : 'bg-red-200 text-black'
                            }`}>
                              {isIncome ? '+' : '-'}${formatNum(item.amount)}
                            </span>
                            {!isIncome && (
                              <button
                                onClick={() => onRemoveExpense(item.id)}
                                className="bg-red-400 hover:bg-red-500 text-black border-2 border-black rounded px-1.5 py-1 cursor-pointer shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5"
                                title="Eliminar gasto"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {fullLedger.length === 0 && (
                      <div className="p-12 text-center text-zinc-500 font-black uppercase">
                        No hay transacciones registradas en este periodo.
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Ledger Pagination Controls */}
            {fullLedger.length > 0 && (() => {
              const ITEMS_PER_PAGE = 10;
              const totalPages = Math.max(1, Math.ceil(fullLedger.length / ITEMS_PER_PAGE));
              const startIndex = (ledgerCurrentPage - 1) * ITEMS_PER_PAGE;
              const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, fullLedger.length);

              return (
                <div className="flex flex-col sm:flex-row items-center justify-between border-t-4 border-black p-4 bg-zinc-50 text-xs font-bold text-black gap-3">
                  <div className="uppercase font-black text-[10px] tracking-wider text-zinc-700">
                    Mostrando {startIndex + 1}-{endIndex} de {fullLedger.length} transacciones
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      disabled={ledgerCurrentPage === 1}
                      onClick={() => setLedgerCurrentPage(1)}
                      className="px-2.5 py-1.5 border-2 border-black bg-white rounded-md text-[10px] font-black uppercase shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] hover:bg-yellow-100 disabled:opacity-40 disabled:hover:bg-white active:translate-y-0.5 disabled:active:translate-y-0 cursor-pointer disabled:cursor-not-allowed"
                    >
                      « Primera
                    </button>
                    <button
                      type="button"
                      disabled={ledgerCurrentPage === 1}
                      onClick={() => setLedgerCurrentPage(p => Math.max(1, p - 1))}
                      className="px-2.5 py-1.5 border-2 border-black bg-white rounded-md text-[10px] font-black uppercase shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] hover:bg-yellow-100 disabled:opacity-40 disabled:hover:bg-white active:translate-y-0.5 disabled:active:translate-y-0 cursor-pointer disabled:cursor-not-allowed"
                    >
                      ‹ Anterior
                    </button>
                    
                    <span className="font-retro-mono bg-yellow-200 border-2 border-black px-2.5 py-1 rounded text-[10px] font-black">
                      PÁG {ledgerCurrentPage} / {totalPages}
                    </span>

                    <button
                      type="button"
                      disabled={ledgerCurrentPage === totalPages}
                      onClick={() => setLedgerCurrentPage(p => Math.min(totalPages, p + 1))}
                      className="px-2.5 py-1.5 border-2 border-black bg-white rounded-md text-[10px] font-black uppercase shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] hover:bg-yellow-100 disabled:opacity-40 disabled:hover:bg-white active:translate-y-0.5 disabled:active:translate-y-0 cursor-pointer disabled:cursor-not-allowed"
                    >
                      Siguiente ›
                    </button>
                    <button
                      type="button"
                      disabled={ledgerCurrentPage === totalPages}
                      onClick={() => setLedgerCurrentPage(totalPages)}
                      className="px-2.5 py-1.5 border-2 border-black bg-white rounded-md text-[10px] font-black uppercase shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] hover:bg-yellow-100 disabled:opacity-40 disabled:hover:bg-white active:translate-y-0.5 disabled:active:translate-y-0 cursor-pointer disabled:cursor-not-allowed"
                    >
                      Última »
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
          
          <div className="bg-yellow-100 p-4 text-center border-t-3 border-black text-[10px] text-black font-black tracking-wide uppercase">
            * Los costos de insumos de cada venta se debitan automáticamente del margen de utilidad total.
          </div>
        </div>
      </div>

    </div>
  );
}
