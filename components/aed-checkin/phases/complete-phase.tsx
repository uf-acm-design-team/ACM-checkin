import { BrandButton } from "../brand-button";
import { Calendar, Clock, MapPin } from "lucide-react";

export function CompletePhase({ details }: { details: any }) {
  return (
    <div className="flex flex-col flex-1 py-10 px-8 items-center text-center">
      <h2 className="text-3xl font-bold mb-2">You're All Set!</h2>
      <p className="text-white/70 mb-10">You've successfully checked in.</p>
      
      <div className="w-full bg-white/10 border border-white/20 rounded-3xl p-8 mb-auto text-left shadow-xl relative overflow-hidden">
        {/* Decorative corner accent */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-brand-primary/40 rounded-full blur-3xl -mr-10 -mt-10"></div>
        
        <h3 className="text-xl font-bold text-white mb-6 relative z-10">Mentorship Meeting</h3>
        
        <div className="flex flex-col gap-5 relative z-10">
          <div className="flex items-center gap-4 text-white/80">
            <div className="bg-brand-background p-2 rounded-lg">
              <Calendar className="w-5 h-5 text-brand-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Thursday</p>
              <p className="text-xs">April 16, 2026</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4 text-white/80">
            <div className="bg-brand-background p-2 rounded-lg">
              <Clock className="w-5 h-5 text-brand-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">6:00 PM</p>
              <p className="text-xs">EST</p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-white/80">
            <div className="bg-brand-background p-2 rounded-lg">
              <MapPin className="w-5 h-5 text-brand-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Reitz Union</p>
              <p className="text-xs">Room 3302</p>
            </div>
          </div>
        </div>
      </div>

      <BrandButton 
        onClick={() => { window.location.href = '/' }}
        className="mt-8 bg-white text-brand-background hover:bg-white/90 shadow-white/20"
      >
        Done
      </BrandButton>
    </div>
  );
}
