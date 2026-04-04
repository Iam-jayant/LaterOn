'use client';

import { useState, useEffect, useRef } from 'react';
import { DashboardCard } from './DashboardCard';

export function DashboardPreview() {
  const [visible, setVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
        }
      },
      { threshold: 0.1 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => {
      if (sectionRef.current) {
        observer.disconnect();
      }
    };
  }, []);

  const mockData = [
    {
      title: 'Active Plan',
      amount: 4500,
      status: 'active' as const,
      dueDate: 'May 4',
    },
    {
      title: 'Completed Plan',
      amount: 8200,
      status: 'completed' as const,
      dueDate: 'Apr 15',
    },
    {
      title: 'Upcoming Plan',
      amount: 12000,
      status: 'upcoming' as const,
      dueDate: 'Jun 1',
    },
  ];

  return (
    <section
      ref={sectionRef}
      style={{
        padding: '80px 20px',
        background: 'var(--background)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(30px)',
        transition: 'opacity 0.7s ease, transform 0.7s ease',
      }}
    >
      <div
        style={{
          maxWidth: '1400px',
          margin: '0 auto',
        }}
      >
        <div
          style={{
            textAlign: 'center',
            marginBottom: '60px',
          }}
        >
          <h2
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: 'clamp(32px, 5vw, 48px)',
              fontWeight: 700,
              color: 'var(--foreground)',
              margin: '0 0 16px',
              letterSpacing: '-0.5px',
            }}
          >
            Your Dashboard Preview
          </h2>
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: '18px',
              color: 'rgba(10,12,18,0.6)',
              margin: 0,
              maxWidth: '600px',
              marginLeft: 'auto',
              marginRight: 'auto',
            }}
          >
            Track all your payment plans in one place with real-time updates
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '40px',
            justifyItems: 'center',
          }}
        >
          {mockData.map((data, index) => (
            <div
              key={index}
              style={{
                opacity: visible ? 1 : 0,
                transform: visible ? 'translateY(0)' : 'translateY(20px)',
                transition: `opacity 0.6s ease ${index * 0.15}s, transform 0.6s ease ${index * 0.15}s`,
              }}
            >
              <DashboardCard {...data} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
