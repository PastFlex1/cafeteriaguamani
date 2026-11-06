/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  const filteredOptions = useMemo(() => {
    if (!searchQuery) return options;
    return options.filter((opt) => opt.label.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [options, searchQuery]);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    const estimatedDropdownHeight = Math.min(
      280,
      Math.max(120, (options.length > 4 ? 48 : 8) + options.length * 36)
    );
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;

    // Decide whether to place above or below
    const placeAbove = spaceBelow < estimatedDropdownHeight && spaceAbove > spaceBelow;

    // Calculate width: at least button width, minimum 220px, maximum 380px or screen width
    const calculatedWidth = Math.min(
      Math.max(rect.width, 220),
      Math.min(380, viewportWidth - 20)
    );

    // Calculate left position, ensuring it stays fully within the screen viewport
    let left = rect.left;
    if (left + calculatedWidth > viewportWidth - 10) {
      left = Math.max(10, viewportWidth - calculatedWidth - 10);
    }
    if (left < 10) left = 10;

    const newStyle: React.CSSProperties = {
      position: 'fixed',
      left: `${left}px`,
      width: `${calculatedWidth}px`,
      zIndex: 99999,
    };

    if (placeAbove) {
      newStyle.bottom = `${viewportHeight - rect.top + 4}px`;
      newStyle.maxHeight = `${Math.min(300, spaceAbove - 16)}px`;
    } else {
      newStyle.top = `${rect.bottom + 4}px`;
      newStyle.maxHeight = `${Math.min(300, spaceBelow - 16)}px`;
    }

    setDropdownStyle(newStyle);
  }, [options.length]);

  // Handle position tracking when open
  useEffect(() => {
    if (!isOpen) return;

    updatePosition();

    const handleScrollOrResize = () => {
      updatePosition();
    };

    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);

    return () => {
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [isOpen, updatePosition]);

  // Focus search input when open
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
    } else if (options.length > 4) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 40);
      return () => clearTimeout(timer);
    }
  }, [isOpen, options.length]);

  // Click outside and Escape key handling
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
  };

  return (
    <div className={`relative w-full ${className}`}>
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full font-black text-black flex items-center justify-between cursor-pointer focus:outline-none transition-all duration-100 uppercase text-left ${
          dense
            ? 'border-2 border-black bg-white rounded p-1.5 text-[11px] tracking-normal shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]'
            : 'border-3 border-black bg-pink-50 hover:bg-pink-100 rounded-lg p-2.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 text-xs tracking-wide'
        }`}
      >
        <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
        <ChevronDown
          className={`ml-1.5 transition-transform duration-200 flex-shrink-0 ${
            dense ? 'w-3 h-3 stroke-[3]' : 'w-4 h-4 stroke-[3.5]'
          } ${isOpen ? 'transform rotate-180' : ''}`}
        />
      </button>

      {/* Options Dropdown via Portal */}
      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={dropdownRef}
            style={dropdownStyle}
            className={`bg-white border-2 border-black rounded shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col animate-fade-in ${
              dense ? 'border-2 rounded' : 'border-3 rounded-lg'
            }`}
          >
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

            <div className="overflow-y-auto divide-y divide-dashed divide-black/15 scrollbar-thin">
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
                      className={`w-full text-left font-black uppercase transition-colors cursor-pointer truncate block ${
                        dense ? 'px-2.5 py-1.5 text-[11px]' : 'px-3.5 py-2.5 text-xs'
                      } ${
                        isSelected
                          ? 'bg-lime-300 text-black font-extrabold'
                          : 'bg-white hover:bg-yellow-200 text-black'
                      }`}
                      title={opt.label}
                    >
                      {opt.label}
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
