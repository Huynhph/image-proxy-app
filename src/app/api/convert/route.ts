import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 5 * 1024 * 1024;

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong Vercel Environment Variables."
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function extensionFromContentType(contentType: string) {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  if (contentType.includes("gif")) return "gif";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("svg")) return "svg";
  return "bin";
}

function getAppBaseUrl(req: NextRequest) {
  const forwardedProto = req.headers.get("x-forwarded-proto") || "https";
  const forwardedHost = req.headers.get("x-forwarded-host") || req.headers.get("host");

  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`;
  return new URL(req.url).origin;
}

export async function POST(req: NextRequest) {
  let uploadedPath: string | null = null;

  try {
    const { imageUrl } = await req.json();

    if (!imageUrl || typeof imageUrl !== "string") {
      return NextResponse.json({ error: "Thiếu tham số imageUrl." }, { status: 400 });
    }

    try {
      const sourceUrl = new URL(imageUrl);
      if (!/^https?:$/.test(sourceUrl.protocol)) throw new Error("Invalid protocol");
    } catch {
      return NextResponse.json(
        { error: "imageUrl không hợp lệ. Chỉ hỗ trợ HTTP/HTTPS URL." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const appBaseUrl = getAppBaseUrl(req);
    const { data: existing, error: existingError } = await supabase
      .from("image_links")
      .select("id, direct_url")
      .eq("original_url", imageUrl)
      .maybeSingle();

    if (existingError) {
      throw new Error(`Không thể kiểm tra dữ liệu đã lưu: ${existingError.message}`);
    }

    if (existing) {
      return NextResponse.json({
        originalUrl: imageUrl,
        directViewUrl: existing.direct_url,
        agentViewUrl: `${appBaseUrl}/api/image/${existing.id}`,
        id: existing.id,
        cached: true,
      });
    }

    const imageRes = await fetch(imageUrl, {
      headers: { "User-Agent": "Zanvis-Image-Proxy/1.0" },
    });

    if (!imageRes.ok) {
      return NextResponse.json(
        { error: `Không tải được ảnh gốc (HTTP ${imageRes.status}).` },
        { status: 502 }
      );
    }

    const contentType = (imageRes.headers.get("content-type") || "")
      .split(";")[0]
      .toLowerCase();

    if (!contentType.startsWith("image/")) {
      return NextResponse.json(
        { error: `URL không trả về ảnh hợp lệ (content-type: ${contentType || "không xác định"}).` },
        { status: 400 }
      );
    }

    const declaredSize = Number(imageRes.headers.get("content-length") || 0);
    if (declaredSize > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Ảnh vượt giới hạn 5MB." }, { status: 413 });
    }

    const buffer = Buffer.from(await imageRes.arrayBuffer());
    if (!buffer.length) {
      return NextResponse.json({ error: "Ảnh gốc rỗng." }, { status: 400 });
    }
    if (buffer.length > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Ảnh vượt giới hạn 5MB." }, { status: 413 });
    }

    const fileName = `${randomUUID()}.${extensionFromContentType(contentType)}`;
    uploadedPath = fileName;

    const { error: uploadError } = await supabase.storage
      .from("images")
      .upload(fileName, buffer, {
        contentType,
        cacheControl: "31536000",
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Supabase Storage: ${uploadError.message}`);
    }

    const { data: publicUrlData } = supabase.storage
      .from("images")
      .getPublicUrl(fileName);

    const { data: savedImage, error: insertError } = await supabase
      .from("image_links")
      .insert({
        original_url: imageUrl,
        direct_url: publicUrlData.publicUrl,
        file_name: fileName,
        content_type: contentType,
        file_size: buffer.length,
        lead_id: null,
      })
      .select("id, original_url, direct_url, lead_id, created_at")
      .single();

    if (insertError) {
      await supabase.storage.from("images").remove([fileName]);
      uploadedPath = null;
      throw new Error(`Không thể lưu metadata vào image_links: ${insertError.message}`);
    }

    return NextResponse.json({
      originalUrl: savedImage.original_url,
      directViewUrl: savedImage.direct_url,
      agentViewUrl: `${appBaseUrl}/api/image/${savedImage.id}`,
      id: savedImage.id,
      leadId: savedImage.lead_id,
      createdAt: savedImage.created_at,
      cached: false,
    });
  } catch (error) {
    if (uploadedPath) {
      try {
        const supabase = getSupabaseAdmin();
        await supabase.storage.from("images").remove([uploadedPath]);
      } catch {
        // Keep original error response when cleanup fails.
      }
    }

    const message = error instanceof Error ? error.message : "Lỗi server khi xử lý ảnh.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
