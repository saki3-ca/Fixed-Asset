import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireRole } from '@/lib/auth/requireRole';

export async function POST(request: Request) {
  const auth = await requireRole(['admin']);
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    const assets = body.assets;

    if (!Array.isArray(assets) || assets.length === 0) {
      return NextResponse.json({ error: 'No assets provided' }, { status: 400 });
    }
    if (assets.length > 1000) {
      return NextResponse.json({ error: 'Send at most 1,000 assets per request' }, { status: 400 });
    }
    const METHODS = ['Count', 'Inspect', 'Vehicle', 'Document'];
    const bad = assets.find(
      (a: { tag_no?: unknown; description?: unknown; method?: unknown; cost?: unknown }) =>
        !a || typeof a.tag_no !== 'string' || !a.tag_no.trim() || typeof a.method !== 'string' ||
        !METHODS.includes(a.method) || typeof a.cost !== 'number'
    );
    if (bad) {
      return NextResponse.json({ error: 'Every asset needs a tag_no, method and numeric cost' }, { status: 400 });
    }

    const adminSupabase = createAdminClient();

    // 1. Ensure an active engagement exists
    let engagementId: string;
    const { data: existingEng } = await adminSupabase
      .from('engagement')
      .select('id')
      .limit(1)
      .maybeSingle();

    if (existingEng) {
      engagementId = existingEng.id;
    } else {
      const { data: newEng, error: engErr } = await adminSupabase
        .from('engagement')
        .insert({
          client_name: 'Remarks HB Limited',
          financial_year: 'FY25',
          far_cutoff_date: '2025-06-30',
          status: 'active',
        })
        .select('id')
        .single();

      if (engErr || !newEng) {
        throw new Error('Failed to create engagement record: ' + (engErr?.message || 'Unknown error'));
      }
      engagementId = newEng.id;
    }

    // 2. Prepare chunk with engagement_id
    const payload = assets.map((a: {
      tag_no: string;
      description: string;
      asset_class: string;
      gl_account?: string | null;
      capitalized_on?: string | null;
      cost: number;
      acc_dep: number;
      nbv: number;
      far_qty: number;
      method: string;
    }) => ({
      tag_no: a.tag_no,
      engagement_id: engagementId,
      description: a.description,
      asset_class: a.asset_class,
      gl_account: a.gl_account || null,
      capitalized_on: a.capitalized_on || null,
      cost: a.cost,
      acc_dep: a.acc_dep,
      nbv: a.nbv,
      far_qty: a.far_qty,
      method: a.method,
    }));

    // 3. Upsert into asset table (Admin key bypasses RLS)
    const { error: upsertErr } = await adminSupabase
      .from('asset')
      .upsert(payload, { onConflict: 'tag_no' });

    if (upsertErr) {
      throw new Error(`Upsert error: ${upsertErr.message}`);
    }

    return NextResponse.json({ success: true, count: payload.length });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json(
      { error: error.message || 'Failed to import assets' },
      { status: 500 }
    );
  }
}

