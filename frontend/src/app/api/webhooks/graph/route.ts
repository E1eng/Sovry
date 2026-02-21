import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SECRET_HEADER = 'x-sovry-secret';

type Payload = {
  event: 'RevenueHarvested' | 'RoyaltyRevenueProcessed';
  txHash: string;
  tokenAddress: string;
  amount: string;
  isPostGrad?: boolean;
  blockNumber?: number;
};

function toEventType(payload: Payload) {
  if (payload.event === 'RoyaltyRevenueProcessed') return 'PUSH' as const;
  if (payload.event === 'RevenueHarvested') {
    return payload.isPostGrad ? ('HARVEST_BUYBACK' as const) : ('HARVEST_RESERVE' as const);
  }
  return undefined;
}

function getSupabaseServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase URL/service role key required');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get(SECRET_HEADER);
    if (!process.env.GRAPH_WEBHOOK_SECRET || secret !== process.env.GRAPH_WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const body = (await req.json()) as Payload;
    if (!body?.event || !body.txHash || !body.tokenAddress || !body.amount) {
      return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
    }

    const eventType = toEventType(body);
    if (!eventType) {
      return NextResponse.json({ error: 'unsupported event' }, { status: 400 });
    }

    const amountStr = body.amount;
    const tokenAddress = body.tokenAddress.toLowerCase();
    const supabase = getSupabaseServiceClient();

    // Insert revenue_event (idempotent on unique txHash)
    const { error: insertErr } = await supabase.from('revenue_events').insert({
      tx_hash: body.txHash,
      token_address: tokenAddress,
      amount: amountStr,
      type: eventType,
      block_number: body.blockNumber ?? null,
    });

    if (insertErr && insertErr.message && insertErr.message.toLowerCase().includes('duplicate')) {
      return NextResponse.json({ ok: true, idempotent: true });
    }
    if (insertErr) {
      console.error('[webhook] insert revenue_events failed:', insertErr.message || insertErr);
      return NextResponse.json({ error: 'db insert error' }, { status: 500 });
    }

    if (eventType === 'PUSH') {
      return NextResponse.json({ ok: true });
    }

    // Fetch current totalHarvestedAmount
    const { data: tokenRow, error: selErr } = await supabase
      .from('tokens')
      .select('total_harvested_amount')
      .eq('token_address', tokenAddress)
      .maybeSingle();

    if (selErr) {
      console.error('[webhook] select token failed:', selErr.message || selErr);
      return NextResponse.json({ error: 'db select error' }, { status: 500 });
    }

    const current = tokenRow?.total_harvested_amount ? BigInt(tokenRow.total_harvested_amount) : 0n;
    const next = (current + BigInt(amountStr)).toString();

    const { error: upErr } = await supabase
      .from('tokens')
      .upsert({ token_address: tokenAddress, total_harvested_amount: next }, { onConflict: 'token_address' });

    if (upErr) {
      console.error('[webhook] upsert token failed:', upErr.message || upErr);
      return NextResponse.json({ error: 'db upsert error' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[webhook] handler error:', err);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
