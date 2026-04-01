import Link from "next/link";

export default function Navbar() {
  return (
    <nav className="border-b bg-white shadow-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        
        <Link href="/" className="text-xl font-bold">
          AngebotsPilot
        </Link>

        <div className="flex items-center gap-6 text-sm">
          <Link href="/customers" className="hover:text-black text-gray-600">
            Kunden
          </Link>

          <Link href="/offers/new" className="hover:text-black text-gray-600">
            Neues Angebot
          </Link>

          <button className="rounded-lg bg-black px-4 py-2 text-white">
            Upgrade
          </button>
        </div>
      </div>
    </nav>
  );
}