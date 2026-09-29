"use client";

import { useState } from "react";

export default function Home() {
  const [imageUrl, setImageUrl] = useState("");
  const [result, setResult] = useState<{
    originalUrl?: string;
    directViewUrl?: string;
    id?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
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
    } catch (err: any) {
      setError(err.message || "Có lỗi xảy ra");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen p-8 bg-black text-white">
      <h1 className="text-2xl font-bold mb-6">
        Chuyển link ảnh thành link xem trực tiếp
      </h1>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-xl">
        <div>
          <label className="block text-sm mb-1">Link ảnh gốc</label>
          <input
            type="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://globo.sfo2.cdn.digitaloceanspaces.com/..."
            className="w-full rounded bg-zinc-900 border border-zinc-700 px-3 py-2 text-white"
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50"
        >
          {loading ? "Đang xử lý..." : "Tạo link xem trực tiếp"}
        </button>
      </form>

      {error && (
        <div className="mt-6 text-red-400">
          <p className="font-semibold">Lỗi:</p>
          <p>{error}</p>
        </div>
      )}

      {result && (
        <div className="mt-8 space-y-4 max-w-xl">
          <div>
            <p className="text-sm text-zinc-400">Link gốc:</p>
            <a href={result.originalUrl} target="_blank" rel="noreferrer" className="text-blue-400 underline break-all">
              {result.originalUrl}
            </a>
          </div>

          <div>
            <p className="text-sm text-zinc-400">Link xem trực tiếp:</p>
            <a href={result.directViewUrl} target="_blank" rel="noreferrer" className="text-blue-400 underline break-all">
              {result.directViewUrl}
            </a>
          </div>

          {result.directViewUrl && (
            <div>
              <p className="text-sm text-zinc-400 mb-2">Xem trước:</p>
              <img src={result.directViewUrl} alt="preview" className="max-w-full rounded border border-zinc-700" />
            </div>
          )}
        </div>
      )}
    </main>
  );
}
