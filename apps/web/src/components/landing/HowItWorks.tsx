'use client';

import { useEffect, useRef, useState } from 'react';

const STEPS = [
  {
    step: '01',
    title: 'Choose Pay Later',
    desc: 'Browse any store and pick your item. Select LaterOn at checkout — approval takes under 10 seconds.',
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <path d="M6 7h16l-2 9H8L6 7z" stroke="#5a6900" strokeWidth="1.8" strokeLinejoin="round" />
        <circle cx="10" cy="21" r="1.5" fill="#5a6900" />
        <circle cx="18" cy="21" r="1.5" fill="#5a6900" />
        <path d="M3 4h2l1 3" stroke="#5a6900" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M11 12h6" stroke="#5a6900" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    highlight: 'Under 10 sec approval',
  },
  {
    step: '02',
    title: 'Pay a small amount now',
    desc: 'Start with just 10% as your first installment. No collateral, no credit check — just instant access.',
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <rect x="4" y="8" width="20" height="14" rx="3" stroke="#5a6900" strokeWidth="1.8" />
        <path d="M4 13h20" stroke="#5a6900" strokeWidth="1.8" />
        <circle cx="9" cy="18" r="1.5" fill="#5a6900" />
        <path d="M13 18h6" stroke="#5a6900" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    highlight: 'Only 10% upfront',
  },
  {
    step: '03',
    title: 'Repay monthly',
    desc: 'Clear your balance in 3, 6, or 12 equal monthly installments. Always 0% interest, always on-chain.',
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <rect x="5" y="5" width="18" height="18" rx="3" stroke="#5a6900" strokeWidth="1.8" />
        <path d="M5 11h18" stroke="#5a6900" strokeWidth="1.8" />
        <path d="M9 5V8M19 5V8" stroke="#5a6900" strokeWidth="1.8" strokeLinecap="round" />
        <path
          d="M9 16l2.5 2.5 5-5"
          stroke="#5a6900"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    highlight: '0% interest always',
  },
];

export function HowItWorks() {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible(true);
      },
      { threshold: 0.15 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      id="how-it-works"
      style={{ background: '#FFFFFF', padding: '96px 32px' }}
    >
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div
          style={{
            textAlign: 'center',
            marginBottom: '64px',
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(20px)',
            transition: 'opacity 0.6s ease, transform 0.6s ease',
          }}
        >
          <span
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: '12px',
              fontWeight: 600,
              color: '#5a6900',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              background: 'rgba(107,122,0,0.08)',
              border: '1px solid rgba(107,122,0,0.16)',
              padding: '5px 14px',
              borderRadius: '100px',
              display: 'inline-block',
              marginBottom: '16px',
            }}
          >
            Simple by design
          </span>
          <h2
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 700,
              fontSize: 'clamp(28px, 3.5vw, 40px)',
              color: '#0A0C12',
              letterSpacing: '-0.8px',
              margin: '0 0 12px',
            }}
          >
            How it works
          </h2>
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: '16px',
              color: 'rgba(10,12,18,0.48)',
              maxWidth: '420px',
              margin: '0 auto',
              lineHeight: 1.6,
            }}
          >
            From checkout to complete repayment — everything in three steps.
          </p>
        </div>

        {/* Steps + connector */}
        <div style={{ position: 'relative' }}>
          {/* Connector line (desktop) */}
          <div
            style={{
              position: 'absolute',
              top: '52px',
              left: 'calc(16.66% + 28px)',
              right: 'calc(16.66% + 28px)',
              height: '1px',
              background:
                'linear-gradient(90deg, rgba(107,122,0,0.2), rgba(107,122,0,0.5), rgba(107,122,0,0.2))',
              pointerEvents: 'none',
            }}
            className="step-connector"
          />

          <div
            style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}
            className="steps-grid"
          >
            {STEPS.map((step, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  background: '#F5F6F0',
                  border: '1px solid rgba(10,12,18,0.07)',
                  borderRadius: '20px',
                  padding: '32px 28px',
                  position: 'relative',
                  transition: 'all 0.3s ease',
                  cursor: 'default',
                  opacity: visible ? 1 : 0,
                  transform: visible ? 'translateY(0)' : 'translateY(24px)',
                  transitionDelay: `${0.2 + i * 0.15}s`,
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLDivElement;
                  el.style.boxShadow = '0 12px 40px rgba(10,12,18,0.10)';
                  el.style.transform = 'translateY(-4px)';
                  el.style.borderColor = 'rgba(107,122,0,0.2)';
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLDivElement;
                  el.style.boxShadow = 'none';
                  el.style.transform = 'translateY(0)';
                  el.style.borderColor = 'rgba(10,12,18,0.07)';
                }}
              >
                {/* Step number */}
                <div
                  style={{
                    position: 'absolute',
                    top: '-14px',
                    left: '28px',
                    background: '#D7E377',
                    borderRadius: '8px',
                    padding: '3px 10px',
                  }}
                >
                  <span
                    style={{
                      fontFamily: "'Space Grotesk', sans-serif",
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#0A0C12',
                      letterSpacing: '0.05em',
                    }}
                  >
                    {step.step}
                  </span>
                </div>

                {/* Icon circle */}
                <div
                  style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: '16px',
                    background: 'rgba(107,122,0,0.09)',
                    border: '1px solid rgba(107,122,0,0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '20px',
                    marginTop: '4px',
                  }}
                >
                  {step.icon}
                </div>

                <h3
                  style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontWeight: 700,
                    fontSize: '18px',
                    color: '#0A0C12',
                    margin: '0 0 10px',
                    letterSpacing: '-0.2px',
                  }}
                >
                  {step.title}
                </h3>
                <p
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: '14px',
                    color: 'rgba(10,12,18,0.52)',
                    lineHeight: 1.65,
                    margin: '0 0 18px',
                  }}
                >
                  {step.desc}
                </p>

                {/* Highlight pill */}
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'rgba(107,122,0,0.08)',
                    border: '1px solid rgba(107,122,0,0.15)',
                    borderRadius: '100px',
                    padding: '4px 12px',
                  }}
                >
                  <div
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: '#D7E377',
                    }}
                  />
                  <span
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#5a6900',
                    }}
                  >
                    {step.highlight}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 820px) {
          .steps-grid {
            flex-direction: column !important;
          }
          .step-connector {
            display: none !important;
          }
        }
      `}</style>
    </section>
  );
}
