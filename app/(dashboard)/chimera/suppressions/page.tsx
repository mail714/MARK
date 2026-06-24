import Link from 'next/link';
import { listSuppressions } from '@/lib/chimera/prospects';
import { SuppressionsManager } from '@/components/chimera/SuppressionsManager';

export const dynamic = 'force-dynamic';

export default async function ChimeraSuppressionsPage() {
  const suppressions = await listSuppressions();
  return (
    <div className="space-y-6">
      <header>
        <Link href="/chimera" className="text-xs text-neutral-500 hover:text-neutral-700">
          ← Chimera
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Suppression list</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Contacts on this list are filtered out of every Chimera search. Add unsubscribes,
          competitors, do-not-contact lists. Email matches a single contact; domain blocks every
          contact on that domain; business name is case-insensitive exact match.
        </p>
      </header>
      <SuppressionsManager initial={suppressions} />
    </div>
  );
}
