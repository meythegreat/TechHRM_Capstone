import type { ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

interface PageTransitionProps {
  pageKey: string;
  children: ReactNode;
  className?: string;
}

const ease = [0.22, 1, 0.36, 1] as const;

export default function PageTransition({ pageKey, children, className = '' }: PageTransitionProps) {
  const reduceMotion = useReducedMotion();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pageKey}
        className={className}
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -6 }}
        transition={{ duration: reduceMotion ? 0 : 0.28, ease }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
