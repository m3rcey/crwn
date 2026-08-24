// Big Page Index: summary + page listing (admin-only, read-only).
//
// GET  /api/admin/distribution/index?q=<optional username filter>
//
// SECURITY: requireAdmin() gates the route (session-derived, middleware skips
// /api). The tables are admin-only; reads go through the service-role store.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { listIndexPages, readIndexSummary } from '@/lib/distribution/store';

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const q = req.nextUrl.searchParams.get('q');
  const query = q && q.trim().length > 0 ? q.trim().slice(0, 40) : null;

  const now = new Date();
  const [summary, listing] = await Promise.all([readIndexSummary(now), listIndexPages(query)]);

  return NextResponse.json({
    summary,
    pages: listing.pages,
    migrationPending: summary.migrationPending || listing.migrationPending,
  });
}
