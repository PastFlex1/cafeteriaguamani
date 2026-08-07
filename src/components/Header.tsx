/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Coffee, User, Calendar, Clock, LogIn, LogOut, DollarSign, Key } from 'lucide-react';
import { Employee, Shift } from '../types';
import { formatNum } from '../utils';

interface HeaderProps {
  businessName: string;
  employees: Employee[];
  activeEmployee: Employee | null;
  activeShift: Shift | null;
  shiftsHistory: Shift[];
  onSelectEmployee: (employee: Employee | null) => void;
  onStartShift: (cashStart: number) => void;
  onEndShift: (cashEndActual: number, transfersActual: number) => void;
}

export default function Header({
  businessName,
  employees,
  activeEmployee,
  activeShift,
  shiftsHistory,
  onSelectEmployee,
  onStartShift,
  onEndShift,
}: HeaderProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [cashStartInput, setCashStartInput] = useState('50.00');
  const [cashEndInput, setCashEndInput] = useState('');
  const [transfersEndInput, setTransfersEndInput] = useState('');
  const [enteredPin, setEnteredPin] = useState('');
  const [selectedEmployeeForPin, setSelectedEmployeeForPin] = useState<Employee | null>(null);
  const [pinError, setPinError] = useState(false);

  const getLocalDateString = (isoString?: string) => {
    const d = isoString ? new Date(isoString) : new Date();
    return d.toLocaleDateString('es-ES', { year: 'numeric', month: '2-digit', day: '2-digit' });
  };
  const todayStr = getLocalDateString();
  const hasShiftStartedToday = shiftsHistory && activeEmployee && shiftsHistory.some(s => s.employeeId === activeEmployee.id && getLocalDateString(s.startTime) === todayStr);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatDate = (date: Date) => {
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    };
    return date.toLocaleDateString('es-ES', options);
  };

  const handleSelectEmployeeRequest = (emp: Employee) => {
    setSelectedEmployeeForPin(emp);
    setEnteredPin('');
    setPinError(false);
  };

  const handleVerifyPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedEmployeeForPin && enteredPin === selectedEmployeeForPin.pin) {
      onSelectEmployee(selectedEmployeeForPin);
      setShowEmployeeModal(false);
      setSelectedEmployeeForPin(null);
      setEnteredPin('');
      setPinError(false);
    } else {
      setPinError(true);
      setEnteredPin('');
    }
  };

  const handleStartShiftSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cash = parseFloat(cashStartInput) || 0;
    onStartShift(cash);
    setShowShiftModal(false);
  };

  const handleEndShiftSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cash = parseFloat(cashEndInput) || 0;
    const transfers = parseFloat(transfersEndInput) || 0;
    onEndShift(cash, transfers);
    setShowShiftModal(false);
    setCashEndInput('');
    setTransfersEndInput('');
  };

  return (
    <header className="bg-cyan-300 border-b-4 border-black px-6 py-4" id="app-header">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4">
        {/* Logo and Business Info */}
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-lg bg-pink-400 border-3 border-black flex items-center justify-center text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:scale-105 transition-transform duration-200 animate-bounce" id="brand-logo">
            <Coffee className="w-6 h-6 stroke-[2]" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-retro-heavy text-black tracking-tight leading-none mb-1 drop-shadow-[2px_2px_0px_rgba(255,255,255,1)] uppercase">{businessName || 'Mi Cafetería'}</h1>
            <div className="flex flex-wrap gap-2 items-center">
              <p className="text-[11px] font-retro-mono tracking-wider text-black bg-yellow-300 border-2 border-black px-2 py-0.5 inline-block font-black shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)]">
                ARCADE POS v9.0 • ESTILO DE LOS 90
              </p>
              <p className="text-[11px] font-retro-mono tracking-wider text-black bg-purple-300 border-2 border-black px-2 py-0.5 inline-block font-black shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)]">
                RUC: 1725403883001
              </p>
            </div>
          </div>
        </div>

        {/* Date and Time */}
        <div className="hidden xl:flex items-center gap-4 text-xs text-black font-bold">
          <div className="flex items-center gap-2 bg-pink-200 border-2 border-black p-2 rounded shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
            <Calendar className="w-4 h-4 text-black stroke-[2]" />
            <span className="capitalize font-black">{formatDate(currentTime)}</span>
          </div>
          <div className="flex items-center gap-2 font-retro-mono text-black bg-lime-300 px-3 py-2 rounded border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
            <Clock className="w-4 h-4 text-black stroke-[2]" />
            <span className="font-extrabold">{currentTime.toLocaleTimeString('es-ES')}</span>
          </div>
        </div>

        {/* User Profile and Shift Actions */}
        <div className="flex items-center gap-3">
          {/* Active Employee Status */}
          {activeEmployee && (
            <button
              onClick={() => {
                setShowEmployeeModal(true);
                setSelectedEmployeeForPin(null);
                setEnteredPin('');
                setPinError(false);
              }}
              className="flex items-center gap-2 bg-purple-300 hover:bg-purple-200 border-2 border-black rounded-lg px-2.5 py-1.5 text-xs text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] active:translate-x-[1px] active:translate-y-[1px] transition-all font-bold cursor-pointer text-left"
              title="Click para cambiar de colaborador / iniciar sesión"
              id="active-employee-trigger"
            >
              <User className="w-4 h-4 text-black stroke-[2]" />
              <div className="text-left flex flex-col justify-center">
                <p className="font-black uppercase tracking-wide leading-none max-w-[120px] md:max-w-[160px] xl:max-w-[200px] truncate">
                  {activeEmployee.name}
                </p>
                <p className="text-[9px] font-retro-mono text-purple-900 mt-0.5 font-bold uppercase tracking-wider leading-none">
                  {activeEmployee.role}
                </p>
              </div>
            </button>
          )}

          {/* Shift Button */}
          {activeEmployee && (
            <>
              {activeShift ? (
                <div className="flex items-center gap-2 bg-lime-300 border-2 border-black rounded-lg px-2.5 py-1.5 text-xs text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] font-bold">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-black animate-pulse"></span>
                  <div className="flex flex-col justify-center">
                    <p className="font-black uppercase tracking-wide leading-none">CAJA LÍNEA</p>
                    <p className="text-[9px] font-retro-mono text-lime-900 mt-0.5 font-bold leading-none">F: ${formatNum(activeShift.cashStart)}</p>
                  </div>
                  <button
                    onClick={() => {
                      setCashEndInput('');
                      setShowShiftModal(true);
                    }}
                    className="ml-1 bg-pink-400 hover:bg-pink-500 text-black border-2 border-black rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] active:translate-x-[1px] active:translate-y-[1px]"
                  >
                    ARQUEO
                  </button>
                </div>
              ) : hasShiftStartedToday ? (
                <button
                  disabled
                  className="flex items-center gap-1.5 bg-zinc-300 text-zinc-500 border-2 border-zinc-400 rounded-lg px-3 py-1.5 text-xs font-black uppercase tracking-wider cursor-not-allowed shadow-none"
                  title="Ya se cerró el turno correspondiente al día de hoy. Solo se permite un turno diario."
                >
                  <Clock className="w-4 h-4 stroke-[2] text-zinc-400" />
                  CERRADO
                </button>
              ) : (
                <button
                  onClick={() => {
                    setCashStartInput('50.00');
                    setShowShiftModal(true);
                  }}
                  className="flex items-center gap-1.5 bg-fuchsia-400 hover:bg-fuchsia-300 text-black border-2 border-black rounded-lg px-3 py-1.5 text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] active:translate-x-[1px] active:translate-y-[1px]"
                >
                  <Clock className="w-4 h-4 stroke-[2]" />
                  ABRIR TURNO
                </button>
              )}
            </>
          )}
        </div>
      </div>



      {/* Shift Modal (Open/Close) */}
      {showShiftModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border-4 border-black max-w-sm w-full overflow-hidden shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] rounded-xl">
            {activeShift ? (
              /* Close Shift Form */
              <form onSubmit={handleEndShiftSubmit}>
                <div className="bg-lime-300 border-b-4 border-black p-4 text-black">
                  <h3 className="text-base font-black uppercase tracking-wider font-retro-heavy">💵 CIERRE DE CAJA</h3>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-black/80 mt-1">Finalizar arqueo para {activeShift.employeeName}</p>
                </div>
                <div className="p-4 space-y-4 bg-yellow-50">
                  <div className="bg-white rounded-lg p-3 border-3 border-black space-y-2 text-xs text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] font-bold">
                    <div className="flex justify-between">
                      <span>Caja Inicial:</span>
                      <span className="font-extrabold font-retro-mono text-sm">${formatNum(activeShift.cashStart)} USD</span>
                    </div>
                    <div className="flex justify-between text-cyan-700 border-t border-black pt-2">
                      <span>Efectivo Esperado:</span>
                      <span className="font-extrabold font-retro-mono text-sm bg-cyan-100 border border-cyan-800 px-1 py-0.5 rounded">
                        ${formatNum(activeShift.cashEndExpected !== undefined ? activeShift.cashEndExpected : activeShift.cashStart)} USD
                      </span>
                    </div>
                    <div className="flex justify-between text-purple-700 border-t border-black pt-2">
                      <span>Transferencias Esperadas:</span>
                      <span className="font-extrabold font-retro-mono text-sm bg-purple-100 border border-purple-800 px-1 py-0.5 rounded">
                        ${formatNum(activeShift.transfersExpected || 0)} USD
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-black uppercase tracking-wider text-black mb-1.5">
                      Efectivo Real en Caja (USD)
                    </label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-2.5 w-4 h-4 text-black stroke-[2.5]" />
                      <input
                        type="number"
                        step="0.01"
                        value={cashEndInput}
                        onChange={(e) => setCashEndInput(e.target.value)}
                        placeholder="0.00"
                        className="w-full pl-9 border-3 border-black bg-white rounded-lg p-2.5 text-sm font-extrabold font-retro-mono text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] focus:outline-none focus:bg-cyan-50"
                        required
                        autoFocus
                      />
                    </div>
                    <p className="text-[10px] text-zinc-500 font-bold mt-1.5 leading-relaxed">
                      Cuenta el dinero real disponible en caja física.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-black uppercase tracking-wider text-black mb-1.5">
                      Transferencias Reales (USD)
                    </label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-2.5 w-4 h-4 text-black stroke-[2.5]" />
                      <input
                        type="number"
                        step="0.01"
                        value={transfersEndInput}
                        onChange={(e) => setTransfersEndInput(e.target.value)}
                        placeholder="0.00"
                        className="w-full pl-9 border-3 border-black bg-white rounded-lg p-2.5 text-sm font-extrabold font-retro-mono text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] focus:outline-none focus:bg-cyan-50"
                        required
                      />
                    </div>
                    <p className="text-[10px] text-zinc-500 font-bold mt-1.5 leading-relaxed">
                      Verifica las transferencias reales en tu cuenta bancaria para este turno.
                    </p>
                  </div>
                </div>
                <div className="bg-yellow-100 border-t-3 border-black p-3 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowShiftModal(false)}
                    className="bg-white hover:bg-zinc-100 text-black border-2 border-black rounded-lg px-4 py-2 text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5"
                  >
                    ATRÁS
                  </button>
                  <button
                    type="submit"
                    className="bg-red-400 hover:bg-red-500 text-black border-2 border-black rounded-lg px-4 py-2 text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5"
                  >
                    CERRAR TURNO
                  </button>
                </div>
              </form>
            ) : (
              /* Open Shift Form */
              <form onSubmit={handleStartShiftSubmit}>
                <div className="bg-fuchsia-400 border-b-4 border-black p-4 text-black">
                  <h3 className="text-base font-black uppercase tracking-wider font-retro-heavy">⚡️ APERTURA DE CAJA</h3>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-black/80 mt-1">Registrar fondo inicial de {activeEmployee?.name}</p>
                </div>
                <div className="p-4 space-y-4 bg-pink-50">
                  <div>
                    <label className="block text-xs font-black uppercase tracking-wider text-black mb-1.5">
                      Fondo de Cambio Inicial (USD)
                    </label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-2.5 w-4 h-4 text-black stroke-[2.5]" />
                      <input
                        type="number"
                        step="0.01"
                        value={cashStartInput}
                        onChange={(e) => setCashStartInput(e.target.value)}
                        className="w-full pl-9 border-3 border-black bg-white rounded-lg p-2.5 text-sm font-extrabold font-retro-mono text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] focus:outline-none focus:bg-cyan-50"
                        required
                        autoFocus
                      />
                    </div>
                    <p className="text-[10px] text-zinc-500 font-bold mt-2 leading-relaxed">
                      Monto de cambio inicial provisto para transacciones del turno.
                    </p>
                  </div>
                </div>
                <div className="bg-pink-100 border-t-3 border-black p-3 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowShiftModal(false)}
                    className="bg-white hover:bg-zinc-100 text-black border-2 border-black rounded-lg px-4 py-2 text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5"
                  >
                    CERRAR
                  </button>
                  <button
                    type="submit"
                    className="bg-lime-300 hover:bg-lime-400 text-black border-2 border-black rounded-lg px-4 py-2 text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5"
                  >
                    INICIAR TURNO
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Employee Switcher Modal */}
      {showEmployeeModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in" id="employee-switch-modal">
          <div className="bg-white border-4 border-black max-w-md w-full overflow-hidden shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] rounded-xl">
            {selectedEmployeeForPin ? (
              /* Verify PIN Form */
              <form onSubmit={handleVerifyPin} id="verify-pin-form">
                <div className="bg-purple-300 border-b-4 border-black p-4 text-black">
                  <h3 className="text-base font-black uppercase tracking-wider font-retro-heavy">🔑 VERIFICAR PIN</h3>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-black/80 mt-1">
                    Ingrese el PIN de seguridad de {selectedEmployeeForPin.name}
                  </p>
                </div>
                <div className="p-4 space-y-4 bg-yellow-50">
                  <div>
                    <label className="block text-xs font-black uppercase tracking-wider text-black mb-1.5">
                      PIN Confidencial (4 dígitos)
                    </label>
                    <div className="relative">
                      <Key className="absolute left-3 top-2.5 w-4 h-4 text-black stroke-[2.5]" />
                      <input
                        type="password"
                        maxLength={4}
                        pattern="\d{4}"
                        value={enteredPin}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '');
                          setEnteredPin(val);
                          setPinError(false);
                        }}
                        placeholder="••••"
                        className="w-full pl-9 tracking-[0.5em] text-center border-3 border-black bg-white rounded-lg p-2.5 text-lg font-extrabold text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] focus:outline-none focus:bg-cyan-50"
                        required
                        autoFocus
                      />
                    </div>
                    {pinError && (
                      <p className="text-red-600 font-black text-[10px] uppercase tracking-wider mt-2 animate-bounce">
                        ⚠️ PIN INCORRECTO. INTENTE NUEVAMENTE.
                      </p>
                    )}
                    <p className="text-[10px] text-zinc-500 font-bold mt-2 leading-relaxed">
                      Si olvidó su código, consulte con el administrador del punto de venta o revise su ficha en "Personal".
                    </p>
                  </div>
                </div>
                <div className="bg-yellow-100 border-t-3 border-black p-3 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedEmployeeForPin(null);
                      setEnteredPin('');
                      setPinError(false);
                    }}
                    className="bg-white hover:bg-zinc-100 text-black border-2 border-black rounded-lg px-4 py-2 text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5"
                    id="btn-pin-atras"
                  >
                    ATRÁS
                  </button>
                  <button
                    type="submit"
                    className="bg-lime-300 hover:bg-lime-400 text-black border-2 border-black rounded-lg px-4 py-2 text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5"
                    id="btn-pin-confirmar"
                  >
                    INGRESAR
                  </button>
                </div>
              </form>
            ) : (
              /* Select Employee List */
              <div id="select-employee-list">
                <div className="bg-purple-300 border-b-4 border-black p-4 text-black">
                  <h3 className="text-base font-black uppercase tracking-wider font-retro-heavy">👥 INGRESO DE COLABORADORES</h3>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-black/80 mt-1">
                    Seleccione su perfil de colaborador para operar el sistema
                  </p>
                </div>
                <div className="p-4 space-y-2 max-h-[350px] overflow-y-auto bg-yellow-50 scrollbar-none">
                  {employees
                    .filter((e) => e.status === 'active')
                    .map((emp) => {
                      const isCurrent = activeEmployee?.id === emp.id;
                      return (
                        <button
                          key={emp.id}
                          onClick={() => handleSelectEmployeeRequest(emp)}
                          className={`w-full flex items-center justify-between p-3.5 border-3 border-black rounded-xl text-left transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-2px] hover:translate-y-[-2px] active:translate-x-[1px] active:translate-y-[1px] cursor-pointer ${
                            isCurrent
                              ? 'bg-purple-200 text-black border-purple-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                              : 'bg-white text-black hover:bg-zinc-50'
                          }`}
                          id={`select-emp-btn-${emp.id}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-pink-200 border-2 border-black flex items-center justify-center font-black">
                              {emp.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-xs font-black uppercase tracking-wide">{emp.name}</p>
                              <span className="inline-block text-[9px] font-retro-mono bg-black text-lime-400 px-1.5 py-0.2 rounded mt-1 font-bold uppercase tracking-wider">
                                {emp.role}
                              </span>
                            </div>
                          </div>
                          {isCurrent && (
                            <span className="text-[9px] font-extrabold bg-emerald-300 text-black px-2 py-1 rounded border border-black uppercase tracking-wider">
                              Sesión Activa
                            </span>
                          )}
                        </button>
                      );
                    })}
                </div>
                <div className="bg-yellow-100 border-t-3 border-black p-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowEmployeeModal(false)}
                    className="bg-white hover:bg-zinc-100 text-black border-2 border-black rounded-lg px-4 py-2 text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5"
                    id="btn-switch-cerrar"
                  >
                    CERRAR
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
