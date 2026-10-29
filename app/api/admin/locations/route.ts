import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const adminSupabase = createAdminClient();

    const { data: locations, error } = await adminSupabase
      .from('location')
      .select(`
        id,
        building,
        floor,
        room,
        assigned_counter,
        status,
        areas_not_accessed,
        unaccessed_reason,
        client_rep_name,
        client_rep_designation,
        signed_off_at,
        created_at
      `)
      .order('building', { ascending: true })
      .order('floor', { ascending: true })
      .order('room', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ locations: locations || [] });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ error: error.message || 'Failed to fetch locations' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const adminSupabase = createAdminClient();

    // 1. Ensure an active engagement exists
    let engagementId: string;
    const { data: eng } = await adminSupabase
      .from('engagement')
      .select('id')
      .limit(1)
      .maybeSingle();

    if (eng) {
      engagementId = eng.id;
    } else {
      const { data: newEng } = await adminSupabase
        .from('engagement')
        .insert({
          client_name: 'Remarks HB Limited',
          financial_year: 'FY25',
          far_cutoff_date: '2025-06-30',
        })
        .select('id')
        .single();
      engagementId = newEng!.id;
    }

    const items: Array<{
      building: string;
      floor: string;
      room: string;
      assigned_counter?: string | null;
    }> = Array.isArray(body.locations)
      ? body.locations
      : [
          {
            building: body.building,
            floor: body.floor,
            room: body.room,
            assigned_counter: body.assigned_counter || null,
          },
        ];

    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'No location data provided' }, { status: 400 });
    }

    // Prepare upsert rows
    const rowsToInsert = items
      .filter((l) => l.building && l.floor && l.room)
      .map((l) => ({
        engagement_id: engagementId,
        building: l.building.trim(),
        floor: l.floor.trim(),
        room: l.room.trim(),
        assigned_counter: l.assigned_counter || null,
        status: 'open',
      }));

    if (rowsToInsert.length === 0) {
      return NextResponse.json({ error: 'All location entries must have Building, Floor, and Room' }, { status: 400 });
    }

    const { data: inserted, error: insertErr } = await adminSupabase
      .from('location')
      .upsert(rowsToInsert, { onConflict: 'building,floor,room' })
      .select();

    if (insertErr) {
      throw insertErr;
    }

    return NextResponse.json({
      success: true,
      count: inserted?.length || rowsToInsert.length,
      locations: inserted,
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error('Location API error:', error);
    return NextResponse.json({ error: error.message || 'Failed to save locations' }, { status: 500 });
  }
}

