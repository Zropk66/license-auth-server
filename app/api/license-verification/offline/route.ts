import { NextRequest, NextResponse } from 'next/server';
import { decryptData, encryptData } from '@/lib/encryption';
import prisma from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const encryptedData = await req.text();

    if (!encryptedData) {
      return NextResponse.json(
        { error: 'Missing encrypted data' },
        { status: 400 }
      );
    }

    let decryptedData: any;
    try {
      decryptedData = decryptData(encryptedData);
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid encrypted data' },
        { status: 400 }
      );
    }

    const { licenseKey, hardwareId, sessionId } = decryptedData;

    if (!licenseKey) {
      return encryptedResponse(
        { error: 'License key is required' },
        400
      );
    }

    const session = await prisma.session.findFirst({
      where: {
        id: sessionId || undefined,
        licenseKey,
        hardwareId: hardwareId || null,
        status: 'active',
      },
    });

    if (!session) {
      return encryptedResponse(
        { error: 'Session not found or parameter mismatch' },
        404
      );
    }

    const now = new Date();
    await prisma.session.update({
      where: { id: session.id },
      data: {
        status: 'terminated',
        terminatedAt: now,
        lastHeartbeat: now,
      },
    });

    return encryptedResponse({ success: true, message: 'Offline reported successfully' });

  } catch (error) {
    console.error('Offline report error:', error);
    return encryptedResponse(
      { error: 'An unexpected error occurred' },
      500
    );
  }
}

function encryptedResponse(data: any, status = 200) {
  const encrypted = encryptData(data);
  return new NextResponse(encrypted, {
    status,
    headers: {
      'Content-Type': 'text/plain',
    },
  });
}
