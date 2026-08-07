/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';

interface RetroDatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  label: string;
}

export default function RetroDatePicker({ value, onChange, label }: RetroDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse current value or default to today
  const parsedDate = value ? new Date(value + 'T12:00:00') : new Date();
  
  // Local state for calendar view (Month & Year)
  const [viewYear, setViewYear] = useState(parsedDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsedDate.getMonth()); // 0-indexed

  // Update view when value changes from outside
  useEffect(() => {
    if (value) {
      const d = new Date(value + 'T12:00:00');
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
  }, [value]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const MONTHS_ES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  const DAYS_ES = ['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO'];

  // Helper to get number of days in month
  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  // Helper to get the start day of the month (Monday is 0, Sunday is 6)
  const getStartDayOfMonth = (year: number, month: number) => {
    let day = new Date(year, month, 1).getDay(); // 0 is Sunday, 1 is Monday...
    return day === 0 ? 6 : day - 1; // convert to: 0 is Monday... 6 is Sunday
  };

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const selectDate = (day: number) => {
    const formattedMonth = String(viewMonth + 1).padStart(2, '0');
    const formattedDay = String(day).padStart(2, '0');
    const newValue = `${viewYear}-${formattedMonth}-${formattedDay}`;
    onChange(newValue);
    setIsOpen(false);
  };

  const setToday = () => {
    const today = new Date();
    const formattedMonth = String(today.getMonth() + 1).padStart(2, '0');
    const formattedDay = String(today.getDate()).padStart(2, '0');
    const newValue = `${today.getFullYear()}-${formattedMonth}-${formattedDay}`;
    onChange(newValue);
    setIsOpen(false);
  };

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const startDay = getStartDayOfMonth(viewYear, viewMonth);

  // Generate blank offset cells
  const blanks = Array(startDay).fill(null);
  
  // Generate days array
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // Format display text
  const displayValue = value ? (() => {
    const d = new Date(value + 'T12:00:00');
    const dayStr = String(d.getDate()).padStart(2, '0');
    const monthStr = String(d.getMonth() + 1).padStart(2, '0');
    return `${dayStr}/${monthStr}/${d.getFullYear()}`;
  })() : 'SELECCIONAR';

  return (
    <div ref={containerRef} className="relative inline-block text-black">
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-black uppercase text-black tracking-wider">{label}:</span>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 bg-white hover:bg-zinc-50 border-3 border-black rounded-lg px-3 py-1.5 text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 active:shadow-none min-w-[130px] justify-between"
        >
          <span className="font-retro-mono">{displayValue}</span>
          <Calendar className="w-4 h-4 text-black flex-shrink-0" />
        </button>
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 bg-white border-4 border-black rounded-xl p-4 w-[280px] shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] z-[90] font-sans animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between bg-amber-200 border-3 border-black p-2 rounded-lg mb-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="bg-white hover:bg-zinc-100 border-2 border-black p-1 rounded cursor-pointer shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 active:shadow-none"
            >
              <ChevronLeft className="w-4 h-4 stroke-[2.5]" />
            </button>

            <span className="font-black text-xs uppercase tracking-wide font-retro-heavy text-black">
              {MONTHS_ES[viewMonth]} {viewYear}
            </span>

            <button
              type="button"
              onClick={handleNextMonth}
              className="bg-white hover:bg-zinc-100 border-2 border-black p-1 rounded cursor-pointer shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 active:shadow-none"
            >
              <ChevronRight className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>

          {/* Days of Week */}
          <div className="grid grid-cols-7 gap-1 text-center mb-1">
            {DAYS_ES.map((day) => (
              <span key={day} className="text-[10px] font-black text-zinc-500 font-retro-mono">
                {day}
              </span>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1">
            {blanks.map((_, index) => (
              <div key={`blank-${index}`} className="w-8 h-8" />
            ))}
            {days.map((day) => {
              const formattedMonth = String(viewMonth + 1).padStart(2, '0');
              const formattedDay = String(day).padStart(2, '0');
              const dayString = `${viewYear}-${formattedMonth}-${formattedDay}`;
              const isSelected = value === dayString;
              
              const todayObj = new Date();
              const isToday = todayObj.getFullYear() === viewYear && 
                              todayObj.getMonth() === viewMonth && 
                              todayObj.getDate() === day;

              return (
                <button
                  key={`day-${day}`}
                  type="button"
                  onClick={() => selectDate(day)}
                  className={`w-8 h-8 flex items-center justify-center text-xs font-black uppercase rounded transition-all cursor-pointer border-2 ${
                    isSelected
                      ? 'bg-fuchsia-400 text-black border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] translate-x-[-1px] translate-y-[-1px]'
                      : isToday
                      ? 'bg-lime-200 border-black hover:bg-fuchsia-100 text-black shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]'
                      : 'bg-white border-transparent hover:bg-zinc-100 hover:border-black text-black'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Quick buttons */}
          <div className="flex gap-2 mt-3 pt-3 border-t-2 border-dashed border-zinc-200">
            <button
              type="button"
              onClick={setToday}
              className="flex-1 bg-lime-300 hover:bg-lime-400 text-black border-2 border-black rounded px-2 py-1.5 text-[10px] font-black uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 active:shadow-none cursor-pointer text-center"
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="flex-1 bg-zinc-200 hover:bg-zinc-300 text-black border-2 border-black rounded px-2 py-1.5 text-[10px] font-black uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 active:shadow-none cursor-pointer text-center"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
