'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { walletService, type WalletType } from '@/lib/wallet';
import { apiClient } from '@/lib/api';
import { ensureWalletToken } from '@/lib/auth';
import { ConsentModal, ScoreReveal, ASAOptIn } from '@/components/onboarding';
import { PRIMARY, BACKGROUND, TEXT, SUCCESS, ERROR } from '@/lib/colors';

type OnboardingStep = 
  | 'wallet' 
  | 'consent' 
  | 'profile' 
  | 'score_reveal' 
  | 'asa_optin';

export default function ConnectPage() {
  const router = useRouter();
  const [step, setStep] = useState<OnboardingStep>('wallet');
  const [walletAddress, setWalletAddress] = useState('');
  const [fullWalletAddress, setFullWalletAddress] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [asaId, setAsaId] = useState<number | null>(null);
  const [scoreAsaId, setScoreAsaId] = useState<number | null>(null);
  const [showAsaOptIn, setShowAsaOptIn] = useState(false);
  const [asaError, setAsaError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleWalletConnect = async (walletType: WalletType) => {
    setIsSubmitting(true);
    setError(null);
    
    try {
      const address = await walletService.connect(walletType);
      const shortAddress = `${address.slice(0, 6)}...${address.slice(-6)}`;
      setWalletAddress(shortAddress);
      setFullWalletAddress(address);

      // Check if user exists
      const { exists } = await apiClient.checkUserExists(address);
      
      if (exists) {
        // Existing user - skip onboarding and go to marketplace
        router.push('/marketplace');
      } else {
        // New user - check if consent already given
        try {
          const token = await ensureWalletToken(address);
          if (token) {
            const hasConsent = await apiClient.checkConsent(token, 'credit_scoring');
            if (hasConsent) {
              // Consent already given, skip to profile
              setAuthToken(token);
              setStep('profile');
              return;
            }
          }
        } catch (err) {
          // If consent check fails, proceed to consent step
          console.log('Consent check failed, showing consent modal');
        }
        
        // No consent yet - start onboarding with consent
        setStep('consent');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect wallet');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConsentGiven = async (txnId: string) => {
    setIsSubmitting(true);
    setError(null);

    try {
      // Save consent record
      await apiClient.saveConsent({
        walletAddress: fullWalletAddress,
        purpose: 'credit_scoring',
        txnId,
      });

      // Move to profile step
      setStep('profile');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save consent');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConsentDecline = async () => {
    // Disconnect wallet and navigate to landing
    await walletService.disconnect();
    router.push('/');
  };

  const handleProfileSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    
    try {
      // Get auth token for wallet analysis
      const token = await ensureWalletToken(fullWalletAddress);
      if (!token) {
        throw new Error('Failed to authenticate');
      }
      setAuthToken(token);

      // Save profile to backend (name and email are now required)
      try {
        const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';
        const res = await fetch(`${apiBase}/api/user/profile`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ name, email, walletAddress: fullWalletAddress })
        });
        
        if (!res.ok) {
          const errorText = await res.text();
          console.error('Failed to save profile:', errorText);
          throw new Error('Failed to save profile');
        } else {
          console.log('Profile saved successfully');
        }
      } catch (err) {
        console.error('Profile save error:', err);
        setError('Failed to save profile. Please try again.');
        setIsSubmitting(false);
        return;
      }

      // Move to score reveal step
      setStep('score_reveal');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit profile');
    } finally {
      setIsSubmitting(false);
    }
  };

  const navigateToMarketplace = () => {
    router.push('/marketplace');
  };

  const handleScoreRevealComplete = async () => {
    console.log('[ScoreReveal] Continue button clicked, starting ASA creation flow');
    console.log('[ScoreReveal] Auth token:', authToken ? 'present' : 'missing');
    
    try {
      // Step 1: Create Score ASA on backend
      console.log('[ScoreReveal] Step 1: Calling /api/user/create-score-asa');
      const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';
      const createRes = await fetch(`${apiBase}/api/user/create-score-asa`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        }
      });

      console.log('[ScoreReveal] Create ASA response status:', createRes.status);

      if (!createRes.ok) {
        const errorText = await createRes.text();
        console.error('[ScoreReveal] ASA creation failed:', errorText);
        // Non-blocking: log and go to marketplace
        navigateToMarketplace();
        return;
      }

      const { asaId } = await createRes.json();
      console.log('[ScoreReveal] ASA created successfully, ID:', asaId);
      setScoreAsaId(asaId);

      // Step 2: Check wallet balance
      console.log('[ScoreReveal] Step 2: Checking wallet balance');
      const balRes = await fetch(`${apiBase}/api/user/wallet-balance`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      const { balance } = await balRes.json();
      console.log('[ScoreReveal] Wallet balance:', balance, 'ALGO');

      if (balance < 0.1) {
        console.warn('[ScoreReveal] Insufficient balance for ASA opt-in');
        setAsaError('Add at least 0.1 ALGO to your wallet to receive your Score token');
        // Show error but allow user to retry or skip
        setShowAsaOptIn(false);
        return;
      }

      // Step 3: Show ASA opt-in component
      console.log('[ScoreReveal] Step 3: Showing ASA opt-in modal');
      setShowAsaOptIn(true);
      setStep('asa_optin');
    } catch (err) {
      console.error('[ScoreReveal] ASA flow error:', err);
      // Non-blocking: go to marketplace on any error
      navigateToMarketplace();
    }
  };

  const handleOptInConfirmed = async () => {
    try {
      await fetch('/api/user/transfer-score-asa', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ asaId: scoreAsaId })
      });
    } catch (err) {
      console.error('ASA transfer failed:', err);
      // Non-blocking
    } finally {
      navigateToMarketplace();
    }
  };

  // Render consent modal
  if (step === 'consent') {
    return (
      <ConsentModal
        walletAddress={fullWalletAddress}
        onConsent={handleConsentGiven}
        onDecline={handleConsentDecline}
      />
    );
  }

  // Render score reveal
  if (step === 'score_reveal') {
    return (
      <ScoreReveal
        authToken={authToken}
        onComplete={handleScoreRevealComplete}
      />
    );
  }

  // Render ASA opt-in (if ASA ID is available)
  if (step === 'asa_optin' && scoreAsaId) {
    return (
      <>
        {asaError && (
          <div style={{ 
            position: 'fixed', 
            top: '50%', 
            left: '50%', 
            transform: 'translate(-50%, -50%)',
            background: '#FFFFFF',
            borderRadius: '16px',
            padding: '32px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            maxWidth: '400px',
            width: '90%',
            zIndex: 1000
          }}>
            <p style={{ 
              fontFamily: "'Inter', sans-serif", 
              fontSize: '15px', 
              color: ERROR,
              marginBottom: '16px'
            }}>
              {asaError}
            </p>
            <button
              onClick={navigateToMarketplace}
              style={{
                width: '100%',
                background: PRIMARY,
                border: 'none',
                borderRadius: '10px',
                padding: '12px',
                fontFamily: "'Inter', sans-serif",
                fontSize: '14px',
                fontWeight: 600,
                color: TEXT,
                cursor: 'pointer'
              }}
            >
              Skip for now
            </button>
          </div>
        )}
        {!asaError && (
          <ASAOptIn
            walletAddress={fullWalletAddress}
            asaId={scoreAsaId}
            onComplete={handleOptInConfirmed}
            onSkip={navigateToMarketplace}
          />
        )}
      </>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: BACKGROUND, position: 'relative', overflow: 'hidden' }}>
      {/* Background */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '600px',
          height: '600px',
          background: `radial-gradient(circle, ${PRIMARY}14 0%, transparent 70%)`,
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `radial-gradient(circle, ${TEXT}0A 1px, transparent 1px)`,
          backgroundSize: '28px 28px',
          pointerEvents: 'none',
          opacity: 0.5,
        }}
      />

      {/* Header */}
      <header style={{ padding: '24px 32px', position: 'relative', zIndex: 10 }}>
        <Link href="/app" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <Image
            src="/images/logo.png"
            alt="LaterOn"
            width={120}
            height={32}
            style={{ height: '32px', width: 'auto', mixBlendMode: 'multiply' }}
          />
        </Link>
      </header>

      {/* Main content */}
      <main
        style={{
          maxWidth: '480px',
          margin: '0 auto',
          padding: '40px 32px',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Progress indicator */}
        <div style={{ marginBottom: '40px' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            {['wallet', 'profile'].map((s) => (
              <div
                key={s}
                style={{
                  flex: 1,
                  height: '4px',
                  background: step === s || (s === 'wallet' && step === 'profile') ? PRIMARY : `${TEXT}1A`,
                  borderRadius: '2px',
                  transition: 'background 0.3s',
                }}
              />
            ))}
          </div>
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: '13px',
              color: `${TEXT}73`,
              margin: 0,
            }}
          >
            Step {step === 'wallet' ? '1' : '2'} of 2
          </p>
        </div>

        {/* Card */}
        <div
          style={{
            background: '#FFFFFF',
            border: `1px solid ${TEXT}14`,
            borderRadius: '20px',
            padding: '40px 32px',
            boxShadow: `0 8px 32px ${TEXT}14`,
          }}
        >
          {step === 'wallet' && (
            <>
              <h1
                style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: '28px',
                  fontWeight: 700,
                  color: TEXT,
                  margin: '0 0 8px',
                  letterSpacing: '-0.6px',
                }}
              >
                Connect your wallet
              </h1>
              <p
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: '15px',
                  color: `${TEXT}80`,
                  margin: '0 0 32px',
                  lineHeight: 1.6,
                }}
              >
                Choose your Algorand wallet to get started
              </p>

              {error && (
                <div
                  style={{
                    background: `${ERROR}0D`,
                    border: `1px solid ${ERROR}33`,
                    borderRadius: '10px',
                    padding: '12px 16px',
                    marginBottom: '16px',
                  }}
                >
                  <p
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: '13px',
                      color: ERROR,
                      margin: 0,
                    }}
                  >
                    {error}
                  </p>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[
                  { id: 'lute', name: 'Lute Wallet', icon: '🎵' },
                  { id: 'pera', name: 'Pera Wallet', icon: '🔷' },
                  { id: 'defly', name: 'Defly Wallet', icon: '🦋' },
                ].map((wallet) => (
                  <button
                    key={wallet.id}
                    onClick={() => handleWalletConnect(wallet.id as WalletType)}
                    disabled={isSubmitting}
                    style={{
                      background: '#FFFFFF',
                      border: `2px solid ${TEXT}1A`,
                      borderRadius: '12px',
                      padding: '18px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                      cursor: isSubmitting ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s',
                      fontFamily: "'Inter', sans-serif",
                      fontSize: '15px',
                      fontWeight: 600,
                      color: TEXT,
                      opacity: isSubmitting ? 0.5 : 1,
                    }}
                    onMouseEnter={(e) => {
                      if (!isSubmitting) {
                        e.currentTarget.style.borderColor = PRIMARY;
                        e.currentTarget.style.background = `${PRIMARY}0D`;
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = `${TEXT}1A`;
                      e.currentTarget.style.background = '#FFFFFF';
                    }}
                  >
                    <span style={{ fontSize: '28px' }}>{wallet.icon}</span>
                    <span style={{ flex: 1, textAlign: 'left' }}>{wallet.name}</span>
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <path
                        d="M7 10h6M10 7l3 3-3 3"
                        stroke={`${TEXT}4D`}
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                ))}
              </div>

              <p
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: '12px',
                  color: `${TEXT}66`,
                  margin: '24px 0 0',
                  textAlign: 'center',
                  lineHeight: 1.5,
                }}
              >
                By connecting, you agree to our Terms of Service
              </p>
            </>
          )}

          {step === 'profile' && (
            <>
              <h1
                style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: '28px',
                  fontWeight: 700,
                  color: TEXT,
                  margin: '0 0 8px',
                  letterSpacing: '-0.6px',
                }}
              >
                Complete your profile
              </h1>
              <p
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: '15px',
                  color: `${TEXT}80`,
                  margin: '0 0 32px',
                  lineHeight: 1.6,
                }}
              >
                Help us personalize your experience
              </p>

              {/* Wallet connected indicator */}
              <div
                style={{
                  background: `${SUCCESS}0F`,
                  border: `1px solid ${SUCCESS}26`,
                  borderRadius: '10px',
                  padding: '12px 16px',
                  marginBottom: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <div
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: SUCCESS,
                  }}
                />
                <span
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: '13px',
                    color: SUCCESS,
                    fontWeight: 500,
                  }}
                >
                  Wallet connected: {walletAddress}
                </span>
              </div>

              <form onSubmit={handleProfileSubmit}>
                <div style={{ marginBottom: '20px' }}>
                  <label
                    style={{
                      display: 'block',
                      fontFamily: "'Inter', sans-serif",
                      fontSize: '13px',
                      fontWeight: 500,
                      color: `${TEXT}A6`,
                      marginBottom: '8px',
                    }}
                  >
                    Name <span style={{ color: ERROR }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your name"
                    required
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      fontFamily: "'Inter', sans-serif",
                      fontSize: '15px',
                      border: `2px solid ${TEXT}1A`,
                      borderRadius: '10px',
                      outline: 'none',
                      transition: 'border-color 0.2s',
                      boxSizing: 'border-box',
                      background: '#FFFFFF',
                      color: TEXT,
                      WebkitAppearance: 'none',
                      MozAppearance: 'none',
                      appearance: 'none',
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = PRIMARY)}
                    onBlur={(e) => (e.currentTarget.style.borderColor = `${TEXT}1A`)}
                  />
                </div>

                <div style={{ marginBottom: '32px' }}>
                  <label
                    style={{
                      display: 'block',
                      fontFamily: "'Inter', sans-serif",
                      fontSize: '13px',
                      fontWeight: 500,
                      color: `${TEXT}A6`,
                      marginBottom: '8px',
                    }}
                  >
                    Email <span style={{ color: ERROR }}>*</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    required
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      fontFamily: "'Inter', sans-serif",
                      fontSize: '15px',
                      border: `2px solid ${TEXT}1A`,
                      borderRadius: '10px',
                      outline: 'none',
                      transition: 'border-color 0.2s',
                      boxSizing: 'border-box',
                      background: '#FFFFFF',
                      color: TEXT,
                      WebkitAppearance: 'none',
                      MozAppearance: 'none',
                      appearance: 'none',
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = PRIMARY)}
                    onBlur={(e) => (e.currentTarget.style.borderColor = `${TEXT}1A`)}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{
                    width: '100%',
                    background: PRIMARY,
                    border: 'none',
                    borderRadius: '12px',
                    padding: '14px',
                    fontFamily: "'Inter', sans-serif",
                    fontSize: '15px',
                    fontWeight: 600,
                    color: TEXT,
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: `0 4px 16px ${SUCCESS}33`,
                    opacity: isSubmitting ? 0.7 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!isSubmitting) {
                      e.currentTarget.style.background = '#e4ee8c';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = `0 6px 20px ${SUCCESS}47`;
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = PRIMARY;
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = `0 4px 16px ${SUCCESS}33`;
                  }}
                >
                  {isSubmitting ? 'Setting up...' : 'Continue to Marketplace'}
                </button>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
