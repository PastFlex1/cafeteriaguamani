/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Users, 
  Clock, 
  Plus, 
  CheckCircle, 
  ShieldAlert, 
  Award,
  CalendarDays,
  Filter,
  Download,
  Eye,
  FileText,
  X,
  AlertTriangle,
  Trash2
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { Employee, Shift, Sale, Expense } from '../types';
import RetroSelect from './RetroSelect';
import { formatNum } from '../utils';

interface StaffViewProps {
  employees: Employee[];
  shiftsHistory: Shift[];
  activeEmployee: Employee | null;
  activeShift: Shift | null;
  onAddEmployee: (employee: Omit<Employee, 'id'>) => void;
  onToggleEmployeeStatus: (id: string) => void;
  onDeleteEmployee?: (id: string) => void;
  sales: Sale[];
  expenses: Expense[];
}

export default function StaffView({
  employees,
  shiftsHistory,
  activeEmployee,
  activeShift,
  onAddEmployee,
  onToggleEmployeeStatus,
  onDeleteEmployee,
  sales = [],
  expenses = [],
}: StaffViewProps) {
  const [isAddingEmployee, setIsAddingEmployee] = useState(false);
  const [previewShift, setPreviewShift] = useState<Shift | null>(null);
  const [empName, setEmpName] = useState('');
  const [empRole, setEmpRole] = useState<'Cocinero' | 'Cajero' | 'Administrador'>('Cocinero');
  const [empPin, setEmpPin] = useState('');
  const [pinError, setPinError] = useState('');

  // Audit filter states
  const [filterDateType, setFilterDateType] = useState<'all' | 'today' | 'yesterday' | 'custom'>('all');
  const [filterCustomDate, setFilterCustomDate] = useState<string>('');
  const [filterEmployeeId, setFilterEmployeeId] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'balanced' | 'unbalanced'>('all');

  // Sub tab navigation inside Staff view to avoid overlapping when there are many audits
  const [activeSubTab, setActiveSubTab] = useState<'colaboradores' | 'arqueos'>('colaboradores');
  const [shiftsCurrentPage, setShiftsCurrentPage] = useState(1);

  React.useEffect(() => {
    setShiftsCurrentPage(1);
  }, [filterEmployeeId, filterStatus, filterDateType, filterCustomDate]);

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!empName || empPin.length !== 4) {
      setPinError('El PIN debe tener exactamente 4 dígitos numéricos.');
      return;
    }

    if (!/^\d{4}$/.test(empPin)) {
      setPinError('El PIN sólo debe contener números.');
      return;
    }

    onAddEmployee({
      name: empName,
      role: empRole,
      status: 'active',
      pin: empPin
    });

    // Reset
    setIsAddingEmployee(false);
    setEmpName('');
    setEmpRole('Cocinero');
    setEmpPin('');
    setPinError('');
  };

  // Helper to parse day string
  const getShiftDateStr = (startTimeISO: string) => {
    try {
      const date = new Date(startTimeISO);
      return date.toLocaleDateString('en-CA'); // YYYY-MM-DD
    } catch {
      return startTimeISO.substring(0, 10);
    }
  };

  const todayStr = new Date().toLocaleDateString('en-CA');
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayStr = yesterdayDate.toLocaleDateString('en-CA');

  const filteredShifts = shiftsHistory.filter(shift => {
    // 1. Employee Filter
    if (filterEmployeeId !== 'all' && shift.employeeId !== filterEmployeeId) {
      return false;
    }

    // 2. Date Filter
    const shiftDate = getShiftDateStr(shift.startTime);
    if (filterDateType === 'today') {
      if (shiftDate !== todayStr) return false;
    } else if (filterDateType === 'yesterday') {
      if (shiftDate !== yesterdayStr) return false;
    } else if (filterDateType === 'custom') {
      if (filterCustomDate && shiftDate !== filterCustomDate) return false;
    }

    // 3. Status (Cuadre) Filter
    if (filterStatus !== 'all') {
      const isCashDiscrepancy = shift.status === 'closed' && 
        shift.cashEndActual !== undefined && 
        shift.cashEndExpected !== undefined &&
        Math.abs(shift.cashEndActual - shift.cashEndExpected) > 0.01;

      const isTransDiscrepancy = shift.status === 'closed' && 
        shift.transfersActual !== undefined && 
        shift.transfersExpected !== undefined &&
        Math.abs(shift.transfersActual - shift.transfersExpected) > 0.01;

      const hasDiscrepancy = isCashDiscrepancy || isTransDiscrepancy;

      if (filterStatus === 'balanced' && (shift.status === 'open' || hasDiscrepancy)) {
        return false;
      }
      if (filterStatus === 'unbalanced' && (shift.status === 'open' || !hasDiscrepancy)) {
        return false;
      }
    }

    return true;
  });

  const totalShiftsCount = filteredShifts.length;
  const closedShifts = filteredShifts.filter(s => s.status === 'closed');

  const totalCashDiff = closedShifts.reduce((acc, s) => {
    if (s.cashEndActual !== undefined && s.cashEndExpected !== undefined) {
      return acc + (s.cashEndActual - s.cashEndExpected);
    }
    return acc;
  }, 0);

  const totalTransfersDiff = closedShifts.reduce((acc, s) => {
    if (s.transfersActual !== undefined && s.transfersExpected !== undefined) {
      return acc + (s.transfersActual - s.transfersExpected);
    }
    return acc;
  }, 0);

  const combinedDiff = totalCashDiff + totalTransfersDiff;

  // General report PDF generation using jsPDF
  const downloadGeneralReportPDF = () => {
    const doc = new jsPDF();
    
    // Header banner
    doc.setFillColor(31, 41, 55); // Dark neutral grey
    doc.rect(0, 0, 210, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('REPORTE GENERAL DE AUDITORÍA Y ARQUEOS', 15, 18);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('SISTEMA DE CONTROL DE PUNTO DE VENTA Y CAJA', 15, 25);
    doc.text(`Fecha de Impresión: ${new Date().toLocaleString('es-ES')}`, 15, 31);
    
    // Brand signature at top right
    doc.setFont('helvetica', 'bold');
    doc.text('CAFETERÍA POS', 150, 18);
    doc.setFont('helvetica', 'normal');
    doc.text('AUDIT REPORT v1.1', 150, 25);

    let y = 52;

    // Subheader: Active filters
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text('FILTROS DE BÚSQUEDA APLICADOS:', 15, y);
    y += 6;
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    
    // Employee filter
    let colText = 'TODOS LOS COLABORADORES';
    if (filterEmployeeId !== 'all') {
      const emp = employees.find(e => e.id === filterEmployeeId);
      colText = emp ? `${emp.name.toUpperCase()} (${emp.role})` : filterEmployeeId;
    }
    doc.text(`* Colaborador: ${colText}`, 18, y);
    
    // Status filter
    let statusText = 'TODOS LOS ARQUEOS (ACTIVOS Y CERRADOS)';
    if (filterStatus === 'balanced') statusText = 'SOLO BALANCE PERFECTO (CUADRADO)';
    if (filterStatus === 'unbalanced') statusText = 'SOLO CON DIFERENCIA (SOBRANTE/FALTANTE)';
    doc.text(`* Estado de Balance: ${statusText}`, 18, y + 5);
    
    // Date filter
    let dateText = 'HISTORIAL COMPLETO (TODOS)';
    if (filterDateType === 'today') dateText = 'HOY';
    if (filterDateType === 'yesterday') dateText = 'AYER';
    if (filterDateType === 'custom') dateText = `DÍA ESPECÍFICO: ${filterCustomDate || '(no especificado)'}`;
    doc.text(`* Rango de Fecha: ${dateText}`, 18, y + 10);
    
    y += 19;

    // Summary container box
    doc.setFillColor(249, 250, 251); // bg-zinc-50
    doc.rect(15, y, 180, 34, 'F');
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.4);
    doc.rect(15, y, 180, 34, 'D');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text('RESUMEN FINANCIERO DEL GRUPO:', 20, y + 7);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`- Turnos Filtrados: ${totalShiftsCount} (${closedShifts.length} cerrados correctamente, ${totalShiftsCount - closedShifts.length} activos)`, 20, y + 14);
    doc.text(`- Diferencia Neta Efectivo: ${totalCashDiff === 0 ? '' : totalCashDiff < 0 ? '-' : '+'}$${formatNum(Math.abs(totalCashDiff))}`, 20, y + 20);
    doc.text(`- Diferencia Neta Transferencias: ${totalTransfersDiff === 0 ? '' : totalTransfersDiff < 0 ? '-' : '+'}$${formatNum(Math.abs(totalTransfersDiff))}`, 20, y + 26);

    // Right aligned balance total
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    const balanceStatusStr = combinedDiff === 0 
      ? 'CAJA TOTAL CUADRADA' 
      : combinedDiff < 0 
        ? 'DIFERENCIA NEGATIVA (FALTANTE)' 
        : 'DIFERENCIA POSITIVA (SOBRANTE)';
    doc.text(balanceStatusStr, 110, y + 12);
    
    doc.setFontSize(16);
    if (combinedDiff === 0) {
      doc.setTextColor(16, 120, 80); // green
      doc.text('$0.00', 110, y + 20);
    } else {
      if (combinedDiff < 0) {
        doc.setTextColor(180, 30, 30); // red
        doc.text(`-$${formatNum(Math.abs(combinedDiff))}`, 110, y + 20);
      } else {
        doc.setTextColor(60, 60, 180); // indigo
        doc.text(`+$${formatNum(combinedDiff)}`, 110, y + 20);
      }
    }
    
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('(Efectivo + Transferencias)', 110, y + 26);

    y += 44;

    // Table Header
    doc.setFillColor(229, 231, 235); // grey
    doc.rect(15, y, 180, 8, 'F');
    doc.rect(15, y, 180, 8, 'D');
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('Colaborador', 17, y + 5.5);
    doc.text('Apertura', 55, y + 5.5);
    doc.text('Estado', 87, y + 5.5);
    doc.text('Fondo', 104, y + 5.5);
    doc.text('Efec. Esp/Fís', 123, y + 5.5);
    doc.text('Trans. Esp/Real', 158, y + 5.5);
    doc.text('Diferencia', 184, y + 5.5);

    y += 8;

    // Table rows
    let rowsOnCurrentPage = 0;
    filteredShifts.forEach((shift, index) => {
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
        doc.text('REPORTE GENERAL DE AUDITORÍA Y ARQUEOS (CONTINUACIÓN)', 15, 11);
        
        y = 25;
        
        // Table Header on new page
        doc.setFillColor(229, 231, 235);
        doc.rect(15, y, 180, 8, 'F');
        doc.rect(15, y, 180, 8, 'D');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(0, 0, 0);
        doc.text('Colaborador', 17, y + 5.5);
        doc.text('Apertura', 55, y + 5.5);
        doc.text('Estado', 87, y + 5.5);
        doc.text('Fondo', 104, y + 5.5);
        doc.text('Efec. Esp/Fís', 123, y + 5.5);
        doc.text('Trans. Esp/Real', 158, y + 5.5);
        doc.text('Diferencia', 184, y + 5.5);
        
        y += 8;
      }

      // Zebra background striping
      if (index % 2 === 0) {
        doc.setFillColor(250, 250, 251);
        doc.rect(15, y, 180, 11, 'F');
      }
      doc.setDrawColor(210, 210, 212);
      doc.rect(15, y, 180, 11, 'D');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(0, 0, 0);

      // Colaborador name truncate
      let nameStr = shift.employeeName;
      if (nameStr.length > 20) {
        nameStr = nameStr.substring(0, 18) + '...';
      }
      doc.text(nameStr.toUpperCase(), 17, y + 7.2);

      // Apertura Time (DD/MM, HH:MM)
      let openTimeStr = '';
      try {
        const d = new Date(shift.startTime);
        openTimeStr = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
      } catch {
        openTimeStr = shift.startTime.substring(5, 16).replace('T', ' ');
      }
      doc.text(openTimeStr, 55, y + 7.2);

      // Status
      const isClosed = shift.status === 'closed';
      doc.setFont('helvetica', 'bold');
      if (isClosed) {
        doc.setTextColor(70, 70, 72);
        doc.text('CERRADO', 87, y + 7.2);
      } else {
        doc.setTextColor(16, 120, 80); // green
        doc.text('ACTIVO', 87, y + 7.2);
      }
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');

      // Initial Fund
      doc.text(`$${formatNum(shift.cashStart)}`, 104, y + 7.2);

      // Cash Expected vs Actual
      if (isClosed) {
        doc.text(`$${formatNum(shift.cashEndExpected || 0)} / $${formatNum(shift.cashEndActual || 0)}`, 123, y + 7.2);
      } else {
        doc.text('-', 123, y + 7.2);
      }

      // Transfers Expected vs Actual
      if (isClosed && shift.transfersExpected !== undefined) {
        doc.text(`$${formatNum(shift.transfersExpected)} / $${formatNum(shift.transfersActual || 0)}`, 158, y + 7.2);
      } else {
        doc.text('-', 158, y + 7.2);
      }

      // Difference
      let shiftDiff = 0;
      if (isClosed) {
        const cDiff = (shift.cashEndActual || 0) - (shift.cashEndExpected || 0);
        const tDiff = (shift.transfersActual || 0) - (shift.transfersExpected || 0);
        shiftDiff = cDiff + tDiff;
      }

      doc.setFont('helvetica', 'bold');
      if (!isClosed) {
        doc.setTextColor(120, 120, 120);
        doc.text('-', 184, y + 7.2);
      } else if (Math.abs(shiftDiff) < 0.01) {
        doc.setTextColor(16, 120, 80);
        doc.text('$0.00', 184, y + 7.2);
      } else {
        if (shiftDiff < 0) {
          doc.setTextColor(180, 30, 30); // red
          doc.text(`-$${formatNum(Math.abs(shiftDiff))}`, 184, y + 7.2);
        } else {
          doc.setTextColor(60, 60, 180); // indigo
          doc.text(`+$${formatNum(shiftDiff)}`, 184, y + 7.2);
        }
      }
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');

      y += 11;
      rowsOnCurrentPage++;
    });

    // Signatures and final footer lines
    if (y > 250) {
      doc.addPage();
      y = 20;
    }
    
    y += 15;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.line(15, y, 195, y);
    
    y += 6;
    doc.setFontSize(8);
    doc.setTextColor(110, 110, 115);
    doc.text('Este reporte consolidado es un comprobante de auditoría oficial autogenerado por el sistema de Cafetería POS.', 15, y);
    doc.text('Las discrepancias aquí descritas reflejan diferencias estrictas entre la declaración del personal de barra y las transacciones cobradas.', 15, y + 4.5);

    doc.save(`Reporte_Auditoria_POS_${new Date().toISOString().substring(0,10)}.pdf`);
  };

  // Reporte detallado en formato carta (A4 PDF) para cuadres de caja y auditoría de jornada
  const downloadShiftDetailedReportPDF = (shift: Shift) => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    // Colores corporativos (Retro elegante de alta legibilidad)
    const primaryColor = [31, 41, 55]; // Gris oscuro neutral
    const lightBg = [249, 250, 251]; // Fondo de caja gris claro

    // Banner de cabecera
    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.rect(0, 0, 210, 42, 'F');

    // Título y marca
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('AUDITORÍA DE JORNADA Y RECONCILIACIÓN', 15, 16);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text('SISTEMA CAFETERÍA POS - INFORME DETALLADO DE ARQUEO DIARIO', 15, 23);
    doc.text(`Identificador de Turno: #${shift.id}`, 15, 29);
    doc.text(`Fecha de Impresión: ${new Date().toLocaleString('es-ES')}`, 15, 35);

    // Firma de marca arriba a la derecha
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('CAFETERÍA POS', 195, 16, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text('REPORTE OFICIAL DE CIERRE', 195, 23, { align: 'right' });
    doc.text(`Estado: ${shift.status === 'open' ? 'ABIERTO (EN BARRA)' : 'CERRADO (AUDITADO)'}`, 195, 29, { align: 'right' });

    let y = 52;

    // Caja de Colaborador y Horarios
    doc.setFillColor(243, 244, 246);
    doc.rect(15, y, 180, 22, 'F');
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.rect(15, y, 180, 22, 'S');

    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text('INFORMACIÓN GENERAL DEL TURNO', 18, y + 5.5);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(`Colaborador: ${shift.employeeName.toUpperCase()}`, 18, y + 11.5);
    
    const startStr = new Date(shift.startTime).toLocaleString('es-ES');
    const endStr = shift.endTime ? new Date(shift.endTime).toLocaleString('es-ES') : 'TURNO ACTIVO (EN BARRA)';
    doc.text(`Inicio de Jornada: ${startStr}   •   Cierre de Jornada: ${endStr}`, 18, y + 17);

    y += 28;

    // Calcular datos de ventas y gastos durante el turno
    const shiftSales = sales.filter(s => {
      const isCompleted = s.status === 'completed';
      const isSameEmployee = s.employeeId === shift.employeeId;
      const saleTime = new Date(s.timestamp).getTime();
      const startTime = new Date(shift.startTime).getTime();
      const isAfterStart = saleTime >= startTime;
      const isBeforeEnd = shift.endTime ? saleTime <= new Date(shift.endTime).getTime() : true;
      return isCompleted && isSameEmployee && isAfterStart && isBeforeEnd;
    });

    const shiftExpenses = expenses.filter(e => {
      const expTime = new Date(e.timestamp).getTime();
      const startTime = new Date(shift.startTime).getTime();
      const isAfterStart = expTime >= startTime;
      const isBeforeEnd = shift.endTime ? expTime <= new Date(shift.endTime).getTime() : true;
      const isShiftCashExpense = e.category !== 'renta' && e.category !== 'servicios';
      return isAfterStart && isBeforeEnd && isShiftCashExpense;
    });

    // Cálculos monetarios
    const cashSales = shiftSales.filter(s => s.paymentMethod === 'efectivo').reduce((sum, s) => sum + s.total, 0);
    const transferSales = shiftSales.filter(s => s.paymentMethod === 'transferencia').reduce((sum, s) => sum + s.total, 0);
    const cardSales = shiftSales.filter(s => s.paymentMethod === 'tarjeta').reduce((sum, s) => sum + s.total, 0);
    const totalSalesSum = shiftSales.reduce((sum, s) => sum + s.total, 0);
    const totalExpensesSum = shiftExpenses.reduce((sum, s) => sum + s.amount, 0);

    // RECONCILIACIÓN DE EFECTIVO Y CAJA
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('RECONCILIACIÓN MONETARIA DE CUADRE', 15, y);
    y += 5;

    // Caja de Efectivo (Izquierda, ancho 85)
    doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
    doc.rect(15, y, 86, 42, 'F');
    doc.rect(15, y, 86, 42, 'S');

    doc.setFillColor(31, 41, 55);
    doc.rect(15, y, 86, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('EFECTIVO (CAJA FISICA)', 18, y + 4.8);

    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text('Fondo de Apertura:', 18, y + 13);
    doc.setFont('helvetica', 'bold');
    doc.text(`$${formatNum(shift.cashStart)}`, 96, y + 13, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.text('Ventas en Efectivo (+):', 18, y + 18.5);
    doc.setFont('helvetica', 'bold');
    doc.text(`$${formatNum(cashSales)}`, 96, y + 18.5, { align: 'right' });

    const cashExpected = shift.cashEndExpected !== undefined ? shift.cashEndExpected : (shift.cashStart + cashSales);
    doc.setFont('helvetica', 'normal');
    doc.text('Efectivo Esperado (=):', 18, y + 24);
    doc.setFont('helvetica', 'bold');
    doc.text(`$${formatNum(cashExpected)}`, 96, y + 24, { align: 'right' });

    const cashActual = shift.cashEndActual !== undefined ? shift.cashEndActual : 0;
    doc.setFont('helvetica', 'normal');
    doc.text('Efectivo Declarado (Arqueo):', 18, y + 29.5);
    doc.setFont('helvetica', 'bold');
    doc.text(`$${formatNum(cashActual)}`, 96, y + 29.5, { align: 'right' });

    const cashDiff = shift.status === 'closed' ? (cashActual - cashExpected) : 0;
    doc.setFont('helvetica', 'bold');
    doc.text('Diferencia de Efectivo:', 18, y + 35);
    if (shift.status === 'open') {
      doc.setTextColor(110, 110, 110);
      doc.text('(Turno activo)', 96, y + 35, { align: 'right' });
    } else if (Math.abs(cashDiff) < 0.01) {
      doc.setTextColor(16, 120, 80);
      doc.text('$0.00 (CUADRADO)', 96, y + 35, { align: 'right' });
    } else if (cashDiff < 0) {
      doc.setTextColor(180, 30, 30);
      doc.text(`-$${formatNum(Math.abs(cashDiff))} (FALTANTE)`, 96, y + 35, { align: 'right' });
    } else {
      doc.setTextColor(60, 60, 180);
      doc.text(`+$${formatNum(cashDiff)} (SOBRANTE)`, 96, y + 35, { align: 'right' });
    }

    doc.setTextColor(0, 0, 0);

    // Caja de Transferencias (Derecha, ancho 85)
    doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
    doc.rect(109, y, 86, 42, 'F');
    doc.rect(109, y, 86, 42, 'S');

    doc.setFillColor(31, 41, 55);
    doc.rect(109, y, 86, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('TRANSFERENCIAS BANCARIAS', 112, y + 4.8);

    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    const transfersExpected = shift.transfersExpected !== undefined ? shift.transfersExpected : transferSales;
    doc.text('Transferencias Esperadas:', 112, y + 13);
    doc.setFont('helvetica', 'bold');
    doc.text(`$${formatNum(transfersExpected)}`, 190, y + 13, { align: 'right' });

    const transfersActual = shift.transfersActual !== undefined ? shift.transfersActual : 0;
    doc.setFont('helvetica', 'normal');
    doc.text('Transferencias Reales:', 112, y + 18.5);
    doc.setFont('helvetica', 'bold');
    doc.text(`$${formatNum(transfersActual)}`, 190, y + 18.5, { align: 'right' });

    const transfDiff = shift.status === 'closed' ? (transfersActual - transfersExpected) : 0;
    doc.setFont('helvetica', 'bold');
    doc.text('Diferencia de Transf.:', 112, y + 24);
    if (shift.status === 'open') {
      doc.setTextColor(110, 110, 110);
      doc.text('(Turno activo)', 190, y + 24, { align: 'right' });
    } else if (Math.abs(transfDiff) < 0.01) {
      doc.setTextColor(16, 120, 80);
      doc.text('$0.00 (CUADRADO)', 190, y + 24, { align: 'right' });
    } else if (transfDiff < 0) {
      doc.setTextColor(180, 30, 30);
      doc.text(`-$${formatNum(Math.abs(transfDiff))} (FALTANTE)`, 190, y + 24, { align: 'right' });
    } else {
      doc.setTextColor(60, 60, 180);
      doc.text(`+$${formatNum(transfDiff)} (SOBRANTE)`, 190, y + 24, { align: 'right' });
    }

    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.text('Soporte Tarjeta:', 112, y + 29.5);
    doc.setFont('helvetica', 'bold');
    doc.text(`$${formatNum(cardSales)}`, 190, y + 29.5, { align: 'right' });

    doc.setTextColor(0, 0, 0);
    y += 49;

    // Caja de Balance Consolidado de la Jornada
    doc.setFillColor(240, 248, 255); // Azul suave
    doc.rect(15, y, 180, 16, 'F');
    doc.rect(15, y, 180, 16, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);
    doc.text('BALANCE GENERAL DE LA JORNADA:', 20, y + 6);
    
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);

    const prefixText = `Ventas Netas: $${formatNum(totalSalesSum)}   |   Resultado: `;
    doc.text(prefixText, 20, y + 11.5);

    const prefixWidth = doc.getTextWidth(prefixText);

    const overallDiff = cashDiff + transfDiff;
    let overallDiffLabel = 'JORNADA PERFECTAMENTE CUADRADA';
    if (shift.status === 'open') {
      overallDiffLabel = 'TURNO EN CURSO (PREVENTA)';
      doc.setTextColor(110, 110, 110);
    } else if (overallDiff < -0.01) {
      overallDiffLabel = `FALTANTE DE -$${formatNum(Math.abs(overallDiff))}`;
      doc.setTextColor(180, 30, 30);
    } else if (overallDiff > 0.01) {
      overallDiffLabel = `SOBRANTE DE +$${formatNum(overallDiff)}`;
      doc.setTextColor(60, 60, 180);
    } else {
      doc.setTextColor(16, 120, 80);
    }
    doc.setFont('helvetica', 'bold');
    doc.text(overallDiffLabel, 20 + prefixWidth, y + 11.5);
    doc.setTextColor(0, 0, 0);

    y += 24;

    // PRODUCTOS VENDIDOS EN EL TURNO
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('DESGLOSE DE PRODUCTOS DESPACHADOS', 15, y);
    y += 5;

    // Consolidación de items vendidos
    const itemsMap: { [name: string]: { qty: number; total: number } } = {};
    shiftSales.forEach(s => {
      s.items.forEach(it => {
        if (!itemsMap[it.name]) {
          itemsMap[it.name] = { qty: 0, total: 0 };
        }
        itemsMap[it.name].qty += it.quantity;
        itemsMap[it.name].total += it.price * it.quantity;
      });
    });

    const itemsSorted = Object.entries(itemsMap)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.qty - a.qty);

    if (itemsSorted.length === 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.text('No se registraron ventas de ítems específicos durante esta jornada.', 18, y + 4.5);
      y += 10;
    } else {
      // Cabecera de mini-tabla
      doc.setFillColor(243, 244, 246);
      doc.rect(15, y, 180, 5.5, 'F');
      doc.rect(15, y, 180, 5.5, 'S');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text('Producto / Servicio', 18, y + 4);
      doc.text('Cantidad Despachada', 110, y + 4);
      doc.text('Total Recaudado', 185, y + 4, { align: 'right' });
      
      y += 5.5;
      doc.setFont('helvetica', 'normal');
      itemsSorted.slice(0, 7).forEach((it, idx) => {
        doc.rect(15, y, 180, 5.5, 'S');
        doc.text(`${idx + 1}. ${it.name}`, 18, y + 4);
        doc.text(`${it.qty} unidades`, 110, y + 4);
        doc.text(`$${formatNum(it.total)}`, 185, y + 4, { align: 'right' });
        y += 5.5;
      });
      if (itemsSorted.length > 7) {
        doc.rect(15, y, 180, 5.5, 'S');
        doc.setFont('helvetica', 'italic');
        doc.text(`... y otros ${itemsSorted.length - 7} productos más vendidos en el turno.`, 18, y + 4);
        y += 5.5;
        doc.setFont('helvetica', 'normal');
      }
      y += 3;
    }

    // SI NOS QUEDAMOS SIN ESPACIO, NUEVA PÁGINA
    if (y > 210) {
      doc.addPage();
      y = 20;
    }

    // DETALLE DE LAS TRANSACCIONES DE LA JORNADA
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('HISTORIAL DE COMPROBANTES DE LA JORNADA', 15, y);
    y += 5;

    if (shiftSales.length === 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.text('No se completaron transacciones individuales en esta jornada.', 18, y + 4.5);
      y += 10;
    } else {
      doc.setFillColor(243, 244, 246);
      doc.rect(15, y, 180, 5.5, 'F');
      doc.rect(15, y, 180, 5.5, 'S');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text('Comprobante', 18, y + 4);
      doc.text('Hora', 55, y + 4);
      doc.text('Método', 90, y + 4);
      doc.text('Cliente', 125, y + 4);
      doc.text('Monto', 185, y + 4, { align: 'right' });

      y += 5.5;
      doc.setFont('helvetica', 'normal');
      
      shiftSales.slice(0, 10).forEach(sale => {
        if (y > 270) {
          doc.addPage();
          y = 20;
        }
        doc.rect(15, y, 180, 5.5, 'S');
        const invoiceNum = sale.invoiceNumber || `#${sale.id.substring(0, 6).toUpperCase()}`;
        doc.text(invoiceNum, 18, y + 4);
        
        const timeStr = new Date(sale.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        doc.text(timeStr, 55, y + 4);
        doc.text(sale.paymentMethod.toUpperCase(), 90, y + 4);
        
        const client = sale.customer?.name ? sale.customer.name.substring(0, 18) : 'VENTA MOSTRADOR';
        doc.text(client, 125, y + 4);
        doc.text(`$${formatNum(sale.total)}`, 185, y + 4, { align: 'right' });
        y += 5.5;
      });

      if (shiftSales.length > 10) {
        doc.rect(15, y, 180, 5.5, 'S');
        doc.setFont('helvetica', 'italic');
        doc.text(`... y otras ${shiftSales.length - 10} transacciones más auditadas de forma exitosa.`, 18, y + 4);
        y += 5.5;
        doc.setFont('helvetica', 'normal');
      }
      y += 3;
    }

    // SI HAY GASTOS, VERIFICAR ESPACIO
    if (shiftExpenses.length > 0) {
      if (y > 210) {
        doc.addPage();
        y = 20;
      }
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('GASTOS EXTRAORDINARIOS REPORTADOS', 15, y);
      y += 5;

      doc.setFillColor(243, 244, 246);
      doc.rect(15, y, 180, 5.5, 'F');
      doc.rect(15, y, 180, 5.5, 'S');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text('Descripción del Gasto', 18, y + 4);
      doc.text('Categoría', 105, y + 4);
      doc.text('Monto', 185, y + 4, { align: 'right' });

      y += 5.5;
      doc.setFont('helvetica', 'normal');
      shiftExpenses.forEach(exp => {
        if (y > 270) {
          doc.addPage();
          y = 20;
        }
        doc.rect(15, y, 180, 5.5, 'S');
        doc.text(exp.description, 18, y + 4);
        doc.text(exp.category.toUpperCase(), 105, y + 4);
        doc.text(`$${formatNum(exp.amount)}`, 185, y + 4, { align: 'right' });
        y += 5.5;
      });
      y += 3;
    }

    // FIRMAS DE VALIDEZ CONTABLE (Siempre en pie de página del reporte)
    if (y > 235) {
      doc.addPage();
      y = 20;
    }

    y += 15;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.4);
    
    doc.line(25, y, 90, y);
    doc.line(120, y, 185, y);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('FIRMA COLABORADOR (ENTREGADOR)', 57, y + 4.5, { align: 'center' });
    doc.text('FIRMA ADMINISTRADOR (SUPERVISOR)', 152, y + 4.5, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 100, 100);
    doc.text(`${shift.employeeName.toUpperCase()}`, 57, y + 8, { align: 'center' });
    doc.text('RESPONSABLE DE CONTROL DE CAJA', 152, y + 8, { align: 'center' });

    y += 18;
    doc.text('Este arqueo detallado ha sido validado contra las bases de datos de transacciones fiscales del punto de venta.', 15, y);
    doc.text('Cualquier discrepancia persistente debe reportarse de manera inmediata a la oficina de contabilidad.', 15, y + 3.5);

    doc.save(`Arqueo_Detallado_Turno_${shift.id}_${shift.employeeName.replace(/\s+/g, '_')}.pdf`);
  };

  // Specific shift ticket print format (thermal receipt style 80mm width)
  const downloadSingleShiftPDF = (shift: Shift) => {
    // We create a thermal receipt size: 80mm wide by 180mm tall (which is a super standard thermal ticket size)
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [80, 190]
    });
    
    doc.setFont('courier', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    
    let y = 10;
    doc.text('*** COMPROBANTE DE ARQUEO ***', 40, y, { align: 'center' });
    y += 5;
    doc.text('CONTROL DE AUDITORIA', 40, y, { align: 'center' });
    y += 4;
    doc.text('CAFETERIA POS', 40, y, { align: 'center' });
    y += 6;
    
    doc.setFont('courier', 'normal');
    doc.setFontSize(8.5);
    doc.text(`Turno ID: #${shift.id}`, 5, y);
    y += 4;
    doc.text(`Fecha Imp: ${new Date().toLocaleString('es-ES')}`, 5, y);
    y += 5;
    
    doc.text('--------------------------------', 5, y);
    y += 4;
    
    doc.setFont('courier', 'bold');
    doc.text('COLABORADOR:', 5, y);
    y += 4;
    doc.setFont('courier', 'normal');
    doc.text(shift.employeeName.toUpperCase(), 8, y);
    y += 5.5;
    
    doc.setFont('courier', 'bold');
    doc.text('APERTURA TURNO:', 5, y);
    y += 4;
    doc.setFont('courier', 'normal');
    doc.text(new Date(shift.startTime).toLocaleString('es-ES'), 8, y);
    y += 5.5;
    
    doc.setFont('courier', 'bold');
    doc.text('CIERRE TURNO:', 5, y);
    y += 4;
    doc.setFont('courier', 'normal');
    const closeTimeStr = shift.endTime 
      ? new Date(shift.endTime).toLocaleString('es-ES') 
      : 'TURNO ACTIVO (EN BARRA)';
    doc.text(closeTimeStr, 8, y);
    y += 5;
    
    doc.text('--------------------------------', 5, y);
    y += 4;
    
    // Monetary rows
    doc.setFont('courier', 'bold');
    doc.text('EFECTIVO INICIAL (FONDO):', 5, y);
    doc.text(`$${formatNum(shift.cashStart)}`, 75, y, { align: 'right' });
    y += 5.5;
    
    if (shift.status === 'closed') {
      doc.text('EFECTIVO ESPERADO:', 5, y);
      doc.text(`$${formatNum(shift.cashEndExpected || 0)}`, 75, y, { align: 'right' });
      y += 5;
      
      doc.text('EFECTIVO REAL (FISICO):', 5, y);
      doc.text(`$${formatNum(shift.cashEndActual || 0)}`, 75, y, { align: 'right' });
      y += 5;
      
      const cDiff = (shift.cashEndActual || 0) - (shift.cashEndExpected || 0);
      doc.text('DIFERENCIA EFECTIVO:', 5, y);
      const cDiffStr = cDiff === 0 ? '$0.00' : (cDiff < 0 ? '-' : '+') + `$${formatNum(Math.abs(cDiff))}`;
      doc.text(cDiffStr, 75, y, { align: 'right' });
      y += 6.5;
      
      if (shift.transfersExpected !== undefined) {
        doc.text('TRANSFERENCIAS ESP:', 5, y);
        doc.text(`$${formatNum(shift.transfersExpected)}`, 75, y, { align: 'right' });
        y += 5;
        
        doc.text('TRANSFERENCIAS REA:', 5, y);
        doc.text(`$${formatNum(shift.transfersActual || 0)}`, 75, y, { align: 'right' });
        y += 5;
        
        const tDiff = (shift.transfersActual || 0) - (shift.transfersExpected || 0);
        doc.text('DIFERENCIA TRANSF:', 5, y);
        const tDiffStr = tDiff === 0 ? '$0.00' : (tDiff < 0 ? '-' : '+') + `$${formatNum(Math.abs(tDiff))}`;
        doc.text(tDiffStr, 75, y, { align: 'right' });
        y += 6.5;
      }
      
      doc.text('================================', 5, y);
      y += 5.5;
      
      // Total Turn Difference
      const totalTurnDiff = ((shift.cashEndActual || 0) - (shift.cashEndExpected || 0)) + 
        (((shift.transfersActual || 0) - (shift.transfersExpected || 0)));
        
      doc.setFont('courier', 'bold');
      doc.text('BALANCE GENERAL DEL TURNO:', 5, y);
      y += 5;
      
      let balanceLabel = 'CUADRE PERFECTO';
      if (totalTurnDiff < -0.01) {
        balanceLabel = `FALTANTE: -$${formatNum(Math.abs(totalTurnDiff))}`;
      } else if (totalTurnDiff > 0.01) {
        balanceLabel = `SOBRANTE: +$${formatNum(totalTurnDiff)}`;
      }
      doc.text(balanceLabel, 5, y);
      y += 7;
    } else {
      doc.text('>>> TURNO ACTIVO EN BARRA <<<', 40, y, { align: 'center' });
      y += 7;
    }
    
    doc.setFont('courier', 'normal');
    doc.text('--------------------------------', 5, y);
    y += 8;
    
    doc.text('Firma Colaborador: ____________', 5, y);
    y += 10;
    doc.text('Firma Supervisor:  ____________', 5, y);
    y += 11;
    
    doc.setFont('courier', 'bold');
    doc.text('* COMPROBANTE CON VALIDEZ INTERNA *', 40, y, { align: 'center' });
    y += 4;
    
    doc.save(`Ticket_Arqueo_Turno_${shift.id}_${shift.employeeName.replace(/\s+/g, '_')}.pdf`);
  };

  return (
    <div className="space-y-6" id="staff-view-root">
      {/* Sub Tabs Navigation */}
      <div className="flex flex-col sm:flex-row gap-3 border-4 border-black p-2.5 rounded-xl bg-zinc-50 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]" id="staff-subtabs">
        <button
          onClick={() => setActiveSubTab('colaboradores')}
          className={`flex-1 flex items-center justify-center gap-2 py-3.5 px-4 border-3 border-black rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 ${
            activeSubTab === 'colaboradores'
              ? 'bg-purple-300 text-black'
              : 'bg-white hover:bg-zinc-50 text-zinc-700'
          }`}
          id="tab-colaboradores"
        >
          <Users className="w-4.5 h-4.5 stroke-[2.5]" />
          <span>👥 EQUIPO DE COLABORADORES</span>
        </button>
        <button
          onClick={() => setActiveSubTab('arqueos')}
          className={`flex-1 flex items-center justify-center gap-2 py-3.5 px-4 border-3 border-black rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 ${
            activeSubTab === 'arqueos'
              ? 'bg-yellow-300 text-black'
              : 'bg-white hover:bg-zinc-50 text-zinc-700'
          }`}
          id="tab-arqueos"
        >
          <Clock className="w-4.5 h-4.5 stroke-[2.5]" />
          <span>📓 HISTORIAL DE ARQUEOS ({shiftsHistory.length})</span>
        </button>
      </div>

      {activeSubTab === 'colaboradores' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-fade-in" id="staff-container-colaboradores">
          {/* Employee listing */}
          <div className="lg:col-span-7 space-y-8">
            <div className="bg-white border-4 border-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] overflow-hidden" id="employees-panel">
              <div className="border-b-4 border-black p-5 bg-purple-300 flex items-center justify-between text-black">
                <div>
                  <h3 className="font-retro-heavy text-base uppercase">👥 EQUIPO DE COLABORADORES</h3>
                  <p className="text-xs font-bold uppercase text-black/80 mt-0.5">Accesos, roles y claves del punto de venta</p>
                </div>
                
                <button
                  onClick={() => {
                    setIsAddingEmployee(true);
                  }}
                  className="flex items-center gap-1.5 bg-yellow-300 hover:bg-yellow-200 text-black border-3 border-black rounded-lg px-4 py-2 text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px]"
                >
                  <Plus className="w-4 h-4 stroke-[3]" />
                  NUEVO PERFIL
                </button>
              </div>

              <div className="divide-y-2 divide-dashed divide-black/15 text-xs text-black font-bold bg-yellow-50/10">
                {employees.map((emp) => {
                  const isActiveUser = activeEmployee?.id === emp.id;
                  const isWorkingInShift = activeShift && activeShift.employeeId === emp.id;
                  
                  return (
                    <div key={emp.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-cyan-50/30 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-11 h-11 rounded-full bg-white border-2 border-black flex items-center justify-center text-black">
                          <Users className="w-5 h-5 stroke-[2.5]" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className={`font-black text-base uppercase ${emp.status === 'inactive' ? 'line-through text-zinc-500' : 'text-black'}`}>{emp.name}</p>
                            {emp.id === 'emp_1' && (
                              <span className="bg-yellow-300 text-black border-2 border-black px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded flex items-center gap-0.5">
                                <Award className="w-3.5 h-3.5 stroke-[2.5]" />
                                SUPER
                              </span>
                            )}
                            {emp.status === 'inactive' && (
                              <span className="bg-red-300 border-2 border-black text-black px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded shadow-[1px_1px_0px_0px_#000]">
                                🚫 SUSPENDIDO
                              </span>
                            )}
                          </div>
                          <p className="text-zinc-600 mt-1 font-bold">
                            ROL: <strong className="text-purple-700 uppercase">{emp.role}</strong> • CLAVE POS: <span className="font-retro-mono bg-black text-lime-400 px-2 py-0.5 border border-black rounded font-black text-xs">{emp.pin}</span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 self-end sm:self-auto">
                        {/* Shift & Login indicators */}
                        {isWorkingInShift ? (
                          <span className="bg-lime-300 border-2 border-black text-black px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider animate-pulse shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)]">
                            EN TURNO
                          </span>
                        ) : isActiveUser ? (
                          <span className="bg-cyan-300 border-2 border-black text-black px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)]">
                            EN SESIÓN
                          </span>
                        ) : null}

                        <button
                          onClick={() => onToggleEmployeeStatus(emp.id)}
                          className={`px-3 py-1.5 rounded text-[10px] font-black uppercase tracking-wider transition-all border-2 border-black cursor-pointer shadow-[2px_2px_0px_0px_#000] active:translate-y-0.5 ${
                            emp.status === 'active'
                              ? 'bg-white hover:bg-zinc-100 text-black'
                              : 'bg-red-300 hover:bg-red-400 text-black'
                          }`}
                          disabled={emp.id === 'emp_1'}
                        >
                          {emp.status === 'active' ? 'Suspender' : 'Reactivar'}
                        </button>

                        {onDeleteEmployee && emp.id !== 'emp_1' && (
                          <button
                            onClick={() => {
                              if (window.confirm(`¿Estás seguro de eliminar permanentemente a "${emp.name}"?`)) {
                                onDeleteEmployee(emp.id);
                              }
                            }}
                            className="p-1.5 rounded bg-red-400 hover:bg-red-500 text-black border-2 border-black transition-all cursor-pointer shadow-[2px_2px_0px_0px_#000] active:translate-y-0.5"
                            title="Eliminar colaborador"
                          >
                            <Trash2 className="w-4 h-4 stroke-[2.5]" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Form / Instruction section on the right to keep it clean */}
          <div className="lg:col-span-5 space-y-8">
            {isAddingEmployee ? (
              <div className="bg-white border-4 border-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-5 space-y-4 animate-fade-in" id="add-employee-form">
                <div className="flex items-center justify-between border-b-3 border-black pb-3">
                  <h3 className="font-retro-heavy text-xs uppercase text-purple-950">👾 REGISTRAR COLABORADOR</h3>
                  <button 
                    onClick={() => setIsAddingEmployee(false)}
                    className="bg-red-400 border-2 border-black px-1.5 py-0.5 rounded text-[10px] text-black hover:bg-red-500 cursor-pointer font-black uppercase"
                  >
                    CERRAR
                  </button>
                </div>

                <form onSubmit={handleAddSubmit} className="space-y-4 text-xs font-bold text-black">
                  <div>
                    <label className="block font-black uppercase tracking-wide mb-1.5">Nombre Completo</label>
                    <input
                      type="text"
                      required
                      placeholder="Ej. Juan Pérez..."
                      value={empName}
                      onChange={(e) => setEmpName(e.target.value)}
                      className="w-full border-3 border-black bg-pink-50 rounded-lg p-2.5 focus:outline-none focus:bg-white text-black font-extrabold"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block font-black uppercase tracking-wide mb-1.5">Rol Operativo</label>
                      <RetroSelect
                        value={empRole}
                        onChange={(val) => setEmpRole(val as any)}
                        options={[
                          { value: 'Cocinero', label: 'Cocinero' },
                          { value: 'Cajero', label: 'Cajero' },
                          { value: 'Administrador', label: 'Administrador' },
                        ]}
                      />
                    </div>

                    <div>
                      <label className="block font-black uppercase tracking-wide mb-1.5">PIN POS (4 DÍGITOS)</label>
                      <input
                        type="text"
                        maxLength={4}
                        required
                        placeholder="9999"
                        value={empPin}
                        onChange={(e) => {
                          setPinError('');
                          setEmpPin(e.target.value.replace(/\D/g, ''));
                        }}
                        className="w-full border-3 border-black bg-pink-50 rounded-lg p-2.5 focus:outline-none focus:bg-white font-retro-mono text-center text-sm font-black tracking-widest text-black"
                      />
                    </div>
                  </div>

                  {pinError && (
                    <p className="text-red-600 font-black text-[10px] uppercase tracking-wider">⚠️ {pinError}</p>
                  )}

                  <button
                    type="submit"
                    className="w-full bg-lime-300 hover:bg-lime-400 text-black border-3 border-black rounded-lg py-3.5 text-xs font-black shadow-[3px_3px_0px_0px_#000] active:translate-y-0.5 cursor-pointer uppercase tracking-wider"
                  >
                    CREAR PERFIL E IMPRIMIR PIN
                  </button>
                </form>
              </div>
            ) : (
              <div className="bg-white border-4 border-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-5 space-y-4" id="staff-security-card">
                <div className="border-b-3 border-black pb-3">
                  <h3 className="font-retro-heavy text-xs uppercase text-purple-950">🛡️ SEGURIDAD Y ACCESOS</h3>
                  <p className="text-[10px] font-bold text-zinc-600 uppercase mt-0.5">Normas Operativas del Punto de Venta</p>
                </div>
                <div className="space-y-3.5 text-xs font-bold text-black">
                  <div className="p-3 bg-purple-50 border-2 border-black rounded-lg">
                    <p className="font-black text-purple-900 uppercase text-[10px]">🔑 PIN CONFIDENCIAL</p>
                    <p className="text-[11px] text-zinc-700 mt-1">Cada colaborador tiene un PIN único. No comparta su código para evitar descuadres de caja atribuidos incorrectamente.</p>
                  </div>
                  <div className="p-3 bg-yellow-50 border-2 border-black rounded-lg">
                    <p className="font-black text-amber-950 uppercase text-[10px]">⏰ CIERRE DE TURNO OBLIGATORIO</p>
                    <p className="text-[11px] text-zinc-700 mt-1">Al finalizar su jornada, el colaborador en turno debe efectuar su arqueo físico (contar dinero en caja y reportar transferencias) para entregar el puesto.</p>
                  </div>
                  <div className="p-3 bg-emerald-50 border-2 border-black rounded-lg">
                    <p className="font-black text-emerald-950 uppercase text-[10px]">⚡ REPORTE DE DIFERENCIAS</p>
                    <p className="text-[11px] text-zinc-700 mt-1">Cualquier discrepancia de balance (sobrante o faltante) quedará registrada automáticamente en el historial de arqueos.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Render Arqueos in Full-Width dashboard */
        <div className="space-y-6 animate-fade-in" id="staff-container-arqueos">
          <div className="bg-white border-4 border-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
            <div className="border-b-4 border-black p-5 bg-yellow-300 text-black flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-retro-heavy text-base uppercase">📓 HISTORIAL GENERAL DE ARQUEOS Y TURNOS</h3>
                <p className="text-xs font-bold uppercase text-black/80 mt-0.5">Auditoría central, aperturas de caja, cierres y balances del negocio</p>
              </div>
              
              <button
                onClick={downloadGeneralReportPDF}
                className="flex items-center justify-center gap-1.5 bg-black hover:bg-neutral-800 text-white border-2 border-black rounded-lg px-4 py-2 text-xs font-retro-heavy uppercase tracking-wider transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(255,255,255,1)] active:translate-y-0.5 shrink-0"
                title="Descargar reporte completo en formato PDF con filtros aplicados"
              >
                <Download className="w-4 h-4 stroke-[3]" />
                DESCARGAR REPORTE (PDF)
              </button>
            </div>

            {/* Filter controls arranged horizontally */}
            <div className="bg-zinc-100 border-b-4 border-black p-5 space-y-4 font-bold text-black text-xs">
              <div className="flex items-center gap-1.5 border-b-2 border-black/10 pb-2 mb-1">
                <Filter className="w-4 h-4 text-purple-700 stroke-[2.5]" />
                <span className="font-retro-heavy text-[11px] uppercase text-purple-900">FILTROS DE AUDITORÍA</span>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Colaborador */}
                <div>
                  <label className="block text-[10px] uppercase font-black text-zinc-600 mb-1.5">Filtrar por Colaborador</label>
                  <RetroSelect
                    options={[
                      { value: 'all', label: 'TODOS LOS COLABORADORES' },
                      ...employees.map(emp => ({
                        value: emp.id,
                        label: `${emp.name.toUpperCase()} (${emp.role.toUpperCase()})`
                      }))
                    ]}
                    value={filterEmployeeId}
                    onChange={setFilterEmployeeId}
                  />
                </div>

                {/* Por Estado de Cuadre */}
                <div>
                  <label className="block text-[10px] uppercase font-black text-zinc-600 mb-1.5">Estado de Balance</label>
                  <RetroSelect
                    options={[
                      { value: 'all', label: 'TODOS LOS TURNOS' },
                      { value: 'balanced', label: '✅ BALANCE PERFECTO (CUADRADO)' },
                      { value: 'unbalanced', label: '⚠️ CON DIFERENCIA (SOBRANTE/FALTANTE)' }
                    ]}
                    value={filterStatus}
                    onChange={setFilterStatus}
                  />
                </div>

                {/* Preset de Fecha */}
                <div>
                  <label className="block text-[10px] uppercase font-black text-zinc-600 mb-1.5">Fecha de Turno</label>
                  <div className="flex gap-1.5">
                    {([
                      { id: 'all', label: 'Todos' },
                      { id: 'today', label: 'Hoy' },
                      { id: 'yesterday', label: 'Ayer' },
                      { id: 'custom', label: 'Fecha...' }
                    ] as const).map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setFilterDateType(preset.id)}
                        className={`flex-1 text-[10px] font-black uppercase py-2 border-2 border-black rounded transition-all cursor-pointer shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 ${
                          filterDateType === preset.id
                            ? 'bg-purple-300 text-black'
                            : 'bg-white text-zinc-700 hover:bg-zinc-50'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Date Input */}
                <div>
                  {filterDateType === 'custom' ? (
                    <div className="animate-fade-in">
                      <label className="block text-[10px] uppercase font-black text-zinc-600 mb-1.5">Seleccionar Día Específico</label>
                      <input
                        type="date"
                        value={filterCustomDate}
                        onChange={(e) => setFilterCustomDate(e.target.value)}
                        className="w-full bg-white border-2 border-black text-xs font-retro-mono font-black p-2 rounded shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] focus:outline-none"
                      />
                    </div>
                  ) : (
                    <div className="opacity-40 select-none">
                      <label className="block text-[10px] uppercase font-black text-zinc-600 mb-1.5">Fecha Manual</label>
                      <input
                        type="text"
                        disabled
                        placeholder="Solo en modo Fecha..."
                        className="w-full bg-zinc-200 border-2 border-black/35 text-xs p-2 rounded cursor-not-allowed"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Resume panel with balanced wider styling */}
            <div className="bg-yellow-50/40 p-5 border-b-4 border-black font-bold text-black text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="bg-white border-3 border-black p-4 rounded-xl shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between">
                  <div>
                    <p className="text-[10px] uppercase font-black text-zinc-500 tracking-wide">Turnos Coincidentes</p>
                    <p className="text-2xl font-retro-heavy text-black mt-1">{totalShiftsCount} {totalShiftsCount === 1 ? 'Turno' : 'Turnos'}</p>
                  </div>
                  <p className="text-[10px] text-zinc-600 mt-3 uppercase font-black">
                    {closedShifts.length} cerrados correctamente • {totalShiftsCount - closedShifts.length} actualmente activos
                  </p>
                </div>

                <div className={`border-3 border-black p-4 rounded-xl shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between ${
                  combinedDiff === 0 
                    ? 'bg-lime-50' 
                    : combinedDiff < -0.01 
                      ? 'bg-rose-50' 
                      : 'bg-indigo-50'
                }`}>
                  <div>
                    <p className="text-[10px] uppercase font-black text-zinc-500 tracking-wide">Diferencia Neta de Caja (Filtrado)</p>
                    <p className={`text-2xl font-retro-heavy mt-1 ${
                      combinedDiff === 0 
                        ? 'text-lime-700' 
                        : combinedDiff < -0.01 
                          ? 'text-rose-700' 
                          : 'text-indigo-700'
                    }`}>
                      {combinedDiff === 0 
                        ? '$0.00' 
                        : combinedDiff < 0 
                          ? `-$${formatNum(Math.abs(combinedDiff))}` 
                          : `+$${formatNum(combinedDiff)}`
                      }
                    </p>
                  </div>
                  <div className="mt-3">
                    <span className={`inline-block text-[9px] font-black uppercase tracking-wider px-2 py-1 border-2 border-black rounded-md ${
                      combinedDiff === 0 
                        ? 'bg-lime-200 text-lime-950 border-lime-700' 
                        : combinedDiff < -0.01 
                          ? 'bg-rose-200 text-rose-950 border-rose-700' 
                          : 'bg-indigo-200 text-indigo-950 border-indigo-700'
                    }`}>
                      {combinedDiff === 0 
                        ? '✅ CUADRE PERFECTO ACUMULADO' 
                        : combinedDiff < 0 
                          ? '⚠️ FALTANTE ACUMULADO EN FILTROS' 
                          : '💎 SOBRANTE ACUMULADO EN FILTROS'
                      }
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* List of audits presented as a spacious responsive table */}
            <div className="bg-yellow-50/10">
              {filteredShifts.length === 0 ? (
                <div className="p-16 text-center text-zinc-500 font-black uppercase border-3 border-dashed border-zinc-300 rounded-xl bg-white m-6">
                  No se encontraron turnos con los filtros seleccionados.
                </div>
              ) : (
                <div className="overflow-x-auto border-b-3 border-black">
                  <table className="w-full text-left border-collapse min-w-[800px]">
                    <thead>
                      <tr className="bg-purple-100 text-[10px] font-black text-black uppercase tracking-widest border-b-3 border-black">
                        <th className="py-3 px-5 w-12 text-center">#</th>
                        <th className="py-3 px-5">Colaborador</th>
                        <th className="py-3 px-5">Apertura (Fecha & Inicial)</th>
                        <th className="py-3 px-5 text-right">Efectivo Final (Esperado / Físico)</th>
                        <th className="py-3 px-5 text-right">Transf. Final (Esperado / Real)</th>
                        <th className="py-3 px-5 text-center">Cuadre / Diferencia</th>
                        <th className="py-3 px-5 text-center">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y-2 divide-dashed divide-black/15 text-xs text-black font-bold bg-white">
                      {(() => {
                        const ITEMS_PER_PAGE = 10;
                        const paginatedShifts = filteredShifts.slice(
                          (shiftsCurrentPage - 1) * ITEMS_PER_PAGE,
                          shiftsCurrentPage * ITEMS_PER_PAGE
                        );

                        return (
                          <>
                            {paginatedShifts.map((shift, idx) => {
                              const globalIdx = filteredShifts.length - ((shiftsCurrentPage - 1) * ITEMS_PER_PAGE + idx);
                              const isDiscrepancy = shift.status === 'closed' && 
                                shift.cashEndActual !== undefined && 
                                shift.cashEndExpected !== undefined &&
                                Math.abs(shift.cashEndActual - shift.cashEndExpected) > 0.01;

                              const discrepancyVal = shift.status === 'closed' && 
                                shift.cashEndActual !== undefined && 
                                shift.cashEndExpected !== undefined 
                                ? shift.cashEndActual - shift.cashEndExpected 
                                : 0;

                              const isTransferDiscrepancy = shift.status === 'closed' && 
                                shift.transfersActual !== undefined && 
                                shift.transfersExpected !== undefined &&
                                Math.abs(shift.transfersActual - shift.transfersExpected) > 0.01;

                              const transferDiscrepancyVal = shift.status === 'closed' && 
                                shift.transfersActual !== undefined && 
                                shift.transfersExpected !== undefined 
                                ? shift.transfersActual - shift.transfersExpected 
                                : 0;

                              return (
                                <tr key={shift.id} className="hover:bg-cyan-50/30 transition-colors">
                                  {/* # Index */}
                                  <td className="py-3.5 px-5 text-center font-retro-mono text-zinc-500">
                                    #{globalIdx}
                                  </td>

                                  {/* Colaborador */}
                                  <td className="py-3.5 px-5">
                                    <div className="flex items-center gap-2">
                                      <span className="font-black text-black uppercase text-sm">{shift.employeeName}</span>
                                      {shift.status === 'open' ? (
                                        <span className="bg-lime-300 border border-black text-black px-1.5 py-0.2 rounded text-[8px] font-black uppercase tracking-wider animate-pulse">
                                          Abierto
                                        </span>
                                      ) : (
                                        <span className="bg-zinc-200 border border-black text-black px-1.5 py-0.2 rounded text-[8px] font-black uppercase tracking-wider">
                                          Cerrado
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[9px] text-zinc-500 uppercase mt-0.5 font-retro-mono">ID: {shift.id.substring(0, 8)}</p>
                                  </td>

                                  {/* Apertura */}
                                  <td className="py-3.5 px-5">
                                    <p className="font-retro-mono font-black text-black">
                                      {new Date(shift.startTime).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                    <p className="text-[10px] text-amber-950 font-black uppercase mt-0.5">INICIAL: ${formatNum(shift.cashStart)}</p>
                                  </td>

                                  {/* Efectivo final */}
                                  <td className="py-3.5 px-5 text-right font-retro-mono">
                                    {shift.endTime ? (
                                      <>
                                        <p className="text-purple-800 font-bold">ESP: ${formatNum(shift.cashEndExpected || 0)}</p>
                                        <p className="text-black font-black">FÍS: ${formatNum(shift.cashEndActual || 0)}</p>
                                      </>
                                    ) : (
                                      <span className="text-zinc-400 font-black uppercase text-[10px] italic">En barra...</span>
                                    )}
                                  </td>

                                  {/* Transferencias */}
                                  <td className="py-3.5 px-5 text-right font-retro-mono">
                                    {shift.endTime && shift.transfersExpected !== undefined ? (
                                      <>
                                        <p className="text-blue-800">ESP: ${formatNum(shift.transfersExpected)}</p>
                                        <p className="text-black font-black">REAL: ${formatNum(shift.transfersActual || 0)}</p>
                                      </>
                                    ) : (
                                      <span className="text-zinc-400 font-black uppercase text-[10px] italic">—</span>
                                    )}
                                  </td>

                                  {/* Cuadre / Diferencia */}
                                  <td className="py-3.5 px-5 text-center">
                                    {shift.status === 'closed' ? (
                                      <div className="flex flex-col items-center gap-1">
                                        {/* Cash discrepancy */}
                                        {isDiscrepancy ? (
                                          <span className={`inline-block px-2 py-0.5 rounded border border-black text-[9px] font-black uppercase tracking-wider ${
                                            discrepancyVal < 0 ? 'bg-red-300 text-red-950' : 'bg-purple-300 text-purple-950'
                                          }`}>
                                            EFEC: {discrepancyVal < 0 ? '-' : '+'}${formatNum(Math.abs(discrepancyVal))}
                                          </span>
                                        ) : null}

                                        {/* Transfer discrepancy */}
                                        {isTransferDiscrepancy ? (
                                          <span className={`inline-block px-2 py-0.5 rounded border border-black text-[9px] font-black uppercase tracking-wider ${
                                            transferDiscrepancyVal < 0 ? 'bg-red-200 text-red-900' : 'bg-indigo-200 text-indigo-900'
                                          }`}>
                                            TRANS: {transferDiscrepancyVal < 0 ? '-' : '+'}${formatNum(Math.abs(transferDiscrepancyVal))}
                                          </span>
                                        ) : null}

                                        {/* Perfect balance */}
                                        {!isDiscrepancy && !isTransferDiscrepancy ? (
                                          <span className="inline-block px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider text-black bg-lime-300 border border-black">
                                            ✅ CUADRADO
                                          </span>
                                        ) : null}
                                      </div>
                                    ) : (
                                      <span className="text-zinc-400 font-black uppercase tracking-wide text-[10px] animate-pulse">ACTIVO</span>
                                    )}
                                  </td>

                                  {/* Acciones (Ver Previa & Descargas) */}
                                  <td className="py-3.5 px-5 text-center">
                                    <div className="flex items-center justify-center gap-2">
                                      <button
                                        onClick={() => setPreviewShift(shift)}
                                        className="inline-flex items-center gap-1 bg-cyan-100 hover:bg-cyan-200 border border-black text-black px-2 py-1.5 rounded text-[9px] font-retro-mono font-black uppercase tracking-wider transition-all cursor-pointer shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5"
                                        title="Ver vista previa detallada de lo trabajado en el día"
                                      >
                                        <Eye className="w-3 h-3 stroke-[2.5]" />
                                        Ver Previa
                                      </button>
                                      <button
                                        onClick={() => downloadSingleShiftPDF(shift)}
                                        className="inline-flex items-center gap-1 bg-zinc-100 hover:bg-yellow-200 border border-black text-black px-2 py-1.5 rounded text-[9px] font-retro-mono font-black uppercase tracking-wider transition-all cursor-pointer shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5"
                                        title="Descargar ticket de arqueo térmico PDF"
                                      >
                                        <Download className="w-3 h-3 stroke-[2.5]" />
                                        Ticket
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </>
                        );
                      })()}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Audit Shifts Pagination Controls */}
            {filteredShifts.length > 0 && (() => {
              const ITEMS_PER_PAGE = 10;
              const totalPages = Math.max(1, Math.ceil(filteredShifts.length / ITEMS_PER_PAGE));
              const startIndex = (shiftsCurrentPage - 1) * ITEMS_PER_PAGE;
              const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, filteredShifts.length);

              return (
                <div className="flex flex-col sm:flex-row items-center justify-between border-t-4 border-black p-4 bg-zinc-50 text-xs font-bold text-black gap-3">
                  <div className="uppercase font-black text-[10px] tracking-wider text-zinc-700">
                    Mostrando {startIndex + 1}-{endIndex} de {filteredShifts.length} turnos / arqueos
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      disabled={shiftsCurrentPage === 1}
                      onClick={() => setShiftsCurrentPage(1)}
                      className="px-2.5 py-1.5 border-2 border-black bg-white rounded-md text-[10px] font-black uppercase shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] hover:bg-yellow-100 disabled:opacity-40 disabled:hover:bg-white active:translate-y-0.5 disabled:active:translate-y-0 cursor-pointer disabled:cursor-not-allowed"
                    >
                      « Primera
                    </button>
                    <button
                      type="button"
                      disabled={shiftsCurrentPage === 1}
                      onClick={() => setShiftsCurrentPage(p => Math.max(1, p - 1))}
                      className="px-2.5 py-1.5 border-2 border-black bg-white rounded-md text-[10px] font-black uppercase shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] hover:bg-yellow-100 disabled:opacity-40 disabled:hover:bg-white active:translate-y-0.5 disabled:active:translate-y-0 cursor-pointer disabled:cursor-not-allowed"
                    >
                      ‹ Anterior
                    </button>
                    
                    <span className="font-retro-mono bg-yellow-200 border-2 border-black px-2.5 py-1 rounded text-[10px] font-black">
                      PÁG {shiftsCurrentPage} / {totalPages}
                    </span>

                    <button
                      type="button"
                      disabled={shiftsCurrentPage === totalPages}
                      onClick={() => setShiftsCurrentPage(p => Math.min(totalPages, p + 1))}
                      className="px-2.5 py-1.5 border-2 border-black bg-white rounded-md text-[10px] font-black uppercase shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] hover:bg-yellow-100 disabled:opacity-40 disabled:hover:bg-white active:translate-y-0.5 disabled:active:translate-y-0 cursor-pointer disabled:cursor-not-allowed"
                    >
                      Siguiente ›
                    </button>
                    <button
                      type="button"
                      disabled={shiftsCurrentPage === totalPages}
                      onClick={() => setShiftsCurrentPage(totalPages)}
                      className="px-2.5 py-1.5 border-2 border-black bg-white rounded-md text-[10px] font-black uppercase shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] hover:bg-yellow-100 disabled:opacity-40 disabled:hover:bg-white active:translate-y-0.5 disabled:active:translate-y-0 cursor-pointer disabled:cursor-not-allowed"
                    >
                      Última »
                    </button>
                  </div>
                </div>
              );
            })()}

            <div className="bg-pink-100 border-t-4 border-black p-4.5 flex items-start gap-2.5 text-[10px] text-black font-bold leading-normal">
              <CalendarDays className="w-5 h-5 text-black flex-shrink-0 stroke-[2.5]" />
              <span className="uppercase">Los cierres de turno calculan la suma esperada basándose estrictamente en las ventas cobradas tanto en efectivo como en transferencias de manera automatizada.</span>
            </div>
          </div>
        </div>
      )}

      {/* PREVIEW SHIFT MODAL */}
      {previewShift && (() => {
        const pShiftSales = sales.filter(s => {
          const isCompleted = s.status === 'completed';
          const isSameEmployee = s.employeeId === previewShift.employeeId;
          const saleTime = new Date(s.timestamp).getTime();
          const startTime = new Date(previewShift.startTime).getTime();
          const isAfterStart = saleTime >= startTime;
          const isBeforeEnd = previewShift.endTime ? saleTime <= new Date(previewShift.endTime).getTime() : true;
          return isCompleted && isSameEmployee && isAfterStart && isBeforeEnd;
        });

        const pShiftExpenses = expenses.filter(e => {
          const expTime = new Date(e.timestamp).getTime();
          const startTime = new Date(previewShift.startTime).getTime();
          const isAfterStart = expTime >= startTime;
          const isBeforeEnd = previewShift.endTime ? expTime <= new Date(previewShift.endTime).getTime() : true;
          const isShiftCashExpense = e.category !== 'renta' && e.category !== 'servicios';
          return isAfterStart && isBeforeEnd && isShiftCashExpense;
        });

        const pCashSales = pShiftSales.filter(s => s.paymentMethod === 'efectivo').reduce((sum, s) => sum + s.total, 0);
        const pTransferSales = pShiftSales.filter(s => s.paymentMethod === 'transferencia').reduce((sum, s) => sum + s.total, 0);
        const pCardSales = pShiftSales.filter(s => s.paymentMethod === 'tarjeta').reduce((sum, s) => sum + s.total, 0);
        const pTotalSalesSum = pShiftSales.reduce((sum, s) => sum + s.total, 0);
        const pTotalExpensesSum = pShiftExpenses.reduce((sum, s) => sum + s.amount, 0);

        // Item counts
        const pItemsMap: { [name: string]: { qty: number; total: number } } = {};
        pShiftSales.forEach(s => {
          s.items.forEach(it => {
            if (!pItemsMap[it.name]) {
              pItemsMap[it.name] = { qty: 0, total: 0 };
            }
            pItemsMap[it.name].qty += it.quantity;
            pItemsMap[it.name].total += it.price * it.quantity;
          });
        });

        const pItemsSorted = Object.entries(pItemsMap)
          .map(([name, d]) => ({ name, ...d }))
          .sort((a, b) => b.qty - a.qty);

        const pCashExpected = previewShift.cashEndExpected !== undefined ? previewShift.cashEndExpected : (previewShift.cashStart + pCashSales);
        const pCashActual = previewShift.cashEndActual !== undefined ? previewShift.cashEndActual : 0;
        const pCashDiff = previewShift.status === 'closed' ? pCashActual - pCashExpected : 0;

        const pTransfersExpected = previewShift.transfersExpected !== undefined ? previewShift.transfersExpected : pTransferSales;
        const pTransfersActual = previewShift.transfersActual !== undefined ? previewShift.transfersActual : 0;
        const pTransfersDiff = previewShift.status === 'closed' ? pTransfersActual - pTransfersExpected : 0;

        const pOverallDiff = pCashDiff + pTransfersDiff;

        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
            <div className="bg-white border-4 border-black rounded-xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-fade-in text-black font-bold">
              {/* Header */}
              <div className="bg-cyan-300 border-b-4 border-black p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h4 className="font-retro-heavy text-base uppercase flex items-center gap-2">
                    <Eye className="w-5 h-5 stroke-[2.5]" />
                    Vista Previa de Arqueo y Trabajo Diario
                  </h4>
                  <p className="text-[10px] font-retro-mono uppercase text-black/75 mt-0.5">
                    Turno: #{previewShift.id} • Colaborador: {previewShift.employeeName}
                  </p>
                </div>
                <button
                  onClick={() => setPreviewShift(null)}
                  className="bg-red-400 hover:bg-red-500 border-2 border-black text-black px-2.5 py-1.5 rounded-lg text-xs font-black uppercase shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 cursor-pointer flex items-center gap-1.5 self-end sm:self-auto"
                >
                  <X className="w-3.5 h-3.5 stroke-[2.5]" />
                  Cerrar
                </button>
              </div>

              {/* Body */}
              <div className="p-5 overflow-y-auto space-y-6 text-xs leading-normal">
                {/* Meta info card */}
                <div className="bg-zinc-100 border-2 border-black p-4 rounded-lg flex flex-col md:flex-row justify-between gap-4">
                  <div>
                    <span className="text-[10px] text-zinc-500 uppercase block">Colaborador operativo</span>
                    <span className="text-sm font-black uppercase text-purple-950">{previewShift.employeeName}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-500 uppercase block">Fecha & Hora Apertura</span>
                    <span className="font-retro-mono">{new Date(previewShift.startTime).toLocaleString('es-ES')}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-500 uppercase block">Fecha & Hora Cierre</span>
                    <span className="font-retro-mono">
                      {previewShift.endTime ? new Date(previewShift.endTime).toLocaleString('es-ES') : 'TURNO ACTIVO (EN BARRA)'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-500 uppercase block">Estado</span>
                    {previewShift.status === 'open' ? (
                      <span className="inline-block bg-lime-300 border border-black text-[9px] px-2 py-0.5 rounded font-retro-mono tracking-wider animate-pulse uppercase mt-0.5">
                        Abierto
                      </span>
                    ) : (
                      <span className="inline-block bg-zinc-300 border border-black text-[9px] px-2 py-0.5 rounded font-retro-mono tracking-wider uppercase mt-0.5">
                        Cerrado
                      </span>
                    )}
                  </div>
                </div>

                {/* Financial overview grids */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Cash Reconcil */}
                  <div className="border-3 border-black rounded-lg overflow-hidden bg-zinc-50/50 flex flex-col">
                    <div className="bg-zinc-800 text-white p-2.5 font-retro-heavy text-[10px] uppercase tracking-wider">
                      💵 Conciliación de Efectivo (Caja Física)
                    </div>
                    <div className="p-3.5 space-y-2.5 flex-1">
                      <div className="flex justify-between items-center border-b border-black/10 pb-1.5">
                        <span className="text-zinc-600">Base de Apertura (Inicial):</span>
                        <span className="font-retro-mono font-black">${formatNum(previewShift.cashStart)}</span>
                      </div>
                      <div className="flex justify-between items-center border-b border-black/10 pb-1.5">
                        <span className="text-zinc-600">Ventas Registradas en Efectivo (+):</span>
                        <span className="font-retro-mono font-black text-lime-700">+${formatNum(pCashSales)}</span>
                      </div>
                      <div className="flex justify-between items-center border-b border-black/10 pb-1.5">
                        <span className="text-zinc-700 font-extrabold">Efectivo Esperado Total (=):</span>
                        <span className="font-retro-mono font-black text-black">${formatNum(pCashExpected)}</span>
                      </div>
                      <div className="flex justify-between items-center border-b border-black/10 pb-1.5">
                        <span className="text-zinc-700 font-extrabold">Efectivo Declarado (Arqueo Físico):</span>
                        <span className="font-retro-mono font-black text-purple-900">${formatNum(pCashActual)}</span>
                      </div>
                      <div className="flex justify-between items-center pt-1">
                        <span className="text-black font-black uppercase text-[10px]">Diferencia de Efectivo:</span>
                        {previewShift.status === 'open' ? (
                          <span className="text-zinc-500 italic font-black text-[10px] uppercase">Turno en curso</span>
                        ) : Math.abs(pCashDiff) < 0.01 ? (
                          <span className="bg-lime-200 border border-black text-lime-950 px-2 py-0.5 rounded text-[9px] font-black uppercase">
                            ✅ CUADRADO
                          </span>
                        ) : pCashDiff < 0 ? (
                          <span className="bg-red-200 border border-black text-red-950 px-2 py-0.5 rounded text-[9px] font-black uppercase">
                            FALTANTE: -${formatNum(Math.abs(pCashDiff))}
                          </span>
                        ) : (
                          <span className="bg-blue-200 border border-black text-blue-950 px-2 py-0.5 rounded text-[9px] font-black uppercase">
                            SOBRANTE: +${formatNum(pCashDiff)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Transfer Reconcil */}
                  <div className="border-3 border-black rounded-lg overflow-hidden bg-zinc-50/50 flex flex-col">
                    <div className="bg-zinc-800 text-white p-2.5 font-retro-heavy text-[10px] uppercase tracking-wider">
                      📱 Conciliación de Transferencias Bancarias
                    </div>
                    <div className="p-3.5 space-y-2.5 flex-1">
                      <div className="flex justify-between items-center border-b border-black/10 pb-1.5">
                        <span className="text-zinc-600">Ventas Esperadas por Transferencia:</span>
                        <span className="font-retro-mono font-black text-blue-700">${formatNum(pTransfersExpected)}</span>
                      </div>
                      <div className="flex justify-between items-center border-b border-black/10 pb-1.5">
                        <span className="text-zinc-700 font-extrabold">Suma de Transferencias Reales:</span>
                        <span className="font-retro-mono font-black text-black">${formatNum(pTransfersActual)}</span>
                      </div>
                      <div className="flex justify-between items-center border-b border-black/10 pb-1.5">
                        <span className="text-zinc-600">Ventas por Tarjeta (Soporte POS):</span>
                        <span className="font-retro-mono font-black text-zinc-700">${formatNum(pCardSales)}</span>
                      </div>
                      <div className="flex justify-between items-center pt-1">
                        <span className="text-black font-black uppercase text-[10px]">Diferencia de Transferencia:</span>
                        {previewShift.status === 'open' ? (
                          <span className="text-zinc-500 italic font-black text-[10px] uppercase">Turno en curso</span>
                        ) : Math.abs(pTransfersDiff) < 0.01 ? (
                          <span className="bg-lime-200 border border-black text-lime-950 px-2 py-0.5 rounded text-[9px] font-black uppercase">
                            ✅ CUADRADO
                          </span>
                        ) : pTransfersDiff < 0 ? (
                          <span className="bg-red-200 border border-black text-red-950 px-2 py-0.5 rounded text-[9px] font-black uppercase">
                            FALTANTE: -${formatNum(Math.abs(pTransfersDiff))}
                          </span>
                        ) : (
                          <span className="bg-blue-200 border border-black text-blue-950 px-2 py-0.5 rounded text-[9px] font-black uppercase">
                            SOBRANTE: +${formatNum(pTransfersDiff)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Combined overall balance box */}
                <div className={`p-4 border-3 border-black rounded-lg flex flex-col sm:flex-row items-center justify-between gap-4 ${
                  previewShift.status === 'open' 
                    ? 'bg-zinc-100'
                    : Math.abs(pOverallDiff) < 0.01 
                      ? 'bg-lime-100' 
                      : pOverallDiff < 0 
                        ? 'bg-rose-100' 
                        : 'bg-indigo-100'
                }`}>
                  <div>
                    <span className="font-retro-heavy text-[11px] uppercase tracking-wide text-zinc-700 block">Balance Consolidado General del Turno</span>
                    <span className="text-2xl font-retro-heavy mt-1 block">
                      TOTAL VENTAS: ${formatNum(pTotalSalesSum)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] text-zinc-500 uppercase block font-black mb-1">Resultado de Auditoría</span>
                    {previewShift.status === 'open' ? (
                      <span className="bg-zinc-200 border-2 border-black text-black px-3 py-1 rounded text-[10px] font-black uppercase tracking-wider">
                        ⏰ TURNO ACTIVO
                      </span>
                    ) : Math.abs(pOverallDiff) < 0.01 ? (
                      <span className="bg-lime-300 border-2 border-black text-black px-3 py-1 rounded text-[10px] font-black uppercase tracking-wider">
                        ✅ PERFECTAMENTE CUADRADO
                      </span>
                    ) : pOverallDiff < 0 ? (
                      <span className="bg-red-300 border-2 border-black text-red-950 px-3 py-1 rounded text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 stroke-[2.5]" />
                        DESCUADRE FALTANTE: -${formatNum(Math.abs(pOverallDiff))}
                      </span>
                    ) : (
                      <span className="bg-purple-300 border-2 border-black text-purple-950 px-3 py-1 rounded text-[10px] font-black uppercase tracking-wider">
                        💎 DESCUADRE SOBRANTE: +${formatNum(pOverallDiff)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Products sold & Sales Table tabs */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {/* Products breakdown table */}
                  <div className="border-3 border-black rounded-lg overflow-hidden bg-white">
                    <div className="bg-zinc-700 text-white p-2.5 font-retro-heavy text-[10px] uppercase tracking-wider">
                      ☕ Productos Vendidos ({pItemsSorted.length})
                    </div>
                    <div className="max-h-[220px] overflow-y-auto">
                      {pItemsSorted.length === 0 ? (
                        <div className="p-10 text-center text-zinc-400 uppercase font-black text-[10px]">
                          Ninguna venta en esta sesión
                        </div>
                      ) : (
                        <table className="w-full text-left">
                          <thead>
                            <tr className="bg-zinc-100 border-b border-black text-[9px] uppercase tracking-wider">
                              <th className="py-1.5 px-3">Producto</th>
                              <th className="py-1.5 px-3 text-center">Unidades</th>
                              <th className="py-1.5 px-3 text-right">Monto</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-200 font-retro-mono font-medium text-black text-[11px]">
                            {pItemsSorted.map((item, i) => (
                              <tr key={i} className="hover:bg-zinc-50">
                                <td className="py-2 px-3 font-bold font-sans uppercase">{item.name}</td>
                                <td className="py-2 px-3 text-center font-black">{item.qty} uds</td>
                                <td className="py-2 px-3 text-right font-black">${formatNum(item.total)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>

                  {/* Individual transactions list */}
                  <div className="border-3 border-black rounded-lg overflow-hidden bg-white">
                    <div className="bg-zinc-700 text-white p-2.5 font-retro-heavy text-[10px] uppercase tracking-wider">
                      🧾 Registro de Transacciones Individuales ({pShiftSales.length})
                    </div>
                    <div className="max-h-[220px] overflow-y-auto text-[11px]">
                      {pShiftSales.length === 0 ? (
                        <div className="p-10 text-center text-zinc-400 uppercase font-black text-[10px]">
                          Sin comprobantes generados
                        </div>
                      ) : (
                        <table className="w-full text-left">
                          <thead>
                            <tr className="bg-zinc-100 border-b border-black text-[9px] uppercase tracking-wider">
                              <th className="py-1.5 px-3">Ticket</th>
                              <th className="py-1.5 px-3">Hora</th>
                              <th className="py-1.5 px-3 text-center">Método</th>
                              <th className="py-1.5 px-3 text-right">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-200 font-retro-mono text-zinc-900 text-[11px]">
                            {pShiftSales.map((sale) => (
                              <tr key={sale.id} className="hover:bg-zinc-50">
                                <td className="py-2 px-3 font-sans font-black uppercase text-black">
                                  {sale.invoiceNumber || `#${sale.id.substring(0, 6).toUpperCase()}`}
                                </td>
                                <td className="py-2 px-3">
                                  {new Date(sale.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                                </td>
                                <td className="py-2 px-3 text-center">
                                  <span className="bg-zinc-100 border border-zinc-300 text-[9px] px-1.5 py-0.2 rounded font-black uppercase">
                                    {sale.paymentMethod}
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-right font-black text-black">
                                  ${formatNum(sale.total)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                </div>

              </div>

              {/* Footer Downloads */}
              <div className="bg-zinc-100 border-t-4 border-black p-4 flex flex-col sm:flex-row items-center justify-end gap-3.5">
                <span className="text-[10px] uppercase font-black tracking-wide text-zinc-500 self-start sm:self-auto">
                  Descargar arqueo en formatos oficiales:
                </span>
                <div className="flex items-center gap-2.5 w-full sm:w-auto">
                  <button
                    onClick={() => downloadShiftDetailedReportPDF(previewShift)}
                    className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white border-2 border-black rounded-lg px-4 py-2.5 text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5"
                    title="Descargar reporte completo en formato Carta A4 PDF"
                  >
                    <FileText className="w-4 h-4 stroke-[2.5]" />
                    AUDITORÍA A4 (PDF)
                  </button>
                  <button
                    onClick={() => downloadSingleShiftPDF(previewShift)}
                    className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 bg-yellow-300 hover:bg-yellow-400 text-black border-2 border-black rounded-lg px-4 py-2.5 text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5"
                    title="Descargar ticket de arqueo térmico"
                  >
                    <Download className="w-4 h-4 stroke-[2.5]" />
                    TICKET COMPACTO (PDF)
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
