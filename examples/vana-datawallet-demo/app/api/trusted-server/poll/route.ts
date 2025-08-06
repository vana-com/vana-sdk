import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { batchId, serverUrl } = await request.json();
    
    if (!batchId || !serverUrl) {
      return NextResponse.json({ error: 'Missing batchId or serverUrl' }, { status: 400 });
    }

    const personalServerBaseUrl = process.env.NEXT_PUBLIC_PERSONAL_SERVER_BASE_URL;
    
    if (!personalServerBaseUrl) {
      return NextResponse.json({ error: 'Personal server not configured' }, { status: 500 });
    }

    // Poll the trusted server for inference results
    const pollUrl = `${personalServerBaseUrl}/jobs/${batchId}/result`;
    
    const response = await fetch(pollUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json({ 
          status: 'pending', 
          message: 'Inference still in progress' 
        });
      }
      throw new Error(`Server responded with status: ${response.status}`);
    }

    const result = await response.json();

    return NextResponse.json({
      status: 'completed',
      result: result,
      batchId,
    });
  } catch (error) {
    console.error('Trusted server poll error:', error);
    
    // If it's a network error or server unavailable, treat as pending
    if (error instanceof Error && error.message.includes('fetch')) {
      return NextResponse.json({ 
        status: 'pending', 
        message: 'Server temporarily unavailable' 
      });
    }

    return NextResponse.json({ 
      error: 'Failed to poll server',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}