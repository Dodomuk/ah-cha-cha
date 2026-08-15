import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 스캐너는 Node 런타임 전용 API(dns, undici dispatcher)를 사용한다.
  // Edge 런타임으로 옮기지 말 것 — SSRF 가드가 동작하지 않는다.
  serverExternalPackages: ["undici"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
