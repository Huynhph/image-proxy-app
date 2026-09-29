import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 60;

const GEMINI_MODEL = "gemini-3.8-flash";
const DEFAULT_PROMPT = `Phân tích ảnh marketing này và chỉ trả về JSON hợp lệ theo schema được yêu cầu. Không dùng markdown. Nếu không xác định được dữ liệu, dùng null hoặc mảng rỗng.`;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING" },
    visibleText: { type: "ARRAY", items: { type: "STRING" } },
    language: { type: "STRING", nullable: true },
    containsPerson: { type: "BOOLEAN" },
    containsProduct: { type: "BOOLEAN" },
    creativeType: { type: "STRING", nullable: true },
    callToAction: { type: "STRING", nullable: true },
    qualityNotes: { type: "STRING", nullable: true },
  },
  required: [
    "summary",
    "visibleText",
    "language",
    "containsPerson",
    "containsProduct",
    "creativeType",
    "callToAction",
    "qualityNotes",
  ],
};

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase server configuration is missing.");
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const prompt = typeof body.prompt === "string" && body.prompt.trim()
      ? body.prompt.trim()
      : DEFAULT_PROMPT;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Thiếu GEMINI_API_KEY trong Vercel Environment Variables." },
        { status: 500 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: image, error: imageError } = await supabase
      .from("image_links")
      .select("id, file_name, content_type, file_size")
      .eq("id", id)
      .maybeSingle();

    if (imageError) {
      throw new Error(`Không thể đọc metadata ảnh: ${imageError.message}`);
    }

    if (!image) {
      return NextResponse.json({ error: "Không tìm thấy ảnh." }, { status: 404 });
    }

    const { data: file, error: downloadError } = await supabase.storage
      .from("images")
      .download(image.file_name);

    if (downloadError || !file) {
      throw new Error(`Không thể tải ảnh từ storage: ${downloadError?.message || "Unknown error"}`);
    }

    const mimeType = image.content_type || file.type || "image/png";
    const binary = Buffer.from(await file.arrayBuffer());
    const base64 = binary.toString("base64");

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType,
                    data: base64,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
            maxOutputTokens: 600,
          },
        }),
      }
    );

    const geminiData = await geminiResponse.json();

    if (!geminiResponse.ok) {
      console.error("Gemini API error:", geminiData);
      return NextResponse.json(
        {
          error: "Gemini API trả về lỗi.",
          details: geminiData?.error?.message || "Unknown Gemini API error",
        },
        { status: 502 }
      );
    }

    const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return NextResponse.json(
        { error: "Gemini không trả về nội dung phân tích.", details: geminiData },
        { status: 502 }
      );
    }

    let analysis: unknown;
    try {
      analysis = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: "Gemini không trả về JSON hợp lệ.", rawResponse: text },
        { status: 502 }
      );
    }

    return NextResponse.json({
      imageId: image.id,
      fileName: image.file_name,
      mimeType,
      fileSize: image.file_size,
      model: GEMINI_MODEL,
      analysis,
    });
  } catch (error) {
    console.error("Gemini image analysis error:", error);
    const message = error instanceof Error ? error.message : "Lỗi server khi phân tích ảnh.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
