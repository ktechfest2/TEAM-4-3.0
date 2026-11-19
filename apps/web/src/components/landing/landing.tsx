"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";
import { ReactLenis } from "lenis/react";
import "lenis/dist/lenis.css";
import { gsap, ScrollTrigger, SplitText, useGSAP } from "@/lib/gsap";

const NUMBER_DISPLAY = "+1 864 808 9401";
const NUMBER_TEL = "+18648089401";
const REPO = "https://github.com/ktechfest2/TEAM-4-3.0";

const BEATS = [
  {
    time: "6:40 am",
    title: "Her polling unit has moved.",
    body: "INEC moved Amara's polling unit last week. The text message was lost among bank alerts. With Confam, her phone rings instead: a voice tells her the new place, St. Mary's Catholic School, beside the Total filling station.",
    lcd: ["Incoming call", "CONFAM", NUMBER_DISPLAY],
  },
  {
    time: "7:55 am",
    title: "The queue is long. Are the officials coming?",
    body: "She calls Confam and asks in Yoruba. Confam answers from the presiding officer's own check-in: the officials arrived at 7:42 and voting has started.",
    lcd: ["Calling", "CONFAM", "00:12"],
  },
  {
    time: "9:10 am",
    title: "A voice note says there's fighting.",
    body: "Instead of going home, Amara asks Confam. It calls the presiding officer at that polling unit, who is standing right there, then calls Amara back: not true, voting is calm.",
    lcd: ["Missed call? No.", "CONFAM", "Callback"],
  },
  {
    time: "10:30 am",
    title: "Her father can't stand in a queue.",
    body: "Baba is 78 and has an old keypad phone. Confam tells him he doesn't have to queue and can bring a helper he trusts. It tells the officials he's coming, then calls him when they're ready.",
    lcd: ["Incoming call", "CONFAM", "Go now"],
  },
];

const TRANSCRIPT = [
  { who: "Caller", lang: "Yoruba", text: "Ẹ jọ̀ọ́, wọ́n ní wọ́n ń jà ní Ojuelegba. Ṣé òótọ́ ni?" },
  { who: "Confam", lang: "Pidgin", text: "I hear you. Make I check am with the presiding officer for Ojuelegba. I go call you back." },
  { who: "Confam calls the presiding officer", lang: "", text: "“Everything is calm. Voting is going on.”" },
  { who: "Confam calls back", lang: "Pidgin", text: "We don check am. E no true. The presiding officer for Ojuelegba confam am give us." },
];

export function Landing() {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      // Every branch must match something, or the callback never runs (it did not on phones before this fix).
      mm.add({ desktop: "(min-width: 900px)", mobile: "(max-width: 899.98px)", reduce: "(prefers-reduced-motion: reduce)" }, (ctx) => {
        const { desktop, reduce } = ctx.conditions as { desktop: boolean; reduce: boolean };
        if (reduce) {
          gsap.set("[data-reveal]", { autoAlpha: 1 });
          return;
        }

        // 1. Hero: the headline rises line by line inside masks (never at opacity 0: it's the LCP element),
        //    the photo opens like a door, then the call transcript plays out in the order you'd hear it.
        const split = SplitText.create(".hero-title", { type: "lines", mask: "lines" });
        const intro = gsap.timeline({ defaults: { ease: "expo.out" } });
        intro
          .from(split.lines, { yPercent: 110, duration: 1.1, stagger: 0.09 })
          .fromTo(".hero-photo", { clipPath: "inset(8% 18% 8% 18% round 18px)" }, { clipPath: "inset(0% 0% 0% 0% round 18px)", duration: 1.3 }, 0.1)
          .fromTo(".hero-photo img", { scale: 1.18 }, { scale: 1, duration: 1.6 }, 0.1)
          .fromTo(".hero-meta > *", { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.7, stagger: 0.06 }, 0.55);
        gsap.utils.toArray<HTMLElement>(".t-line").forEach((line, i) => {
          intro.fromTo(line, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.5 }, 1.0 + i * 0.75);
          const text = line.querySelector(".t-text");
          if (text) {
            const chars = SplitText.create(text, { type: "words,chars" }).chars;
            intro.from(chars, { autoAlpha: 0, duration: 0.01, stagger: 0.012 }, 1.05 + i * 0.75);
          }
        });
        intro.fromTo(".t-stamp", { autoAlpha: 0, scale: 1.6, rotate: -14 }, { autoAlpha: 1, scale: 1, rotate: -6, duration: 0.45, ease: "expo.out" }, 1.0 + TRANSCRIPT.length * 0.75);

        // 2. Amara's morning: a pinned scene on desktop; each beat swaps text and the phone's screen.
        const beats = gsap.utils.toArray<HTMLElement>(".beat");
        const screens = gsap.utils.toArray<HTMLElement>(".lcd-state");
        const clock = gsap.utils.toArray<HTMLElement>(".beat-dot");
        if (desktop) {
          gsap.set(beats.slice(1), { autoAlpha: 0, y: 30 });
          gsap.set(screens.slice(1), { autoAlpha: 0 });
          const story = gsap.timeline({
            scrollTrigger: { trigger: ".story-pin", start: "top top", end: `+=${beats.length * 85}%`, scrub: 0.6, pin: true, anticipatePin: 1 },
          });
          beats.forEach((beat, i) => {
            if (i === 0) return;
            story
              .to(beats[i - 1]!, { autoAlpha: 0, y: -30, duration: 0.4 }, i)
              .to(screens[i - 1]!, { autoAlpha: 0, duration: 0.2 }, i)
              .to(beat, { autoAlpha: 1, y: 0, duration: 0.4 }, i + 0.15)
              .to(screens[i]!, { autoAlpha: 1, duration: 0.2 }, i + 0.1)
              .to(clock[i]!, { backgroundColor: "var(--l-green)", scale: 1, duration: 0.2 }, i);
          });
          story.to(".phone-body", { rotate: 3, duration: beats.length }, 0);
        } else {
          beats.forEach((beat) =>
            gsap.fromTo(beat, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, scrollTrigger: { trigger: beat, start: "top 85%", once: true } }),
          );
        }

        // 3. Why a phone call: words of the statement brighten as you read them.
        const why = SplitText.create(".why-statement", { type: "words" });
        gsap.fromTo(why.words, { opacity: 0.18 }, { opacity: 1, stagger: 0.05, ease: "none", scrollTrigger: { trigger: ".why-statement", start: "top 78%", end: "bottom 45%", scrub: true } });
        gsap.fromTo(".baba-photo", { clipPath: "inset(0% 0% 100% 0% round 18px)" }, { clipPath: "inset(0% 0% 0% 0% round 18px)", duration: 1.3, scrollTrigger: { trigger: ".baba-photo", start: "top 80%", once: true } });

        // 4. The verification path draws itself between caller, Confam, the officer and the callback.
        const path = document.querySelector<SVGPathElement>(".flow-path");
        if (path) {
          const len = path.getTotalLength();
          gsap.set(path, { strokeDasharray: len, strokeDashoffset: len });
          gsap.to(path, { strokeDashoffset: 0, ease: "none", scrollTrigger: { trigger: ".flow", start: "top 70%", end: "bottom 60%", scrub: true } });
        }
        gsap.utils.toArray<HTMLElement>(".flow-step").forEach((step, i) =>
          gsap.fromTo(step, { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.8, delay: i * 0.08, scrollTrigger: { trigger: ".flow", start: "top 70%", once: true } }),
        );
        gsap.fromTo(".officer-photo img", { yPercent: -8 }, { yPercent: 8, ease: "none", scrollTrigger: { trigger: ".officer-photo", start: "top bottom", end: "bottom top", scrub: true } });

        // 5. The control room screenshot rises and settles as it comes into view.
        gsap.fromTo(".console-shot", { y: 80, scale: 0.94, rotateX: 8 }, { y: 0, scale: 1, rotateX: 0, ease: "none", scrollTrigger: { trigger: ".console-shot", start: "top bottom", end: "top 35%", scrub: true } });

        // 6. Trust rules and the closing call-to-action: quiet staggered entrances, different from the rest.
        gsap.fromTo(".trust-item", { autoAlpha: 0, x: -16 }, { autoAlpha: 1, x: 0, stagger: 0.07, duration: 0.7, scrollTrigger: { trigger: ".trust", start: "top 75%", once: true } });
        gsap.fromTo(".hood-row > *", { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, stagger: 0.06, duration: 0.7, scrollTrigger: { trigger: ".hood", start: "top 70%", once: true } });
        const close = SplitText.create(".close-title", { type: "lines", mask: "lines" });
        gsap.from(close.lines, { yPercent: 110, duration: 1, stagger: 0.1, scrollTrigger: { trigger: ".close-title", start: "top 85%", once: true } });

        // Safety net: nothing stays hidden if a trigger never fires.
        const net = setTimeout(() => ScrollTrigger.refresh(), 600);
        return () => {
          clearTimeout(net);
          split.revert();
          why.revert();
          close.revert();
        };
      });
    },
    { scope: root },
  );

  return (
    <ReactLenis root options={{ lerp: 0.1, anchors: true }}>
      <div ref={root} className="landing min-h-screen overflow-x-clip">
        {/* Header */}
        <header className="mx-auto flex max-w-[1240px] items-center justify-between px-5 py-5 sm:px-8">
          <Link href="/" className="serif text-[1.6rem] tracking-tight" aria-label="Confam home">
            Confam
          </Link>
          <nav aria-label="Main" className="flex items-center gap-5 text-[15px] text-[var(--l-soft)]">
            <a href="#story" className="hidden hover:text-[var(--l-ink)] sm:inline">The story</a>
            <a href="#how" className="hidden hover:text-[var(--l-ink)] sm:inline">How it works</a>
            <a href="#control-room" className="hidden hover:text-[var(--l-ink)] md:inline">Control room</a>
            <a href={`tel:${NUMBER_TEL}`} className="l-btn l-btn-solid py-2 text-[15px]">Call Confam</a>
          </nav>
        </header>

        {/* Hero */}
        <section className="mx-auto grid max-w-[1240px] gap-10 px-5 pb-24 pt-8 sm:px-8 lg:grid-cols-[1.12fr_1fr] lg:gap-14 lg:pt-14">
          <div className="flex flex-col justify-center">
            <p className="hero-meta text-[15px] text-[var(--l-soft)]">
              <span>An election line for Surulere, Lagos</span>
            </p>
            <h1 className="hero-title serif mt-5 text-balance text-[clamp(2.6rem,5.8vw,5.1rem)] font-light leading-[1.03] tracking-[-0.025em]">
              One phone call to know what&apos;s true on election day.
            </h1>
            <div className="hero-meta mt-7 max-w-[34rem] space-y-6">
              <p className="text-[1.15rem] leading-relaxed text-[var(--l-soft)]">
                Call Confam and speak the way you speak at home, in Yoruba, Hausa, Igbo, Pidgin or English. It checks rumours with the officials at the polling unit, calls you when your polling unit moves, and tells you whether officials have arrived. No smartphone, data or reading needed.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <a href={`tel:${NUMBER_TEL}`} className="l-btn l-btn-solid">
                  Call {NUMBER_DISPLAY}
                </a>
                <Link href="/control" className="l-btn l-btn-ghost">
                  Open the INEC control room
                </Link>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="hero-photo relative aspect-[4/5] overflow-hidden rounded-[18px] bg-[var(--l-paper-2)]">
              <Image src="/images/amara.jpg" alt="Amara, a voter in Surulere, listening on a keypad phone outside her polling unit at dawn" fill priority sizes="(min-width: 1024px) 560px, 100vw" className="object-cover object-[60%_center]" />
            </div>
            {/* Signature: the call, as you'd hear it */}
            <figure className="relative -mt-28 ml-auto w-[min(92%,25rem)] rounded-[14px] bg-[var(--l-paper)]/95 p-5 shadow-[0_30px_60px_-30px_rgba(20,33,27,0.45)] ring-1 ring-[var(--l-line)] backdrop-blur-sm sm:-ml-10 lg:absolute lg:-bottom-10 lg:-left-16 lg:mt-0">
              <figcaption className="mb-3 flex items-center justify-between text-[13px] text-[var(--l-soft)]">
                <span>A real call, translated by Confam</span>
                <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-[var(--l-green)]" />live</span>
              </figcaption>
              <ol className="space-y-3">
                {TRANSCRIPT.map((t, i) => (
                  <li key={i} data-reveal className="t-line">
                    <p className="text-[12px] text-[var(--l-soft)]">
                      {t.who}
                      {t.lang && <span className="ml-1.5 opacity-70">{t.lang}</span>}
                    </p>
                    <p className={`t-text text-[15px] leading-snug ${i === 0 ? "serif text-[1.05rem] italic" : ""}`}>{t.text}</p>
                  </li>
                ))}
              </ol>
              <span
                data-reveal
                className="t-stamp serif absolute -right-3 -top-4 rounded-[4px] border-2 border-[var(--l-violet)] bg-[var(--l-paper)] px-2.5 py-0.5 text-[15px] tracking-[0.14em] text-[var(--l-violet)]"
                aria-label="Verdict: false"
              >
                FALSE
              </span>
            </figure>
          </div>
        </section>

        {/* The problem, as a morning */}
        <section id="story" className="border-t border-[var(--l-line)]">
          <div className="story-pin">
            <div className="mx-auto grid min-h-[100svh] max-w-[1240px] items-center gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[1fr_0.8fr]">
              <div>
                <p className="text-[15px] text-[var(--l-soft)]">Election day, as most people live it</p>
                <h2 className="serif mt-3 max-w-xl text-[clamp(2rem,4vw,3.2rem)] font-light leading-[1.08] tracking-[-0.02em]">
                  Amara has a voter&apos;s card and an ₦8,000 phone. No WhatsApp. No data.
                </h2>
                {/* Beats replace each other while pinned (deliberate fade-out), so the smoke check ignores their hidden states */}
                <ol className="relative mt-12 lg:min-h-[17rem]" data-verify-ignore>
                  {BEATS.map((b, i) => (
                    <li key={b.time} className="beat mb-10 lg:absolute lg:inset-x-0 lg:top-0 lg:mb-0">
                      <p className="flex items-center gap-3 text-[14px] text-[var(--l-soft)]">
                        <span className="beat-dot inline-block size-2 rounded-full bg-[var(--l-line)]" style={i === 0 ? { backgroundColor: "var(--l-green)" } : undefined} />
                        {b.time}
                      </p>
                      <h3 className="serif mt-2 text-[1.75rem] font-normal leading-snug">{b.title}</h3>
                      <p className="mt-3 max-w-[34rem] text-[1.05rem] leading-relaxed text-[var(--l-soft)]">{b.body}</p>
                    </li>
                  ))}
                </ol>
              </div>
              {/* A keypad phone: the device Confam is built for */}
              <div className="hidden justify-center lg:flex" aria-hidden>
                <div className="phone-body relative w-[15rem] rounded-[2.4rem] bg-[#1d2420] px-5 pb-8 pt-9 shadow-[0_40px_80px_-40px_rgba(15,28,22,0.7)]">
                  <div className="lcd relative h-40 overflow-hidden rounded-[10px] p-4" data-verify-ignore>
                    {BEATS.map((b) => (
                      <div key={b.time} className="lcd-state absolute inset-4 flex flex-col justify-between text-[13px]">
                        <span>{b.lcd[0]}</span>
                        <span className="text-center text-[1.35rem] tracking-[0.2em]">{b.lcd[1]}</span>
                        <span className="text-right">{b.lcd[2]}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-6 grid grid-cols-3 gap-2.5">
                    {["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map((k) => (
                      <span key={k} className="flex h-9 items-center justify-center rounded-[10px] bg-[#2c3530] font-mono text-[13px] text-[#c7d0ca]">
                        {k}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Why a phone call */}
        <section className="bg-[var(--l-paper-2)]">
          <div className="mx-auto grid max-w-[1240px] items-center gap-12 px-5 py-24 sm:px-8 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <p className="text-[15px] text-[var(--l-soft)]">Why a phone call</p>
              <p className="why-statement serif mt-4 text-pretty text-[clamp(1.7rem,3.3vw,2.7rem)] font-light leading-[1.22] tracking-[-0.01em]">
                Most election tools assume a smartphone, mobile data and the ability to read English. The people who need help most often have none of those. Nearly everyone can make a call, so that&apos;s where Confam lives.
              </p>
              <dl className="mt-12 grid gap-8 sm:grid-cols-3">
                <div>
                  <dt className="text-[14px] text-[var(--l-soft)]">Languages it understands</dt>
                  <dd className="serif mt-1 text-[1.35rem]">Whatever you speak at home</dd>
                </div>
                <div>
                  <dt className="text-[14px] text-[var(--l-soft)]">What you need</dt>
                  <dd className="serif mt-1 text-[1.35rem]">Any phone that can call</dd>
                </div>
                <div>
                  <dt className="text-[14px] text-[var(--l-soft)]">Who confirms the truth</dt>
                  <dd className="serif mt-1 text-[1.35rem]">The official at the polling unit</dd>
                </div>
              </dl>
            </div>
            <div className="baba-photo relative aspect-[4/5] overflow-hidden rounded-[18px]">
              <Image src="/images/baba.jpg" alt="Amara's father, 78, smiling as he listens on an old keypad phone on his veranda" fill sizes="(min-width: 1024px) 420px, 100vw" className="object-cover" />
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="mx-auto max-w-[1240px] px-5 py-24 sm:px-8">
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
            <div>
              <p className="text-[15px] text-[var(--l-soft)]">How a rumour gets settled</p>
              <h2 className="serif mt-3 text-[clamp(2rem,4vw,3.2rem)] font-light leading-[1.08] tracking-[-0.02em]">
                Confam doesn&apos;t guess. It asks the person standing there.
              </h2>
            </div>
            <p className="max-w-xl text-[1.1rem] leading-relaxed text-[var(--l-soft)]">
              The answer comes from the presiding officer at that polling unit, never from the AI&apos;s own idea of what&apos;s true. Every verdict says who confirmed it, and the next caller who asks gets the answer straight away.
            </p>
          </div>

          <div className="flow relative mt-16">
            {/* The path runs through the centres of the numbered circles (24px), never across the headings below */}
            <svg className="pointer-events-none absolute left-0 top-0 hidden h-12 w-[78%] md:block" viewBox="0 0 1000 48" preserveAspectRatio="none" aria-hidden>
              <path className="flow-path" d="M 30 24 C 180 6, 230 42, 345 24 S 560 6, 670 24 S 880 42, 990 24" fill="none" stroke="var(--l-green)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            </svg>
            <ol className="relative grid gap-10 md:grid-cols-4 md:gap-6">
              {[
                ["A voter calls", "“Dem say fight dey Ojuelegba.” Any language, any phone."],
                ["Confam promises to check", "It notes the place and claim, and says it will call back."],
                ["The officer answers", "Confam calls the presiding officer at that unit: is it true right now?"],
                ["Everyone hears back", "The reporter gets a callback. Voters nearby get a warning if it's about safety."],
              ].map(([title, body], i) => (
                <li key={title} className="flow-step">
                  <span className="relative z-10 flex size-12 items-center justify-center rounded-full bg-[var(--l-paper)] font-mono text-[14px] ring-1 ring-[var(--l-line)]">{i + 1}</span>
                  <h3 className="serif mt-5 text-[1.4rem]">{title}</h3>
                  <p className="mt-2 text-[1rem] leading-relaxed text-[var(--l-soft)]">{body}</p>
                </li>
              ))}
            </ol>
          </div>

          <div className="officer-photo relative mt-20 aspect-[16/8] overflow-hidden rounded-[18px]">
            <Image src="/images/officer.jpg" alt="A presiding officer arriving at a polling unit at dawn with a ballot box, answering a call on her keypad phone" fill sizes="(min-width: 1240px) 1180px, 100vw" className="scale-[1.18] object-cover" />
          </div>
        </section>

        {/* INEC control room */}
        <section id="control-room" className="border-t border-[var(--l-line)] bg-[var(--l-paper-2)]" style={{ perspective: "1400px" }}>
          <div className="mx-auto max-w-[1240px] px-5 py-24 sm:px-8">
            <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-end">
              <div>
                <p className="text-[15px] text-[var(--l-soft)]">For INEC and election officials</p>
                <h2 className="serif mt-3 text-[clamp(2rem,4vw,3.2rem)] font-light leading-[1.08] tracking-[-0.02em]">
                  The control room sees every call as it happens.
                </h2>
              </div>
              <ul className="space-y-3 text-[1.05rem] leading-relaxed text-[var(--l-soft)]">
                <li>Move one voter or a whole polling unit, and Confam calls the people affected within seconds.</li>
                <li>Watch rumours being checked, read what officials said, and correct a verdict if you know better.</li>
                <li>See which polling units have officials in, and pause every outbound call with one switch.</li>
              </ul>
            </div>
            <div className="console-shot mt-14 overflow-hidden rounded-[14px] bg-[var(--l-paper)] shadow-[0_50px_100px_-50px_rgba(15,28,22,0.55)] ring-1 ring-[var(--l-line)]">
              <div className="flex items-center gap-2 border-b border-[var(--l-line)] px-4 py-2.5">
                <span className="size-2.5 rounded-full bg-[var(--l-line)]" />
                <span className="size-2.5 rounded-full bg-[var(--l-line)]" />
                <span className="size-2.5 rounded-full bg-[var(--l-line)]" />
                <span className="ml-3 font-mono text-[12px] text-[var(--l-soft)]">confam / control room</span>
              </div>
              <Image src="/images/control-overview.png" alt="The Confam INEC control room: live activity, wards and rumours being checked" width={2880} height={2000} sizes="(min-width: 1240px) 1180px, 100vw" className="h-auto w-full" />
            </div>
            <div className="mt-8">
              <Link href="/control" className="l-link text-[1.05rem]">Open the control room</Link>
            </div>
          </div>
        </section>

        {/* Trust */}
        <section className="trust mx-auto max-w-[1240px] px-5 py-24 sm:px-8">
          <p className="text-[15px] text-[var(--l-soft)]">Built to be trusted</p>
          <h2 className="serif mt-3 max-w-2xl text-[clamp(2rem,4vw,3.2rem)] font-light leading-[1.08] tracking-[-0.02em]">Rules Confam can&apos;t break.</h2>
          <ul className="mt-12 grid gap-x-12 gap-y-8 md:grid-cols-2">
            {[
              ["It never makes up an answer.", "It can only repeat what an official confirmed, and it says who that was."],
              ["Officials prove who they are.", "A check-in only counts from the official's registered phone, with their private PIN."],
              ["It takes no side.", "Confam never praises or criticises a party or candidate, and never predicts results."],
              ["Safety comes first.", "Anyone in danger is told to move away and call 112. No one is asked to go and check."],
              ["People stay in control.", "Only registered voters hear about their own polling unit, and “stop calling me” always works."],
              ["Voting stays in person.", "The Electoral Act requires it, so Confam helps people get to the polls instead."],
            ].map(([title, body]) => (
              <li key={title} className="trust-item border-t border-[var(--l-line)] pt-5">
                <h3 className="serif text-[1.35rem]">{title}</h3>
                <p className="mt-2 text-[1rem] leading-relaxed text-[var(--l-soft)]">{body}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Under the hood */}
        <section className="hood bg-[var(--l-night)] text-[#e3e9e5]">
          <div className="mx-auto max-w-[1240px] px-5 py-24 sm:px-8">
            <p className="text-[15px] text-[#9fb0a6]">Under the hood</p>
            <h2 className="serif mt-3 max-w-2xl text-[clamp(2rem,4vw,3.2rem)] font-light leading-[1.08] tracking-[-0.02em]">A real phone line, a real backend, built in 48 hours.</h2>
            <ol className="hood-row mt-14 grid gap-px overflow-hidden rounded-[14px] bg-[#24332b] sm:grid-cols-2 lg:grid-cols-5">
              {[
                ["Phone number", "Telnyx", "Carries every call in and out."],
                ["Voice", "Aethex AI", "Understands speech in local languages and answers with low latency."],
                ["Thinking", "Claude Haiku 4.5", "Fast enough for natural conversation."],
                ["Brain", "Fastify + Postgres", "Tools, verdict rules, callbacks, retries and memory."],
                ["Control room", "Next.js", "Live updates for INEC as calls happen."],
              ].map(([role, name, body]) => (
                <li key={role} className="bg-[var(--l-night)] p-6">
                  <p className="text-[13px] text-[#9fb0a6]">{role}</p>
                  <p className="serif mt-2 text-[1.3rem]">{name}</p>
                  <p className="mt-2 text-[15px] leading-relaxed text-[#b8c5bd]">{body}</p>
                </li>
              ))}
            </ol>
            <p className="mt-10 max-w-3xl text-[1rem] leading-relaxed text-[#b8c5bd]">
              One honest limit: we had 48 hours, and a Nigerian number needs regulatory paperwork, so Confam runs on a US number for now. Calling it from Nigeria is an international call, and its calls can show a random local caller ID. A Nigerian number fixes both. The design, code and tests are on{" "}
              <a href={REPO} className="l-link text-[#e3e9e5]">GitHub</a>.
            </p>
          </div>
        </section>

        {/* Close */}
        <section className="mx-auto max-w-[1240px] px-5 py-28 sm:px-8">
          <h2 className="close-title serif max-w-4xl text-pretty text-[clamp(2.4rem,5.6vw,4.8rem)] font-light leading-[1.04] tracking-[-0.025em]">
            Try it now. Call and ask about Ojuelegba Primary School.
          </h2>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <a href={`tel:${NUMBER_TEL}`} className="l-btn l-btn-solid text-[1.05rem]">Call {NUMBER_DISPLAY}</a>
            <Link href="/control" className="l-btn l-btn-ghost text-[1.05rem]">Open the INEC control room</Link>
          </div>
          <footer className="mt-24 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--l-line)] pt-6 text-[14px] text-[var(--l-soft)]">
            <span>Confam, built for K-Tech Fest, &ldquo;Every Vote, Every Voice&rdquo;</span>
            <span className="flex gap-5">
              <a href={REPO} className="l-link">Source code</a>
              <Link href="/control" className="l-link">Control room</Link>
            </span>
          </footer>
        </section>
      </div>
    </ReactLenis>
  );
}
