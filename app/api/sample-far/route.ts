import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    // Look for sample file in docs directory
    const filePath = path.join(process.cwd(), 'docs', 'FAR (14.01.26).xlsx');
    
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'Sample file not found' }, { status: 404 });
    }

    const fileBuffer = fs.readFileSync(filePath);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="FAR_14.01.26.xlsx"',
      },
    });
  } catch (err) {
    console.error('Error reading sample FAR:', err);
    return NextResponse.json({ error: 'Failed to load sample FAR file' }, { status: 500 });
  }
}

