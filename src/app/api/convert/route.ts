import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export const POST = async (req: NextRequest) => {
  try {
    const body = await req.json();
    const imageUrl = body.imageUrl as string | undefined;

    if (!imageUrl || typeof imageUrl !== "string") {
      return NextResponse.json({ error: "Thiếu tham số imageUrl" }, { status: 400 });
    }

    // Kiểm tra xem URL đã tồn tại chưa
    const { data: existing } = await supabase
      .from("image_links")
      .select("id, direct_url")
      .eq("original_url", imageUrl)
      .single();

    if (existing) {
      return NextResponse.json({
        originalUrl: imageUrl,
        directViewUrl: existing.direct_url,
        id: existing.id,
        cached: true,
      });
    }

    // Tải ảnh từ URL gốc
    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) {
      return NextResponse.json(
        { error: "Không tải được ảnh từ link gốc" },
        { status: 502 }
      );
    }

    const contentType = imageRes.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      return NextResponse.json({ error: "Link không phải là ảnh" }, { status: 400 });
    }

    const ext =
      contentType.includes("png")
        ? "png"
        : contentType.includes("jpeg") || contentType.includes("jpg")
        ? "jpg"
        : contentType.includes("gif")
        ? "gif"
        : contentType.includes("webp")
        ? "webp"
        : "bin";

    const buffer = Buffer.from(await imageRes.arrayBuffer());
    const fileName = `${randomUUID()}.${ext}`;

    // Upload lên Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("images")
      .upload(fileName, buffer, {
        contentType,
        upsert: false,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return NextResponse.json(
        { error: "Lỗi khi upload ảnh lên storage" },
        { status: 500 }
      );
    }

    // Lấy public URL
    const { data: urlData } = supabase.storage
      .from("images")
      .getPublicUrl(fileName);

    const directUrl = urlData.publicUrl;

    // Lưu vào database
    const { data: dbData, error: dbError } = await supabase
      .from("image_links")
      .insert({
        original_url: imageUrl,
        direct_url: directUrl,
        file_name: fileName,
        content_type: contentType,
        file_size: buffer.length,
        lead_id: null,
      })
      .select()
      .single();

    if (dbError) {
      console.error("DB error:", dbError);
      return NextResponse.json(
        { error: "Lỗi khi lưu vào database" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      originalUrl: imageUrl,
      directViewUrl: directUrl,
      id: dbData.id,
      cached: false,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Lỗi server khi xử lý ảnh" },
      { status: 500 }
    );
  }
};
