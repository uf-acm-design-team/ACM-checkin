import { Loader2 } from "lucide-react";
import { useEffect } from "react";

export function VerifyingPhase({ onNext, onMismatch }: { onNext: () => void, onMismatch: () => void }) {
  // Simulate network request for location verification
  useEffect(() => {
    const timer = setTimeout(() => {
      // Simulate success mapping vs mismatch (50/50 for demo)
      // TODO: Implement actual GPS check logic
      const isSuccess = Math.random() > 0.5;
      if (isSuccess) onNext();
      else onMismatch();
    }, 2000);
    return () => clearTimeout(timer);
  }, [onNext, onMismatch]);

  return (
    <div className="flex flex-col flex-1 py-20 px-8 items-center justify-center text-center">
      <div className="relative">
        <div className="absolute inset-0 bg-brand-action/20 rounded-full blur-xl animate-pulse"></div>
        <Loader2 className="w-16 h-16 text-brand-action animate-spin relative z-10" />
      </div>
      <h2 className="text-2xl font-semibold mt-8 mb-2 z-10">Verifying Location...</h2>
      <p className="text-white/70 z-10">Please make sure you have allowed location permissions.</p>
    </div>
  );
}
