import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabaseAdmin();

    const { data: image, error: imageError } = await supabase
      .from("image_links")
      .select("file_name, content_type, file_size")
      .eq("id", id)
      .maybeSingle();

    if (imageError) {
      console.error("Image metadata lookup error:", imageError);
      return NextResponse.json({ error: "Không thể đọc metadata ảnh." }, { status: 500 });
    }

    if (!image) {
      return NextResponse.json({ error: "Không tìm thấy ảnh." }, { status: 404 });
    }

    const { data: file, error: downloadError } = await supabase.storage
      .from("images")
      .download(image.file_name);

    if (downloadError || !file) {
      console.error("Image download error:", downloadError);
      return NextResponse.json({ error: "Không thể tải ảnh từ storage." }, { status: 502 });
    }

    const binary = await file.arrayBuffer();
    const contentType = image.content_type || file.type || "application/octet-stream";

    return new NextResponse(binary, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(binary.byteLength),
        "Content-Disposition": "inline",
        "Cache-Control": "public, max-age=3600",
        "X-Content-Type-Options": "nosniff",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("Image proxy error:", error);
    return NextResponse.json({ error: "Lỗi server khi trả ảnh." }, { status: 500 });
  }
}
