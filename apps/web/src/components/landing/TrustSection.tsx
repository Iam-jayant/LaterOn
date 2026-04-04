'use client';

import { useEffect, useRef, useState } from 'react';

const TRUST_CARDS = [
  {
    icon: (
      <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
        <path
          d="M13 3L4 7v6c0 5.5 3.8 10.6 9 11.9 5.2-1.3 9-6.4 9-11.9V7l-9-4z"
          stroke="#5a6900"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M9 13l3 3 5-6"
          stroke="#5a6900"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    title: 'No credit score needed',
    desc: "We don't pull your CIBIL score. Anyone with a wallet can apply — approval is instant and on-chain.",
    stat: '100%',
    statLabel: 'approval transparency',
  },
  {
    icon: (
      <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
        <rect x="4" y="7" width="18" height="13" rx="3" stroke="#5a6900" strokeWidth="1.8" />
        <path d="M4 12h18" stroke="#5a6900" strokeWidth="1.8" />
        <circle cx="9" cy="16.5" r="1.5" fill="#5a6900" />
        <path d="M13 16.5h5" stroke="#5a6900" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    title: 'Transparent repayments',
    desc: 'Every payment, every due date, every rupee — all visible to you before you commit. Zero surprises.',
    stat: '0%',
    statLabel: 'hidden fees',
  },
  {
    icon: (
      <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
        <path
          d="M13 3l3 5h5l-4 3 1.5 5.5L13 14l-5.5 2.5L9 11 5 8h5l3-5z"
          stroke="#5a6900"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    ),
    title: 'On-chain verification',
    desc: 'Smart contracts on the blockchain record every agreement. Immutable, auditable, and trustless.',
    stat: 'EVM',
    statLabel: 'compatible chains',
  },
  {
    icon: (
      <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
        <circle cx="13" cy="13" r="9" stroke="#5a6900" strokeWidth="1.8" />
        <path d="M13 8v5l3 3" stroke="#5a6900" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
    title: 'Instant approval',
    desc: 'No paperwork, no waiting. Our smart contracts evaluate and approve in under 10 seconds.',
    stat: '<10s',
    statLabel: 'approval time',
  },
  {
    icon: (
      <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
        <path d="M5 13h16M5 8h10M5 18h7" stroke="#5a6900" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
    title: 'Flexible plans',
    desc: 'Choose 3, 6, or 12-month plans. All carry 0% interest — always. You only repay what you borrow.',
    stat: '0%',
    statLabel: 'interest rate',
  },
  {
    icon: (
      <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
        <path
          d="M8 13l4 4 8-8"
          stroke="#5a6900"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="13" cy="13" r="9" stroke="#5a6900" strokeWidth="1.8" />
      </svg>
    ),
    title: 'Non-custodial',
    desc: 'You own your funds at all times. No centralized custody. Your keys, your rules.',
    stat: 'Self',
    statLabel: 'custody always',
  },
];

export function TrustSection() {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible(true);
      },
      { threshold: 0.1 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={ref} style={{ background: '#F5F6F0', padding: '96px 32px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div
          style={{
            textAlign: 'center',
            marginBottom: '56px',
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
            Built on trust
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
            Why users trust LaterOn
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
            Every feature is built to put you in control. No surprises. No fine print.
          </p>
        </div>

        {/* Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '16px',
          }}
          className="trust-grid"
        >
          {TRUST_CARDS.map((card, i) => (
            <div
              key={i}
              style={{
                background: '#FFFFFF',
                border: '1px solid rgba(10,12,18,0.07)',
                borderRadius: '20px',
                padding: '28px',
                transition: 'all 0.28s ease',
                cursor: 'default',
                opacity: visible ? 1 : 0,
                transform: visible ? 'translateY(0)' : 'translateY(24px)',
                transitionDelay: `${0.1 + i * 0.08}s`,
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLDivElement;
                el.style.boxShadow = '0 12px 36px rgba(10,12,18,0.09)';
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
              {/* Icon */}
              <div
                style={{
                  width: '52px',
                  height: '52px',
                  borderRadius: '14px',
                  background: 'rgba(107,122,0,0.09)',
                  border: '1px solid rgba(107,122,0,0.14)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '18px',
                }}
              >
                {card.icon}
              </div>

              <h3
                style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontWeight: 700,
                  fontSize: '17px',
                  color: '#0A0C12',
                  margin: '0 0 10px',
                  letterSpacing: '-0.2px',
                }}
              >
                {card.title}
              </h3>
              <p
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: '14px',
                  color: 'rgba(10,12,18,0.50)',
                  lineHeight: 1.65,
                  margin: '0 0 18px',
                }}
              >
                {card.desc}
              </p>

              {/* Stat */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontSize: '22px',
                    fontWeight: 700,
                    color: '#0A0C12',
                    letterSpacing: '-0.3px',
                  }}
                >
                  {card.stat}
                </span>
                <span
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: '12px',
                    color: 'rgba(10,12,18,0.4)',
                    fontWeight: 400,
                  }}
                >
                  {card.statLabel}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom CTA */}
        <div
          style={{
            textAlign: 'center',
            marginTop: '56px',
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(16px)',
            transition: 'opacity 0.6s ease 0.5s, transform 0.6s ease 0.5s',
          }}
        >
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: '15px',
              color: 'rgba(10,12,18,0.5)',
              marginBottom: '20px',
            }}
          >
            Join <span style={{ fontWeight: 600, color: '#0A0C12' }}>12,000+</span> users who
            already mint now and settle later.
          </p>
          <button
            style={{
              background: '#D7E377',
              border: 'none',
              cursor: 'pointer',
              fontFamily: "'Inter', sans-serif",
              fontSize: '15px',
              fontWeight: 600,
              color: '#0A0C12',
              padding: '14px 32px',
              borderRadius: '12px',
              boxShadow: '0 4px 20px rgba(107,122,0,0.25)',
              transition: 'all 0.22s',
            }}
            onMouseEnter={(e) => {
              const b = e.currentTarget as HTMLButtonElement;
              b.style.background = '#e4ee8c';
              b.style.transform = 'translateY(-2px)';
              b.style.boxShadow = '0 8px 28px rgba(107,122,0,0.32)';
            }}
            onMouseLeave={(e) => {
              const b = e.currentTarget as HTMLButtonElement;
              b.style.background = '#D7E377';
              b.style.transform = 'translateY(0)';
              b.style.boxShadow = '0 4px 20px rgba(107,122,0,0.25)';
            }}
          >
            Start for free — no card needed
          </button>
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 900px) {
          .trust-grid {
            grid-template-columns: 1fr 1fr !important;
          }
        }
        @media (max-width: 560px) {
          .trust-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </section>
  );
}
