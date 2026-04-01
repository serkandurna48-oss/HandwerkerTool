import Navbar from "@/components/Navbar";
import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <Navbar />

      <main className="mx-auto max-w-6xl px-6 py-16">
        <h1 className="text-4xl font-bold">
          Angebote in 2 Minuten erstellen
        </h1>

        <p className="mt-4 text-lg text-gray-600 max-w-xl">
          Für Handwerksbetriebe, die weniger Zeit mit Papierkram
          und mehr Zeit auf der Baustelle verbringen wollen.
        </p>

        <div className="mt-8 flex gap-4">
          <Link
            href="/offers/new"
            className="rounded-lg bg-black px-6 py-3 text-white"
          >
            Angebot erstellen
          </Link>

          <Link
            href="/customers"
            className="rounded-lg border px-6 py-3"
          >
            Kunden verwalten
          </Link>
        </div>
      </main>
    </div>
  );
}