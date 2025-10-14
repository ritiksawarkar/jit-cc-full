import React, { useEffect, useState, useRef } from 'react';

// Simple countdown timer component
// Props:
// - initialSeconds: number of seconds to start from
// - onFinish: optional callback when timer reaches zero
// - running: boolean to control running state (optional)
export default function Timer({ initialSeconds = 0, onFinish, running = true }) {
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);
  const intervalRef = useRef(null);
  const runningRef = useRef(running);

  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  useEffect(() => {
    setSecondsLeft(initialSeconds);
  }, [initialSeconds]);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (!runningRef.current) return;

    intervalRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
          if (onFinish) onFinish();
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [initialSeconds, onFinish, running]);

  const format = (secs) => {
    const hrs = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(hrs)}:${pad(mins)}:${pad(s)}`;
  };

  return (
    <div className="px-3 py-1 text-sm font-mono text-white/90 bg-black/30 rounded-md">
      {format(secondsLeft)}
    </div>
  );
}
