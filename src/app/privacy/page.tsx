import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy — Invoice Extractor" };

const sections = [
  {
    title: "Who is responsible",
    body: (
      <>
        Alessandro Zanni, reachable via{" "}
        <a href="https://alessandrozanni.dev" className="underline underline-offset-4">alessandrozanni.dev</a>.
      </>
    ),
  },
  {
    title: "Accounts and login",
    body: "Accounts are created by the owner; signup is closed. Login uses Supabase Auth with session cookies that are strictly necessary for the app to work.",
  },
  {
    title: "Your documents",
    body: "Uploaded documents (PDF and images) and the data extracted from them are stored in Supabase in the EU (Frankfurt, eu-central-1). They are private: each user can access only their own documents.",
  },
  {
    title: "Extraction",
    body: "Each uploaded document is sent to the Anthropic Claude API to extract its data. Anthropic does not train its models on API data by default.",
  },
  {
    title: "Hosting and analytics",
    body: "The app is hosted on Vercel (Frankfurt, fra1). Vercel Web Analytics counts page views in aggregate, without cookies and without tracking you across sites.",
  },
  {
    title: "Deletion",
    body: "You can ask for your account and documents to be deleted through the contact above.",
  },
];

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4 sm:p-8">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Privacy</h1>
        <Link href="/" className="text-sm text-muted-foreground underline-offset-4 hover:underline">Invoice Extractor</Link>
      </header>
      {sections.map((s) => (
        <section key={s.title} className="flex flex-col gap-1">
          <h2 className="font-medium">{s.title}</h2>
          <p className="text-sm text-muted-foreground">{s.body}</p>
        </section>
      ))}
    </main>
  );
}
