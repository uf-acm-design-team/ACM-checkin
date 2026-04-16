import { BrandButton } from "../brand-button";
import { Check } from "lucide-react";

export function VerifiedPhase({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col flex-1 py-10 px-8 items-center justify-center">
      <div className="w-full bg-[rgba(34,197,94,0.15)] border border-[rgba(34,197,94,0.3)] rounded-2xl p-8 text-center shadow-lg backdrop-blur-sm">
        <div className="mx-auto w-16 h-16 rounded-full bg-[rgba(34,197,94,0.2)] flex items-center justify-center mb-6">
          <Check className="w-8 h-8 text-[#22c55e]" strokeWidth={3} />
        </div>
        
        <h3 className="text-2xl font-bold text-[#86efac] mb-2">Verified</h3>
        <p className="text-white/80 mb-8">
          Your location matches the meeting area.
        </p>

        <BrandButton onClick={onNext} className="h-12 text-lg">
          Continue to Questions
        </BrandButton>
      </div>
    </div>
  );
}
