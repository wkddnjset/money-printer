import { NextResponse } from "next/server";
import { fetchBalance } from "@/engine/ExchangeConnector";

export async function GET() {
  try {
    const balances = await fetchBalance();
    return NextResponse.json({ balances });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
