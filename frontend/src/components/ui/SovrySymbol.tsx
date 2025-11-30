"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

interface SovrySymbolProps {
  className?: string;
  size?: number;
  useImage?: boolean;
}

export function SovrySymbol({ 
  className, 
  size = 40, 
  useImage = true 
}: SovrySymbolProps) {
  if (useImage) {
    return (
      <div 
        className={cn("relative flex-shrink-0", className)}
        style={{ width: size, height: size }}
      >
        <Image
          src="/Sovry_Logo.png"
          alt="Sovry Symbol"
          width={size}
          height={size}
          className="object-contain"
          priority
          unoptimized={false}
        />
      </div>
    );
  }

  // SVG fallback
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("text-foreground", className)}
    >
      {/* Main Eye/Oval Shape - Upper Arc (pixelated segments) */}
      <g opacity="0.95">
        {/* Upper arc - left side */}
        <rect x="8" y="48" width="3" height="2" fill="currentColor" />
        <rect x="12" y="46" width="2" height="2" fill="currentColor" />
        <rect x="15" y="44" width="3" height="2" fill="currentColor" />
        <rect x="19" y="42" width="4" height="3" fill="currentColor" />
        <rect x="24" y="40" width="5" height="3" fill="currentColor" />
        <rect x="30" y="38" width="6" height="4" fill="currentColor" />
        <rect x="37" y="36" width="7" height="4" fill="currentColor" />
        <rect x="45" y="35" width="8" height="5" fill="currentColor" />
        <rect x="54" y="34" width="9" height="5" fill="currentColor" />
        
        {/* Upper arc - center (thickest) */}
        <rect x="64" y="33" width="10" height="6" fill="currentColor" />
        <rect x="75" y="34" width="9" height="5" fill="currentColor" />
        
        {/* Upper arc - right side */}
        <rect x="85" y="35" width="8" height="5" fill="currentColor" />
        <rect x="94" y="36" width="7" height="4" fill="currentColor" />
        <rect x="102" y="38" width="6" height="4" fill="currentColor" />
        <rect x="109" y="40" width="5" height="3" fill="currentColor" />
        <rect x="115" y="42" width="4" height="3" fill="currentColor" />
        <rect x="120" y="44" width="3" height="2" fill="currentColor" />
        <rect x="124" y="46" width="2" height="2" fill="currentColor" />
        <rect x="127" y="48" width="3" height="2" fill="currentColor" />
        
        {/* Lower arc - left side */}
        <rect x="8" y="70" width="3" height="2" fill="currentColor" />
        <rect x="12" y="72" width="2" height="2" fill="currentColor" />
        <rect x="15" y="74" width="3" height="2" fill="currentColor" />
        <rect x="19" y="76" width="4" height="3" fill="currentColor" />
        <rect x="24" y="78" width="5" height="3" fill="currentColor" />
        <rect x="30" y="80" width="6" height="4" fill="currentColor" />
        <rect x="37" y="82" width="7" height="4" fill="currentColor" />
        <rect x="45" y="83" width="8" height="5" fill="currentColor" />
        <rect x="54" y="84" width="9" height="5" fill="currentColor" />
        
        {/* Lower arc - center (thickest) */}
        <rect x="64" y="85" width="10" height="6" fill="currentColor" />
        <rect x="75" y="84" width="9" height="5" fill="currentColor" />
        
        {/* Lower arc - right side */}
        <rect x="85" y="83" width="8" height="5" fill="currentColor" />
        <rect x="94" y="82" width="7" height="4" fill="currentColor" />
        <rect x="102" y="80" width="6" height="4" fill="currentColor" />
        <rect x="109" y="78" width="5" height="3" fill="currentColor" />
        <rect x="115" y="76" width="4" height="3" fill="currentColor" />
        <rect x="120" y="74" width="3" height="2" fill="currentColor" />
        <rect x="124" y="72" width="2" height="2" fill="currentColor" />
        <rect x="127" y="70" width="3" height="2" fill="currentColor" />
      </g>
      
      {/* Four-pointed star in bottom right */}
      <g opacity="0.5" className="text-muted-foreground">
        <path
          d="M100 100 L102 105 L107 105 L103 108 L105 113 L100 110 L95 113 L97 108 L93 105 L98 105 Z"
          fill="currentColor"
        />
      </g>
    </svg>
  );
}

