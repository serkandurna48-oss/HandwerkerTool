"use client";

import { useEffect, useMemo, useState } from "react";
import Navbar from "@/components/Navbar";
import { api } from "@/lib/api";

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

export default function NewOfferPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [trade, setTrade] = useState("");
  const [notes, setNotes] = useState("");
  const [title, setTitle] = useState("");
  const [introText, setIntroText] = useState("");
  const [items, setItems] = useState<OfferItem[]>([]);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "info">(
    "info"
  );
  const [offerId, setOfferId] = useState("");
  const [loadingAI, setLoadingAI] = useState(false);
  const [savingOffer, setSavingOffer] = useState(false);

  useEffect(() => {
    async function loadCustomers() {
      try {
        const res = await api.get("/customers");
        setCustomers(res.data);
      } catch (error) {
        console.error("Fehler beim Laden der Kunden:", error);
      }
    }

    loadCustomers();
  }, []);

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
    } catch (error: any) {
      console.error("Fehler bei KI-Strukturierung:", error);
      console.log("Backend-Fehler:", error.response?.data);
      setMessage("KI-Strukturierung fehlgeschlagen.");
      setMessageType("error");
    } finally {
      setLoadingAI(false);
    }
  }

  function updateItem(
    index: number,
    field: keyof OfferItem,
    value: string | number
  ) {
    const nextItems = [...items];
    nextItems[index] = {
      ...nextItems[index],
      [field]: value,
    };
    setItems(nextItems);
  }

  function addEmptyItem() {
    setItems((prev) => [
      ...prev,
      {
        title: "",
        description: "",
        quantity: 1,
        unit: "Pauschale",
        unit_price_net: 0,
      },
    ]);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  const totalNet = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity * item.unit_price_net, 0),
    [items]
  );
  const vatAmount = totalNet * 0.19;
  const totalGross = totalNet + vatAmount;

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

    try {
      setSavingOffer(true);
      setMessage("");

      const res = await api.post("/offers", {
        customer_id: selectedCustomerId,
        title,
        intro_text: introText,
        items,
        valid_until: "2026-04-15",
        vat_rate: 19,
        notes: "",
      });

      setOfferId(res.data.id);
      setMessage(`Angebot gespeichert: ${res.data.offer_number}`);
      setMessageType("success");
    } catch (error) {
      console.error("Fehler beim Speichern des Angebots:", error);
      setMessage("Fehler beim Speichern des Angebots.");
      setMessageType("error");
    } finally {
      setSavingOffer(false);
    }
  }

  const selectedCustomerName =
    customers.find((customer) => customer.id === selectedCustomerId)?.company_name ||
    "Nicht ausgewählt";

  const statusClassName =
    messageType === "success"
      ? "border border-green-200 bg-green-50 text-green-800"
      : messageType === "error"
      ? "border border-red-200 bg-red-50 text-red-800"
      : "border border-gray-200 bg-gray-50 text-gray-800";

  const fieldClassName =
    "w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-[15px] text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none focus:ring-4 focus:ring-gray-200";

  return (
    <div className="min-h-screen bg-neutral-50">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <p className="text-sm font-medium text-gray-500">Angebote</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-gray-950">
            Neues Angebot
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-gray-600">
            Erfasse die Grunddaten, lasse dir Positionen von der KI strukturieren
            und speichere daraus ein sauberes Angebot.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-6">
            <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-6 flex flex-col gap-1">
                <h2 className="text-lg font-semibold text-gray-950">
                  Grunddaten
                </h2>
                <p className="text-sm text-gray-600">
                  Kunde auswählen und Auftrag kurz beschreiben.
                </p>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-800">
                    Kunde
                  </label>
                  <select
                    className={fieldClassName}
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                  >
                    <option value="">Kunde auswählen</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.company_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-800">
                    Gewerk
                  </label>
                  <input
                    className={fieldClassName}
                    placeholder="z. B. Sanitär"
                    value={trade}
                    onChange={(e) => setTrade(e.target.value)}
                  />
                </div>
              </div>

              <div className="mt-5">
                <label className="mb-2 block text-sm font-medium text-gray-800">
                  Notizen
                </label>
                <textarea
                  className={`${fieldClassName} min-h-[150px] resize-y`}
                  placeholder="z. B. alte Dusche demontieren, neue Dusche montieren, Fliesen im Duschbereich erneuern, Entsorgung inklusive"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-6 flex flex-col gap-1">
                <h2 className="text-lg font-semibold text-gray-950">
                  Angebotstext
                </h2>
                <p className="text-sm text-gray-600">
                  Titel und Einleitung können automatisch erstellt und danach
                  manuell überarbeitet werden.
                </p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-800">
                  Angebotstitel
                </label>
                <input
                  className={fieldClassName}
                  placeholder="z. B. Angebot für Sanitärarbeiten"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div className="mt-5">
                <label className="mb-2 block text-sm font-medium text-gray-800">
                  Einleitung
                </label>
                <textarea
                  className={`${fieldClassName} min-h-[120px] resize-y`}
                  placeholder="z. B. Vielen Dank für Ihre Anfrage. Nachfolgend erhalten Sie unser Angebot."
                  value={introText}
                  onChange={(e) => setIntroText(e.target.value)}
                />
              </div>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-950">
                    Positionen
                  </h2>
                  <p className="text-sm text-gray-600">
                    Preise ergänzen und Positionen bei Bedarf anpassen.
                  </p>
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
                  Noch keine Positionen vorhanden. Nutze die KI oder füge manuell
                  eine Position hinzu.
                </div>
              ) : (
                <div className="space-y-4">
                  {items.map((item, index) => (
                    <div
                      key={index}
                      className="rounded-2xl border border-gray-200 bg-white p-5"
                    >
                      <div className="mb-4 flex items-center justify-between">
                        <div className="text-sm font-medium text-gray-700">
                          Position {index + 1}
                        </div>
                        <button
                          onClick={() => removeItem(index)}
                          className="text-sm font-medium text-red-600 transition hover:text-red-700"
                        >
                          Entfernen
                        </button>
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium text-gray-800">
                          Titel
                        </label>
                        <input
                          className={fieldClassName}
                          placeholder="Positionstitel"
                          value={item.title}
                          onChange={(e) =>
                            updateItem(index, "title", e.target.value)
                          }
                        />
                      </div>

                      <div className="mt-5">
                        <label className="mb-2 block text-sm font-medium text-gray-800">
                          Beschreibung
                        </label>
                        <textarea
                          className={`${fieldClassName} min-h-[110px] resize-y`}
                          placeholder="Beschreibung der Leistung"
                          value={item.description}
                          onChange={(e) =>
                            updateItem(index, "description", e.target.value)
                          }
                        />
                      </div>

                      <div className="mt-5 grid gap-4 md:grid-cols-3">
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-800">
                            Menge
                          </label>
                          <input
                            type="number"
                            className={fieldClassName}
                            placeholder="1"
                            value={item.quantity}
                            onChange={(e) =>
                              updateItem(index, "quantity", Number(e.target.value))
                            }
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-800">
                            Einheit
                          </label>
                          <input
                            className={fieldClassName}
                            placeholder="Pauschale"
                            value={item.unit}
                            onChange={(e) =>
                              updateItem(index, "unit", e.target.value)
                            }
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-800">
                            Einzelpreis netto
                          </label>
                          <input
                            type="number"
                            className={fieldClassName}
                            placeholder="0"
                            value={item.unit_price_net}
                            onChange={(e) =>
                              updateItem(
                                index,
                                "unit_price_net",
                                Number(e.target.value)
                              )
                            }
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <aside className="xl:sticky xl:top-24 xl:self-start">
            <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div>
                <h2 className="text-lg font-semibold text-gray-950">Aktionen</h2>
                <p className="mt-1 text-sm text-gray-600">
                  Erst strukturieren, dann speichern.
                </p>
              </div>

              <div className="rounded-xl bg-gray-50 p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Aktueller Kunde
                </div>
                <div className="mt-1 text-sm font-medium text-gray-900">
                  {selectedCustomerName}
                </div>
              </div>

              <button
                onClick={handleAIStructure}
                disabled={loadingAI}
                className="w-full rounded-xl bg-gray-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-gray-400"
              >
                {loadingAI ? "KI arbeitet..." : "Mit KI strukturieren"}
              </button>

              <button
                onClick={saveOffer}
                disabled={savingOffer}
                className="w-full rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-medium text-gray-900 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:bg-gray-100"
              >
                {savingOffer ? "Speichert..." : "Angebot speichern"}
              </button>

              {offerId && (
                <button
                  onClick={() =>
                    window.open(`${process.env.NEXT_PUBLIC_API_URL}/offers/${offerId}/html`)
                  }
                  className="w-full rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-medium text-gray-900 transition hover:bg-gray-50"
                >
                  Angebot anzeigen
                </button>
              )}


              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <h3 className="text-sm font-semibold text-gray-900">Übersicht</h3>

                <div className="mt-4 space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Positionen</span>
                    <span className="font-medium text-gray-900">{items.length}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Netto</span>
                    <span className="font-medium text-gray-900">
                      {totalNet.toFixed(2)} €
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">MwSt. 19%</span>
                    <span className="font-medium text-gray-900">
                      {vatAmount.toFixed(2)} €
                    </span>
                  </div>

                  <div className="flex items-center justify-between border-t border-gray-200 pt-3">
                    <span className="font-semibold text-gray-950">Brutto</span>
                    <span className="font-semibold text-gray-950">
                      {totalGross.toFixed(2)} €
                    </span>
                  </div>
                </div>
              </div>

              {message && (
                <div className={`rounded-xl p-4 text-sm ${statusClassName}`}>
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