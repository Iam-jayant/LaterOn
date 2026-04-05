'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { DashboardCard } from './DashboardCard';
import { PRIMARY } from '@/lib/colors';

const USE_CASES = ['Electronics', 'Furniture', 'Travel', 'Education', 'Fashion', 'Gadgets'];

const STATS = [
  { label: 'Disbursed', value: 24, suffix: 'Cr+', prefix: '₹' },
  { label: 'Active Users', value: 12, suffix: 'K+', prefix: '' },
  { label: 'Avg. Interest', value: 0, suffix: '%', prefix: '' },
  { label: 'App Rating', value: 4.9, suffix: '★', prefix: '' },
];

function useCountUp(target: number, duration = 1600, started = false, isFloat = false) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!started) return;
    let startTime: number | null = null;
    const step = (ts: number) => {
      if (!startTime) startTime = ts;
      const p = Math.min((ts - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      const val = eased * target;
      setCount(isFloat ? Math.round(val * 10) / 10 : Math.floor(val));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration, started, isFloat]);
  return count;
}

function StatItem({ stat, started }: { stat: typeof STATS[0]; started: boolean }) {
  const isFloat = !Number.isInteger(stat.value);
  const count = useCountUp(stat.value, 1600, started, isFloat);
  return (
    <div style={{ textAlign: 'center' }}>
      <p
        style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: '22px',
          fontWeight: 700,
          color: '#0A0C12',
          margin: 0,
          letterSpacing: '-0.5px',
          lineHeight: 1.2,
        }}
      >
        {stat.prefix}
        {isFloat ? count.toFixed(1) : count}
        {stat.suffix}
      </p>
      <p
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: '12px',
          color: 'rgba(10,12,18,0.45)',
          margin: '4px 0 0',
          lineHeight: 1,
        }}
      >
        {stat.label}
      </p>
    </div>
  );
}

export function HeroSection() {
  const [caseIndex, setCaseIndex] = useState(0);
  const [caseVisible, setCaseVisible] = useState(true);
  const [statsStarted, setStatsStarted] = useState(false);
  const [contentVisible, setContentVisible] = useState(false);
  const [cardVisible, setCardVisible] = useState(false);
  const statsRef = useRef<HTMLDivElement>(null);

  // Staggered entrance
  useEffect(() => {
    const t1 = setTimeout(() => setContentVisible(true), 100);
    const t2 = setTimeout(() => setCardVisible(true), 350);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  // Cycling use-case text
  useEffect(() => {
    const interval = setInterval(() => {
      setCaseVisible(false);
      setTimeout(() => {
        setCaseIndex((i) => (i + 1) % USE_CASES.length);
        setCaseVisible(true);
      }, 300);
    }, 2400);
    return () => clearInterval(interval);
  }, []);

  // Stats counter trigger on scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setStatsStarted(true);
      },
      { threshold: 0.3 }
    );
    if (statsRef.current) observer.observe(statsRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      style={{
        minHeight: '100vh',
        background: '#F5F6F0',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Background blobs */}
      <div
        style={{
          position: 'absolute',
          top: '-160px',
          left: '-180px',
          width: '600px',
          height: '600px',
          background: 'radial-gradient(circle, rgba(175,195,30,0.12) 0%, transparent 65%)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '-60px',
          right: '-120px',
          width: '520px',
          height: '520px',
          background: 'radial-gradient(circle, rgba(175,195,30,0.08) 0%, transparent 65%)',
          pointerEvents: 'none',
        }}
      />
      {/* Dot grid */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'radial-gradient(circle, rgba(10,12,18,0.055) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          pointerEvents: 'none',
          opacity: 0.6,
        }}
      />

      {/* Hero content */}
      <div
        style={{
          flex: 1,
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '0 32px',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          paddingTop: '100px',
          paddingBottom: '60px',
          gap: '60px',
        }}
        className="hero-wrap"
      >
        {/* LEFT */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            opacity: contentVisible ? 1 : 0,
            transform: contentVisible ? 'translateY(0)' : 'translateY(28px)',
            transition: 'opacity 0.7s ease, transform 0.7s ease',
          }}
        >
          {/* Eyebrow */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              background: 'rgba(107,122,0,0.08)',
              border: '1px solid rgba(107,122,0,0.18)',
              borderRadius: '100px',
              padding: '6px 14px 6px 8px',
              marginBottom: '28px',
            }}
          >
            <div
              style={{
                background: '#D7E377',
                borderRadius: '50%',
                width: '22px',
                height: '22px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path
                  d="M2 5.5l2.5 2.5L8 2"
                  stroke="#0A0C12"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <span
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: '12px',
                fontWeight: 600,
                color: '#5a6900',
                letterSpacing: '0.02em',
              }}
            >
              Web3-powered installments — now live
            </span>
          </div>

          {/* Headline */}
          <h1
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 700,
              fontSize: 'clamp(40px, 5vw, 64px)',
              lineHeight: 1.06,
              color: '#0A0C12',
              margin: '0 0 6px',
              letterSpacing: '-1.8px',
            }}
          >
            Buy Now.
          </h1>
          <h1
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 700,
              fontSize: 'clamp(40px, 5vw, 64px)',
              lineHeight: 1.06,
              color: '#0A0C12',
              margin: '0 0 18px',
              letterSpacing: '-1.8px',
            }}
          >
            <span style={{ color: '#6b7a00' }}>Settle</span> Later.
          </h1>

          {/* Dynamic use-case line */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '24px',
            }}
          >
            <span
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: '16px',
                color: 'rgba(10,12,18,0.45)',
                fontWeight: 400,
              }}
            >
              Perfect for
            </span>
            <span
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: '16px',
                fontWeight: 600,
                color: '#5a6900',
                background: 'rgba(107,122,0,0.09)',
                border: '1px solid rgba(107,122,0,0.16)',
                padding: '3px 12px',
                borderRadius: '100px',
                display: 'inline-block',
                minWidth: '110px',
                textAlign: 'center',
                opacity: caseVisible ? 1 : 0,
                transform: caseVisible ? 'translateY(0)' : 'translateY(-6px)',
                transition: 'opacity 0.28s ease, transform 0.28s ease',
              }}
            >
              {USE_CASES[caseIndex]}
            </span>
            <span
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: '16px',
                color: 'rgba(10,12,18,0.45)',
                fontWeight: 400,
              }}
            >
              & more
            </span>
          </div>

          {/* Subtext */}
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: '17px',
              fontWeight: 400,
              color: 'rgba(10,12,18,0.5)',
              lineHeight: 1.65,
              margin: '0 0 36px',
              maxWidth: '420px',
            }}
          >
            Smart contract–backed installment payments. Split any purchase in 3, 6, or 12 months.{' '}
            <span style={{ color: 'rgba(10,12,18,0.78)', fontWeight: 500 }}>
              No credit score needed.
            </span>
          </p>

          {/* CTAs */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '40px' }}>
            <Link href="/app">
              <button
                className="hero-cta-button"
                style={{
                  background: PRIMARY,
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: "'Inter', sans-serif",
                  fontSize: '15px',
                  fontWeight: 600,
                  color: '#0A0C12',
                  padding: '14px 28px',
                  borderRadius: '12px',
                  letterSpacing: '0.01em',
                  boxShadow: '0 4px 20px rgba(107,122,0,0.25)',
                  transition: 'all 0.22s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  minHeight: '44px',
                }}
                onMouseEnter={(e) => {
                  const b = e.currentTarget as HTMLButtonElement;
                  b.style.background = '#e4ee8c';
                  b.style.transform = 'translateY(-2px)';
                  b.style.boxShadow = '0 8px 28px rgba(107,122,0,0.32)';
                }}
                onMouseLeave={(e) => {
                  const b = e.currentTarget as HTMLButtonElement;
                  b.style.background = PRIMARY;
                  b.style.transform = 'translateY(0)';
                  b.style.boxShadow = '0 4px 20px rgba(107,122,0,0.25)';
                }}
              >
                Use App
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M3 8h10M9 4l4 4-4 4"
                    stroke="#0A0C12"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </Link>
          </div>

          {/* Stats strip */}
          <div
            ref={statsRef}
            style={{
              display: 'flex',
              gap: '0',
              alignItems: 'center',
              background: '#FFFFFF',
              border: '1px solid rgba(10,12,18,0.07)',
              borderRadius: '16px',
              padding: '16px 24px',
              boxShadow: '0 4px 16px rgba(10,12,18,0.06)',
              width: 'fit-content',
              flexWrap: 'wrap',
            }}
          >
            {STATS.map((stat, i) => (
              <div key={stat.label} style={{ display: 'flex', alignItems: 'center' }}>
                <StatItem stat={stat} started={statsStarted} />
                {i < STATS.length - 1 && (
                  <div
                    style={{
                      width: '1px',
                      height: '32px',
                      background: 'rgba(10,12,18,0.08)',
                      margin: '0 20px',
                    }}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Trust line */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              flexWrap: 'wrap',
              marginTop: '18px',
            }}
          >
            {['No hidden fees', 'Transparent repayments', 'Instant checkout'].map((item, i) => (
              <div key={item} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {i > 0 && <span style={{ color: 'rgba(10,12,18,0.2)', fontSize: '12px' }}>•</span>}
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <circle cx="6" cy="6" r="5" fill="rgba(107,122,0,0.12)" />
                    <path
                      d="M3.5 6l2 2 3-3"
                      stroke="#6b7a00"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: '13px',
                      color: 'rgba(10,12,18,0.45)',
                    }}
                  >
                    {item}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT — card */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            paddingTop: '40px',
            paddingBottom: '40px',
            opacity: cardVisible ? 1 : 0,
            transform: cardVisible ? 'translateY(0) scale(1)' : 'translateY(32px) scale(0.97)',
            transition: 'opacity 0.75s ease, transform 0.75s ease',
          }}
          className="hero-right"
        >
          <DashboardCard />
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 900px) {
          .hero-wrap {
            flex-direction: column !important;
            padding-top: 120px !important;
            padding-bottom: 80px !important;
            gap: 72px !important;
          }
          .hero-right {
            padding-bottom: 60px !important;
          }
        }
      `}</style>
    </section>
  );
}
