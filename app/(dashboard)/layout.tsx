import Link from 'next/link';

const NAV = [
  { href: '/', label: 'Overview' },
  { href: '/case-studies', label: 'Case Studies' },
  { href: '/emails', label: 'Emails' },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-6 py-4">
          <Link href="/" className="font-semibold tracking-tight">
            Signet Marketing
          </Link>
          <nav className="flex gap-6 text-sm text-neutral-600">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="hover:text-neutral-900"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="text-xs text-neutral-500">Honours Boards</div>
        </div>
      </header>
      <main className="flex-1 bg-neutral-50">
        <div className="mx-auto max-w-6xl px-6 py-10">{children}</div>
      </main>
    </div>
  );
}
