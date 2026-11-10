import { ReferenceStatus } from '@/lib/types';
import { Tone } from './ui';

/** How a design's readiness for photo checks is shown. */
export function referenceTone(status: ReferenceStatus): { label: string; tone: Tone } {
  switch (status) {
    case 'approved': return { label: 'Ready to check', tone: 'success' };
    case 'needs_review': return { label: 'Awaiting approval', tone: 'warning' };
    case 'rejected': return { label: 'Rejected', tone: 'danger' };
    case 'failed': return { label: 'Not readable', tone: 'danger' };
    case 'processing': return { label: 'Being prepared', tone: 'info' };
    default: return { label: 'Not prepared yet', tone: 'neutral' };
  }
}
