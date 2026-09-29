"use client";

import { useState } from "react";

type ConvertResult = {
  originalUrl?: string;
  directViewUrl?: string;
  agentViewUrl?: string;
  id?: string;
  cached?: boolean;
};

export default function Home() {
  const [imageUrl, setImageUrl] = useState("");
  const [result, setResult] = useState<ConvertResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    setCopied(false);
    setLoading(true);

    try {
      const res = await fetch("/api/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Lỗi không xác định");
      }

      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setLoading(false);
    }
  };

  const copyAgentUrl = async () => {
    if (!result?.agentViewUrl) return;
    await navigator.clipboard.writeText(result.agentViewUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const previewUrl = result?.agentViewUrl || result?.directViewUrl;

  return (
    <main className="min-h-screen bg-zinc-950 px-5 py-10 text-white sm:px-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold tracking-tight">
          Chuyển link ảnh thành link xem trực tiếp
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          Lưu ảnh vào Supabase Storage và tạo link public dành cho trình duyệt, crawler và AI agent.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          <div>
            <label htmlFor="image-url" className="mb-2 block text-sm font-medium">
              Link ảnh gốc
            </label>
            <input
              id="image-url"
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://globo.sfo2.cdn.digitaloceanspaces.com/..."
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-blue-500"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Đang xử lý..." : "Tạo link xem trực tiếp"}
          </button>
        </form>

        {error && (
          <div className="mt-6 rounded-xl border border-red-900 bg-red-950/50 p-4 text-red-200">
            <p className="font-semibold">Lỗi xử lý ảnh</p>
            <p className="mt-1 text-sm">{error}</p>
          </div>
        )}

        {result && (
          <section className="mt-6 space-y-5 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">Kết quả</h2>
              {result.cached && (
                <span className="rounded-full bg-emerald-950 px-2 py-1 text-xs text-emerald-300">
                  Link có sẵn trong cache
                </span>
              )}
            </div>

            <div>
              <p className="mb-1 text-sm font-medium text-zinc-300">Link gốc</p>
              <a
                href={result.originalUrl}
                target="_blank"
                rel="noreferrer"
                className="break-all text-sm text-blue-400 underline hover:text-blue-300"
              >
                {result.originalUrl}
              </a>
            </div>

            <div>
              <p className="mb-1 text-sm font-medium text-zinc-300">Link Supabase Storage</p>
              <a
                href={result.directViewUrl}
                target="_blank"
                rel="noreferrer"
                className="break-all text-sm text-blue-400 underline hover:text-blue-300"
              >
                {result.directViewUrl}
              </a>
            </div>

            {result.agentViewUrl && (
              <div className="rounded-lg border border-blue-800 bg-blue-950/35 p-4">
                <p className="text-sm font-semibold text-blue-200">
                  Link dành cho AI agent / crawler
                </p>
                <p className="mt-1 text-xs text-blue-200/70">
                  Link này trả trực tiếp binary ảnh qua domain Vercel, không cần cookie hoặc token.
                </p>
                <a
                  href={result.agentViewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 block break-all text-sm text-blue-300 underline hover:text-blue-200"
                >
                  {result.agentViewUrl}
                </a>
                <button
                  type="button"
                  onClick={copyAgentUrl}
                  className="mt-3 rounded-md border border-blue-600 px-3 py-2 text-xs font-semibold text-blue-100 hover:bg-blue-900/60"
                >
                  {copied ? "Đã copy" : "Copy link agent"}
                </button>
              </div>
            )}

            {previewUrl && (
              <div>
                <p className="mb-2 text-sm font-medium text-zinc-300">
                  Xem trước qua {result.agentViewUrl ? "agent link" : "Storage link"}
                </p>
                <img
                  src={previewUrl}
                  alt="Ảnh đã lưu"
                  className="max-h-[560px] max-w-full rounded-lg border border-zinc-700 bg-white object-contain"
                />
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
