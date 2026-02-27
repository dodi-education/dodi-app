import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { createClient } from "@/lib/supabase/server";
import {
  getConfiguredProviders,
  addProvider,
  removeProvider,
  getModelConfig,
} from "@/lib/services/ai-providers";

const AddProviderSchema = z.object({
  provider: z.enum(["gemini", "openai", "anthropic", "xai"]),
  apiKey: z.string().min(1),
});

const RemoveProviderSchema = z.object({
  provider: z.enum(["gemini", "openai", "anthropic", "xai"]),
});

export async function GET(): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const providers = await getConfiguredProviders(supabase, user.id);
    const modelConfig = await getModelConfig(supabase, user.id);
    return NextResponse.json({ providers, modelConfig });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch providers" },
      { status: 500 },
    );
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
  const result = AddProviderSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.issues },
      { status: 400 },
    );
  }

  try {
    await addProvider(supabase, user.id, result.data.provider, result.data.apiKey);
    const providers = await getConfiguredProviders(supabase, user.id);
    const modelConfig = await getModelConfig(supabase, user.id);
    return NextResponse.json({ providers, modelConfig }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to add provider";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: unknown = await request.json();
  const result = RemoveProviderSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.issues },
      { status: 400 },
    );
  }

  try {
    await removeProvider(supabase, user.id, result.data.provider);
    const providers = await getConfiguredProviders(supabase, user.id);
    const modelConfig = await getModelConfig(supabase, user.id);
    return NextResponse.json({ providers, modelConfig });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to remove provider";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
