import Navbar from "@/components/Navbar";
import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-neutral-50">
      <Navbar />

      <main className="mx-auto max-w-5xl px-6 py-20">
        <div className="max-w-xl">
          <span className="inline-block rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-500 shadow-sm">
            Beta
          </span>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-gray-950">
            Angebote in 2 Minuten erstellen
          </h1>
          <p className="mt-4 text-lg text-gray-500 leading-relaxed">
            Für Handwerksbetriebe, die weniger Zeit mit Papierkram
            und mehr Zeit auf der Baustelle verbringen wollen.
          </p>

          <div className="mt-8 flex gap-3">
            <Link
              href="/offers/new"
              className="rounded-xl bg-gray-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-black"
            >
              Angebot erstellen
            </Link>
            <Link
              href="/customers"
              className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              Kunden verwalten
            </Link>
          </div>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { title: "KI-Strukturierung", desc: "Notizen eingeben, Positionen automatisch generieren lassen." },
            { title: "Preise pflegen", desc: "Einzelpreise manuell ergänzen, Summen werden live berechnet." },
            { title: "Angebot freigeben", desc: "Entwurf prüfen, freigeben und direkt als HTML oder PDF ausgeben." },
          ].map((item) => (
            <div key={item.title} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-gray-900">{item.title}</p>
              <p className="mt-1 text-sm text-gray-500">{item.desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
