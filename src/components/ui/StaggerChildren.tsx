'use client';

import { useInView } from '@/hooks/useInView';
import React from 'react';

interface StaggerChildrenProps {
  children: React.ReactNode;
  staggerDelay?: number;
  className?: string;
}

export function StaggerChildren({ children, staggerDelay = 50, className = '' }: StaggerChildrenProps) {
  const { ref, isInView } = useInView(0.05);
  const childArray = React.Children.toArray(children);

  return (
    <div ref={ref} className={className}>
      {childArray.map((child, i) => (
        <div
          key={i}
          className={`transition-all duration-500 ease-out ${
            isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
          style={{ transitionDelay: isInView ? `${i * staggerDelay}ms` : '0ms' }}
        >
          {child}
        </div>
      ))}
    </div>
  );
}
