import { BrandButton } from "../brand-button";
import { useState } from "react";

export function QuestionnairePhase({ onNext }: { onNext: (data: any) => void }) {
  const [q1, setQ1] = useState("");
  const [q2, setQ2] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNext({ q1, q2 });
  };

  return (
    <div className="flex flex-col flex-1 py-10 px-8">
      <h2 className="text-2xl font-semibold mb-2">Almost Done</h2>
      <p className="text-white/70 mb-8">Please answer a few quick questions.</p>
      
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-white/90">Will you be eating pizza?</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-white/80">
              <input type="radio" name="pizza" value="yes" onChange={(e) => setQ1(e.target.value)} required />
              Yes
            </label>
            <label className="flex items-center gap-2 text-white/80">
              <input type="radio" name="pizza" value="no" onChange={(e) => setQ1(e.target.value)} />
              No
            </label>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-white/90">Feedback or Notes</label>
          <textarea 
            value={q2}
            onChange={(e) => setQ2(e.target.value)}
            className="bg-white/10 border border-white/20 text-white placeholder:text-white/50 rounded-xl p-4 min-h-[100px] resize-none"
            placeholder="Any allergies?"
          />
        </div>
        
        {/* TODO: Submit form responses to database */}
        <BrandButton type="submit" className="mt-4">Submit</BrandButton>
      </form>
    </div>
  );
}
