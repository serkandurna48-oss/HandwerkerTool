"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import { api } from "@/lib/api";

const DEFAULT_VAT_RATE = 19;

function getValidUntilDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  return date.toISOString().split("T")[0];
}

type Customer = {
  id: string;
  company_name: string;
};

type OfferItem = {
  title: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price_net: number;
};

type AIItemSuggestion = {
  title: string;
  description: string;
  quantity: number;
  unit: string;
};

// ─── inner component (needs Suspense because of useSearchParams) ─────────────

function NewOfferPageContent() {
  const searchParams = useSearchParams();
  const editId = searchParams.get("id"); // present when editing an existing offer

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [trade, setTrade] = useState("");
  const [notes, setNotes] = useState("");
  const [title, setTitle] = useState("");
  const [introText, setIntroText] = useState("");
  const [items, setItems] = useState<OfferItem[]>([]);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "info">("info");
  const [offerId, setOfferId] = useState("");
  const [offerStatus, setOfferStatus] = useState<"draft" | "approved" | "">("");
  const [vatRate, setVatRate] = useState(DEFAULT_VAT_RATE);
  const [validUntil, setValidUntil] = useState(getValidUntilDate());
  const [loadingAI, setLoadingAI] = useState(false);
  const [savingOffer, setSavingOffer] = useState(false);
  const [approvingOffer, setApprovingOffer] = useState(false);
  const [loadingOffer, setLoadingOffer] = useState(false);

  const isEditMode = Boolean(editId);

  // ── load customers ──────────────────────────────────────────────────────────
  useEffect(() => {
    api.get("/customers").then((res) => setCustomers(res.data)).catch(() => {});
  }, []);

  // ── load existing offer when ?id= is present ────────────────────────────────
  useEffect(() => {
    if (!editId) return;

    setLoadingOffer(true);
    api
      .get(`/offers/${editId}`)
      .then((res) => {
        const offer = res.data;
        setOfferId(offer.id);
        setSelectedCustomerId(offer.customer_id);
        setTitle(offer.title);
        setIntroText(offer.intro_text || "");
        setItems(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          offer.items.map((item: any) => ({
            title: item.title,
            description: item.description || "",
            quantity: Number(item.quantity),
            unit: item.unit,
            unit_price_net: Number(item.unit_price_net),
          }))
        );
        setOfferStatus(offer.status);
        setVatRate(offer.vat_rate != null ? Number(offer.vat_rate) : 19);
        if (offer.valid_until) setValidUntil(offer.valid_until);
      })
      .catch(() => {
        setMessage("Angebot konnte nicht geladen werden.");
        setMessageType("error");
      })
      .finally(() => setLoadingOffer(false));
  }, [editId]);

  // ── AI structuring ──────────────────────────────────────────────────────────
  async function handleAIStructure() {
    if (trade.trim().length < 2) {
      setMessage("Bitte ein Gewerk eingeben.");
      setMessageType("error");
      return;
    }
    if (notes.trim().length < 5) {
      setMessage("Bitte ausführlichere Notizen eingeben.");
      setMessageType("error");
      return;
    }
    if (items.length > 0) {
      const hasPrices = items.some((item) => item.unit_price_net > 0);
      const confirmMsg = hasPrices
        ? "Es sind bereits Positionen mit eingetragenen Preisen vorhanden.\n\nBeim Fortfahren werden alle Positionen und Preise durch die KI-Struktur ersetzt.\n\nFortfahren?"
        : "Es sind bereits Positionen vorhanden.\n\nDiese werden durch die KI-Struktur ersetzt.\n\nFortfahren?";
      if (!window.confirm(confirmMsg)) return;
    }
    try {
      setLoadingAI(true);
      setMessage("");
      const res = await api.post("/ai/structure-offer", {
        trade: trade.trim(),
        notes: notes.trim(),
      });
      setTitle(res.data.title);
      setIntroText(res.data.intro_text);
      const aiItems: OfferItem[] = (res.data.items as AIItemSuggestion[]).map(
        (item) => ({
          title: item.title,
          description: item.description,
          quantity: Number(item.quantity),
          unit: item.unit,
          unit_price_net: 0,
        })
      );
      setItems(aiItems);
      setMessage("Angebotsstruktur wurde erstellt.");
      setMessageType("success");
    } catch {
      setMessage("KI-Strukturierung fehlgeschlagen.");
      setMessageType("error");
    } finally {
      setLoadingAI(false);
    }
  }

  // ── item helpers ────────────────────────────────────────────────────────────
  function updateItem(index: number, field: keyof OfferItem, value: string | number) {
    const nextItems = [...items];
    nextItems[index] = { ...nextItems[index], [field]: value };
    setItems(nextItems);
  }

  function addEmptyItem() {
    setItems((prev) => [
      ...prev,
      { title: "", description: "", quantity: 1, unit: "Pauschale", unit_price_net: 0 },
    ]);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  // ── totals ──────────────────────────────────────────────────────────────────
  const totalNet = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity * item.unit_price_net, 0),
    [items]
  );
  const vatAmount = totalNet * (vatRate / 100);
  const totalGross = totalNet + vatAmount;

  // ── save (POST = new, PUT = update) ─────────────────────────────────────────
  async function saveOffer() {
    if (!selectedCustomerId) {
      setMessage("Bitte zuerst einen Kunden auswählen.");
      setMessageType("error");
      return;
    }
    if (!title.trim()) {
      setMessage("Bitte einen Angebotstitel eingeben.");
      setMessageType("error");
      return;
    }
    if (items.length === 0) {
      setMessage("Bitte mindestens eine Position hinzufügen.");
      setMessageType("error");
      return;
    }

    const payload = {
      title,
      intro_text: introText,
      items,
      valid_until: validUntil,
      vat_rate: vatRate,
      notes: "",
    };

    try {
      setSavingOffer(true);
      setMessage("");

      if (offerId) {
        // ── UPDATE existing offer ──────────────────────────────────────────
        await api.put(`/offers/${offerId}`, payload);
        setMessage("Angebot wurde aktualisiert.");
        setMessageType("success");
      } else {
        // ── CREATE new offer ───────────────────────────────────────────────
        const res = await api.post("/offers", {
          customer_id: selectedCustomerId,
          ...payload,
        });
        setOfferId(res.data.id);
        setOfferStatus("draft");
        setMessage(`Angebot gespeichert: ${res.data.offer_number}`);
        setMessageType("success");
      }
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        setMessage("Freigegebene Angebote können nicht mehr bearbeitet werden.");
      } else {
        setMessage("Fehler beim Speichern des Angebots.");
      }
      setMessageType("error");
    } finally {
      setSavingOffer(false);
    }
  }

  // ── approve ─────────────────────────────────────────────────────────────────
  async function approveOffer() {
    if (!offerId) return;
    try {
      setApprovingOffer(true);
      await api.patch(`/offers/${offerId}/approve`);
      setOfferStatus("approved");
      setMessage("Angebot wurde freigegeben.");
      setMessageType("success");
    } catch {
      setMessage("Freigabe fehlgeschlagen.");
      setMessageType("error");
    } finally {
      setApprovingOffer(false);
    }
  }

  // ── derived UI values ────────────────────────────────────────────────────────
  const selectedCustomerName =
    customers.find((c) => c.id === selectedCustomerId)?.company_name || "Nicht ausgewählt";

  const statusClassName =
    messageType === "success"
      ? "border border-green-200 bg-green-50 text-green-800"
      : messageType === "error"
      ? "border border-red-200 bg-red-50 text-red-800"
      : "border border-gray-200 bg-gray-50 text-gray-800";

  const fieldClassName =
    "w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-[15px] text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none focus:ring-4 focus:ring-gray-200";

  // ── render ───────────────────────────────────────────────────────────────────
  if (loadingOffer) {
    return (
      <div className="min-h-screen bg-neutral-50">
        <Navbar />
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <p className="text-sm text-gray-400">Angebot wird geladen…</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <p className="text-sm font-medium text-gray-500">Angebote</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-gray-950">
            {isEditMode ? "Angebot bearbeiten" : "Neues Angebot"}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-gray-600">
            {isEditMode
              ? "Felder anpassen und Angebot aktualisieren."
              : "Erfasse die Grunddaten, lasse dir Positionen von der KI strukturieren und speichere daraus ein sauberes Angebot."}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-6">

            {/* Grunddaten */}
            <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-6 flex flex-col gap-1">
                <h2 className="text-lg font-semibold text-gray-950">Grunddaten</h2>
                <p className="text-sm text-gray-600">Kunde auswählen und Auftrag kurz beschreiben.</p>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-800">Kunde</label>
                  <select
                    className={fieldClassName}
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                    disabled={isEditMode}
                  >
                    <option value="">Kunde auswählen</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.company_name}
                      </option>
                    ))}
                  </select>
                  {isEditMode && (
                    <p className="mt-1 text-xs text-gray-400">Kunde kann nachträglich nicht geändert werden.</p>
                  )}
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-800">Gewerk</label>
                  <input
                    className={fieldClassName}
                    placeholder="z. B. Sanitär"
                    value={trade}
                    onChange={(e) => setTrade(e.target.value)}
                  />
                </div>
              </div>

              <div className="mt-5">
                <label className="mb-2 block text-sm font-medium text-gray-800">Notizen (für KI-Strukturierung)</label>
                <textarea
                  className={`${fieldClassName} min-h-[150px] resize-y`}
                  placeholder="z. B. alte Dusche demontieren, neue Dusche montieren, Fliesen im Duschbereich erneuern, Entsorgung inklusive"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
                <p className="mt-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-700">
                  Datenschutzhinweis: Inhalte dieses Feldes werden zur Strukturierung an OpenAI übermittelt. Bitte keine sensiblen personenbezogenen Daten eingeben.
                </p>
              </div>
            </section>

            {/* Angebotstext */}
            <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-6 flex flex-col gap-1">
                <h2 className="text-lg font-semibold text-gray-950">Angebotstext</h2>
                <p className="text-sm text-gray-600">
                  Titel und Einleitung können automatisch erstellt und danach manuell überarbeitet werden.
                </p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-800">Angebotstitel</label>
                <input
                  className={fieldClassName}
                  placeholder="z. B. Angebot für Sanitärarbeiten"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div className="mt-5">
                <label className="mb-2 block text-sm font-medium text-gray-800">Einleitung</label>
                <textarea
                  className={`${fieldClassName} min-h-[120px] resize-y`}
                  placeholder="z. B. Vielen Dank für Ihre Anfrage. Nachfolgend erhalten Sie unser Angebot."
                  value={introText}
                  onChange={(e) => setIntroText(e.target.value)}
                />
              </div>
            </section>

            {/* Positionen */}
            <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-950">Positionen</h2>
                  <p className="text-sm text-gray-600">Preise ergänzen und Positionen bei Bedarf anpassen.</p>
                </div>
                <button
                  onClick={addEmptyItem}
                  className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 transition hover:border-gray-400 hover:bg-gray-50"
                >
                  Position hinzufügen
                </button>
              </div>

              {items.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-sm text-gray-600">
                  Noch keine Positionen vorhanden. Nutze die KI oder füge manuell eine Position hinzu.
                </div>
              ) : (
                <div className="space-y-4">
                  {items.map((item, index) => (
                    <div key={index} className="rounded-2xl border border-gray-200 bg-white p-5">
                      <div className="mb-4 flex items-center justify-between">
                        <div className="text-sm font-medium text-gray-700">Position {index + 1}</div>
                        <button
                          onClick={() => removeItem(index)}
                          className="text-sm font-medium text-red-600 transition hover:text-red-700"
                        >
                          Entfernen
                        </button>
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium text-gray-800">Titel</label>
                        <input
                          className={fieldClassName}
                          placeholder="Positionstitel"
                          value={item.title}
                          onChange={(e) => updateItem(index, "title", e.target.value)}
                        />
                      </div>

                      <div className="mt-5">
                        <label className="mb-2 block text-sm font-medium text-gray-800">Beschreibung</label>
                        <textarea
                          className={`${fieldClassName} min-h-[110px] resize-y`}
                          placeholder="Beschreibung der Leistung"
                          value={item.description}
                          onChange={(e) => updateItem(index, "description", e.target.value)}
                        />
                      </div>

                      <div className="mt-5 grid gap-4 md:grid-cols-3">
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-800">Menge</label>
                          <input
                            type="number"
                            className={fieldClassName}
                            placeholder="1"
                            value={item.quantity}
                            onChange={(e) => updateItem(index, "quantity", Number(e.target.value))}
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-800">Einheit</label>
                          <input
                            className={fieldClassName}
                            placeholder="Pauschale"
                            value={item.unit}
                            onChange={(e) => updateItem(index, "unit", e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-800">Einzelpreis netto</label>
                          <input
                            type="number"
                            className={fieldClassName}
                            placeholder="0"
                            value={item.unit_price_net}
                            onChange={(e) => updateItem(index, "unit_price_net", Number(e.target.value))}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Sidebar */}
          <aside className="xl:sticky xl:top-24 xl:self-start">
            <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">

              {/* Kunde + Status */}
              <div className="rounded-xl bg-gray-50 p-4 space-y-3">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-gray-400">Kunde</div>
                  <div className="mt-1 text-sm font-medium text-gray-900">{selectedCustomerName}</div>
                </div>

                {offerStatus && (
                  <div className="border-t border-gray-200 pt-3">
                    <div className="text-xs font-medium uppercase tracking-wide text-gray-400">Status</div>
                    <div className="mt-1.5">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                        offerStatus === "approved"
                          ? "bg-green-100 text-green-700"
                          : "bg-amber-100 text-amber-700"
                      }`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${offerStatus === "approved" ? "bg-green-500" : "bg-amber-500"}`} />
                        {offerStatus === "approved" ? "Freigegeben" : "Entwurf"}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Summen */}
              <div className="rounded-xl bg-gray-50 p-4">
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between text-gray-400 text-xs pb-1">
                    <span>{items.length} {items.length === 1 ? "Position" : "Positionen"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Netto</span>
                    <span className="font-medium text-gray-900">{totalNet.toFixed(2)} €</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-gray-500 shrink-0">MwSt.</label>
                    <div className="flex items-center gap-1.5">
                      <select
                        value={vatRate}
                        onChange={(e) => setVatRate(Number(e.target.value))}
                        className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:border-gray-400 focus:outline-none"
                      >
                        <option value={0}>0 %</option>
                        <option value={7}>7 %</option>
                        <option value={19}>19 %</option>
                      </select>
                      <span className="font-medium text-gray-900">{vatAmount.toFixed(2)} €</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-t border-gray-200 pt-2 mt-1">
                    <span className="font-semibold text-gray-950">Gesamt</span>
                    <span className="font-semibold text-gray-950">{totalGross.toFixed(2)} €</span>
                  </div>
                </div>
              </div>

              {/* Aktions-Buttons */}
              <div className="space-y-2 pt-1">
                <button
                  onClick={handleAIStructure}
                  disabled={loadingAI}
                  className="w-full rounded-xl bg-gray-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-gray-300"
                >
                  {loadingAI ? "KI arbeitet..." : "Mit KI strukturieren"}
                </button>

                <button
                  onClick={saveOffer}
                  disabled={savingOffer || offerStatus === "approved"}
                  className="w-full rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-medium text-gray-800 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400"
                >
                  {savingOffer
                    ? "Speichert..."
                    : isEditMode
                    ? "Änderungen speichern"
                    : "Angebot speichern"}
                </button>
                {offerStatus === "approved" && (
                  <p className="text-center text-xs text-amber-600">
                    Freigegebene Angebote können nicht mehr bearbeitet werden.
                  </p>
                )}

                {offerId && offerStatus === "draft" && (
                  <button
                    onClick={approveOffer}
                    disabled={approvingOffer}
                    className="w-full rounded-xl bg-green-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                  >
                    {approvingOffer ? "Wird freigegeben..." : "Freigeben"}
                  </button>
                )}

                {offerId && (
                  <a
                    href={`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/offers/${offerId}/html`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full rounded-xl border border-gray-200 bg-white px-5 py-3 text-center text-sm font-medium text-gray-800 transition hover:bg-gray-50"
                  >
                    Vorschau öffnen
                  </a>
                )}
                {offerId && (
                  <a
                    href={`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/offers/${offerId}/pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full rounded-xl border border-gray-200 bg-white px-5 py-3 text-center text-sm font-medium text-gray-800 transition hover:bg-gray-50"
                  >
                    PDF herunterladen
                  </a>
                )}
              </div>

              {message && (
                <div className={`rounded-xl p-3.5 text-sm ${statusClassName}`}>
                  {message}
                </div>
              )}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

// ─── Suspense wrapper (required for useSearchParams in App Router) ────────────
export default function NewOfferPage() {
  return (
    <Suspense>
      <NewOfferPageContent />
    </Suspense>
  );
}
