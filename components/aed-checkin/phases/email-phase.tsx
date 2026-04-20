import { BrandButton } from "../brand-button";
import { Input } from "@/components/ui/input";
import { useState } from "react";

export function EmailPhase({ onNext }: { onNext: (email: string) => void }) {
  const [email, setEmail] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) onNext(email);
  };

  return (
    <div className="flex flex-col flex-1 py-10 px-8">
      <h2 className="text-2xl font-semibold mb-2">Welcome</h2>
      <p className="text-white/70 mb-8">Please enter your UF email to begin.</p>
      
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="text-sm font-medium text-white/80">Email Address</label>
        <Input 
          type="email" 
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your.name@ufl.edu"
          className="bg-white/10 border-white/20 text-white placeholder:text-white/50 h-12"
          required
        />
        {/* TODO: Check if user exists logic */}
        <BrandButton type="submit" className="mt-8">Continue</BrandButton>
      </form>
    </div>
  );
}
