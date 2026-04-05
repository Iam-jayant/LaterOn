import React from 'react';
import { SUCCESS, WARNING, ERROR, TEXT } from '@/lib/colors';

interface BadgeProps {
  status: 'paid' | 'due-soon' | 'overdue' | 'coming-soon';
  children: React.ReactNode;
}

const Badge: React.FC<BadgeProps> = ({ status, children }) => {
  const getStatusStyles = () => {
    switch (status) {
      case 'paid':
        return {
          backgroundColor: SUCCESS,
          color: '#ffffff',
        };
      case 'due-soon':
        return {
          backgroundColor: WARNING,
          color: '#ffffff',
        };
      case 'overdue':
        return {
          backgroundColor: ERROR,
          color: '#ffffff',
        };
      case 'coming-soon':
        return {
          backgroundColor: '#e0e0e0',
          color: TEXT,
        };
      default:
        return {
          backgroundColor: '#e0e0e0',
          color: TEXT,
        };
    }
  };

  const styles = getStatusStyles();

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '4px 12px',
        borderRadius: '12px',
        fontSize: '12px',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        ...styles,
      }}
    >
      {children}
    </span>
  );
};

export default Badge;
