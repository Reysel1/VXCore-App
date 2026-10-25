"use client";

import { useState } from "react";
import Image from "next/image";

export function VXLogo({
  size = 32,
  className = "",
  rounded = "rounded-lg",
  alt = "VXCore",
}: {
  size?: number;
  className?: string;
  rounded?: string;
  alt?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span
        style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
        className={`inline-flex shrink-0 select-none items-center justify-center bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-600 font-extrabold tracking-tight text-white shadow-sm ${rounded} ${className}`}
        aria-hidden
      >
        VX
      </span>
    );
  }

  return (
    <Image
      src="/vertex/logo-mark.png"
      alt={alt}
      width={size}
      height={size}
      unoptimized
      onError={() => setFailed(true)}
      style={{ width: size, height: size }}
      className={`shrink-0 ${className}`}
    />
  );
}
