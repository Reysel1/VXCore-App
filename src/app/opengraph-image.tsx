import { ImageResponse } from "next/og";
import { join } from "node:path";
import { readFile } from "node:fs/promises";

export const alt = "VXCore — Panel de control para servidores FiveM";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const GROUND = "#090a0c";
const GOLD = "#d6b36a";
const INK = "#f5f2ea";
const MUTED = "rgba(245, 242, 234, 0.58)";

const SITE_HOST = (process.env.NEXT_PUBLIC_SITE_URL || "github.com/Reysel1/VXCore-App")
  .replace(/^https?:\/\//, "")
  .replace(/\/+$/, "");

const markSrc = `data:image/png;base64,${await readFile(
  join(process.cwd(), "public", "vertex", "logo-mark.png"),
  "base64"
)}`;

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: GROUND,
          padding: "76px 84px",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            display: "flex",
            top: -280,
            right: -220,
            width: 760,
            height: 760,
            backgroundImage:
              "radial-gradient(circle, rgba(214,179,106,0.22) 0%, rgba(214,179,106,0.07) 45%, rgba(9,10,12,0) 70%)",
          }}
        />

        <div style={{ display: "flex", alignItems: "center" }}>
          <img src={markSrc} width={128} height={128} alt="" />
          <div style={{ display: "flex", flexDirection: "column", marginLeft: 34 }}>
            <div
              style={{
                display: "flex",
                fontSize: 86,
                color: INK,
                letterSpacing: -2,
                lineHeight: 1,
              }}
            >
              VXCore
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 25,
                color: GOLD,
                letterSpacing: 9,
                marginTop: 12,
              }}
            >
              PANEL DE CONTROL
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              width: 104,
              height: 4,
              backgroundColor: GOLD,
              marginBottom: 30,
            }}
          />
          <div
            style={{
              display: "flex",
              fontSize: 46,
              color: INK,
              lineHeight: 1.22,
              maxWidth: 1032,
            }}
          >
            Tu servidor de FiveM, en tiempo real
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 27,
              color: MUTED,
              marginTop: 18,
              lineHeight: 1.4,
              maxWidth: 1032,
            }}
          >
            Jugadores, consola, recursos, sanciones y base de datos desde un solo sitio.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: `1px solid rgba(214,179,106,0.18)`,
            paddingTop: 26,
          }}
        >
          <div style={{ display: "flex", fontSize: 23, color: MUTED, letterSpacing: 1 }}>
            {SITE_HOST}
          </div>
          <div style={{ display: "flex", fontSize: 21, color: GOLD, letterSpacing: 4 }}>
            FIVEM · FXSERVER
          </div>
        </div>
      </div>
    ),
    size
  );
}
