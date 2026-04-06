'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import Badge from '@/components/ui/Badge';
import { BACKGROUND, TEXT, PRIMARY, SUCCESS } from '@/lib/colors';

export default function RoleSelectionPage() {
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  const roles = [
    {
      id: 'bnpl',
      title: 'Buy now, pay later',
      description: 'Split purchases into easy installments',
      icon: '💳',
      active: true,
      href: '/app/connect',
    },
    {
      id: 'lend',
      title: 'Earn yield on repayments',
      description: 'Provide liquidity and earn returns',
      icon: '💰',
      active: false,
      badge: 'Coming soon',
    },
    {
      id: 'developers',
      title: 'Integrate LaterOn into your app',
      description: 'Add BNPL to your platform with our SDK',
      icon: '⚡',
      active: false,
      badge: 'Coming soon',
    },
  ];

  return (
    <div style={{ minHeight: '100vh', background: BACKGROUND, position: 'relative', overflow: 'hidden' }}>
      {/* Background elements */}
      <div
        style={{
          position: 'absolute',
          top: '-120px',
          right: '-140px',
          width: '500px',
          height: '500px',
          background: `radial-gradient(circle, ${PRIMARY}1A 0%, transparent 65%)`,
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `radial-gradient(circle, ${TEXT}0E 1px, transparent 1px)`,
          backgroundSize: '28px 28px',
          pointerEvents: 'none',
          opacity: 0.5,
        }}
      />

      {/* Header */}
      <header
        style={{
          padding: '24px 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'relative',
          zIndex: 10,
        }}
      >
        <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <Image
            src="/images/logo.png"
            alt="LaterOn"
            width={120}
            height={32}
            style={{ height: '32px', width: 'auto', mixBlendMode: 'multiply' }}
          />
        </Link>
        <Link
          href="/"
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: '14px',
            fontWeight: 500,
            color: `${TEXT}8C`,
            textDecoration: 'none',
            transition: 'color 0.2s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = TEXT)}
          onMouseLeave={(e) => (e.currentTarget.style.color = `${TEXT}8C`)}
        >
          ← Back to home
        </Link>
      </header>

      {/* Main content */}
      <main
        style={{
          maxWidth: '1000px',
          margin: '0 auto',
          padding: '60px 32px',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Title section */}
        <div style={{ textAlign: 'center', marginBottom: '56px' }}>
          <h1
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: 'clamp(32px, 4vw, 48px)',
              fontWeight: 700,
              color: TEXT,
              margin: '0 0 12px',
              letterSpacing: '-1.2px',
            }}
          >
            Choose your role
          </h1>
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: '17px',
              color: `${TEXT}80`,
              margin: 0,
              lineHeight: 1.6,
            }}
          >
            Select how you want to use LaterOn
          </p>
        </div>

        {/* Role cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '24px',
            marginBottom: '40px',
          }}
        >
          {roles.map((role) => {
            const isHovered = hoveredCard === role.id;

            const cardContent = (
              <>
                {/* Badge */}
                {role.badge && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '16px',
                      right: '16px',
                    }}
                  >
                    <Badge status="coming-soon">{role.badge}</Badge>
                  </div>
                )}

                {/* Icon */}
                <div
                  style={{
                    fontSize: '48px',
                    marginBottom: '20px',
                    lineHeight: 1,
                  }}
                >
                  {role.icon}
                </div>

                {/* Title */}
                <h3
                  style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontSize: '22px',
                    fontWeight: 600,
                    color: TEXT,
                    margin: '0 0 8px',
                    letterSpacing: '-0.3px',
                  }}
                >
                  {role.title}
                </h3>

                {/* Description */}
                <p
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: '14px',
                    color: `${TEXT}80`,
                    margin: '0 0 24px',
                    lineHeight: 1.6,
                  }}
                >
                  {role.description}
                </p>

                {/* CTA */}
                {role.active && (
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontFamily: "'Inter', sans-serif",
                      fontSize: '14px',
                      fontWeight: 600,
                      color: isHovered ? SUCCESS : `${TEXT}A6`,
                      transition: 'color 0.2s',
                    }}
                  >
                    Continue
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path
                        d="M3 8h10M9 4l4 4-4 4"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                )}
              </>
            );

            return role.active ? (
              <Link
                key={role.id}
                href={role.href!}
                style={{
                  background: '#FFFFFF',
                  border: `2px solid ${isHovered ? PRIMARY : `${TEXT}14`}`,
                  borderRadius: '16px',
                  padding: '32px 24px',
                  position: 'relative',
                  cursor: 'pointer',
                  transition: 'all 0.25s ease',
                  transform: isHovered ? 'translateY(-4px)' : 'translateY(0)',
                  boxShadow: isHovered
                    ? `0 12px 32px ${SUCCESS}26`
                    : `0 4px 16px ${TEXT}0F`,
                  textDecoration: 'none',
                  display: 'block',
                }}
                onMouseEnter={() => setHoveredCard(role.id)}
                onMouseLeave={() => setHoveredCard(null)}
              >
                {cardContent}
              </Link>
            ) : (
              <div
                key={role.id}
                style={{
                  background: '#FFFFFF',
                  border: `2px solid ${TEXT}14`,
                  borderRadius: '16px',
                  padding: '32px 24px',
                  position: 'relative',
                  cursor: 'not-allowed',
                  opacity: 0.6,
                  transition: 'all 0.25s ease',
                  boxShadow: `0 4px 16px ${TEXT}0F`,
                  display: 'block',
                }}
              >
                {cardContent}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
