import { BrandButton } from "../brand-button";
import { X, MapPin } from "lucide-react";

export function MismatchPhase({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col flex-1 py-10 px-8 items-center justify-center">
      <div className="w-full bg-[rgba(239,68,68,0.15)] border border-[rgba(239,68,68,0.3)] rounded-2xl p-8 text-center shadow-lg backdrop-blur-sm">
        <div className="mx-auto w-16 h-16 rounded-full bg-[rgba(239,68,68,0.2)] flex items-center justify-center mb-6">
          <X className="w-8 h-8 text-[#ef4444]" strokeWidth={3} />
        </div>
        
        <h3 className="text-2xl font-bold text-[#fca5a5] mb-2">Location Mismatch</h3>
        <p className="text-white/80 mb-6">
          You appear to be too far from the meeting location. 
        </p>

        {/* TODO: Add Map preview or distance indicator here */}
        <div className="w-full bg-black/20 rounded-xl p-4 mb-8 border border-white/10 flex items-center gap-3">
          <div className="bg-white/10 p-2 rounded-lg">
            <MapPin className="text-[#fca5a5] w-5 h-5" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-white">0.5 miles away</p>
            <p className="text-xs text-white/50">From Reitz Union</p>
          </div>
        </div>

        <BrandButton onClick={onRetry} className="h-12 text-lg bg-[#ef4444] shadow-none hover:bg-[#ef4444]/80">
          Try Again
        </BrandButton>
      </div>
    </div>
  );
}
