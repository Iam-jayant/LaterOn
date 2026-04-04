'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { label: 'How it works', href: '#how-it-works' },
    { label: 'Pricing', href: '#calculator' },
    { label: 'Developers', href: '#developers' },
    { label: 'Docs', href: '#docs' },
  ];

  return (
    <nav
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        transition: 'all 0.35s ease',
        backgroundColor: scrolled ? 'rgba(245, 246, 240, 0.95)' : 'transparent',
        backdropFilter: scrolled ? 'blur(20px)' : 'blur(0px)',
        borderBottom: scrolled ? '1px solid rgba(10, 12, 18, 0.08)' : '1px solid transparent',
        boxShadow: scrolled ? '0 4px 24px rgba(10, 12, 18, 0.06)' : 'none',
      }}
    >
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '68px' }}>
          {/* Logo */}
          <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
            <Image
              src="/images/logo.png"
              alt="LaterOn"
              width={120}
              height={32}
              style={{
                height: '32px',
                width: 'auto',
                display: 'block',
                mixBlendMode: 'multiply',
              }}
              priority
            />
          </Link>

          {/* Desktop Nav Links */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '36px' }} className="nav-hidden-mobile">
            {navLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: '14px',
                  fontWeight: 500,
                  color: 'rgba(10, 12, 18, 0.5)',
                  textDecoration: 'none',
                  transition: 'color 0.2s',
                  letterSpacing: '0.01em',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(10,12,18,0.9)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(10,12,18,0.5)')}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Right CTAs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }} className="nav-hidden-mobile">
            <Link
              href="/app"
              style={{
                background: '#D7E377',
                border: 'none',
                cursor: 'pointer',
                fontFamily: "'Inter', sans-serif",
                fontSize: '14px',
                fontWeight: 600,
                color: '#0A0C12',
                padding: '9px 20px',
                borderRadius: '10px',
                transition: 'all 0.2s',
                letterSpacing: '0.01em',
                boxShadow: '0 2px 12px rgba(107,122,0,0.22)',
                display: 'inline-block',
                textDecoration: 'none',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#e4ee8c';
                e.currentTarget.style.boxShadow = '0 4px 20px rgba(107,122,0,0.32)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#D7E377';
                e.currentTarget.style.boxShadow = '0 2px 12px rgba(107,122,0,0.22)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              Use App
            </Link>
          </div>

          {/* Mobile Hamburger */}
          <button
            className="nav-show-mobile"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'none',
              flexDirection: 'column',
              gap: '5px',
              padding: '10px',
              minWidth: '44px',
              minHeight: '44px',
              justifyContent: 'center',
              alignItems: 'center',
              borderRadius: '8px',
              transition: 'background 0.2s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(10,12,18,0.05)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                style={{
                  display: 'block',
                  width: '22px',
                  height: '2px',
                  background: '#0A0C12',
                  borderRadius: '2px',
                  transition: 'all 0.2s',
                }}
              />
            ))}
          </button>
        </div>

        {/* Mobile Menu */}
        {menuOpen && (
          <div
            style={{
              padding: '16px 0 20px',
              borderTop: '1px solid rgba(10,12,18,0.08)',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              background: 'rgba(245,246,240,0.98)',
            }}
          >
            {navLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: '15px',
                  fontWeight: 500,
                  color: 'rgba(10,12,18,0.65)',
                  textDecoration: 'none',
                  padding: '10px 4px',
                  transition: 'color 0.2s ease',
                }}
                onClick={() => setMenuOpen(false)}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#0A0C12')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(10,12,18,0.65)')}
              >
                {link.label}
              </Link>
            ))}
            <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
              <Link
                href="/app"
                style={{
                  flex: 1,
                  background: '#D7E377',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: "'Inter', sans-serif",
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#0A0C12',
                  padding: '12px',
                  borderRadius: '10px',
                  textAlign: 'center',
                  minHeight: '44px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 2px 12px rgba(107,122,0,0.22)',
                  textDecoration: 'none',
                }}
                onClick={() => setMenuOpen(false)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#e4ee8c';
                  e.currentTarget.style.boxShadow = '0 4px 20px rgba(107,122,0,0.32)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#D7E377';
                  e.currentTarget.style.boxShadow = '0 2px 12px rgba(107,122,0,0.22)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                Use App
              </Link>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        @media (max-width: 768px) {
          .nav-hidden-mobile {
            display: none !important;
          }
          .nav-show-mobile {
            display: flex !important;
          }
        }
      `}</style>
    </nav>
  );
}
