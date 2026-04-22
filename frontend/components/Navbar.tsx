import Link from "next/link";

export default function Navbar() {
  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">

        <Link href="/" className="text-[15px] font-semibold tracking-tight text-gray-950">
          AngebotsPilot
        </Link>

        <div className="flex items-center gap-1">
          <Link
            href="/customers"
            className="rounded-lg px-3 py-2 text-sm text-gray-600 transition hover:bg-gray-100 hover:text-gray-900"
          >
            Kunden
          </Link>
          <Link
            href="/offers/new"
            className="rounded-lg px-3 py-2 text-sm text-gray-600 transition hover:bg-gray-100 hover:text-gray-900"
          >
            Neues Angebot
          </Link>
          <Link
            href="/offers/new"
            className="ml-2 rounded-lg bg-gray-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-black"
          >
            + Angebot
          </Link>
        </div>
      </div>
    </nav>
  );
}
