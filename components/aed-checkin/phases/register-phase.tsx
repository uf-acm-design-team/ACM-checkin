import { BrandButton } from "../brand-button";
import { Input } from "@/components/ui/input";
import { useState } from "react";

export function RegisterPhase({ onNext }: { onNext: (data: any) => void }) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNext({ name, password });
  };

  return (
    <div className="flex flex-col flex-1 py-10 px-8">
      <h2 className="text-2xl font-semibold mb-2">Create Account</h2>
      <p className="text-white/70 mb-8">It looks like you're new. Let's get you set up.</p>
      
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="text-sm font-medium text-white/80">Full Name</label>
        <Input 
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Albert Gator"
          className="bg-white/10 border-white/20 text-white placeholder:text-white/50 h-12"
          required
        />

        <label className="text-sm font-medium text-white/80 mt-2">Password</label>
        <Input 
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          className="bg-white/10 border-white/20 text-white placeholder:text-white/50 h-12"
          required
        />
        
        {/* TODO: Supabase auth signup here */}
        <BrandButton type="submit" className="mt-8">Create Account</BrandButton>
      </form>
    </div>
  );
}
