"use client";

import { useEffect } from "react";

/**
 * Client-side enhancements for the marketing home page, ported from the design
 * project's `site/site.js`. It only wires behaviour onto the server-rendered
 * markup (sticky header shadow, mobile nav toggle, scroll-reveal, and the
 * scroll-stepped dodo jump), so it renders nothing itself. Everything is
 * progressive: with JS off, the page is fully visible and readable.
 */
export function LandingInteractions() {
  useEffect(() => {
    const cleanups: Array<() => void> = [];

    // ── Sticky header shadow on scroll ──
    const header = document.querySelector<HTMLElement>(".site-header");
    if (header) {
      const onScroll = () => {
        if (window.scrollY > 8) header.classList.add("scrolled");
        else header.classList.remove("scrolled");
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
      cleanups.push(() => window.removeEventListener("scroll", onScroll));
    }

    // ── Mobile nav toggle ──
    const toggle = document.querySelector<HTMLElement>(".nav-toggle");
    const nav = document.querySelector<HTMLElement>(".main-nav");
    if (toggle && nav) {
      const onToggle = () => {
        const open = nav.classList.toggle("open");
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
      };
      const onNavClick = (e: Event) => {
        if ((e.target as HTMLElement).tagName === "A") nav.classList.remove("open");
      };
      toggle.addEventListener("click", onToggle);
      nav.addEventListener("click", onNavClick);
      cleanups.push(() => {
        toggle.removeEventListener("click", onToggle);
        nav.removeEventListener("click", onNavClick);
      });
    }

    // ── Scroll reveal — visible by default; only hide (then animate) elements
    //    that begin below the fold, so screenshots / no-JS always show content. ──
    const reveals = document.querySelectorAll<HTMLElement>(".reveal");
    const vh = window.innerHeight || 800;
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((en) => {
            if (en.isIntersecting) {
              en.target.classList.remove("pre");
              io.unobserve(en.target);
            }
          });
        },
        { threshold: 0.1, rootMargin: "0px 0px -8% 0px" },
      );
      reveals.forEach((el) => {
        if (el.getBoundingClientRect().top > vh * 0.9) {
          el.classList.add("pre");
          io.observe(el);
        }
      });
      cleanups.push(() => io.disconnect());
    }

    // ── Scroll-step dodo jump: discrete hops as the user scrolls ──
    // States: 0 center → 1 hop to bottom → 2 scared hop to the right edge →
    // 3 dive down to the CTA slot. Scrolling picks the TARGET state, but the
    // dodo only ever advances ONE state per animation, and a new step cannot
    // start until the previous one has finished. This keeps every hop a clean,
    // complete animation and guarantees the 0→1→2→3 path is never skipped
    // (fast scrolling used to jump 1→3, teleporting the bird to the perch).
    const jumper = document.getElementById("dodo-jumper");
    const jStage = document.querySelector<HTMLElement>(".about-mascot-stage");
    const ctaSec = document.querySelector<HTMLElement>(".cta-final");
    const ctaDodo = document.getElementById("cta-dodo");
    if (
      jumper &&
      jStage &&
      ctaSec &&
      ctaDodo &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      document.body.classList.add("dodo-anim");
      const hopEl = jumper.querySelector<HTMLElement>(".dodo-hop");
      const dBody = jumper.querySelector<HTMLElement>(".dodo-body");
      // Locks are slightly shorter than the animations so the next step starts
      // during the landing squash — continuous motion instead of land-freeze-launch.
      const HOP_MS = 620; // 0.7s hop, chained at ~90%
      const HOP_FAST_MS = 380; // 0.45s catch-up hop (jumper.fast)
      const FLY_MS = 1250; // 1.2s dodoFly animation (terminal, no overlap)
      let jState = 0;
      let busyUntil = 0; // wall-clock time the next step may start
      let stepTimer = 0;

      // Flight vector: from the state-2 perch (bottom-right of frame) to the CTA slot.
      const setFlightVars = () => {
        const s = jStage.getBoundingClientRect();
        const t = ctaDodo.getBoundingClientRect();
        const jw = s.width * 0.56; // jumper width
        const c2x = s.left + s.width / 2 + jw * 0.36; // state-2 center
        const c2y = s.top + s.height / 2 + jw * 0.36;
        jumper.style.setProperty("--fx", (t.left + t.width / 2 - c2x).toFixed(1) + "px");
        jumper.style.setProperty("--fy", (t.top + t.height / 2 - c2y).toFixed(1) + "px");
        jumper.style.setProperty("--fs", (t.width / jw).toFixed(3));
      };
      const targetState = () => {
        const winH = window.innerHeight;
        if (ctaSec.getBoundingClientRect().top < winH * 0.8) return 3;
        const top = jStage.getBoundingClientRect().top;
        if (top < winH * 0.2) return 2;
        if (top < winH * 0.52) return 1;
        return 0;
      };
      const clearAnims = () => {
        hopEl?.classList.remove("hop");
        dBody?.classList.remove("squash", "scared");
      };
      // The CTA wrap may still be hidden by the scroll-reveal (.pre = 22px
      // offset). Settle it instantly before measuring the flight target, or
      // the dive lands where the slot WAS mid-reveal, not where it ends up.
      const settleCtaReveal = () => {
        const el = ctaSec.querySelector<HTMLElement>(".reveal.pre");
        if (el) {
          el.style.transition = "none";
          el.classList.remove("pre");
          void el.offsetWidth;
          el.style.transition = "";
        }
      };
      // Re-check once the running animation has (nearly) finished — catches up
      // to the target state step by step when the user scrolled several
      // thresholds at once.
      const queueRecheck = () => {
        window.clearTimeout(stepTimer);
        stepTimer = window.setTimeout(step, Math.max(0, busyUntil - performance.now()) + 10);
      };
      const step = () => {
        const target = targetState();
        if (target === jState) return;
        const now = performance.now();
        if (now < busyUntil) {
          queueRecheck(); // an animation is running — let it play out
          return;
        }
        clearAnims();
        if (target > jState) {
          // Forward: exactly one state per step, each with its own animation.
          // When further steps are already queued (user scrolled ahead), play
          // this hop in fast mode so the bird catches up without long pauses.
          const next = jState + 1;
          const backlog = target > next;
          jumper.classList.toggle("fast", backlog && next !== 3);
          if (next === 3) {
            settleCtaReveal();
            setFlightVars();
            jumper.setAttribute("data-jump", "3");
            void jumper.offsetWidth;
            jumper.classList.add("fly");
            busyUntil = now + FLY_MS;
          } else {
            jumper.classList.remove("fly");
            jumper.setAttribute("data-jump", String(next));
            if (hopEl && dBody) {
              void hopEl.offsetWidth;
              hopEl.classList.add("hop");
              dBody.classList.add("squash");
              // The scared peek only plays when the user pauses at the edge —
              // starting the dive mid-peek would snap the pose.
              if (next === 2 && !backlog) dBody.classList.add("scared");
            }
            busyUntil = now + (backlog ? HOP_FAST_MS : HOP_MS);
          }
          jState = next;
        } else {
          // Backward (scrolling up): glide straight to the target, no theatrics.
          jumper.classList.remove("fast");
          jumper.classList.remove("fly");
          jumper.setAttribute("data-jump", String(target));
          busyUntil = now + HOP_MS;
          jState = target;
        }
        if (targetState() !== jState) queueRecheck();
      };
      let pending = false;
      const onJumpScroll = () => {
        if (pending) return;
        pending = true;
        requestAnimationFrame(() => {
          pending = false;
          step();
        });
      };
      const onResize = () => {
        if (jState === 3) setFlightVars();
        onJumpScroll();
      };
      window.addEventListener("scroll", onJumpScroll, { passive: true });
      window.addEventListener("resize", onResize, { passive: true });
      // Set initial state without animating.
      jState = targetState();
      jumper.style.transition = "none";
      if (jState === 3) {
        setFlightVars();
        jumper.classList.add("fly");
      }
      jumper.setAttribute("data-jump", String(jState));
      void jumper.offsetWidth;
      jumper.style.transition = "";
      cleanups.push(() => {
        window.clearTimeout(stepTimer);
        window.removeEventListener("scroll", onJumpScroll);
        window.removeEventListener("resize", onResize);
        document.body.classList.remove("dodo-anim");
      });
    }

    // ── Reserve form (Companion): friendly inline confirmation, no backend ──
    const rf = document.querySelector<HTMLFormElement>(".reserve-form");
    if (rf) {
      const onSubmit = (e: Event) => {
        e.preventDefault();
        const input = rf.querySelector("input");
        const btn = rf.querySelector("button");
        if (input && btn && input.value.trim()) {
          btn.textContent = btn.getAttribute("data-done") || "✓";
          btn.disabled = true;
          btn.style.background = "var(--mint)";
          input.disabled = true;
        }
      };
      rf.addEventListener("submit", onSubmit);
      cleanups.push(() => rf.removeEventListener("submit", onSubmit));
    }

    // ── E2EE scramble demo (Companion): plaintext ⇄ ciphertext loop ──
    const e2ee = document.getElementById("e2ee-demo");
    const tEl = e2ee?.querySelector<HTMLElement>(".e2ee-text");
    if (e2ee && tEl) {
      const GLYPHS = "#@%&+=?!23456789ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";
      const plain = () => tEl.getAttribute("data-plain") || tEl.textContent || "";
      const rnd = () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        tEl.textContent = plain();
      } else {
        let pos = 0;
        let phase: "hold-plain" | "encrypt" | "decrypt" = "hold-plain";
        let timer = 0;
        const scramble = (p: string, n: number) => {
          let out = "";
          for (let i = 0; i < n; i++) out += i < pos ? rnd() : p[i];
          return out;
        };
        const tick = () => {
          const p = plain();
          const n = p.length;
          if (pos > n) pos = n;
          if (phase === "hold-plain") {
            tEl.textContent = p;
            e2ee.classList.remove("locked");
            pos = 0;
            phase = "encrypt";
            timer = window.setTimeout(tick, 2100);
            return;
          }
          if (phase === "encrypt") {
            pos++;
            tEl.textContent = scramble(p, n);
            if (pos >= n) {
              e2ee.classList.add("locked");
              phase = "decrypt";
              timer = window.setTimeout(tick, 2300);
            } else {
              timer = window.setTimeout(tick, 42);
            }
            return;
          }
          pos--;
          tEl.textContent = scramble(p, n);
          if (pos <= 0) {
            e2ee.classList.remove("locked");
            phase = "hold-plain";
            timer = window.setTimeout(tick, 80);
          } else {
            timer = window.setTimeout(tick, 42);
          }
        };
        tick();
        cleanups.push(() => window.clearTimeout(timer));
      }
    }

    return () => cleanups.forEach((fn) => fn());
  }, []);

  return null;
}
