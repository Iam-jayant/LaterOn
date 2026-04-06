'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { walletService } from '@/lib/wallet';
import { apiClient, type Plan as ApiPlan, type UserProfile } from '@/lib/api';
import { ensureWalletToken } from '@/lib/auth';
import {
  getProductName,
  getNextEmiDate,
  getRemainingAmountInr,
  getProgressPercentage,
  getEmiStatus,
  truncateAddress,
  formatInr,
  formatEmiDate,
  ALGO_TO_INR,
} from '@/lib/dashboard-utils';
import { PRIMARY, BACKGROUND, TEXT, SUCCESS, ERROR } from '@/lib/colors';
import Badge from '@/components/ui/Badge';
import SkeletonLoader from '@/components/ui/SkeletonLoader';

interface EMI {
  id: string;
  amount: number;
  amountAlgo: number;
  dueDate: string;
  status: 'due-soon' | 'paid' | 'overdue';
}

export default function DashboardPage() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [plans, setPlans] = useState<ApiPlan[]>([]);
  const [upcomingEmis, setUpcomingEmis] = useState<EMI[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDisconnectMenu, setShowDisconnectMenu] = useState(false);
  const disconnectMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        // Try to reconnect wallet first
        await walletService.reconnect();
        
        const address = walletService.getAddress();
        if (!address) {
          window.location.href = '/app/connect';
          return;
        }

        setWalletAddress(address);

        // Get auth token
        const token = await ensureWalletToken(address);

        // Fetch user profile and plans
        const [profile, userPlans] = await Promise.all([
          apiClient.getUserProfile(address, token).catch(() => ({
            walletAddress: address,
            tier: 'NEW' as const,
            capacityAlgo: 25,
            completedPlans: 0,
            activePlans: 0,
          })),
          apiClient.getUserPlans(address, token).catch(() => []),
        ]);

        setUserProfile(profile);
        setPlans(userPlans);

        // Generate EMI list from plans
        const emis: EMI[] = [];

        userPlans.forEach((plan) => {
          plan.installments.forEach((inst) => {
            const status = getEmiStatus(inst, plan.installmentsPaid, inst.installmentNumber);

            emis.push({
              id: `${plan.planId}-${inst.installmentNumber}`,
              amount: Math.round(inst.amountAlgo * ALGO_TO_INR),
              amountAlgo: inst.amountAlgo,
              dueDate: new Date(inst.dueAtUnix * 1000).toISOString(),
              status,
            });
          });
        });

        // Sort by due date
        emis.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
        setUpcomingEmis(emis.slice(0, 5)); // Show only next 5

        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard');
        setLoading(false);
      }
    };

    loadDashboardData();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (disconnectMenuRef.current && !disconnectMenuRef.current.contains(event.target as Node)) {
        setShowDisconnectMenu(false);
      }
    };

    if (showDisconnectMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDisconnectMenu]);

  const handleDisconnect = async () => {
    try {
      await walletService.disconnect();
      window.location.href = '/app/connect';
    } catch (err) {
      console.error('Failed to disconnect wallet:', err);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: BACKGROUND, position: 'relative' }}>
        {/* Subtle background pattern */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `radial-gradient(circle, ${TEXT}0A 1px, transparent 1px)`,
            backgroundSize: '32px 32px',
            pointerEvents: 'none',
            opacity: 0.5,
          }}
        />

        {/* Header */}
        <header
          style={{
            background: `${BACKGROUND}F5`,
            backdropFilter: 'blur(20px)',
            borderBottom: `1px solid ${TEXT}14`,
            padding: '20px 32px',
            position: 'sticky',
            top: 0,
            zIndex: 50,
          }}
        >
          <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
              <Image
                src="/images/logo.png"
                alt="LaterOn"
                width={120}
                height={32}
                style={{ height: '32px', width: 'auto', mixBlendMode: 'multiply' }}
              />
            </Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <SkeletonLoader variant="text" width="140px" height="36px" />
            </div>
          </div>
        </header>

        {/* Main content */}
        <main style={{ maxWidth: '1400px', margin: '0 auto', padding: '40px 32px', position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '32px' }} className="dashboard-grid">
            {/* LEFT SIDE */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Welcome */}
              <div>
                <SkeletonLoader variant="text" width="250px" height="32px" />
                <div style={{ marginTop: '6px' }}>
                  <SkeletonLoader variant="text" width="200px" height="15px" />
                </div>
              </div>

              {/* Active Plans Section */}
              <section>
                <SkeletonLoader variant="text" width="150px" height="20px" />
                <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <SkeletonLoader variant="card" height="180px" />
                  <SkeletonLoader variant="card" height="180px" />
                </div>
              </section>

              {/* Upcoming EMIs Section */}
              <section>
                <SkeletonLoader variant="text" width="180px" height="20px" />
                <div style={{ marginTop: '16px' }}>
                  <SkeletonLoader variant="card" height="280px" />
                </div>
              </section>
            </div>

            {/* RIGHT SIDE - Capacity Card */}
            <div>
              <SkeletonLoader variant="card" height="320px" />
            </div>
          </div>
        </main>

        <style jsx>{`
          @media (max-width: 1024px) {
            .dashboard-grid {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: BACKGROUND, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontFamily: "'Inter', sans-serif", color: `${TEXT}80`, marginBottom: '16px' }}>{error}</p>
          <Link href="/app/connect" style={{ color: PRIMARY, textDecoration: 'underline', fontWeight: 600 }}>
            Reconnect wallet
          </Link>
        </div>
      </div>
    );
  }

  const hasPlans = plans.length > 0;
  const capacity = {
    algo: userProfile?.capacityAlgo || 25,
    inr: Math.round((userProfile?.capacityAlgo || 25) * ALGO_TO_INR),
  };

  return (
    <div style={{ minHeight: '100vh', background: BACKGROUND, position: 'relative' }}>
      {/* Subtle background pattern */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `radial-gradient(circle, ${TEXT}0A 1px, transparent 1px)`,
          backgroundSize: '32px 32px',
          pointerEvents: 'none',
          opacity: 0.5,
        }}
      />

      {/* Header */}
      <header
        style={{
          background: `${BACKGROUND}F5`,
          backdropFilter: 'blur(20px)',
          borderBottom: `1px solid ${TEXT}14`,
          padding: '20px 32px',
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}
      >
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
            <Image
              src="/images/logo.png"
              alt="LaterOn"
              width={120}
              height={32}
              style={{ height: '32px', width: 'auto', mixBlendMode: 'multiply' }}
            />
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div ref={disconnectMenuRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setShowDisconnectMenu(!showDisconnectMenu)}
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: '13px',
                  color: `${TEXT}80`,
                  background: `${TEXT}0D`,
                  padding: '8px 14px',
                  borderRadius: '8px',
                  border: `1px solid ${TEXT}14`,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = `${TEXT}14`;
                  e.currentTarget.style.borderColor = `${TEXT}26`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = `${TEXT}0D`;
                  e.currentTarget.style.borderColor = `${TEXT}14`;
                }}
              >
                {walletAddress ? truncateAddress(walletAddress) : 'ALGO...XYZ123'}
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M3 4.5l3 3 3-3"
                    stroke={`${TEXT}80`}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              
              {showDisconnectMenu && (
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 8px)',
                    right: 0,
                    background: '#FFFFFF',
                    border: `1px solid ${TEXT}14`,
                    borderRadius: '10px',
                    boxShadow: '0 8px 24px rgba(10,12,18,0.12)',
                    minWidth: '180px',
                    zIndex: 100,
                  }}
                >
                  <button
                    onClick={handleDisconnect}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      fontFamily: "'Inter', sans-serif",
                      fontSize: '14px',
                      fontWeight: 500,
                      color: ERROR,
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background 0.2s',
                      borderRadius: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = `${ERROR}0D`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path
                        d="M6 14H3.5A1.5 1.5 0 012 12.5v-9A1.5 1.5 0 013.5 2H6M11 11l3-3-3-3M14 8H6"
                        stroke={ERROR}
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    Disconnect Wallet
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main style={{ maxWidth: '1400px', margin: '0 auto', padding: '40px 32px', position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '32px' }} className="dashboard-grid">
          {/* LEFT SIDE */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Welcome */}
            <div>
              <h1
                style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: '32px',
                  fontWeight: 700,
                  color: TEXT,
                  margin: '0 0 6px',
                  letterSpacing: '-0.8px',
                }}
              >
                Welcome back
              </h1>
              <p
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: '15px',
                  color: `${TEXT}73`,
                  margin: 0,
                }}
              >
                Manage your installment plans
              </p>
            </div>

            {/* Active Plans */}
            <section>
              <h2
                style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: '20px',
                  fontWeight: 600,
                  color: TEXT,
                  margin: '0 0 16px',
                  letterSpacing: '-0.3px',
                }}
              >
                Active Plans
              </h2>

              {hasPlans ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {plans.map((plan) => {
                    const productName = getProductName(plan);
                    const nextEmiDate = getNextEmiDate(plan);
                    const remainingAmountInr = getRemainingAmountInr(plan);
                    const progressPercentage = getProgressPercentage(plan);

                    return (
                      <div
                        key={plan.planId}
                        style={{
                          background: '#FFFFFF',
                          borderRadius: '16px',
                          padding: '24px',
                          border: `1px solid ${TEXT}14`,
                          boxShadow: '0 4px 16px rgba(10,12,18,0.06)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
                          <div>
                            <h3
                              style={{
                                fontFamily: "'Space Grotesk', sans-serif",
                                fontSize: '18px',
                                fontWeight: 600,
                                color: TEXT,
                                margin: '0 0 4px',
                                letterSpacing: '-0.2px',
                              }}
                            >
                              {productName}
                            </h3>
                            <p
                              style={{
                                fontFamily: "'Inter', sans-serif",
                                fontSize: '13px',
                                color: `${TEXT}80`,
                                margin: 0,
                              }}
                            >
                              Next EMI: {nextEmiDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                            </p>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <p
                              style={{
                                fontFamily: "'Space Grotesk', sans-serif",
                                fontSize: '20px',
                                fontWeight: 700,
                                color: TEXT,
                                margin: '0 0 2px',
                                letterSpacing: '-0.4px',
                              }}
                            >
                              ₹{remainingAmountInr.toLocaleString('en-IN')}
                            </p>
                            <p
                              style={{
                                fontFamily: "'Inter', sans-serif",
                                fontSize: '12px',
                                color: `${TEXT}73`,
                                margin: 0,
                              }}
                            >
                              remaining
                            </p>
                          </div>
                        </div>

                        {/* Progress bar */}
                        <div>
                          <div
                            style={{
                              width: '100%',
                              height: '8px',
                              background: `${TEXT}14`,
                              borderRadius: '100px',
                              overflow: 'hidden',
                            }}
                          >
                            <div
                              style={{
                                width: `${progressPercentage}%`,
                                height: '100%',
                                background: `linear-gradient(90deg, ${PRIMARY} 0%, ${SUCCESS} 100%)`,
                                borderRadius: '100px',
                                transition: 'width 0.5s ease',
                              }}
                            />
                          </div>
                          <p
                            style={{
                              fontFamily: "'Inter', sans-serif",
                              fontSize: '12px',
                              color: `${TEXT}73`,
                              margin: '8px 0 0',
                            }}
                          >
                            {progressPercentage}% paid
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div
                  style={{
                    background: '#FFFFFF',
                    borderRadius: '16px',
                    padding: '48px 32px',
                    textAlign: 'center',
                    border: `1px solid ${TEXT}14`,
                    boxShadow: '0 4px 16px rgba(10,12,18,0.06)',
                  }}
                >
                  <div style={{ fontSize: '48px', marginBottom: '16px' }}>📦</div>
                  <h3
                    style={{
                      fontFamily: "'Space Grotesk', sans-serif",
                      fontSize: '18px',
                      fontWeight: 600,
                      color: TEXT,
                      margin: '0 0 8px',
                    }}
                  >
                    No active plans yet
                  </h3>
                  <p
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: '14px',
                      color: `${TEXT}80`,
                      margin: '0 0 24px',
                    }}
                  >
                    Start your first purchase with installments
                  </p>
                  <button
                    style={{
                      background: PRIMARY,
                      border: 'none',
                      borderRadius: '10px',
                      padding: '12px 24px',
                      fontFamily: "'Inter', sans-serif",
                      fontSize: '14px',
                      fontWeight: 600,
                      color: TEXT,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      boxShadow: `0 4px 12px ${SUCCESS}33`,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#e4ee8c';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = PRIMARY;
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    Start a purchase
                  </button>
                </div>
              )}
            </section>

            {/* Upcoming EMIs */}
            {hasPlans && (
              <section>
                <h2
                  style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontSize: '20px',
                    fontWeight: 600,
                    color: TEXT,
                    margin: '0 0 16px',
                    letterSpacing: '-0.3px',
                  }}
                >
                  Upcoming Installments
                </h2>

                <div
                  style={{
                    background: '#FFFFFF',
                    borderRadius: '16px',
                    padding: '20px',
                    border: `1px solid ${TEXT}14`,
                    boxShadow: '0 4px 16px rgba(10,12,18,0.06)',
                  }}
                >
                  {upcomingEmis.length > 0 ? (
                    upcomingEmis.map((emi, index) => (
                      <div
                        key={emi.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '16px 0',
                          borderBottom: index < upcomingEmis.length - 1 ? `1px solid ${TEXT}14` : 'none',
                        }}
                      >
                        <div>
                          <p
                            style={{
                              fontFamily: "'Space Grotesk', sans-serif",
                              fontSize: '16px',
                              fontWeight: 600,
                              color: TEXT,
                              margin: '0 0 4px',
                            }}
                          >
                            ₹{formatInr(emi.amount)}
                            <span
                              style={{
                                fontFamily: "'Inter', sans-serif",
                                fontSize: '13px',
                                fontWeight: 400,
                                color: `${TEXT}73`,
                                marginLeft: '8px',
                              }}
                            >
                              ≈ {emi.amountAlgo} ALGO
                            </span>
                          </p>
                          <p
                            style={{
                              fontFamily: "'Inter', sans-serif",
                              fontSize: '13px',
                              color: `${TEXT}80`,
                              margin: 0,
                            }}
                          >
                            Due: {formatEmiDate(new Date(emi.dueDate))}
                          </p>
                        </div>
                        <Badge status={emi.status}>
                          {emi.status === 'due-soon' ? 'Due Soon' : emi.status === 'paid' ? 'Paid' : 'Overdue'}
                        </Badge>
                      </div>
                    ))
                  ) : (
                    <div style={{ textAlign: 'center', padding: '32px 16px' }}>
                      <div style={{ fontSize: '32px', marginBottom: '12px' }}>📅</div>
                      <p
                        style={{
                          fontFamily: "'Inter', sans-serif",
                          fontSize: '14px',
                          color: `${TEXT}80`,
                          margin: 0,
                        }}
                      >
                        No upcoming installments
                      </p>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* CTA Section */}
            {hasPlans && (
              <button
                style={{
                  background: PRIMARY,
                  border: 'none',
                  borderRadius: '12px',
                  padding: '16px',
                  fontFamily: "'Inter', sans-serif",
                  fontSize: '15px',
                  fontWeight: 600,
                  color: TEXT,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: `0 4px 16px ${SUCCESS}40`,
                  width: '100%',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#e4ee8c';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = `0 6px 20px ${SUCCESS}52`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = PRIMARY;
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = `0 4px 16px ${SUCCESS}40`;
                }}
              >
                Start a new purchase
              </button>
            )}
          </div>

          {/* RIGHT SIDE - Capacity Card */}
          <div>
            <div
              className="capacity-card"
              style={{
                background: `linear-gradient(135deg, ${PRIMARY} 0%, #b8c45f 100%)`,
                borderRadius: '20px',
                padding: '32px',
                boxShadow: `0 12px 40px ${SUCCESS}4D`,
                position: 'sticky',
                top: '120px',
              }}
            >
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: `${TEXT}14`,
                  borderRadius: '100px',
                  padding: '6px 12px',
                  marginBottom: '20px',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="7" r="6" stroke={TEXT} strokeWidth="1.5" />
                  <path d="M7 4v3l2 2" stroke={TEXT} strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <span
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: '11px',
                    fontWeight: 600,
                    color: TEXT,
                    letterSpacing: '0.02em',
                  }}
                >
                  PURCHASE CAPACITY
                </span>
              </div>

              <h2
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: '14px',
                  fontWeight: 500,
                  color: `${TEXT}99`,
                  margin: '0 0 8px',
                  letterSpacing: '0.01em',
                }}
              >
                Available to spend
              </h2>

              <div style={{ marginBottom: '24px' }}>
                <p
                  style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontSize: '48px',
                    fontWeight: 700,
                    color: TEXT,
                    margin: '0 0 4px',
                    letterSpacing: '-1.5px',
                    lineHeight: 1,
                  }}
                >
                  {capacity.algo} ALGO
                </p>
                <p
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: '18px',
                    fontWeight: 500,
                    color: `${TEXT}8C`,
                    margin: 0,
                  }}
                >
                  ≈ ₹{capacity.inr.toLocaleString('en-IN')}
                </p>
              </div>

              <div
                style={{
                  background: `${TEXT}0F`,
                  borderRadius: '12px',
                  padding: '16px',
                  border: `1px solid ${TEXT}1A`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'start', gap: '10px' }}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ marginTop: '2px', flexShrink: 0 }}>
                    <circle cx="8" cy="8" r="7" fill={`${TEXT}1A`} />
                    <path
                      d="M8 5v3M8 11h.01"
                      stroke={TEXT}
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <p
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: '13px',
                      color: `${TEXT}B3`,
                      margin: 0,
                      lineHeight: 1.5,
                    }}
                  >
                    Your limit increases as you repay on time
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <style jsx>{`
        @media (max-width: 1024px) {
          .dashboard-grid {
            grid-template-columns: 1fr !important;
          }
          .capacity-card {
            position: static !important;
          }
        }
      `}</style>
    </div>
  );
}
