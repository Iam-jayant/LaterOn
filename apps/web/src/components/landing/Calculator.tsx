'use client';

import { useState, useEffect, useRef } from 'react';
import { PRIMARY, BACKGROUND, TEXT, SUCCESS } from '@/lib/colors';

const PLANS = [3, 6, 12] as const;

export function Calculator() {
  const [amount, setAmount] = useState(15000);
  const [plan, setPlan] = useState<3 | 6 | 12>(3);
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLElement>(null);

  // Calculations
  const downPayment = Math.round(amount * 0.10);
  const remaining = amount - downPayment;
  const emi = Math.round(remaining / plan);
  const totalSaved = Math.round(amount * 0.18 * (plan / 12));

  // Intersection Observer for entrance animation
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
      id="calculator"
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
              color: SUCCESS,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              background: `${SUCCESS}14`,
              border: `1px solid ${SUCCESS}29`,
              padding: '5px 14px',
              borderRadius: '100px',
              display: 'inline-block',
              marginBottom: '16px',
            }}
          >
            Calculate your plan
          </span>
          <h2
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 700,
              fontSize: 'clamp(28px, 3.5vw, 40px)',
              color: TEXT,
              letterSpacing: '-0.8px',
              margin: '0 0 12px',
            }}
          >
            See what you'll pay
          </h2>
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: '16px',
              color: `${TEXT}7A`,
              maxWidth: '420px',
              margin: '0 auto',
              lineHeight: 1.6,
            }}
          >
            Adjust the amount and plan to see your monthly installment breakdown.
          </p>
        </div>

        {/* Calculator Card */}
        <div
          style={{
            background: BACKGROUND,
            border: `1px solid ${TEXT}12`,
            borderRadius: '24px',
            padding: '48px',
            maxWidth: '900px',
            margin: '0 auto',
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(24px)',
            transition: 'opacity 0.7s ease 0.2s, transform 0.7s ease 0.2s',
          }}
          className="calculator-card"
        >
          <div
            style={{ display: 'flex', gap: '48px', alignItems: 'stretch' }}
            className="calculator-layout"
          >
            {/* LEFT - Input Section */}
            <div style={{ flex: 1 }}>
              {/* Amount Slider */}
              <div style={{ marginBottom: '36px' }}>
                <label
                  htmlFor="amount-slider"
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: '14px',
                    fontWeight: 600,
                    color: `${TEXT}99`,
                    display: 'block',
                    marginBottom: '12px',
                  }}
                >
                  Purchase Amount
                </label>
                <div
                  style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontSize: '36px',
                    fontWeight: 700,
                    color: TEXT,
                    marginBottom: '16px',
                    letterSpacing: '-0.8px',
                  }}
                >
                  ₹{amount.toLocaleString('en-IN')}
                </div>
                <input
                  id="amount-slider"
                  type="range"
                  min="1000"
                  max="100000"
                  step="1000"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  style={{
                    width: '100%',
                    height: '6px',
                    borderRadius: '3px',
                    background: `linear-gradient(to right, ${PRIMARY} 0%, ${PRIMARY} ${((amount - 1000) / (100000 - 1000)) * 100}%, ${TEXT}1A ${((amount - 1000) / (100000 - 1000)) * 100}%, ${TEXT}1A 100%)`,
                    outline: 'none',
                    appearance: 'none',
                    WebkitAppearance: 'none',
                    cursor: 'pointer',
                  }}
                />
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginTop: '8px',
                  }}
                >
                  <span
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: '12px',
                      color: `${TEXT}66`,
                    }}
                  >
                    ₹1,000
                  </span>
                  <span
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: '12px',
                      color: `${TEXT}66`,
                    }}
                  >
                    ₹1,00,000
                  </span>
                </div>
              </div>

              {/* Plan Selector */}
              <div>
                <label
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: '14px',
                    fontWeight: 600,
                    color: `${TEXT}99`,
                    display: 'block',
                    marginBottom: '12px',
                  }}
                >
                  Repayment Plan
                </label>
                <div style={{ display: 'flex', gap: '12px' }}>
                  {PLANS.map((p) => (
                    <button
                      key={p}
                      onClick={() => setPlan(p)}
                      aria-label={`Select ${p} month plan`}
                      style={{
                        flex: 1,
                        background: plan === p ? PRIMARY : '#FFFFFF',
                        border: plan === p ? `2px solid ${SUCCESS}` : `1px solid ${TEXT}1F`,
                        borderRadius: '12px',
                        padding: '16px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        fontFamily: "'Inter', sans-serif",
                        minHeight: '44px',
                        minWidth: '44px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      onMouseEnter={(e) => {
                        if (plan !== p) {
                          const btn = e.currentTarget as HTMLButtonElement;
                          btn.style.borderColor = `${SUCCESS}4D`;
                          btn.style.background = `${SUCCESS}0A`;
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (plan !== p) {
                          const btn = e.currentTarget as HTMLButtonElement;
                          btn.style.borderColor = `${TEXT}1F`;
                          btn.style.background = '#FFFFFF';
                        }
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: '20px',
                          color: plan === p ? TEXT : `${TEXT}B3`,
                          marginBottom: '4px',
                        }}
                      >
                        {p}
                      </div>
                      <div
                        style={{
                          fontSize: '12px',
                          color: plan === p ? `${TEXT}99` : `${TEXT}73`,
                        }}
                      >
                        months
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Divider */}
            <div
              style={{
                width: '1px',
                background: `${TEXT}1A`,
                alignSelf: 'stretch',
              }}
              className="calculator-divider"
            />

            {/* RIGHT - Output Section */}
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: '14px',
                  fontWeight: 600,
                  color: `${TEXT}99`,
                  marginBottom: '20px',
                }}
              >
                Your Breakdown
              </div>

              {/* Breakdown Items */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Down Payment */}
                <div>
                  <div
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: '13px',
                      color: `${TEXT}80`,
                      marginBottom: '6px',
                    }}
                  >
                    Down Payment (10%)
                  </div>
                  <div
                    style={{
                      fontFamily: "'Space Grotesk', sans-serif",
                      fontSize: '24px',
                      fontWeight: 700,
                      color: TEXT,
                      letterSpacing: '-0.5px',
                    }}
                  >
                    ₹{downPayment.toLocaleString('en-IN')}
                  </div>
                </div>

                {/* Monthly EMI */}
                <div
                  style={{
                    background: '#FFFFFF',
                    border: `2px solid ${PRIMARY}`,
                    borderRadius: '16px',
                    padding: '20px',
                  }}
                >
                  <div
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: '13px',
                      color: `${TEXT}80`,
                      marginBottom: '6px',
                    }}
                  >
                    Monthly EMI
                  </div>
                  <div
                    style={{
                      fontFamily: "'Space Grotesk', sans-serif",
                      fontSize: '32px',
                      fontWeight: 700,
                      color: SUCCESS,
                      letterSpacing: '-0.8px',
                    }}
                  >
                    ₹{emi.toLocaleString('en-IN')}
                  </div>
                  <div
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: '12px',
                      color: `${TEXT}66`,
                      marginTop: '4px',
                    }}
                  >
                    for {plan} months
                  </div>
                </div>

                {/* Total Saved */}
                <div
                  style={{
                    background: `${SUCCESS}0F`,
                    border: `1px solid ${SUCCESS}1F`,
                    borderRadius: '12px',
                    padding: '16px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <circle cx="8" cy="8" r="7" stroke={SUCCESS} strokeWidth="1.5" />
                      <path
                        d="M5 8l2.5 2.5L11 6"
                        stroke={SUCCESS}
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span
                      style={{
                        fontFamily: "'Inter', sans-serif",
                        fontSize: '13px',
                        color: SUCCESS,
                        fontWeight: 600,
                      }}
                    >
                      Save ₹{totalSaved.toLocaleString('en-IN')} vs credit card
                    </span>
                  </div>
                  <div
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: '11px',
                      color: `${TEXT}66`,
                      marginTop: '6px',
                    }}
                  >
                    Compared to 18% APR credit card interest
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Custom slider styles */}
      <style jsx>{`
        input[type='range']::-webkit-slider-thumb {
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: ${SUCCESS};
          cursor: pointer;
          border: 3px solid #FFFFFF;
          box-shadow: 0 2px 8px ${SUCCESS}4D;
          transition: all 0.2s ease;
        }

        input[type='range']::-webkit-slider-thumb:hover {
          transform: scale(1.15);
          box-shadow: 0 4px 12px ${SUCCESS}66;
        }

        input[type='range']::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: ${SUCCESS};
          cursor: pointer;
          border: 3px solid #FFFFFF;
          box-shadow: 0 2px 8px ${SUCCESS}4D;
          transition: all 0.2s ease;
        }

        input[type='range']::-moz-range-thumb:hover {
          transform: scale(1.15);
          box-shadow: 0 4px 12px ${SUCCESS}66;
        }

        @media (max-width: 820px) {
          .calculator-card {
            padding: 32px 24px !important;
          }
          .calculator-layout {
            flex-direction: column !important;
            gap: 32px !important;
          }
          .calculator-divider {
            display: none !important;
          }
        }
      `}</style>
    </section>
  );
}
