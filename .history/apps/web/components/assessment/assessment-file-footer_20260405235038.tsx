"use client";

import Image from "next/image";

import { ASSESSMENT_FILE_FOOTER_LAYOUT } from "@/lib/assessment-file-branding";
import { cn } from "@/lib/utils";

type AssessmentFileFooterProps = {
  footerLine: {
    leadingEmoji: string;
    text: string;
    trailingEmoji: string;
  };
  pageNumber: number;
  sealAssetUrl: string;
  themeMode: "light" | "dark";
  className?: string;
};

export function AssessmentFileFooter({
  footerLine,
  pageNumber,
  sealAssetUrl,
  themeMode,
  className,
}: AssessmentFileFooterProps) {
  const dark = themeMode === "dark";
  const sideAnchorSize = ASSESSMENT_FILE_FOOTER_LAYOUT.sideAnchorSizePx;
  const sideAnchorSizeClassName =
    sideAnchorSize >= 96 ? "h-24 w-24" : "h-20 w-20";
  const sealImageStyle = {
    padding: `${ASSESSMENT_FILE_FOOTER_LAYOUT.sealImagePaddingPx}px`,
    transform: `scale(${ASSESSMENT_FILE_FOOTER_LAYOUT.sealImageScale})`,
    transformOrigin: "center",
  } as const;
  const footerTextStyle = {
    fontFamily: ASSESSMENT_FILE_FOOTER_LAYOUT.footerTextFontFamily,
    maxWidth: `${ASSESSMENT_FILE_FOOTER_LAYOUT.footerTextMaxWidthPx}px`,
  } as const;
  const pageArcViewBox = ASSESSMENT_FILE_FOOTER_LAYOUT.pageArcViewBox;
  const pageArcCenter = pageArcViewBox / 2;
  /* Keep footer anchors physically LTR even when nested inside RTL containers.
     This protects the shared contract: seal at left, page badge at right. */
  const footerDirectionStyle = {
    direction: "ltr",
    unicodeBidi: "isolate",
  } as const;

  return (
    <footer
      /* The support page is forced to RTL for Arabic body copy, but the shared footer anchors
         must stay physically stable on every page: seal at left and page badge at right. */
      dir="ltr"
      style={footerDirectionStyle}
      className={cn(
        "mt-auto flex items-center gap-[0.85rem] rounded-[1.65rem] border px-4 py-2.5",
        dark
          ? "border-emerald-200/15 bg-[linear-gradient(180deg,rgba(4,13,27,0.97),rgba(3,10,22,0.92))] text-white shadow-[inset_0_0_0_1px_rgba(94,234,212,0.12),0_12px_28px_rgba(1,4,14,0.18)]"
          : "border-emerald-700/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(246,251,249,0.82))] text-slate-900 shadow-[inset_0_0_0_1px_rgba(15,118,110,0.08),0_10px_22px_rgba(15,23,42,0.06)]",
        className,
      )}
    >
      {/* This shared file footer keeps the left seal, centered Arabic attribution line, and
          right page-number arc on one baseline so detached preview pages and paged exports stay
          visually aligned instead of drifting into separate footer treatments. */}
      <span
        className={cn(
          "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border",
          sideAnchorSizeClassName,
          dark
            ? "border-emerald-200/20 bg-white/5.5"
            : "border-emerald-700/12 bg-white/80",
        )}
      >
        <Image
          src={sealAssetUrl}
          alt=""
          fill
          sizes={`${sideAnchorSize}px`}
          className="object-contain"
          style={sealImageStyle}
        />
      </span>

      <div className="min-w-0 flex-1 overflow-hidden text-center" dir="rtl">
        <p
          className={cn(
            "inline-flex flex-wrap items-center justify-center gap-1.5 text-center text-[0.68rem] font-semibold leading-[1.35] sm:text-[0.72rem]",
            dark ? "text-white/88" : "text-slate-800/90",
          )}
        >
          <span className="shrink-0">{footerLine.leadingEmoji}</span>
          {/* Footer attribution text stays shared across preview/result/export surfaces.
              Keep this center block readable and wrap-safe for Arabic without creating a second
              footer wording path in another renderer. */}
          <span className="min-w-0 whitespace-normal text-balance" style={footerTextStyle}>
            {footerLine.text}
          </span>
          <span className="shrink-0">{footerLine.trailingEmoji}</span>
        </p>
      </div>

      <span
        className={cn(
          "relative flex shrink-0 items-center justify-center",
          sideAnchorSizeClassName,
        )}
      >
        <svg
          aria-hidden="true"
          viewBox={`0 0 ${pageArcViewBox} ${pageArcViewBox}`}
          className="absolute inset-0 h-full w-full"
        >
          <circle
            cx={pageArcCenter}
            cy={pageArcCenter}
            r={ASSESSMENT_FILE_FOOTER_LAYOUT.pageArcRadius}
            fill="none"
            stroke={dark ? "rgba(220,255,249,0.92)" : "#0f766e"}
            strokeWidth={ASSESSMENT_FILE_FOOTER_LAYOUT.pageArcStrokeWidth}
            strokeDasharray={ASSESSMENT_FILE_FOOTER_LAYOUT.pageArcDashArray}
            strokeLinecap="round"
            transform={`rotate(${ASSESSMENT_FILE_FOOTER_LAYOUT.pageArcRotation} ${pageArcCenter} ${pageArcCenter})`}
          />
        </svg>
        <span
          className={cn(
            "relative text-[1.08rem] font-black tracking-[0.16em]",
            dark ? "text-emerald-50" : "text-emerald-700",
          )}
        >
          {pageNumber}
        </span>
      </span>
    </footer>
  );
}
