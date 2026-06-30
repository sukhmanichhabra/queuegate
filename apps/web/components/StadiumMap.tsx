"use client";

import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

export interface TicketCategory {
  id: string;
  name: string;
  description?: string;
  price: number;
  capacity: number;
  availableCapacity: number;
  soldOut: boolean;
  color: string;
}

interface StadiumMapProps {
  categories: TicketCategory[];
  selectedCategoryId: string | null;
  onSelectCategory: (id: string) => void;
}

/**
 * Utility to generate an SVG path for a sector (an annular ring segment).
 * Angles are in degrees, where 0 is straight right (3 o'clock).
 */
function describeArc(x: number, y: number, r: number, startAngle: number, endAngle: number) {
  const polarToCartesian = (cx: number, cy: number, r: number, angleInDegrees: number) => {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
    return {
      x: cx + r * Math.cos(angleInRadians),
      y: cy + r * Math.sin(angleInRadians),
    };
  };

  const start = polarToCartesian(x, y, r, endAngle);
  const end = polarToCartesian(x, y, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

  return `A ${r} ${r} 0 ${largeArcFlag} 0 ${start.x} ${start.y}`;
}

function createSectorPath(
  cx: number, cy: number,
  innerRadius: number, outerRadius: number,
  startAngle: number, endAngle: number
) {
  const p1 = (a: number, r: number) => {
    const rad = ((a - 90) * Math.PI) / 180.0;
    return `${cx + r * Math.cos(rad)} ${cy + r * Math.sin(rad)}`;
  };

  return [
    `M ${p1(startAngle, outerRadius)}`,
    describeArc(cx, cy, outerRadius, startAngle, endAngle),
    `L ${p1(endAngle, innerRadius)}`,
    describeArc(cx, cy, innerRadius, endAngle, startAngle).replace(' 0 0 ', ' 0 1 '), // sweep-flag 1 for inner arc backwards
    'Z'
  ].join(" ");
}

/**
 * Pre-defined stadium geometry based on standard concert layouts.
 * We'll map the provided categories to these predefined shapes.
 */
const STADIUM_SHAPES = [
  // Floor (Platea) - A large rectangle at the bottom
  { type: 'rect', x: 250, y: 320, w: 300, h: 220, rx: 8, labelX: 400, labelY: 430 },
  
  // Tier 1 - Inner ring segments
  { type: 'arc', rIn: 160, rOut: 240, start: -45, end: 45, labelX: 400, labelY: 210 }, // Center Pit
  { type: 'arc', rIn: 160, rOut: 240, start: -90, end: -48, labelX: 250, labelY: 280 }, // Left Pit
  { type: 'arc', rIn: 160, rOut: 240, start: 48, end: 90, labelX: 550, labelY: 280 }, // Right Pit
  
  // Tier 2 - Middle ring segments
  { type: 'arc', rIn: 245, rOut: 325, start: -30, end: 30, labelX: 400, labelY: 130 }, // Lower Center
  { type: 'arc', rIn: 245, rOut: 325, start: -80, end: -33, labelX: 220, labelY: 190 }, // Lower Left
  { type: 'arc', rIn: 245, rOut: 325, start: 33, end: 80, labelX: 580, labelY: 190 }, // Lower Right
  
  // Tier 3 - Outer ring segments
  { type: 'arc', rIn: 330, rOut: 400, start: -25, end: 25, labelX: 400, labelY: 65 }, // Upper Center
  { type: 'arc', rIn: 330, rOut: 400, start: -75, end: -28, labelX: 180, labelY: 120 }, // Upper Left
  { type: 'arc', rIn: 330, rOut: 400, start: 28, end: 75, labelX: 620, labelY: 120 }, // Upper Right
];

export function StadiumMap({ categories, selectedCategoryId, onSelectCategory }: StadiumMapProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Map the dynamic categories to the predefined static geometry shapes.
  // We use modulo if there are more categories than shapes.
  const mappedSectors = useMemo(() => {
    return categories.map((cat, index) => {
      const shapeDef = STADIUM_SHAPES[index % STADIUM_SHAPES.length];
      
      let path = "";
      if (shapeDef.type === 'rect') {
        // Render rect natively
      } else if (shapeDef.type === 'arc') {
        path = createSectorPath(400, 480, shapeDef.rIn!, shapeDef.rOut!, shapeDef.start!, shapeDef.end!);
      }

      return {
        ...cat,
        shapeDef,
        path,
        state: cat.soldOut ? 'unavailable' : (cat.id === selectedCategoryId ? 'selected' : 'available')
      };
    });
  }, [categories, selectedCategoryId]);

  const hoveredSector = mappedSectors.find(s => s.id === hoveredId);

  return (
    <div 
      className="relative w-full h-full min-h-[500px] flex items-center justify-center bg-[#0d1216] rounded-xl overflow-hidden"
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }}
      onMouseLeave={() => setHoveredId(null)}
    >
      {/* Background Stage Elements */}
      <svg viewBox="0 0 800 600" className="w-full h-full absolute inset-0 pointer-events-none opacity-40">
        <path d="M 300,560 Q 400,540 500,560 L 480,590 L 320,590 Z" fill="#2d3748" />
        <text x="400" y="580" fill="#9ca3af" fontSize="14" fontFamily="monospace" textAnchor="middle" letterSpacing="4">STAGE</text>
        
        {/* Subtle decorative stadium rings */}
        <path d={createSectorPath(400, 480, 410, 412, -90, 90)} fill="rgba(255,255,255,0.02)" />
        <path d={createSectorPath(400, 480, 420, 422, -85, 85)} fill="rgba(255,255,255,0.01)" />
      </svg>

      {/* Interactive Sectors */}
      <svg viewBox="0 0 800 600" className="w-full h-full z-10">
        {mappedSectors.map((sector) => {
          const { shapeDef, path, state, color } = sector;
          
          let fillColor = 'rgba(255,255,255,0.03)';
          let strokeColor = 'rgba(255,255,255,0.1)';
          let cursor = 'pointer';

          if (state === 'unavailable') {
            fillColor = 'rgba(255,255,255,0.02)';
            strokeColor = 'rgba(255,255,255,0.05)';
            cursor = 'not-allowed';
          } else if (state === 'selected') {
            fillColor = `${color}40`; // 25% opacity
            strokeColor = color;
          } else if (hoveredId === sector.id) {
            fillColor = `${color}20`; // 12% opacity
            strokeColor = `${color}80`;
          } else {
            // Available
            fillColor = `${color}10`;
            strokeColor = `${color}40`;
          }

          const commonProps = {
            fill: fillColor,
            stroke: strokeColor,
            strokeWidth: state === 'selected' ? 2 : 1,
            style: { cursor, transition: 'all 0.3s ease' },
            onMouseEnter: () => !sector.soldOut && setHoveredId(sector.id),
            onClick: () => !sector.soldOut && onSelectCategory(sector.id)
          };

          return (
            <g key={sector.id}>
              {shapeDef.type === 'rect' ? (
                <rect 
                  x={shapeDef.x} y={shapeDef.y} 
                  width={shapeDef.w} height={shapeDef.h} 
                  rx={shapeDef.rx} 
                  {...commonProps} 
                />
              ) : (
                <path d={path} {...commonProps} />
              )}
              
              {/* Sector Name Label */}
              <text 
                x={shapeDef.labelX} y={shapeDef.labelY} 
                fill={state === 'unavailable' ? '#4b5563' : (state === 'selected' ? '#ffffff' : '#9ca3af')}
                fontSize="11" 
                fontFamily="sans-serif" 
                textAnchor="middle" 
                pointerEvents="none"
              >
                {sector.name}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="absolute top-6 left-6 bg-[#161a1d] border border-white/[0.07] rounded-lg p-5 shadow-2xl z-20">
        <h3 className="font-mono text-[10px] text-white uppercase tracking-widest mb-4 font-bold">Sector Select</h3>
        <ul className="space-y-3">
          <li className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-[#00b87c] shadow-[0_0_8px_rgba(0,184,124,0.6)]" />
            <span className="font-sans text-xs text-[#9ca3af]">Selected</span>
          </li>
          <li className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-[#facc15]" />
            <span className="font-sans text-xs text-[#9ca3af]">Available</span>
          </li>
          <li className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-[#4b5563]" />
            <span className="font-sans text-xs text-[#9ca3af]">Unavailable</span>
          </li>
        </ul>
      </div>

      {/* Floating Tooltip */}
      <AnimatePresence>
        {hoveredSector && !hoveredSector.soldOut && hoveredId !== selectedCategoryId && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            transition={{ duration: 0.15 }}
            className="absolute pointer-events-none z-50 rounded-lg shadow-2xl border overflow-hidden"
            style={{ 
              left: mousePos.x + 20, 
              top: mousePos.y + 20,
              backgroundColor: '#1b2023',
              borderColor: `${hoveredSector.color}40`,
            }}
          >
            <div className="px-4 py-3 border-b" style={{ borderColor: `${hoveredSector.color}20` }}>
              <p className="font-sans text-sm font-bold text-white mb-0.5">{hoveredSector.name}</p>
              {hoveredSector.description && (
                <p className="font-sans text-[11px] text-[#9ca3af] max-w-[200px] truncate">{hoveredSector.description}</p>
              )}
            </div>
            <div className="px-4 py-3 flex items-center justify-between gap-6" style={{ backgroundColor: hoveredSector.color }}>
              <p className="font-sans text-xs font-bold text-black uppercase tracking-wider">
                {hoveredSector.name}
              </p>
              <p className="font-sans text-lg font-bold text-black">
                ${hoveredSector.price.toLocaleString()}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
