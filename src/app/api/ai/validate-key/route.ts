import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Anthropic from "@anthropic-ai/sdk";

import { createClient } from "@/lib/supabase/server";

const ValidateKeySchema = z.object({
  provider: z.enum(["gemini", "openai", "anthropic", "xai"]),
  apiKey: z.string().min(1),
});

async function validateGeminiKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });
    // Lightweight call: count tokens on a tiny string to validate the key
    await model.countTokens("test");
    return { valid: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("API_KEY_INVALID") || message.includes("401") || message.includes("403")) {
      return { valid: false, error: "Invalid API key" };
    }
    return { valid: false, error: message };
  }
}

async function validateAnthropicKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const client = new Anthropic({ apiKey });
    // Lightweight call: count tokens on a tiny message to validate the key
    await client.messages.countTokens({
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "test" }],
    });
    return { valid: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("invalid") || message.includes("401") || message.includes("authentication")) {
      return { valid: false, error: "Invalid API key" };
    }
    return { valid: false, error: message };
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: unknown = await request.json();
  const result = ValidateKeySchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.issues },
      { status: 400 },
    );
  }

  const { provider, apiKey } = result.data;

  switch (provider) {
    case "gemini": {
      const validation = await validateGeminiKey(apiKey);
      return NextResponse.json(validation);
    }
    case "anthropic": {
      const validation = await validateAnthropicKey(apiKey);
      return NextResponse.json(validation);
    }
    default:
      return NextResponse.json(
        { valid: false, error: `Provider "${provider}" is not yet supported` },
        { status: 400 },
      );
  }
}
