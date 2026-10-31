import ExcelJS from 'exceljs';
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/requireRole';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { fetchAll, workbookResponse } from '@/lib/export/util';

export const maxDuration = 60;

// Exception schedule: everything the reviewer or partner has to look at, with client explanations.
export async function GET() {
  const auth = await requireRole(['admin', 'manager']);
  if (!auth.ok) return auth.response;

  try {
    const supabase = await createServerSupabaseClient();

    const verifs = await fetchAll<Record<string, unknown>>((f, t) =>
      supabase.from('verification').select('*').neq('result', 'Verified').order('tag_no').range(f, t)
    );
    const assets = await fetchAll<{ tag_no: string; description: string; asset_class: string; cost: number; far_qty: number }>(
      (f, t) => supabase.from('asset').select('tag_no, description, asset_class, cost, far_qty').range(f, t)
    );
    const { data: profiles } = await supabase.from('profiles').select('id, full_name');
    const { data: locs } = await supabase.from('location').select('id, building, floor, room');
    const { data: fnf } = await supabase.from('found_not_in_far').select('*').order('created_at');
    const { data: flags } = await supabase
      .from('audit_log')
      .select('record_id, reason, changed_by, changed_at')
      .eq('field', 'duplicate_tag_flag')
      .order('changed_at');

    const assetOf = new Map(assets.map((a) => [a.tag_no, a]));
    const nameOf = new Map((profiles || []).map((p) => [p.id, p.full_name as string]));
    const locOf = new Map((locs || []).map((l) => [l.id, `${l.building} › ${l.floor} › ${l.room}`]));

    const wb = new ExcelJS.Workbook();
    const head = (ws: ExcelJS.Worksheet) => {
      ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F5132' } };
      ws.views = [{ state: 'frozen', ySplit: 1 }];
    };

    const ex = wb.addWorksheet('Exceptions');
    ex.columns = [
      { header: 'Tag No.', key: 'tag', width: 12 },
      { header: 'Description', key: 'desc', width: 40 },
      { header: 'Asset Class', key: 'cls', width: 28 },
      { header: 'Cost (Tk)', key: 'cost', width: 16 },
      { header: 'FAR Qty', key: 'far', width: 9 },
      { header: 'Physical Qty', key: 'qty', width: 12 },
      { header: 'Result', key: 'result', width: 24 },
      { header: 'Condition', key: 'cond', width: 12 },
      { header: 'Tag Status', key: 'tag_status', width: 22 },
      { header: 'Location', key: 'loc', width: 34 },
      { header: 'Counted By', key: 'by', width: 18 },
      { header: 'Remarks', key: 'remarks', width: 36 },
      { header: 'Review Status', key: 'review', width: 13 },
      { header: 'Reviewer Comment', key: 'comment', width: 32 },
      { header: 'Client Explanation', key: 'explain', width: 36 },
    ];
    head(ex);
    verifs.forEach((v) => {
      const a = assetOf.get(String(v.tag_no));
      ex.addRow({
        tag: v.tag_no,
        desc: a?.description,
        cls: a?.asset_class,
        cost: a ? Number(a.cost) : null,
        far: a ? Number(a.far_qty) : null,
        qty: Number(v.physical_qty),
        result: v.result,
        cond: v.condition,
        tag_status: v.tag_status,
        loc: v.location_id ? locOf.get(String(v.location_id)) : '',
        by: v.counter_id ? nameOf.get(String(v.counter_id)) : '',
        remarks: v.remarks,
        review: v.review_status,
        comment: v.review_comment,
        explain: v.client_explanation,
      });
    });
    ex.getColumn('cost').numFmt = '#,##0.00';

    const fn = wb.addWorksheet('Found Not in FAR');
    fn.columns = [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Tag Found', key: 'tag', width: 12 },
      { header: 'Description', key: 'desc', width: 38 },
      { header: 'Brand / Model', key: 'brand', width: 22 },
      { header: 'Serial No.', key: 'serial', width: 18 },
      { header: 'Probable Class', key: 'cls', width: 28 },
      { header: 'Qty', key: 'qty', width: 7 },
      { header: 'Condition', key: 'cond', width: 12 },
      { header: 'Location', key: 'loc', width: 34 },
      { header: 'Logged By', key: 'by', width: 18 },
      { header: 'Counter Remarks', key: 'remarks', width: 34 },
      { header: 'Client Explanation', key: 'explain', width: 34 },
      { header: 'Resolution', key: 'res', width: 30 },
    ];
    head(fn);
    (fnf || []).forEach((f) =>
      fn.addRow({
        date: String(f.created_at).slice(0, 10),
        tag: f.tag_found,
        desc: f.description,
        brand: f.brand_model,
        serial: f.serial_no,
        cls: f.probable_class,
        qty: Number(f.qty),
        cond: f.condition,
        loc: f.location_id ? locOf.get(f.location_id) : '',
        by: f.logged_by ? nameOf.get(f.logged_by) : '',
        remarks: f.remarks,
        explain: f.client_explanation,
        res: f.resolution,
      })
    );

    const dup = wb.addWorksheet('Duplicate Tag Flags');
    dup.columns = [
      { header: 'Tag No.', key: 'tag', width: 12 },
      { header: 'Flagged By', key: 'by', width: 20 },
      { header: 'When', key: 'when', width: 20 },
      { header: 'Note', key: 'note', width: 70 },
    ];
    head(dup);
    (flags || []).forEach((f) =>
      dup.addRow({
        tag: f.record_id,
        by: f.changed_by ? nameOf.get(f.changed_by) : '',
        when: String(f.changed_at).slice(0, 16).replace('T', ' '),
        note: f.reason,
      })
    );

    const stamp = new Date().toISOString().slice(0, 10);
    return await workbookResponse(wb, `FA_Exception_Schedule_${stamp}.xlsx`);
  } catch (err: unknown) {
    console.error('Exceptions export error:', err);
    return NextResponse.json({ error: (err as Error).message || 'Export failed' }, { status: 500 });
  }
}
