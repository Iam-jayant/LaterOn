'use client';

import { useState, useEffect } from 'react';
import { PRIMARY, TEXT, SUCCESS, BACKGROUND } from '@/lib/colors';

interface DashboardCardProps {
  title?: string;
  amount?: number;
  status?: 'active' | 'completed' | 'upcoming';
  dueDate?: string;
}

function CircleProgress({ percent }: { percent: number }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const offset = circ - (percent / 100) * circ;
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" style={{ transform: 'rotate(-90deg)' }}>
      <circle cx="36" cy="36" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="5" />
      <circle
        cx="36"
        cy="36"
        r={r}
        fill="none"
        stroke={PRIMARY}
        strokeWidth="5"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 1s ease' }}
      />
    </svg>
  );
}

export function DashboardCard({
  title = 'Active Plan',
  amount = 4500,
  status = 'active',
  dueDate = 'May 4',
}: DashboardCardProps) {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setProgress(33), 400);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
        }
      },
      { threshold: 0.2 }
    );

    const element = document.getElementById('dashboard-card');
    if (element) {
      observer.observe(element);
    }

    return () => {
      if (element) {
        observer.disconnect();
      }
    };
  }, []);

  const downPayment = Math.round(amount * 0.10);
  const remaining = amount - downPayment;
  const emi = Math.round(remaining / 3);

  return (
    <div
      id="dashboard-card"
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: '440px',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(20px)',
        transition: 'opacity 0.7s ease, transform 0.7s ease',
      }}
    >
      {/* Soft glow behind card */}
      <div
        style={{
          position: 'absolute',
          inset: '-24px',
          background: `radial-gradient(ellipse at center, ${SUCCESS}1A 0%, transparent 70%)`,
          borderRadius: '40px',
          pointerEvents: 'none',
        }}
      />

      {/* Floating mini card — top right */}
      <div
        style={{
          position: 'absolute',
          top: '-18px',
          right: '20px',
          zIndex: 10,
          background: '#FFFFFF',
          border: '1px solid rgba(10,12,18,0.09)',
          borderRadius: '14px',
          padding: '12px 16px',
          boxShadow: '0 8px 28px rgba(10,12,18,0.10)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          minWidth: '180px',
        }}
      >
        <div
          style={{
            width: '34px',
            height: '34px',
            borderRadius: '10px',
            background: 'rgba(107,122,0,0.10)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M2 8l4 4 8-8"
              stroke={SUCCESS}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div>
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: '11px',
              color: 'rgba(10,12,18,0.45)',
              margin: 0,
              lineHeight: 1.3,
            }}
          >
            Payment verified
          </p>
          <p
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: '13px',
              fontWeight: 600,
              color: '#5a6900',
              margin: 0,
              lineHeight: 1.4,
            }}
          >
            On-chain ✓
          </p>
        </div>
      </div>

      {/* Main Card */}
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '24px',
          padding: '28px',
          boxShadow: `0 20px 60px ${TEXT}1A, 0 1px 0 ${TEXT}0A`,
          border: `1px solid ${TEXT}0F`,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Subtle top accent line */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: '28px',
            right: '28px',
            height: '2px',
            background: `linear-gradient(90deg, transparent, ${PRIMARY}, transparent)`,
            opacity: 0.7,
          }}
        />

        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '22px',
          }}
        >
          <div>
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: '11px',
                fontWeight: 600,
                color: 'rgba(10,12,18,0.4)',
                margin: 0,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              {title}
            </p>
            <p
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: '26px',
                fontWeight: 700,
                color: '#0A0C12',
                margin: '4px 0 0',
                letterSpacing: '-0.5px',
              }}
            >
              ₹{amount.toLocaleString('en-IN')}
            </p>
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: '12px',
                color: 'rgba(10,12,18,0.4)',
                margin: '2px 0 0',
              }}
            >
              Total purchase amount
            </p>
          </div>
          <div
            style={{
              background: `${SUCCESS}1A`,
              border: `1px solid ${SUCCESS}33`,
              borderRadius: '10px',
              padding: '6px 12px',
            }}
          >
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: '12px',
                fontWeight: 600,
                color: SUCCESS,
                margin: 0,
                textTransform: 'capitalize',
              }}
            >
              {status}
            </p>
          </div>
        </div>

        {/* Pay Now Highlight */}
        <div
          style={{
            background: TEXT,
            borderRadius: '16px',
            padding: '18px 20px',
            marginBottom: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: '11px',
                color: 'rgba(242,242,242,0.45)',
                margin: 0,
                letterSpacing: '0.07em',
              }}
            >
              PAY NOW
            </p>
            <p
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: '28px',
                fontWeight: 700,
                color: '#D7E377',
                margin: '4px 0 0',
                letterSpacing: '-0.5px',
              }}
            >
              ₹{downPayment.toLocaleString('en-IN')}
            </p>
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: '12px',
                color: 'rgba(242,242,242,0.4)',
                margin: '2px 0 0',
              }}
            >
              ₹{emi.toLocaleString('en-IN')}/month × 3 installments
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <CircleProgress percent={progress} />
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: '11px',
                color: 'rgba(242,242,242,0.35)',
                margin: '4px 0 0',
                textAlign: 'center',
              }}
            >
              1 of 3
            </p>
          </div>
        </div>

        {/* Progress Bar */}
        <div style={{ marginBottom: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: '12px',
                fontWeight: 500,
                color: 'rgba(10,12,18,0.5)',
              }}
            >
              Repayment progress
            </span>
            <span
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: '12px',
                fontWeight: 600,
                color: TEXT,
              }}
            >
              33%
            </span>
          </div>
          <div
            style={{
              background: '#EAEAEB',
              borderRadius: '100px',
              height: '8px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${progress}%`,
                height: '100%',
                background: `linear-gradient(90deg, #b8cc4a, ${PRIMARY})`,
                borderRadius: '100px',
                transition: 'width 1s ease',
                boxShadow: `0 0 8px ${SUCCESS}4D`,
              }}
            />
          </div>
        </div>

        {/* Info Row */}
        <div style={{ display: 'flex', gap: '10px' }}>
          {[
            { label: 'Remaining', value: `₹${remaining.toLocaleString('en-IN')}` },
            { label: 'Next Due', value: dueDate },
            { label: 'Interest', value: '0%' },
          ].map(({ label, value }) => (
            <div
              key={label}
              style={{
                flex: 1,
                background: BACKGROUND,
                border: `1px solid ${TEXT}0F`,
                borderRadius: '12px',
                padding: '12px 14px',
              }}
            >
              <p
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: '10px',
                  color: `${TEXT}66`,
                  margin: 0,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                }}
              >
                {label}
              </p>
              <p
                style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: '16px',
                  fontWeight: 700,
                  color: TEXT,
                  margin: '4px 0 0',
                }}
              >
                {value}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Floating bottom badge */}
      <div
        style={{
          position: 'absolute',
          bottom: '-16px',
          left: '24px',
          zIndex: 10,
          background: '#FFFFFF',
          border: `1px solid ${TEXT}14`,
          borderRadius: '12px',
          padding: '10px 16px',
          boxShadow: `0 8px 24px ${TEXT}1A`,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <div
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: PRIMARY,
            boxShadow: `0 0 6px ${SUCCESS}99`,
            animation: 'pulse 2s infinite',
            flexShrink: 0,
          }}
        />
        <p
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: '12px',
            color: `${TEXT}8C`,
            margin: 0,
          }}
        >
          Smart contract verified on-chain
        </p>
        <style jsx>{`
          @keyframes pulse {
            0%,
            100% {
              opacity: 1;
            }
            50% {
              opacity: 0.35;
            }
          }
        `}</style>
      </div>
    </div>
  );
}
