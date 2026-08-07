/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Search } from 'lucide-react';

interface Option {
  value: string;
  label: string;
}

interface RetroSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  dense?: boolean;
}

export default function RetroSelect({
  options,
  value,
  onChange,
  placeholder = 'Seleccionar...',
  className = '',
  dense = false,
}: RetroSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  const filteredOptions = useMemo(() => {
    if (!searchQuery) return options;
    return options.filter(opt => opt.label.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [options, searchQuery]);

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
    } else if (options.length > 4) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen, options.length]);

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

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full font-black text-black flex items-center justify-between cursor-pointer focus:outline-none transition-all duration-100 uppercase text-left ${
          dense
            ? 'border-2 border-black bg-white rounded p-1.5 text-[11px] tracking-normal'
            : 'border-3 border-black bg-pink-50 hover:bg-pink-100 rounded-lg p-2.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 text-xs tracking-wide'
        }`}
      >
        <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
        <ChevronDown className={`ml-2 transition-transform duration-200 flex-shrink-0 ${
          dense ? 'w-3 h-3 stroke-[3]' : 'w-4 h-4 stroke-[3.5]'
        } ${isOpen ? 'transform rotate-180' : ''}`} />
      </button>

      {/* Options Dropdown */}
      {isOpen && (
        <div className={`absolute left-0 min-w-full w-max max-w-[320px] mt-1.5 bg-white border-2 border-black rounded shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] z-50 max-h-64 overflow-y-auto divide-y divide-dashed divide-black/15 animate-fade-in scrollbar-thin flex flex-col ${
          dense ? 'border-2 rounded' : 'border-3 rounded-lg'
        }`}>
          {options.length > 4 && (
            <div className="sticky top-0 bg-white p-2 border-b-2 border-black z-10 flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-zinc-400 stroke-[3]" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Buscar..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="w-full text-xs font-bold text-black focus:outline-none bg-transparent"
              />
            </div>
          )}
          
          <div className="flex-1 overflow-y-auto divide-y divide-dashed divide-black/15">
            {filteredOptions.length === 0 ? (
              <div className="p-3 text-center font-bold text-zinc-500 uppercase text-[10px]">
                No hay opciones
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSelect(opt.value)}
                    className={`w-full text-left font-black uppercase transition-colors cursor-pointer whitespace-nowrap ${
                      dense ? 'px-2 py-1.5 text-[10px]' : 'px-3.5 py-2.5 text-xs'
                    } ${
                      isSelected
                        ? 'bg-lime-300 text-black font-extrabold'
                        : 'bg-white hover:bg-yellow-200 text-black'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
