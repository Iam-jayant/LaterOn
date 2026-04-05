import React from 'react';

interface SkeletonLoaderProps {
  variant: 'text' | 'card' | 'circle';
  width?: string;
  height?: string;
}

const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({ 
  variant, 
  width, 
  height 
}) => {
  const getVariantStyles = () => {
    switch (variant) {
      case 'text':
        return {
          width: width || '100%',
          height: height || '16px',
          borderRadius: '4px',
        };
      case 'card':
        return {
          width: width || '100%',
          height: height || '200px',
          borderRadius: '16px',
        };
      case 'circle':
        return {
          width: width || '48px',
          height: height || '48px',
          borderRadius: '50%',
        };
      default:
        return {
          width: width || '100%',
          height: height || '16px',
          borderRadius: '4px',
        };
    }
  };

  const variantStyles = getVariantStyles();

  return (
    <div
      style={{
        backgroundColor: '#e0e0e0',
        animation: 'pulse 1.5s ease-in-out infinite',
        ...variantStyles,
      }}
    >
      <style jsx>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
      `}</style>
    </div>
  );
};

export default SkeletonLoader;
