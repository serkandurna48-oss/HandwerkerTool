import "./globals.css";

export const metadata = {
  title: "AngebotsPilot",
  description: "Angebote in Minuten erstellen",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body className="bg-gray-50 text-gray-900">        {children}
      </body>
    </html>
  );
}