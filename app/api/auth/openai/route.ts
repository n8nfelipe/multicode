import { NextResponse } from "next/server";
import { getOpenAIAuthStatus, loginWithOpenAI } from "../../../../lib/openai-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await getOpenAIAuthStatus());
}

export async function POST() {
  try {
    return NextResponse.json(await loginWithOpenAI());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível concluir o login com a conta OpenAI." },
      { status: 400 },
    );
  }
}
