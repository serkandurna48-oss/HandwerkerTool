"use client";

import { useEffect, useRef, useState } from "react";
import Navbar from "@/components/Navbar";
import { api } from "@/lib/api";

type Customer = {
  id: string;
  company_name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  city?: string;
};

const emptyForm = {
  company_name: "",
  contact_person: "",
  street: "",
  zip_code: "",
  city: "",
  email: "",
  phone: "",
  object_address: "",
  notes: "",
};

const field =
  "w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-[15px] text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none focus:ring-4 focus:ring-gray-100 transition";

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadCustomers() {
    setLoading(true);
    try {
      const res = await api.get("/customers");
      setCustomers(res.data);
    } catch (error) {
      console.error("Fehler beim Laden der Kunden:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Kunde "${name}" wirklich löschen?`)) return;
    setDeleteError("");
    try {
      await api.delete(`/customers/${id}`);
      loadCustomers();
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        setDeleteError("Kunde kann nicht gelöscht werden, solange noch Angebote vorhanden sind.");
      } else {
        setDeleteError("Kunde konnte nicht gelöscht werden. Bitte erneut versuchen.");
      }
    }
  }

  function downloadTemplate() {
    const csv = "company_name,phone,email\nMuster GmbH,089 123456,info@muster.de\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "kunden-vorlage.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportMessage("");  // alte Meldung sofort löschen bevor Upload startet
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post("/customers/import", formData);
      const { imported, skipped } = res.data as { imported: number; skipped: number };
      const parts: string[] = [];
      if (imported > 0) parts.push(`${imported} Kunde${imported === 1 ? "" : "n"} importiert`);
      if (skipped > 0) parts.push(`${skipped} übersprungen`);
      setImportMessage(parts.join(", ") || "Keine Kunden importiert.");
      if (imported > 0) loadCustomers();
    } catch {
      setImportMessage("Import fehlgeschlagen. Bitte CSV-Datei und Format prüfen.");
    } finally {
      setImporting(false);
      // Input zurücksetzen, damit dieselbe Datei erneut hochgeladen werden kann
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/customers", form);
      setForm(emptyForm);
      loadCustomers();
    } catch (error) {
      console.error("Fehler beim Erstellen des Kunden:", error);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    loadCustomers();
  }, []);

  return (
    <div className="min-h-screen bg-neutral-50">
      <Navbar />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <p className="text-sm font-medium text-gray-500">Verwaltung</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-gray-950">
            Kunden
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Lege neue Kunden an und verwalte bestehende Kontakte.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">

          {/* Formular */}
          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-950">Neuer Kunde</h2>
            <p className="mt-1 text-sm text-gray-500">Pflichtfeld: Firmenname</p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Firma oder Name <span className="text-gray-400">*</span>
                </label>
                <input
                  className={field}
                  placeholder="z. B. Muster GmbH oder Hans Müller"
                  value={form.company_name}
                  onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Ansprechpartner
                </label>
                <input
                  className={field}
                  placeholder="z. B. Hans Müller"
                  value={form.contact_person}
                  onChange={(e) => setForm({ ...form, contact_person: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    E-Mail
                  </label>
                  <input
                    type="email"
                    className={field}
                    placeholder="mail@beispiel.de"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Telefon
                  </label>
                  <input
                    className={field}
                    placeholder="0123 456789"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Ort
                </label>
                <input
                  className={field}
                  placeholder="z. B. München"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full rounded-xl bg-gray-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-gray-300"
                >
                  {saving ? "Wird gespeichert..." : "Kunde speichern"}
                </button>
              </div>
            </form>
          </section>

          {/* Kundenliste */}
          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            {deleteError && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {deleteError}
              </div>
            )}
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-950">Kundenliste</h2>
              <div className="flex items-center gap-2">
                {customers.length > 0 && (
                  <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                    {customers.length}
                  </span>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleImport}
                />
                <button
                  onClick={downloadTemplate}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-500 transition hover:border-gray-300 hover:bg-gray-50"
                >
                  Vorlage
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importing}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:border-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400"
                >
                  {importing ? "Importiert..." : "CSV importieren"}
                </button>
              </div>
            </div>
            <p className="mt-1.5 text-xs text-gray-400">
              Erwartete Spalten: <span className="font-mono">company_name</span>, <span className="font-mono">phone</span>, <span className="font-mono">email</span>
            </p>
            {importMessage && (
              <p className={`mt-2 rounded-lg px-3 py-2 text-xs ${
                importMessage.includes("fehlgeschlagen")
                  ? "bg-red-50 text-red-700 border border-red-200"
                  : "bg-green-50 text-green-700 border border-green-200"
              }`}>
                {importMessage}
              </p>
            )}

            <div className="mt-5">
              {loading ? (
                <p className="text-sm text-gray-400">Wird geladen...</p>
              ) : customers.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-400">
                  Noch keine Kunden vorhanden.
                </div>
              ) : (
                <div className="space-y-3">
                  {customers.map((customer) => (
                    <div
                      key={customer.id}
                      className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-gray-900">{customer.company_name}</p>
                          <div className="mt-1 space-y-0.5 text-sm text-gray-500">
                            {customer.contact_person && <p>{customer.contact_person}</p>}
                            {customer.email && <p>{customer.email}</p>}
                            {(customer.phone || customer.city) && (
                              <p>
                                {[customer.phone, customer.city].filter(Boolean).join(" · ")}
                              </p>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleDelete(customer.id, customer.company_name)}
                          className="shrink-0 rounded-lg border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-600 transition hover:border-red-300 hover:bg-red-50"
                        >
                          Löschen
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
