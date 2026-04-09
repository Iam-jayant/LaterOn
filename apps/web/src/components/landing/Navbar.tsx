'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { PRIMARY } from '@/lib/colors';

interface NavbarProps {
  onSearch?: (query: string) => void;
  walletAddress?: string | null;
  onDisconnect?: () => void;
  showSearch?: boolean;
  showProfile?: boolean;
}

export function Navbar({ 
  onSearch, 
  walletAddress, 
  onDisconnect,
  showSearch = false,
  showProfile = false 
}: NavbarProps = {}) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Debounced search handler (300ms delay) - Requirement 4.2
  useEffect(() => {
    if (!onSearch) return;

    const timeoutId = setTimeout(() => {
      onSearch(searchQuery);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, onSearch]);

  const navLinks = [
    { label: 'Marketplace', href: '/marketplace' },
    { label: 'How it works', href: '#how-it-works' },
    { label: 'Pricing', href: '#calculator' },
    { label: 'Developers', href: '#developers' },
    { label: 'Docs', href: '#docs' },
  ];

  const handleDisconnect = () => {
    setProfileMenuOpen(false);
    if (onDisconnect) {
      onDisconnect();
    }
  };

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
            {!showSearch && !showProfile && navLinks.map((link) => (
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
            
            {/* Search Input - Requirement 4.1, 4.2 */}
            {showSearch && (
              <input
                type="text"
                placeholder="Search gift cards..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: '14px',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: '1px solid rgba(10, 12, 18, 0.15)',
                  backgroundColor: 'rgba(255, 255, 255, 0.8)',
                  outline: 'none',
                  transition: 'all 0.2s',
                  width: '280px',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = PRIMARY;
                  e.currentTarget.style.backgroundColor = '#fff';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(10, 12, 18, 0.15)';
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
                }}
              />
            )}
          </div>

          {/* Right CTAs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }} className="nav-hidden-mobile">
            {/* Profile Dropdown - Requirement 4.4, 4.5 */}
            {showProfile && walletAddress ? (
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                  style={{
                    background: 'rgba(10, 12, 18, 0.05)',
                    border: '1px solid rgba(10, 12, 18, 0.15)',
                    cursor: 'pointer',
                    fontFamily: "'Inter', sans-serif",
                    fontSize: '14px',
                    fontWeight: 500,
                    color: '#0A0C12',
                    padding: '9px 16px',
                    borderRadius: '10px',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    minWidth: '44px',
                    minHeight: '44px',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(10, 12, 18, 0.08)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(10, 12, 18, 0.05)';
                  }}
                >
                  <span style={{ 
                    width: '24px', 
                    height: '24px', 
                    borderRadius: '50%', 
                    background: PRIMARY,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}>
                    {walletAddress.slice(0, 2).toUpperCase()}
                  </span>
                  <span>{walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}</span>
                </button>
                
                {/* Dropdown Menu */}
                {profileMenuOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 8px)',
                      right: 0,
                      background: '#fff',
                      border: '1px solid rgba(10, 12, 18, 0.15)',
                      borderRadius: '12px',
                      boxShadow: '0 4px 24px rgba(10, 12, 18, 0.12)',
                      minWidth: '200px',
                      padding: '8px',
                      zIndex: 100,
                    }}
                  >
                    <Link
                      href="/dashboard"
                      onClick={() => setProfileMenuOpen(false)}
                      style={{
                        display: 'block',
                        fontFamily: "'Inter', sans-serif",
                        fontSize: '14px',
                        fontWeight: 500,
                        color: '#0A0C12',
                        textDecoration: 'none',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        transition: 'background 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(10, 12, 18, 0.05)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      Dashboard
                    </Link>
                    <button
                      onClick={handleDisconnect}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        fontFamily: "'Inter', sans-serif",
                        fontSize: '14px',
                        fontWeight: 500,
                        color: '#dc2626',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        transition: 'background 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(220, 38, 38, 0.05)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      Disconnect Wallet
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link
                href="/app"
                style={{
                  background: PRIMARY,
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
                  e.currentTarget.style.background = PRIMARY;
                  e.currentTarget.style.boxShadow = '0 2px 12px rgba(107,122,0,0.22)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                Use App
              </Link>
            )}
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
            {/* Mobile Search */}
            {showSearch && (
              <div style={{ padding: '0 4px 12px' }}>
                <input
                  type="text"
                  placeholder="Search gift cards..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    fontFamily: "'Inter', sans-serif",
                    fontSize: '14px',
                    padding: '10px 16px',
                    borderRadius: '8px',
                    border: '1px solid rgba(10, 12, 18, 0.15)',
                    backgroundColor: '#fff',
                    outline: 'none',
                    minHeight: '44px',
                  }}
                />
              </div>
            )}
            
            {/* Mobile Profile Info */}
            {showProfile && walletAddress && (
              <>
                <div style={{ 
                  padding: '10px 4px', 
                  fontSize: '12px', 
                  color: 'rgba(10,12,18,0.5)',
                  fontFamily: "'Inter', sans-serif",
                }}>
                  {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                </div>
                <Link
                  href="/dashboard"
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
                  Dashboard
                </Link>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    handleDisconnect();
                  }}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: "'Inter', sans-serif",
                    fontSize: '15px',
                    fontWeight: 500,
                    color: '#dc2626',
                    padding: '10px 4px',
                    transition: 'color 0.2s ease',
                    minHeight: '44px',
                  }}
                >
                  Disconnect Wallet
                </button>
              </>
            )}
            
            {/* Regular nav links for landing page */}
            {!showSearch && !showProfile && navLinks.map((link) => (
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
            
            {!showProfile && (
              <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                <Link
                  href="/app"
                  style={{
                    flex: 1,
                    background: PRIMARY,
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
                    e.currentTarget.style.background = PRIMARY;
                    e.currentTarget.style.boxShadow = '0 2px 12px rgba(107,122,0,0.22)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  Use App
                </Link>
              </div>
            )}
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
