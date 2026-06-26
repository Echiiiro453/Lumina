/**
 * useRipple — Material Design 3 ripple effect hook.
 * Usage: const { rippleProps, ripples } = useRipple();
 * Then spread {...rippleProps} on your button and render <Ripples ripples={ripples} /> inside it.
 */
import React, { useState, useCallback } from 'react';

function useRipple() {
  const [ripples, setRipples] = useState([]);

  const addRipple = useCallback((e) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;
    const id = Date.now() + Math.random();

    setRipples(prev => [...prev, { id, x, y, size }]);
    setTimeout(() => {
      setRipples(prev => prev.filter(r => r.id !== id));
    }, 600);
  }, []);

  return {
    rippleProps: { onMouseDown: addRipple },
    ripples,
  };
}

export function Ripples({ ripples, color = 'rgba(255,255,255,0.25)' }) {
  return (
    <>
      {ripples.map(r => (
        <span
          key={r.id}
          className="absolute pointer-events-none rounded-full animate-[ripple_0.6s_ease-out_forwards]"
          style={{
            left: r.x,
            top: r.y,
            width: r.size,
            height: r.size,
            background: color,
          }}
        />
      ))}
      <style>{`
        @keyframes ripple {
          0%   { transform: scale(0); opacity: 0.5; }
          100% { transform: scale(1); opacity: 0; }
        }
      `}</style>
    </>
  );
}

/**
 * RippleButton — drop-in replacement for <button> with MD3 ripple.
 * All standard button props work normally.
 */
export function RippleButton({ children, className = '', rippleColor, ...props }) {
  const { rippleProps, ripples } = useRipple();
  return (
    <button
      {...props}
      {...rippleProps}
      onMouseDown={(e) => {
        rippleProps.onMouseDown(e);
        props.onMouseDown?.(e);
      }}
      className={`relative overflow-hidden ${className}`}
    >
      {children}
      <Ripples ripples={ripples} color={rippleColor} />
    </button>
  );
}
