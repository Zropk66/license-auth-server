'use client';

import { useState, useEffect } from 'react';

export function useCaptcha() {
  const [enableCaptcha, setEnableCaptcha] = useState(false);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/auth/captcha-config')
      .then((res) => res.json())
      .then((data) => {
        if (data && typeof data.enabled === 'boolean') {
          setEnableCaptcha(data.enabled);
        }
        if (data && typeof data.siteKey === 'string') {
          setTurnstileSiteKey(data.siteKey);
        }
      })
      .catch((err) => {
        console.error('Error fetching captcha config:', err);
      });
  }, []);

  return { enableCaptcha, turnstileSiteKey, turnstileToken, setTurnstileToken };
}
