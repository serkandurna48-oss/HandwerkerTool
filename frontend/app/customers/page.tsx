"use client";

import { useEffect, useState } from "react";
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

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    company_name: "",
    contact_person: "",
    street: "",
    zip_code: "",
    city: "",
    email: "",
    phone: "",
    object_address: "",
    notes: "",
  });

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      await api.post("/customers", form);
      setForm({
        company_name: "",
        contact_person: "",
        street: "",
        zip_code: "",
        city: "",
        email: "",
        phone: "",
        object_address: "",
        notes: "",
      });
      loadCustomers();
    } catch (error) {
      console.error("Fehler beim Erstellen des Kunden:", error);
    }
  }

  useEffect(() => {
    loadCustomers();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="mx-auto grid max-w-5xl gap-8 px-6 py-10 md:grid-cols-2">
        <section className="rounded-xl bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold">Kunde anlegen</h1>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <input
              className="w-full rounded-lg border px-4 py-3"
              placeholder="Firmenname"
              value={form.company_name}
              onChange={(e) =>
                setForm({ ...form, company_name: e.target.value })
              }
              required
            />

            <input
              className="w-full rounded-lg border px-4 py-3"
              placeholder="Ansprechpartner"
              value={form.contact_person}
              onChange={(e) =>
                setForm({ ...form, contact_person: e.target.value })
              }
            />

            <input
              className="w-full rounded-lg border px-4 py-3"
              placeholder="E-Mail"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />

            <input
              className="w-full rounded-lg border px-4 py-3"
              placeholder="Telefon"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />

            <input
              className="w-full rounded-lg border px-4 py-3"
              placeholder="Ort"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
            />

            <button
              type="submit"
              className="w-full rounded-lg bg-black px-4 py-3 text-white hover:bg-gray-800"
            >
              Kunde speichern
            </button>
          </form>
        </section>

        <section className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold">Kundenliste</h2>

          {loading ? (
            <p className="mt-4 text-gray-500">Lade Kunden...</p>
          ) : customers.length === 0 ? (
            <p className="mt-4 text-gray-500">Noch keine Kunden vorhanden.</p>
          ) : (
            <div className="mt-6 space-y-4">
              {customers.map((customer) => (
                <div
                  key={customer.id}
                  className="rounded-lg border border-gray-200 p-4"
                >
                  <p className="font-semibold">{customer.company_name}</p>
                  <p className="text-sm text-gray-600">
                    {customer.contact_person || "Kein Ansprechpartner"}
                  </p>
                  <p className="text-sm text-gray-500">
                    {customer.email || "Keine E-Mail"}
                  </p>
                  <p className="text-sm text-gray-500">
                    {customer.phone || "Kein Telefon"}
                  </p>
                  <p className="text-sm text-gray-500">
                    {customer.city || "Kein Ort"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}