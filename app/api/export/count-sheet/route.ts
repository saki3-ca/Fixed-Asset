import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/requireRole';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { fetchAll, loadTemplate, toDate, workbookResponse } from '@/lib/export/util';

export const maxDuration = 60;

interface AssetRow {
  tag_no: string;
  description: string;
  asset_class: string;
  capitalized_on: string | null;
  cost: number;
  nbv: number;
  far_qty: number;
  method: string;
}

interface VerifRow {
  tag_no: string;
  found: string | null;
  count_date: string;
  counter_id: string | null;
  location_id: string | null;
  department: string | null;
  custodian: string | null;
  tag_status: string;
  brand_model: string | null;
  physical_qty: number;
  condition: string;
  in_use: boolean;
  remarks: string | null;
  serial_no: string | null;
  reviewed_by: string | null;
  client_explanation: string | null;
  created_at: string;
}

// Fills the stored "FA_Count_Verification_Sheet.xlsx" template from the database so the agreed format and live formulas stay as they are.
export async function GET() {
  const auth = await requireRole(['admin', 'manager']);
  if (!auth.ok) return auth.response;

  try {
    const supabase = await createServerSupabaseClient();

    const assets = await fetchAll<AssetRow>((f, t) =>
      supabase
        .from('asset')
        .select('tag_no, description, asset_class, capitalized_on, cost, nbv, far_qty, method')
        .gt('cost', 0)
        .order('tag_no')
        .range(f, t)
    );
    const verifs = await fetchAll<VerifRow>((f, t) =>
      supabase.from('verification').select('*').order('created_at').range(f, t)
    );
    const photos = await fetchAll<{ verification_id: string; file_path: string }>((f, t) =>
      supabase.from('photo').select('verification_id, file_path').range(f, t)
    );
    const verifIds = await fetchAll<{ id: string; tag_no: string }>((f, t) =>
      supabase.from('verification').select('id, tag_no').range(f, t)
    );
    const { data: profiles } = await supabase.from('profiles').select('id, full_name');
    const { data: locs } = await supabase.from('location').select('id, building, floor, room');
    const { data: fnf } = await supabase.from('found_not_in_far').select('*').order('created_at');
    const { data: docs } = await supabase.from('doc_check').select('*').order('created_at');

    const nameOf = new Map((profiles || []).map((p) => [p.id, p.full_name as string]));
    const locOf = new Map((locs || []).map((l) => [l.id, l]));
    const tagOfVerif = new Map(verifIds.map((v) => [v.id, v.tag_no]));
    const photosByTag = new Map<string, number>();
    photos.forEach((p) => {
      const tag = tagOfVerif.get(p.verification_id);
      if (tag) photosByTag.set(tag, (photosByTag.get(tag) || 0) + 1);
    });

    const verifsByTag = new Map<string, VerifRow[]>();
    verifs.forEach((v) => {
      const arr = verifsByTag.get(v.tag_no) || [];
      arr.push(v);
      verifsByTag.set(v.tag_no, arr);
    });

    const wb = await loadTemplate('FA_Count_Verification_Sheet.xlsx');

    // ---------- Count Sheet (row 4 onward; A-I from FAR, J-Y inputs, Z & AA formulas stay) ----------
    const ws = wb.getWorksheet('Count Sheet');
    if (!ws) throw new Error('Template is missing the "Count Sheet" tab');

    const countable = assets.filter((a) => a.method !== 'Document');
    const first = 4;
    const lastTemplateRow = ws.rowCount;

    // Clear everything the counters would fill, including sample data in the template
    for (let r = first; r <= lastTemplateRow; r++) {
      const row = ws.getRow(r);
      for (let c = 1; c <= 25; c++) {
        const cell = row.getCell(c);
        if (cell.type !== 6 /* formula */) cell.value = null;
      }
    }

    countable.forEach((a, i) => {
      const r = first + i;
      const row = ws.getRow(r);
      const set = (col: number, v: string | number | Date | null) => {
        row.getCell(col).value = v;
      };
      set(1, i + 1);
      set(2, a.tag_no);
      set(3, a.description);
      set(4, a.asset_class);
      set(5, toDate(a.capitalized_on));
      set(6, Number(a.cost));
      set(7, Number(a.nbv));
      set(8, Number(a.far_qty));
      set(9, a.method);

      const rows = verifsByTag.get(a.tag_no);
      if (rows && rows.length) {
        const lead = rows[0];
        const rooms = rows.map((v) => (v.location_id ? locOf.get(v.location_id) : null)).filter(Boolean) as Array<{
          building: string; floor: string; room: string;
        }>;
        const foundYes = rows.filter((v) => v.found === 'Yes');
        const found = foundYes.length ? 'Yes' : lead.found;
        const qty = foundYes.length ? foundYes.reduce((n, v) => n + Number(v.physical_qty), 0) : Number(lead.physical_qty);
        const detail = foundYes[0] || lead;
        set(10, found);
        set(11, toDate(lead.count_date));
        set(12, lead.counter_id ? nameOf.get(lead.counter_id) || '' : '');
        set(13, [...new Set(rooms.map((x) => x.building))].join('; '));
        set(14, [...new Set(rooms.map((x) => x.floor))].join('; '));
        set(15, [...new Set(rooms.map((x) => x.room))].join('; '));
        set(16, detail.department);
        set(17, detail.custodian);
        set(18, detail.tag_status);
        set(19, (detail.remarks || '').match(/New tag: ([^|]+)/)?.[1]?.trim() || null);
        set(20, detail.brand_model);
        set(21, qty);
        set(22, detail.condition);
        set(23, detail.in_use ? 'Yes' : 'No');
        const n = photosByTag.get(a.tag_no) || 0;
        set(24, n ? `${n} photo${n > 1 ? 's' : ''} in evidence store` : null);
        set(25, (detail.remarks || '').replace(/\s*\|?\s*New tag: [^|]+/, '').trim() || null);
        // 28 Reviewed By, 29 Client Explanation
        const reviewer = rows.find((v) => v.reviewed_by)?.reviewed_by;
        set(28, reviewer ? nameOf.get(reviewer) || '' : null);
        set(29, rows.map((v) => v.client_explanation).filter(Boolean).join(' / ') || null);
      }
      row.commit?.();
    });

    // If the FAR has fewer assets than the template had rows, blank the unused tail
    for (let r = first + countable.length; r <= lastTemplateRow; r++) {
      const row = ws.getRow(r);
      for (let c = 1; c <= 29; c++) {
        const cell = row.getCell(c);
        if (cell.type !== 6) cell.value = null;
      }
    }

    // ---------- Found Not in FAR ----------
    const wf = wb.getWorksheet('Found Not in FAR');
    if (wf) {
      for (let r = 4; r <= wf.rowCount; r++) {
        for (const c of [2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]) {
          const cell = wf.getRow(r).getCell(c);
          if (cell.type !== 6) cell.value = null;
        }
      }
      (fnf || []).forEach((f, i) => {
        const row = wf.getRow(4 + i);
        const l = f.location_id ? locOf.get(f.location_id) : null;
        row.getCell(1).value = i + 1;
        row.getCell(2).value = toDate(String(f.created_at).slice(0, 10));
        row.getCell(3).value = f.logged_by ? nameOf.get(f.logged_by) || '' : '';
        row.getCell(4).value = l?.building || '';
        row.getCell(5).value = l?.floor || '';
        row.getCell(6).value = l?.room || '';
        row.getCell(7).value = f.tag_found || null;
        row.getCell(9).value = f.description;
        row.getCell(10).value = f.brand_model;
        row.getCell(11).value = f.serial_no;
        row.getCell(12).value = f.probable_class;
        row.getCell(13).value = Number(f.qty);
        row.getCell(14).value = f.condition;
        row.getCell(15).value = f.photo_path ? 'Photo in evidence store' : null;
        row.getCell(16).value = f.remarks || null;
        row.getCell(17).value = f.client_explanation || null;
        row.getCell(18).value = f.resolution || null;
      });
    }

    // ---------- Land, AUC & Clearing ----------
    const wl = wb.getWorksheet('Land, AUC & Clearing');
    if (wl) {
      const docAssets = assets.filter((a) => a.method === 'Document');
      const docsByTag = new Map<string, NonNullable<typeof docs>[number]>();
      (docs || []).forEach((d) => docsByTag.set(d.tag_no, d));
      for (let r = 4; r <= wl.rowCount; r++) {
        for (let c = 1; c <= 14; c++) {
          const cell = wl.getRow(r).getCell(c);
          if (cell.type !== 6) cell.value = null;
        }
      }
      docAssets.forEach((a, i) => {
        const row = wl.getRow(4 + i);
        const d = docsByTag.get(a.tag_no);
        row.getCell(1).value = i + 1;
        row.getCell(2).value = a.tag_no;
        row.getCell(3).value = a.description;
        row.getCell(4).value = a.asset_class;
        row.getCell(5).value = toDate(a.capitalized_on);
        row.getCell(6).value = Number(a.cost);
        row.getCell(7).value = Number(a.nbv);
        if (d) {
          row.getCell(8).value = d.check_type;
          row.getCell(9).value = d.document_ref;
          row.getCell(10).value = toDate(d.check_date);
          row.getCell(11).value = d.checked_by ? nameOf.get(d.checked_by) || '' : '';
          row.getCell(13).value = d.progress_pct !== null ? Number(d.progress_pct) : null;
          row.getCell(14).value = d.remarks;
        }
      });
    }

    const stamp = new Date().toISOString().slice(0, 10);
    return await workbookResponse(wb, `FA_Count_Verification_Sheet_${stamp}.xlsx`);
  } catch (err: unknown) {
    console.error('Count sheet export error:', err);
    return NextResponse.json({ error: (err as Error).message || 'Export failed' }, { status: 500 });
  }
}
