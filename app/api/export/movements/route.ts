import ExcelJS from 'exceljs';
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/requireRole';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { fetchAll, loadTemplate, toDate, workbookResponse } from '@/lib/export/util';

export const maxDuration = 60;

const ROWS_PER_PAGE = 15;
const FIRST_DATA_ROW = 7; // template: header on row 6, 15 numbered rows 7-21

interface MovementRow {
  tag_no: string;
  from_location_id: string | null;
  to_location_id: string | null;
  issue_date: string | null;
  receive_date: string | null;
  qty: number;
  status: string;
  gate_pass_no: string | null;
  authorized_by: string | null;
  remarks: string | null;
}

// Fills the client's "Asset Movement Register" template: one tab per receiving building/floor, 15 rows a page.
export async function GET() {
  const auth = await requireRole(['admin', 'manager']);
  if (!auth.ok) return auth.response;

  try {
    const supabase = await createServerSupabaseClient();

    const moves = await fetchAll<MovementRow>((f, t) =>
      supabase.from('movement').select('*').order('created_at').range(f, t)
    );
    const { data: locs } = await supabase.from('location').select('id, building, floor, room');
    const assets = await fetchAll<{ tag_no: string; description: string; asset_class: string }>((f, t) =>
      supabase.from('asset').select('tag_no, description, asset_class').range(f, t)
    );
    const verifs = await fetchAll<{ tag_no: string; serial_no: string | null; brand_model: string | null }>((f, t) =>
      supabase.from('verification').select('tag_no, serial_no, brand_model').range(f, t)
    );

    const locOf = new Map((locs || []).map((l) => [l.id, l]));
    const assetOf = new Map(assets.map((a) => [a.tag_no, a]));
    const detailOf = new Map(verifs.map((v) => [v.tag_no, v]));

    const wb = await loadTemplate('Fixed Asset Movement Register_Remarks_HBL.xlsx');
    const tpl = wb.worksheets[0];
    if (!tpl) throw new Error('Template is missing its register sheet');

    // Group by receiving building + floor
    const groups = new Map<string, MovementRow[]>();
    moves.forEach((m) => {
      const to = m.to_location_id ? locOf.get(m.to_location_id) : null;
      const key = to ? `${to.building} - ${to.floor}` : 'Unassigned';
      const arr = groups.get(key) || [];
      arr.push(m);
      groups.set(key, arr);
    });

    if (groups.size === 0) {
      // Nothing logged yet: hand back the blank template
      return await workbookResponse(wb, 'Asset_Movement_Register_blank.xlsx');
    }

    const lastRow = tpl.rowCount;
    const copyPage = (target: ExcelJS.Worksheet, offset: number) => {
      for (let r = 1; r <= lastRow; r++) {
        const src = tpl.getRow(r);
        const dst = target.getRow(r + offset);
        dst.height = src.height;
        src.eachCell({ includeEmpty: true }, (cell, c) => {
          const d = dst.getCell(c);
          d.value = cell.value;
          d.style = JSON.parse(JSON.stringify(cell.style));
        });
      }
      Object.keys((tpl as unknown as { _merges: Record<string, unknown> })._merges || {}).forEach((addr) => {
        const m = (tpl as unknown as { _merges: Record<string, { model: { top: number; left: number; bottom: number; right: number } }> })._merges[addr].model;
        target.mergeCells(m.top + offset, m.left, m.bottom + offset, m.right);
      });
    };

    const usedNames = new Set<string>();
    groups.forEach((rows, key) => {
      let name = key.replace(/[\\/?*[\]:]/g, ' ').slice(0, 28) || 'Register';
      let n = 2;
      while (usedNames.has(name)) name = `${name.slice(0, 25)} ${n++}`;
      usedNames.add(name);

      const ws = wb.addWorksheet(name);
      tpl.columns.forEach((col, i) => {
        ws.getColumn(i + 1).width = col.width;
      });

      const pages = Math.ceil(rows.length / ROWS_PER_PAGE);
      for (let p = 0; p < pages; p++) {
        const offset = p * (lastRow + 1);
        copyPage(ws, offset);
        const a4 = ws.getRow(4 + offset).getCell(1);
        a4.value = `Name of Department/Building/Business Area: ${key}`;

        rows.slice(p * ROWS_PER_PAGE, (p + 1) * ROWS_PER_PAGE).forEach((m, i) => {
          const row = ws.getRow(FIRST_DATA_ROW + offset + i);
          const a = assetOf.get(m.tag_no);
          const d = detailOf.get(m.tag_no);
          const from = m.from_location_id ? locOf.get(m.from_location_id) : null;
          const to = m.to_location_id ? locOf.get(m.to_location_id) : null;
          const place = (l: { building: string; floor: string; room: string } | null | undefined) =>
            l ? `${l.building}, ${l.floor}, ${l.room}` : '';
          const set = (c: number, v: string | number | Date | null) => {
            row.getCell(c).value = v;
          };
          set(1, p * ROWS_PER_PAGE + i + 1);
          set(2, a?.description || m.tag_no);
          set(3, d?.brand_model || null);
          set(4, d?.serial_no || null);
          set(5, m.tag_no);
          set(6, a?.asset_class || null);
          set(8, place(to));
          set(9, toDate(m.receive_date));
          set(10, place(from));
          set(11, toDate(m.issue_date));
          set(12, Number(m.qty));
          set(13, m.status);
          set(14, [m.gate_pass_no ? `Gate pass ${m.gate_pass_no}` : '', m.authorized_by ? `Authorised: ${m.authorized_by}` : '', m.remarks || '']
            .filter(Boolean)
            .join(' · ') || null);
        });
      }
    });

    wb.removeWorksheet(tpl.id);
    const stamp = new Date().toISOString().slice(0, 10);
    return await workbookResponse(wb, `Asset_Movement_Register_${stamp}.xlsx`);
  } catch (err: unknown) {
    console.error('Movement export error:', err);
    return NextResponse.json({ error: (err as Error).message || 'Export failed' }, { status: 500 });
  }
}
