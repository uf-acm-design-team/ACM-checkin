import Image from "next/image";
import crestImage from "./AED Crest.png";

export function Header() {
  return (
    <header className="bg-[var(--brand-primary)]/20 backdrop-blur-sm px-6 pt-10 pb-6 flex flex-col items-center justify-center rounded-b-3xl shadow-sm">
      <div className="relative h-24 w-24 flex items-center justify-center">
        <Image
          src={crestImage}
          alt="AED crest"
          width={96}
          height={96}
          className="object-contain drop-shadow-md"
          priority
        />
      </div>
    </header>
  );
}
