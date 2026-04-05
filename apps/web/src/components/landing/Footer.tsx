'use client';

import Link from 'next/link';
import { TEXT } from '@/lib/colors';

export function Footer() {
  const productLinks = [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Checkout', href: '/checkout' },
    { label: 'Lender', href: '/lender' },
  ];

  const companyLinks = [
    { label: 'About', href: '#about' },
    { label: 'Careers', href: '#careers' },
    { label: 'Contact', href: '#contact' },
  ];

  const resourceLinks = [
    { label: 'Documentation', href: '#docs' },
    { label: 'API Reference', href: '#api' },
    { label: 'Support', href: '#support' },
  ];

  const legalLinks = [
    { label: 'Privacy Policy', href: '#privacy' },
    { label: 'Terms of Service', href: '#terms' },
  ];

  return (
    <footer
      style={{
        background: 'rgba(245, 246, 240, 0.5)',
        borderTop: `1px solid ${TEXT}14`,
        marginTop: '80px',
      }}
    >
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '60px 32px 32px' }}>
        {/* Main Footer Content */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '48px',
            marginBottom: '48px',
          }}
          className="footer-grid"
        >
          {/* Brand Column */}
          <div>
            <div
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: '20px',
                fontWeight: 600,
                color: TEXT,
                marginBottom: '12px',
              }}
            >
              LaterOn
            </div>
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: '14px',
                lineHeight: '1.6',
                color: `${TEXT}8C`,
                margin: 0,
              }}
            >
              Buy now, pay later with zero interest. Smart financing for your purchases.
            </p>
          </div>

          {/* Product Links */}
          <div>
            <h3
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: '13px',
                fontWeight: 600,
                color: TEXT,
                marginBottom: '16px',
                marginTop: 0,
                letterSpacing: '0.02em',
                textTransform: 'uppercase',
              }}
            >
              Product
            </h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {productLinks.map((link) => (
                <li key={link.label} style={{ marginBottom: '12px' }}>
                  <Link
                    href={link.href}
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: '14px',
                      color: `${TEXT}8C`,
                      textDecoration: 'none',
                      transition: 'color 0.2s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = TEXT)}
                    onMouseLeave={(e) => (e.currentTarget.style.color = `${TEXT}8C`)}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company Links */}
          <div>
            <h3
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: '13px',
                fontWeight: 600,
                color: TEXT,
                marginBottom: '16px',
                marginTop: 0,
                letterSpacing: '0.02em',
                textTransform: 'uppercase',
              }}
            >
              Company
            </h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {companyLinks.map((link) => (
                <li key={link.label} style={{ marginBottom: '12px' }}>
                  <Link
                    href={link.href}
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: '14px',
                      color: `${TEXT}8C`,
                      textDecoration: 'none',
                      transition: 'color 0.2s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = TEXT)}
                    onMouseLeave={(e) => (e.currentTarget.style.color = `${TEXT}8C`)}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources Links */}
          <div>
            <h3
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: '13px',
                fontWeight: 600,
                color: TEXT,
                marginBottom: '16px',
                marginTop: 0,
                letterSpacing: '0.02em',
                textTransform: 'uppercase',
              }}
            >
              Resources
            </h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {resourceLinks.map((link) => (
                <li key={link.label} style={{ marginBottom: '12px' }}>
                  <Link
                    href={link.href}
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: '14px',
                      color: `${TEXT}8C`,
                      textDecoration: 'none',
                      transition: 'color 0.2s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = TEXT)}
                    onMouseLeave={(e) => (e.currentTarget.style.color = `${TEXT}8C`)}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div
          style={{
            paddingTop: '24px',
            borderTop: `1px solid ${TEXT}14`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '16px',
          }}
          className="footer-bottom"
        >
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: '13px',
              color: `${TEXT}73`,
              margin: 0,
            }}
          >
            © {new Date().getFullYear()} LaterOn. All rights reserved.
          </p>

          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
            {legalLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: '13px',
                  color: `${TEXT}73`,
                  textDecoration: 'none',
                  transition: 'color 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = TEXT)}
                onMouseLeave={(e) => (e.currentTarget.style.color = `${TEXT}73`)}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 768px) {
          .footer-grid {
            grid-template-columns: 1fr !important;
            gap: 32px !important;
          }
          .footer-bottom {
            flex-direction: column !important;
            align-items: flex-start !important;
          }
        }
      `}</style>
    </footer>
  );
}
