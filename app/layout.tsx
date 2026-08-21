import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Multicode | Pátio de serviço",
  description: "Central local para delegar tarefas a agentes e acompanhar suas execuções.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
      </body>
    </html>
  );
}
