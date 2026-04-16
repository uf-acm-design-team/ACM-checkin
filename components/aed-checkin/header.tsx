import Image from "next/image";

export function Header() {
  return (
    <header className="bg-brand-primary px-5 py-4">
      <div className="flex items-center gap-3">
        <div className="relative h-12 w-12 overflow-hidden rounded-full border border-white/25 bg-white/10">
          <Image
            src="/aed-crest-placeholder.svg"
            alt="AED crest"
            fill
            sizes="48px"
            className="object-cover"
            priority
          />
        </div>

        <p className="text-xl font-semibold tracking-[0.01em] text-white">
          AED Check In
        </p>
      </div>
    </header>
  );
}
