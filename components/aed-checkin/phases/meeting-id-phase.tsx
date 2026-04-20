import { BrandButton } from "../brand-button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { ScanLine } from "lucide-react";

export function MeetingIdPhase({ onNext }: { onNext: (id: string) => void }) {
  const [meetingId, setMeetingId] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (meetingId) onNext(meetingId);
  };

  return (
    <div className="flex flex-col flex-1 py-10 px-8">
      <h2 className="text-2xl font-semibold mb-2">Join Meeting</h2>
      <p className="text-white/70 mb-8">Enter the meeting code or scan the QR.</p>
      
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 bg-white/5 p-6 rounded-2xl border border-white/10">
        <label className="text-sm font-medium text-white/80 text-center">Meeting ID</label>
        <Input 
          value={meetingId}
          onChange={(e) => setMeetingId(e.target.value.toUpperCase())}
          placeholder="e.g. AED-123"
          className="bg-white/10 border-white/20 text-white placeholder:text-white/50 h-14 text-center text-xl font-mono tracking-widest uppercase"
          required
        />
        {/* TODO: Validate meeting ID logic */}
        <BrandButton type="submit" className="mt-4">Join</BrandButton>
      </form>

      <div className="flex items-center my-8 text-white/40">
        <div className="flex-1 border-t border-white/20"></div>
        <span className="px-4 text-sm font-medium">OR</span>
        <div className="flex-1 border-t border-white/20"></div>
      </div>

      <button className="flex items-center justify-center gap-3 bg-white/10 hover:bg-white/20 active:bg-white/30 text-white py-4 rounded-xl border border-white/20 transition-all font-semibold">
        <ScanLine className="w-5 h-5" />
        Scan QR Code
      </button>
    </div>
  );
}
