import Image from "next/image";
import { Crown, Sparkles, Stars } from "lucide-react";

import { getRequestUiContext } from "@/lib/server/request-context";

const HALL_OF_HONOR_COPY = {
  en: {
    eyebrow: "Hall of Honor",
    title: "A tribute to the leadership and dedication behind Zootopia Club",
    subtitle:
      "Two honored names. One clear hierarchy. One shared legacy of service to science students.",
    featuredBadge: "Main Featured Honoree",
    featuredRole: "Primary Permanent Admin · Founder · Platform Owner · Main Developer",
    featuredTagline: "Vision, ownership, and long-term leadership",
    secondaryBadge: "Honored Supporting Presence",
    secondaryRole: "Assistant and trusted supporting presence",
    secondaryTagline: "Loyal support with respected contribution",
  },
  ar: {
    eyebrow: "قاعة الشرف",
    title: "تكريم للقيادة والإخلاص خلف منصة زوتوبيا كلوب",
    subtitle: "اسمان مكرمان. هرمية واضحة. وإرث مشترك في خدمة طلاب العلوم.",
    featuredBadge: "المكرم الرئيسي",
    featuredRole: "الأدمن الأساسي الدائم · المؤسس · مالك المنصة · المطور الرئيسي",
    featuredTagline: "رؤية وملكية وقيادة طويلة المدى",
    secondaryBadge: "حضور داعم مكرم",
    secondaryRole: "مساعد وحضور داعم موثوق",
    secondaryTagline: "دعم مخلص بإسهام محترم",
  },
} as const;

export default async function HallOfHonorPage() {
  const { locale } = await getRequestUiContext();
  const content = HALL_OF_HONOR_COPY[locale];

  return (
    <div className="space-y-6">
      <section className="surface-card relative overflow-hidden px-6 py-7 sm:px-8 sm:py-9 lg:px-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(242,198,106,0.2),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.14),transparent_34%)]" />
        <div className="relative space-y-4">
          <p className="section-label">{content.eyebrow}</p>
          <h1 className="page-title max-w-5xl text-balance">{content.title}</h1>
          <p className="page-subtitle max-w-3xl">{content.subtitle}</p>
        </div>
      </section>

      {/* Featured-first composition is intentional: Elmahdy must remain the visual hero and
          future refinements must preserve this hierarchy instead of flattening both profiles equally. */}
      <section className="grid gap-6">
        <article className="surface-card relative mx-auto w-full max-w-6xl overflow-hidden px-6 py-8 sm:px-8 sm:py-10">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(242,198,106,0.22),transparent_38%),radial-gradient(circle_at_bottom,rgba(16,185,129,0.14),transparent_36%)]" />
          <div className="relative grid gap-7 lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.2fr)] lg:items-center">
            {/* Keep this circular portrait treatment rich and stable across breakpoints.
                The gold ring, layered halo, and centered crop are part of the premium featured identity. */}
            <div className="mx-auto">
              <div className="relative h-56 w-56 sm:h-64 sm:w-64">
                <div className="absolute inset-0 rounded-full border-2 border-gold/70 bg-gold/10 shadow-[0_0_0_8px_rgba(242,198,106,0.15)]" />
                <div className="absolute inset-4 overflow-hidden rounded-full border border-white/45 shadow-2xl dark:border-white/15">
                  <Image
                    src="/elmahdy1.jpeg"
                    alt="Elmahdy Abdallah Yousef"
                    fill
                    sizes="(max-width: 640px) 224px, 256px"
                    className="object-cover"
                    priority
                  />
                </div>
                <div className="absolute -top-2 -right-2 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-gold/45 bg-gold/20 text-gold">
                  <Crown className="h-5 w-5" />
                </div>
              </div>
            </div>

            <div className="space-y-4 text-center lg:text-start">
              <span className="inline-flex items-center gap-2 rounded-full border border-gold/35 bg-gold/15 px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-gold">
                <Stars className="h-4 w-4" />
                {content.featuredBadge}
              </span>
              <h2 className="font-[family-name:var(--font-display)] text-3xl font-black tracking-tight text-foreground sm:text-4xl">
                Elmahdy Abdallah Yousef
              </h2>
              <p className="text-sm font-bold uppercase tracking-[0.13em] text-emerald-700 dark:text-emerald-300">
                {content.featuredRole}
              </p>
              <p className="text-base font-semibold text-foreground-muted">{content.featuredTagline}</p>
            </div>
          </div>
        </article>

        {/* Secondary card remains premium and respectful while intentionally less dominant.
            Keep this visual tier below the featured card to preserve tribute hierarchy. */}
        <article className="surface-card relative mx-auto w-full max-w-4xl overflow-hidden px-6 py-7 sm:px-7 sm:py-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.12),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(242,198,106,0.1),transparent_34%)]" />
          <div className="relative grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
            <div className="mx-auto sm:mx-0">
              <div className="relative h-36 w-36">
                <div className="absolute inset-0 rounded-full border border-emerald-400/45 bg-emerald-500/10" />
                <div className="absolute inset-3 overflow-hidden rounded-full border border-white/40 dark:border-white/14">
                  <Image
                    src="/adham.jpg"
                    alt="Adham Essam"
                    fill
                    sizes="(max-width: 640px) 144px, 144px"
                    className="object-cover"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3 text-center sm:text-start">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/12 px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
                <Sparkles className="h-4 w-4" />
                {content.secondaryBadge}
              </span>
              <h2 className="font-[family-name:var(--font-display)] text-2xl font-extrabold tracking-tight text-foreground">
                Adham Essam
              </h2>
              <p className="text-sm font-bold uppercase tracking-[0.12em] text-foreground-muted">
                {content.secondaryRole}
              </p>
              <p className="text-sm font-semibold text-foreground-muted">{content.secondaryTagline}</p>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}