"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { api } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

type OfferTotals = {
  subtotal_net: number;
  vat_amount: number;
  total_gross: number;
};

type Offer = {
  id: string;
  offer_number: string;
  title: string;
  customer_id: string;
  customer_name?: string;
  status: "draft" | "approved";
  totals: OfferTotals;
  created_at: string;
};

function StatusBadge({ status }: { status: Offer["status"] }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        status === "approved"
          ? "bg-green-100 text-green-700"
          : "bg-amber-100 text-amber-700"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          status === "approved" ? "bg-green-500" : "bg-amber-500"
        }`}
      />
      {status === "approved" ? "Freigegeben" : "Entwurf"}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatCurrency(value: number) {
  return value.toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + " €";
}

export default function OffersPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleteError, setDeleteError] = useState("");

  function loadOffers() {
    setLoading(true);
    api
      .get("/offers")
      .then((res) => setOffers(res.data))
      .catch(() => setError("Angebote konnten nicht geladen werden."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadOffers();
  }, []);

  async function handleDelete(id: string, offerNumber: string) {
    if (!window.confirm(`Angebot ${offerNumber} wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`)) return;
    setDeleteError("");
    try {
      await api.delete(`/offers/${id}`);
      loadOffers();
    } catch {
      setDeleteError("Angebot konnte nicht gelöscht werden. Bitte erneut versuchen.");
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <Navbar />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">Übersicht</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-gray-950">
              Angebote
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              Alle gespeicherten Angebote auf einen Blick.
            </p>
          </div>
          <Link
            href="/offers/new"
            className="rounded-xl bg-gray-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-black"
          >
            + Neues Angebot
          </Link>
        </div>

        {deleteError && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {deleteError}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-gray-400">Wird geladen...</p>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : offers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-16 text-center">
            <p className="text-sm text-gray-400">Noch keine Angebote vorhanden.</p>
            <Link
              href="/offers/new"
              className="mt-4 inline-block rounded-xl bg-gray-950 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-black"
            >
              Erstes Angebot erstellen
            </Link>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
                  <th className="px-5 py-3.5">Angebotsnr.</th>
                  <th className="px-5 py-3.5">Titel</th>
                  <th className="px-5 py-3.5">Kunde</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5">Datum</th>
                  <th className="px-5 py-3.5 text-right">Brutto</th>
                  <th className="px-5 py-3.5 text-right">Aktionen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {offers.map((offer) => (
                  <tr key={offer.id} className="transition hover:bg-gray-50">
                    <td className="whitespace-nowrap px-5 py-4 font-mono text-xs text-gray-500">
                      {offer.offer_number}
                    </td>
                    <td className="px-5 py-4 font-medium text-gray-900">
                      {offer.title}
                    </td>
                    <td className="px-5 py-4 text-gray-600">
                      {offer.customer_name ?? "—"}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={offer.status} />
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-gray-500">
                      {formatDate(offer.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-right font-medium text-gray-900">
                      {formatCurrency(Number(offer.totals.total_gross))}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <a
                          href={`${API_URL}/offers/${offer.id}/html`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
                        >
                          Ansehen
                        </a>
                        <Link
                          href={`/offers/new?id=${offer.id}`}
                          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
                        >
                          Bearbeiten
                        </Link>
                        <button
                          onClick={() => handleDelete(offer.id, offer.offer_number)}
                          className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 transition hover:border-red-300 hover:bg-red-50"
                        >
                          Löschen
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
